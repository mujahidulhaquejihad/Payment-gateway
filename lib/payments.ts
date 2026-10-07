import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { Prisma, type Mode, type Payment, type PaymentStatus } from "@/lib/generated/prisma/client";
import { acct, availableBalance, lockMerchant, post } from "@/lib/ledger";
import { calcFee, feeBpsFor, MAX_AMOUNT, MIN_AMOUNT } from "@/lib/money";
import { getProvider, isProviderAllowed } from "@/lib/providers";
import type { PaymentProvider, StatusResult } from "@/lib/providers/types";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ["PENDING", "FAILED"],
  PENDING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  FAILED: [],
  REFUNDED: [],
};

export const canTransition = (from: PaymentStatus, to: PaymentStatus) => TRANSITIONS[from].includes(to);

/** An unpaid payment can be started for this long; after that it expires. */
export const CHECKOUT_TTL_MS = 24 * 3600_000;
/** A provider session left PENDING this long is treated as abandoned. */
export const PENDING_TTL_MS = 60 * 60_000;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

type CreateInput = {
  merchantId: string;
  mode: Mode;
  amount: number;
  linkId?: string;
  idempotencyKey?: string;
  description?: string;
  customerName?: string;
  customerPhone?: string;
  redirectUrl?: string;
};

const IDEMPOTENT_FIELDS = ["amount", "linkId", "description", "customerName", "customerPhone", "redirectUrl"] as const;

export async function createPayment(input: CreateInput): Promise<Payment> {
  if (!Number.isInteger(input.amount) || input.amount < MIN_AMOUNT || input.amount > MAX_AMOUNT) {
    throw new PaymentError(`Amount must be between ${MIN_AMOUNT / 100} and ${MAX_AMOUNT / 100} BDT`);
  }
  if (!input.idempotencyKey) return prisma.payment.create({ data: input });

  const replay = async () => {
    const p = await prisma.payment.findUnique({
      where: { merchantId_mode_idempotencyKey: { merchantId: input.merchantId, mode: input.mode, idempotencyKey: input.idempotencyKey! } },
    });
    if (p && !IDEMPOTENT_FIELDS.every((f) => (p[f] ?? undefined) === input[f])) {
      throw new PaymentError("Idempotency-Key was already used with different parameters", 409);
    }
    return p;
  };
  const existing = await replay();
  if (existing) return existing;
  try {
    return await prisma.payment.create({ data: input });
  } catch (e) {
    if (isUniqueViolation(e)) return (await replay())!;
    throw e;
  }
}

/** Hands the buyer to the provider. Returns the provider redirect URL. */
export async function startCheckout(paymentId: string, providerId: string, clientIp: string): Promise<string> {
  const provider = getProvider(providerId);
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { merchant: true } });
  if (!p || p.status !== "CREATED" || p.createdAt.getTime() < Date.now() - CHECKOUT_TTL_MS) {
    throw new PaymentError("This payment can no longer be paid");
  }
  if (p.merchant.kycStatus === "REJECTED" || (p.mode === "LIVE" && p.merchant.kycStatus !== "APPROVED")) {
    throw new PaymentError("This merchant cannot accept payments right now");
  }
  if (!provider || !isProviderAllowed(provider.sandbox(), p.mode)) throw new PaymentError("This payment method is not available");

  const { redirectUrl, providerRef } = await provider.createPayment({
    paymentId: p.id,
    amount: p.amount,
    callbackUrl: `${appUrl()}/api/webhooks/${provider.id}`,
    clientIp,
    customerPhone: p.customerPhone,
  });
  if (!providerRef || (!redirectUrl.startsWith("https://") && !redirectUrl.startsWith(`${appUrl()}/`))) {
    throw new Error(`${provider.id} returned an invalid checkout session`);
  }
  const n = await prisma.payment.updateMany({
    where: { id: p.id, status: "CREATED" },
    data: { status: "PENDING", provider: provider.id, providerRef },
  });
  if (n.count === 0) throw new PaymentError("This payment can no longer be paid");
  return redirectUrl;
}

/**
 * Provider redirect / IPN entry point. Returns the payment id, or null if the callback is unknown.
 * Callback contents are only a hint; the provider's status API is the source of truth.
 */
