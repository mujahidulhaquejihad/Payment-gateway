import { z } from "zod";
import { apiError, authenticate } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
import { createPayment, PaymentError } from "@/lib/payments";
import { serializePayment } from "@/lib/webhooks";

const Body = z
  .object({
    amount: z.number().int(), // paisa
    description: z.string().trim().max(200).optional(),
    customer_name: z.string().trim().max(100).optional(),
    customer_phone: z.string().regex(/^01[3-9]\d{8}$/).optional(),
    redirect_url: z.url({ protocol: process.env.NODE_ENV === "production" ? /^https$/ : /^https?$/ }).max(500).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const key = await authenticate(req);
  if (key instanceof Response) return key;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const idem = req.headers.get("idempotency-key")?.trim();
  if (idem && !/^[\x21-\x7e]{1,100}$/.test(idem)) return apiError(400, "Idempotency-Key must be 1-100 printable ASCII characters");

  try {
    const p = await createPayment({
      merchantId: key.merchantId,
      mode: key.mode,
      amount: parsed.data.amount,
      idempotencyKey: idem || undefined,
      description: parsed.data.description,
      customerName: parsed.data.customer_name,
      customerPhone: parsed.data.customer_phone,
      redirectUrl: parsed.data.redirect_url,
    });
    return Response.json(serializePayment(p), { status: 201 });
  } catch (e) {
    if (e instanceof PaymentError) return apiError(e.status, e.message);
    throw e;
  }
}

export async function GET(req: Request) {
  const key = await authenticate(req);
  if (key instanceof Response) return key;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const limit = Math.trunc(Number(url.searchParams.get("limit")) || 20);
  const payments = await prisma.payment.findMany({
    where: { merchantId: key.merchantId, mode: key.mode, ...(id ? { id } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return Response.json({ data: payments.map(serializePayment) });
}
