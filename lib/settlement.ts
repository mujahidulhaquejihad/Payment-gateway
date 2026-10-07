import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { acct, lockMerchant, post } from "@/lib/ledger";
import { paisaToDecimal } from "@/lib/money";

const DHAKA_OFFSET = 6 * 3600_000;
const DAY = 86400_000;

/** Start of "today" in Asia/Dhaka; everything paid before it is due (T+1). */
export function settlementCutoff(now = new Date()): Date {
  return new Date(Math.floor((now.getTime() + DHAKA_OFFSET) / DAY) * DAY - DHAKA_OFFSET);
}

export function summarize(payments: { amount: number; fee: number }[], refunds: { amount: number }[]) {
  const gross = payments.reduce((s, p) => s + p.amount, 0);
  const fees = payments.reduce((s, p) => s + p.fee, 0);
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  return { gross, fees, refunds: refundTotal, net: gross - fees - refundTotal };
}

/**
 * Creates one PENDING settlement per approved merchant from all unsettled LIVE items before the cutoff.
 * Items with a non-positive net are carried forward to the next run.
 */
export async function runSettlement(now = new Date()) {
  // ponytail: runs merchants sequentially in one process; move to a job queue when merchant count grows.
  const periodEnd = settlementCutoff(now);
  const merchants = await prisma.merchant.findMany({ where: { kycStatus: "APPROVED" }, select: { id: true } });
  const created: string[] = [];
  for (const { id: merchantId } of merchants) {
    try {
      const s = await prisma.$transaction(async (tx) => {
        await lockMerchant(tx, merchantId);
        const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
        // No payout destination, or a refund still awaiting provider confirmation: carry everything forward.
        if (!merchant.payoutMethod || !merchant.payoutAccount) return null;
        if (await tx.refund.count({ where: { providerRef: null, payment: { merchantId } } })) return null;
        const payments = await tx.payment.findMany({
          where: { merchantId, mode: "LIVE", settlementId: null, paidAt: { lt: periodEnd }, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
          select: { id: true, amount: true, fee: true },
        });
        const refunds = await tx.refund.findMany({
          where: { settlementId: null, createdAt: { lt: periodEnd }, payment: { merchantId, mode: "LIVE" } },
          select: { id: true, amount: true },
        });
        const sum = summarize(payments, refunds);
        if (sum.net <= 0) return null;
        const settlement = await tx.settlement.create({
          data: { merchantId, periodEnd, ...sum, payoutMethod: merchant.payoutMethod, payoutAccount: merchant.payoutAccount },
        });
        await tx.payment.updateMany({ where: { id: { in: payments.map((p) => p.id) } }, data: { settlementId: settlement.id } });
        await tx.refund.updateMany({ where: { id: { in: refunds.map((r) => r.id) } }, data: { settlementId: settlement.id } });
        return settlement;
      });
      if (s) created.push(s.id);
    } catch (e) {
      // A concurrent run already settled this merchant for this period.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  return { periodEnd, created };
}

export async function markSettlementPaid(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.settlement.findUniqueOrThrow({ where: { id } });
    const n = await tx.settlement.updateMany({ where: { id, status: "PENDING" }, data: { status: "PAID", paidAt: new Date() } });
    if (n.count === 0) return false;
    await post(tx, [
      { account: acct.merchantPayable(s.merchantId), debit: s.net, memo: `settlement ${id}` },
      { account: acct.settlementPaid, credit: s.net },
    ]);
    return true;
  });
}

const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection and quote everything.
  const risky = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
  return `"${(risky ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export async function settlementCsv(id: string, merchantId?: string): Promise<string | null> {
  const s = await prisma.settlement.findFirst({
    where: { id, ...(merchantId ? { merchantId } : {}) },
    include: { payments: true, refundItems: { include: { payment: true } } },
  });
  if (!s) return null;
  const rows: (string | number | null)[][] = [["type", "id", "payment_id", "provider", "paid_or_refunded_at", "amount", "fee", "net"]];
  for (const p of s.payments) rows.push(["payment", p.id, p.id, p.provider, p.paidAt?.toISOString() ?? "", paisaToDecimal(p.amount), paisaToDecimal(p.fee), paisaToDecimal(p.amount - p.fee)]);
  for (const r of s.refundItems) rows.push(["refund", r.id, r.paymentId, r.payment.provider, r.createdAt.toISOString(), paisaToDecimal(r.amount), "0.00", `-${paisaToDecimal(r.amount)}`]);
  rows.push(["total", s.id, "", "", s.periodEnd.toISOString(), paisaToDecimal(s.gross), paisaToDecimal(s.fees), paisaToDecimal(s.net)]);
  return toCsv(rows);
}
