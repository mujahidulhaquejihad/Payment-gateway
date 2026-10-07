import { currentUser } from "@/lib/auth";
import { settlementCsv } from "@/lib/settlement";

export async function GET(_req: Request, ctx: RouteContext<"/dashboard/settlements/[id]/csv">) {
  const u = await currentUser();
  if (!u || u.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const csv = await settlementCsv(id, u.isAdmin ? undefined : u.merchantId);
  if (!csv) return new Response("Not found", { status: 404 });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="settlement-${id}.csv"`, "Cache-Control": "no-store" },
  });
}
