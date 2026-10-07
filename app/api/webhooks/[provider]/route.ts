import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { handleProviderCallback } from "@/lib/payments";
import { ipFrom, rateLimit } from "@/lib/rate-limit";
import { notifyMerchant } from "@/lib/webhooks";

const MAX_BODY = 64 * 1024;

async function handle(req: NextRequest, provider: string, params: URLSearchParams) {
  if (!rateLimit(`callback:${ipFrom((n) => req.headers.get(n))}`, 60, 60_000)) return null;
  try {
    const r = await handleProviderCallback(provider, params);
    if (r?.changed) {
      const p = await prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
      after(() => notifyMerchant(r.paymentId, p.status === "SUCCEEDED" ? "payment.succeeded" : "payment.failed"));
    }
    return r?.paymentId ?? null;
  } catch (e) {
    console.error(`[webhook:${provider}]`, e);
    return null;
  }
}

/** Browser redirect from the provider after the buyer finishes. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await ctx.params;
  const paymentId = await handle(req, provider, req.nextUrl.searchParams);
  if (paymentId) return Response.redirect(`${appUrl()}/pay/result/${paymentId}`, 303);
  return new Response("Payment callback could not be processed. If money was deducted, contact the merchant with your transaction ID.", { status: 400 });
}

/** Server-to-server IPN. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await ctx.params;
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const type = req.headers.get("content-type") ?? "";
  // A declared length is required so chunked bodies cannot stream past the cap before we check it.
  const length = req.headers.get("content-length");
  if (length === null || !(Number(length) <= MAX_BODY)) return Response.json({ ok: false }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ ok: false }, { status: 413 });
  if (type.includes("application/json")) {
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {}
    if (body && typeof body === "object") for (const [k, v] of Object.entries(body)) if (typeof v === "string") params.set(k, v);
  } else if (type.includes("application/x-www-form-urlencoded")) {
    for (const [k, v] of new URLSearchParams(raw)) params.set(k, v);
  }
  const paymentId = await handle(req, provider, params);
  return Response.json({ ok: Boolean(paymentId) }, { status: paymentId ? 200 : 400 });
}