export async function handleProviderCallback(providerId: string, params: URLSearchParams): Promise<{ paymentId: string; changed: boolean } | null> {
  const provider = getProvider(providerId);
  const cb = provider?.verifyCallback(params);
  if (!provider || !cb) return null;
  const payment = await prisma.payment.findUnique({ where: { provider_providerRef: { provider: provider.id, providerRef: cb.providerRef } } });
  if (!payment) return null;
  // Already final: nothing to do, and replays must not trigger provider calls or event rows.
  if (payment.status !== "PENDING") return { paymentId: payment.id, changed: false };
  try {
    await prisma.webhookEvent.create({
      data: { direction: "in", provider: provider.id, eventId: cb.eventId, paymentId: payment.id, payload: Object.fromEntries(params), status: "received" },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { paymentId: payment.id, changed: false };
    throw e;
  }
  return { paymentId: payment.id, changed: await syncPayment(payment, provider, cb.failed) };
}

/** Why a provider-reported success must not be booked, or null if it matches our record exactly. */
export function successMismatch(payment: Pick<Payment, "id" | "amount" | "currency">, st: StatusResult): string | null {
  if (st.amount !== payment.amount) return `amount: expected ${payment.amount}, provider reported ${st.amount ?? "nothing"}`;
  if (st.currency !== undefined && st.currency !== payment.currency) return `currency: expected ${payment.currency}, provider reported ${st.currency}`;
  if (st.reference !== undefined && st.reference !== payment.id) return `reference: expected ${payment.id}, provider reported ${st.reference}`;
  return null;
}

/** Re-checks a PENDING payment with its provider. Returns true if the status changed. */
export async function syncPayment(payment: Payment, provider?: PaymentProvider, buyerReportedFailure = false): Promise<boolean> {
  if (payment.status !== "PENDING" || !payment.provider || !payment.providerRef) return false;
  provider ??= getProvider(payment.provider);
  if (!provider) return false;

  const st = await provider.queryStatus(payment.providerRef);
  if (st.status === "SUCCEEDED") {
    const mismatch = successMismatch(payment, st);
    if (!mismatch) return markSucceeded(payment, provider, st.trxId);
    // Never book money that does not match the order; ops must reconcile and refund at the provider.
    await prisma.webhookEvent.create({
      data: { direction: "in", provider: provider.id, paymentId: payment.id, payload: { ...st }, status: "failed", lastError: `Mismatch on ${mismatch}` },
    });
    return markFailed(payment.id);
  }
  if (st.status === "FAILED" || buyerReportedFailure) return markFailed(payment.id);
  return false;
}

async function markSucceeded(payment: Payment, provider: PaymentProvider, trxId?: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: payment.merchantId } });
    const fee = calcFee(payment.amount, feeBpsFor(provider.id, merchant));
    const n = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "SUCCEEDED", fee, paidAt: new Date(), providerTrxId: trxId ?? null },
    });
    if (n.count === 0) return false;
    if (payment.mode === "LIVE") {
      await post(
        tx,
        [
          { account: acct.providerReceivable, debit: payment.amount, memo: `${provider.id} payment` },
          { account: acct.merchantPayable(payment.merchantId), credit: payment.amount - fee },
          { account: acct.feeRevenue, credit: fee },
        ],
        payment.id,
      );
    }
    return true;
  });
}

async function markFailed(paymentId: string): Promise<boolean> {
  const n = await prisma.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED" } });
  return n.count > 0;
}

/** Cron: expire unpaid payments and give up on abandoned provider sessions. Returns ids that changed. */
export async function expireStalePayments(now = Date.now()): Promise<string[]> {
  await prisma.payment.updateMany({ where: { status: "CREATED", createdAt: { lt: new Date(now - CHECKOUT_TTL_MS) } }, data: { status: "FAILED" } });
  const stale = await prisma.payment.findMany({ where: { status: "PENDING", updatedAt: { lt: new Date(now - 10 * 60_000) } }, take: 200 });
  const changed: string[] = [];
  for (const p of stale) {
    const abandoned = p.updatedAt.getTime() < now - PENDING_TTL_MS;
    if (await syncPayment(p, undefined, abandoned).catch((e) => (console.error(`[sync ${p.id}]`, e), false))) changed.push(p.id);
  }
  return changed;
}

/**
 * Refund flow: under a per-merchant lock, check the balance, reserve the amount and post the ledger;
 * then call the provider; on provider failure, release the reservation with reversing entries.
 */
