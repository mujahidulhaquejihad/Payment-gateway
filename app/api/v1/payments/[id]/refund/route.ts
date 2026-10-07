import { after } from "next/server";
import { z } from "zod";
import { apiError, authenticate } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
import { PaymentError, refundPayment } from "@/lib/payments";
import { notifyMerchant, serializePayment } from "@/lib/webhooks";

const Body = z.object({ amount: z.number().int().positive().optional() }).strict();

export async function POST(req: Request, ctx: RouteContext<"/api/v1/payments/[id]/refund">) {
  const key = await authenticate(req);
  if (key instanceof Response) return key;
  const { id } = await ctx.params;
  const owned = await prisma.payment.findFirst({ where: { id, merchantId: key.merchantId, mode: key.mode }, select: { id: true } });
  if (!owned) return apiError(404, "Payment not found");
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "amount must be a positive integer (paisa)");
  try {
    const p = await refundPayment(key.merchantId, id, parsed.data.amount);
    after(() => notifyMerchant(p.id, "payment.refunded"));
    return Response.json(serializePayment(p));
  } catch (e) {
    if (e instanceof PaymentError) return apiError(e.status, e.message);
    throw e;
  }
}
