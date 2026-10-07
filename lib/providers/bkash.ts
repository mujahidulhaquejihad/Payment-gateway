import { paisaToDecimal, toPaisa } from "@/lib/money";
import type { PaymentProvider, StatusResult } from "./types";

// bKash Tokenized Checkout v1.2.0-beta
const env = () => ({
  base: process.env.BKASH_BASE_URL ?? "",
  appKey: process.env.BKASH_APP_KEY ?? "",
  appSecret: process.env.BKASH_APP_SECRET ?? "",
  username: process.env.BKASH_USERNAME ?? "",
  password: process.env.BKASH_PASSWORD ?? "",
});

let token: { value: string; expiresAt: number } | null = null;

async function grantToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;
  const c = env();
  const res = await fetch(`${c.base}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", username: c.username, password: c.password },
    body: JSON.stringify({ app_key: c.appKey, app_secret: c.appSecret }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json();
  if (!j.id_token) throw new Error(`bKash token grant failed: ${j.statusMessage ?? j.msg ?? res.status}`);
  token = { value: j.id_token, expiresAt: Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000 };
  return token.value;
}

async function call(path: string, body: unknown) {
  const res = await fetch(`${env().base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: await grantToken(),
      "X-APP-Key": env().appKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
}

function mapStatus(j: { transactionStatus?: string; amount?: string; currency?: string; merchantInvoiceNumber?: string; trxID?: string }): StatusResult {
  const amount = j.amount ? (toPaisa(String(j.amount)) ?? undefined) : undefined;
  if (j.transactionStatus === "Completed") return { status: "SUCCEEDED", amount, currency: j.currency, reference: j.merchantInvoiceNumber, trxId: j.trxID };
  if (!j.transactionStatus || j.transactionStatus === "Initiated" || j.transactionStatus === "Pending Authorized") return { status: "PENDING" };
  return { status: "FAILED" };
}

export const bkash: PaymentProvider = {
  id: "bkash",
  label: "bKash",
  kind: "mfs",
  sandboxHint: "Sandbox wallet 01770618575, OTP 123456, PIN 12121",
  enabled: () => Boolean(env().appKey && env().base.startsWith("https://")),
  sandbox: () => env().base.includes("sandbox"),

  async createPayment({ paymentId, amount, callbackUrl, customerPhone }) {
    const j = await call("/tokenized/checkout/create", {
      mode: "0011",
      payerReference: customerPhone || "N/A",
      callbackURL: callbackUrl,
      amount: paisaToDecimal(amount),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: paymentId,
    });
    if (j.statusCode !== "0000" || !j.bkashURL) throw new Error(`bKash create failed: ${j.statusMessage ?? j.errorMessage ?? "unknown"}`);
    return { redirectUrl: j.bkashURL, providerRef: j.paymentID };
  },

  verifyCallback(params) {
    const ref = params.get("paymentID");
    const status = params.get("status") ?? "";
    if (!ref) return null;
    // Safe to trust a cancel: bKash only captures money when we call execute.
    const failed = status !== "success";
    return { providerRef: ref, eventId: `${ref}:${failed ? "failed" : "success"}`, failed };
  },

  async queryStatus(ref) {
    // Execute captures the payment; if it was already executed or fails, fall back to the status query.
    const exec = await call("/tokenized/checkout/execute", { paymentID: ref });
    if (exec.transactionStatus === "Completed") return mapStatus(exec);
    return mapStatus(await call("/tokenized/checkout/payment/status", { paymentID: ref }));
  },

  async refund({ providerRef, trxId, amount }) {
    const j = await call("/tokenized/checkout/payment/refund", {
      paymentID: providerRef,
      trxID: trxId,
      amount: paisaToDecimal(amount),
      sku: "payment",
      reason: "Merchant refund",
    });
    if (j.transactionStatus !== "Completed") throw new Error(`bKash refund failed: ${j.statusMessage ?? j.errorMessage ?? "unknown"}`);
    return { refundRef: j.refundTrxID };
  },
};
