import { constants, createSign, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { paisaToDecimal, toPaisa } from "@/lib/money";
import type { PaymentProvider } from "./types";

// Nagad remote payment gateway (v-0.2.0)
const env = () => ({
  base: process.env.NAGAD_BASE_URL ?? "",
  merchantId: process.env.NAGAD_MERCHANT_ID ?? "",
  merchantNumber: process.env.NAGAD_MERCHANT_NUMBER ?? "",
  privateKey: process.env.NAGAD_MERCHANT_PRIVATE_KEY ?? "",
  pgPublicKey: process.env.NAGAD_PG_PUBLIC_KEY ?? "",
});

const pem = (b64: string, type: string) => `-----BEGIN ${type}-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END ${type}-----`;

const encrypt = (plain: string) =>
  publicEncrypt({ key: pem(env().pgPublicKey, "PUBLIC KEY"), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(plain)).toString("base64");

const sign = (plain: string) => createSign("SHA256").update(plain).sign(pem(env().privateKey, "PRIVATE KEY"), "base64");

const decrypt = (b64: string) =>
  JSON.parse(
    privateDecrypt({ key: pem(env().privateKey, "PRIVATE KEY"), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(b64, "base64")).toString(),
  );

/** YYYYMMDDHHmmss in Asia/Dhaka */
const dhakaTimestamp = () => new Date(Date.now() + 6 * 3600_000).toISOString().replace(/\D/g, "").slice(0, 14);

async function request(path: string, clientIp: string, body?: unknown) {
  const res = await fetch(`${env().base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-KM-Api-Version": "v-0.2.0",
      "X-KM-IP-V4": clientIp,
      "X-KM-Client-Type": "PC_WEB",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
}

const FAILED = new Set(["Aborted", "Cancelled", "Failed", "Fraud", "Expired", "Rejected"]);

export const nagad: PaymentProvider = {
  id: "nagad",
  label: "Nagad",
  kind: "mfs",
  // Nagad's sandbox is served over plain http; production must be https.
  enabled: () => Boolean(env().merchantId && env().privateKey && env().pgPublicKey && (env().base.startsWith("https://") || nagad.sandbox())),
  sandbox: () => env().base.includes("sandbox"),

  async createPayment({ paymentId, amount, callbackUrl, clientIp }) {
    const { merchantId, merchantNumber } = env();
    const datetime = dhakaTimestamp();
    const initPlain = JSON.stringify({ merchantId, datetime, orderId: paymentId, challenge: randomBytes(20).toString("hex") });
    const init = await request(`/check-out/initialize/${merchantId}/${paymentId}?locale=EN`, clientIp, {
      accountNumber: merchantNumber,
      dateTime: datetime,
      sensitiveData: encrypt(initPlain),
      signature: sign(initPlain),
    });
    if (!init.sensitiveData) throw new Error(`Nagad initialize failed: ${init.message ?? "unknown"}`);
    const { paymentReferenceId, challenge } = decrypt(init.sensitiveData);

    const completePlain = JSON.stringify({ merchantId, orderId: paymentId, currencyCode: "050", amount: paisaToDecimal(amount), challenge });
    const done = await request(`/check-out/complete/${paymentReferenceId}`, clientIp, {
      sensitiveData: encrypt(completePlain),
      signature: sign(completePlain),
      merchantCallbackURL: callbackUrl,
    });
    if (done.status !== "Success" || !done.callBackUrl) throw new Error(`Nagad complete failed: ${done.message ?? "unknown"}`);
    return { redirectUrl: done.callBackUrl, providerRef: paymentReferenceId };
  },

  verifyCallback(params) {
    const ref = params.get("payment_ref_id");
    if (!ref) return null;
    // Nagad captures on its side, so a forged "cancel" must not fail a payment the buyer may still complete;
    // only the verify API decides.
    return { providerRef: ref, eventId: `${ref}:callback`, failed: false };
  },

  async queryStatus(ref) {
    const j = await request(`/verify/payment/${encodeURIComponent(ref)}`, "127.0.0.1");
    if (j.status === "Success") return { status: "SUCCEEDED", amount: toPaisa(String(j.amount)) ?? undefined, reference: j.orderId, trxId: j.issuerPaymentRefNo };
    return { status: FAILED.has(j.status) ? "FAILED" : "PENDING" };
  },

  async refund() {
    throw new Error("Nagad refunds are not available via API; process the refund from the Nagad merchant portal");
  },
};
