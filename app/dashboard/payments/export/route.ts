import { currentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paisaToDecimal } from "@/lib/money";
import { paymentFilter } from "@/lib/payments";
import { toCsv } from "@/lib/settlement";

// ponytail: builds the whole file in memory, capped at 10k rows; stream with a cursor if merchants need more.
const MAX_ROWS = 10_000;

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || u.mustChangePassword || !can(u.role, "MANAGER")) return new Response("Not found", { status: 404 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { where, mode } = paymentFilter(u.merchantId, u.merchant.kycStatus === "APPROVED", sp);
  const payments = await prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
  const rows: (string | number | null)[][] = [
    ["payment_id", "created_at", "paid_at", "status", "method", "customer_name", "customer_phone", "description", "amount", "fee", "refunded", "provider_trx_id"],
    ...payments.map((p) => [
      p.id, p.createdAt.toISOString(), p.paidAt?.toISOString() ?? "", p.status, p.provider, p.customerName, p.customerPhone, p.description,
      paisaToDecimal(p.amount), paisaToDecimal(p.fee), paisaToDecimal(p.refundedAmount), p.providerTrxId,
    ]),
  ];
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${mode.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
