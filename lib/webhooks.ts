import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import type { Payment } from "@/lib/generated/prisma/client";

const MAX_ATTEMPTS = 5;

export function serializePayment(p: Payment) {
  return {
    id: p.id,
    status: p.status,
    mode: p.mode.toLowerCase(),
    amount: p.amount,
    fee: p.fee,
    refunded_amount: p.refundedAmount,
    currency: p.currency,
    provider: p.provider,
    description: p.description,
    customer_name: p.customerName,
    customer_phone: p.customerPhone,
    checkout_url: `${appUrl()}/checkout/${p.id}`,
    paid_at: p.paidAt,
    created_at: p.createdAt,
  };
}

/** Header value `t=<unix>,v1=<hex>`; merchants verify HMAC-SHA256(secret, `${t}.${body}`). */
export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

export async function notifyMerchant(paymentId: string, event: string): Promise<void> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { merchant: true } });
  if (!p?.merchant.webhookUrl) return;
  const ev = await prisma.webhookEvent.create({
    data: { direction: "out", paymentId, url: p.merchant.webhookUrl, payload: { event, data: serializePayment(p) }, status: "pending" },
  });
  await deliver(ev.id);
}

async function deliver(eventId: string): Promise<void> {
  const ev = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  const payment = ev.paymentId ? await prisma.payment.findUnique({ where: { id: ev.paymentId }, include: { merchant: true } }) : null;
  if (!payment || !ev.url) return;
  const body = JSON.stringify(ev.payload);
  let error: string | null = null;
  try {
    if (process.env.NODE_ENV === "production") {
      const addrs = await lookup(new URL(ev.url).hostname, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Webhook URL resolves to a private address");
    }
    const res = await fetch(ev.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SmePay-Signature": signWebhook(payment.merchant.webhookSecret, body) },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: error ? "failed" : "delivered", attempts: { increment: 1 }, lastError: error },
  });
}

export async function retryFailedWebhooks(): Promise<number> {
  const failed = await prisma.webhookEvent.findMany({
    where: { direction: "out", status: "failed", attempts: { lt: MAX_ATTEMPTS } },
    take: 100,
  });
  for (const ev of failed) await deliver(ev.id);
  return failed.length;
}

const PRIVATE = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) {
  PRIVATE.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [["::", 127], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  PRIVATE.addSubnet(net, bits, "ipv6");
}

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast, NAT64, and IPv4-mapped forms of those. */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped) return isPrivateIp(mapped);
  const v = isIP(ip);
  return v === 0 || PRIVATE.check(ip, v === 6 ? "ipv6" : "ipv4");
}

/** Merchant-supplied URL: https only in production, no embedded credentials. Resolved IPs are checked at delivery. */
export function isAllowedWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.username || u.password || raw.length > 500) return false;
    // ponytail: DNS is checked before fetch, which re-resolves; a rebinding attacker can race it. Use an egress proxy at scale.
    return u.protocol === "https:" || (process.env.NODE_ENV !== "production" && u.protocol === "http:");
  } catch {
    return false;
  }
}