export async function refundPayment(merchantId: string, paymentId: string, amount?: number): Promise<Payment> {
  const { p, refundId, amt } = await prisma.$transaction(async (tx) => {
    await lockMerchant(tx, merchantId);
    const p = await tx.payment.findFirst({ where: { id: paymentId, merchantId } });
    if (!p || (p.status !== "SUCCEEDED" && p.status !== "PARTIALLY_REFUNDED")) throw new PaymentError("Only successful payments can be refunded");
    if (!p.provider || !getProvider(p.provider)) throw new PaymentError("Payment provider is not available");
    const remaining = p.amount - p.refundedAmount;
    const amt = amount ?? remaining;
    if (!Number.isInteger(amt) || amt <= 0 || amt > remaining) throw new PaymentError(`Refund amount must be between 0.01 and ${remaining / 100} BDT`);
    if (p.mode === "LIVE") {
      const available = await availableBalance(tx, merchantId);
      if (amt > available) throw new PaymentError(`Insufficient unsettled balance for this refund (available ${Math.max(available, 0) / 100} BDT)`);
    }
    const refunded = p.refundedAmount + amt;
    await tx.payment.update({ where: { id: p.id }, data: { status: refunded === p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED", refundedAmount: refunded } });
    const r = await tx.refund.create({ data: { paymentId: p.id, amount: amt } });
    if (p.mode === "LIVE") {
      await post(tx, [{ account: acct.merchantPayable(merchantId), debit: amt, memo: `refund ${r.id}` }, { account: acct.providerReceivable, credit: amt }], p.id);
    }
    return { p, refundId: r.id, amt };
  });

  try {
    const { refundRef } = await getProvider(p.provider!)!.refund({ providerRef: p.providerRef!, trxId: p.providerTrxId, amount: amt });
    await prisma.refund.update({ where: { id: refundId }, data: { providerRef: refundRef } });
  } catch (e) {
    // A timeout or network drop may still have refunded the buyer: keep the money reserved (this also pauses
    // settlement for the merchant) until ops reconciles the refund row against the provider statement.
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError)) {
      console.error(`[refund ${refundId}] ambiguous provider failure, held for reconciliation`, e);
      throw new PaymentError("The provider did not confirm the refund; it is on hold for manual reconciliation", 502);
    }
    await prisma.$transaction(async (tx) => {
      await lockMerchant(tx, merchantId);
      const cur = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
      const refunded = cur.refundedAmount - amt;
      await tx.payment.update({ where: { id: p.id }, data: { refundedAmount: refunded, status: refunded === 0 ? "SUCCEEDED" : "PARTIALLY_REFUNDED" } });
      await tx.refund.delete({ where: { id: refundId } });
      if (p.mode === "LIVE") {
        await post(tx, [{ account: acct.providerReceivable, debit: amt, memo: `refund ${refundId} failed` }, { account: acct.merchantPayable(merchantId), credit: amt }], p.id);
      }
    });
    throw new PaymentError(e instanceof Error ? e.message : "Refund failed", 502);
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
}

/** A YYYY-MM-DD calendar day in Asia/Dhaka as a UTC instant (start of day, or end of day). */
export function dhakaDay(v: string | undefined, end = false): Date | undefined {
  // Round-trip rejects impossible dates like 2026-02-31 that Date would silently roll over.
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) return undefined;
  return new Date(`${v}T${end ? "23:59:59.999" : "00:00:00.000"}+06:00`);
}

type Params = Record<string, string | string[] | undefined>;

/** Dashboard payment search shared by the list and the CSV export, so both always show the same rows. */
export function paymentFilter(merchantId: string, defaultLive: boolean, sp: Params) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = (Object.keys(TRANSITIONS) as PaymentStatus[]).find((s) => s === one("status"));
  const mode: Mode = one("mode") === "test" ? "TEST" : one("mode") === "live" ? "LIVE" : defaultLive ? "LIVE" : "TEST";
  const q = one("q")?.trim().slice(0, 100) || undefined;
  const from = dhakaDay(one("from")), to = dhakaDay(one("to"), true);
  const where: Prisma.PaymentWhereInput = {
    merchantId,
    mode,
    ...(status && { status }),
    ...((from || to) && { createdAt: { gte: from, lte: to } }),
    ...(q && {
      OR: [
        { id: q },
        { providerTrxId: q },
        { customerPhone: { contains: q } },
        { customerName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  return { where, mode, status, q, from: from && one("from"), to: to && one("to") };
}