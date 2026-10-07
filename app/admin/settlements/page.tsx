import { revalidatePath } from "next/cache";
import { SubmitButton } from "@/app/client-ui";
import { btn, btnSm, Icon, PageHeader, panel, td, th } from "@/app/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBDT } from "@/lib/money";
import { markSettlementPaid, runSettlement } from "@/lib/settlement";

async function runNow() {
  "use server";
  await requireAdmin();
  await runSettlement();
  revalidatePath("/admin/settlements");
}

async function markPaid(formData: FormData) {
  "use server";
  await requireAdmin();
  await markSettlementPaid(String(formData.get("id")));
  revalidatePath("/admin/settlements");
}

export default async function AdminSettlements() {
  await requireAdmin();
  const settlements = await prisma.settlement.findMany({ orderBy: [{ status: "asc" }, { periodEnd: "desc" }], include: { merchant: true }, take: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Send each pending payout to the account shown, then mark it paid."
        action={<form action={runNow}><SubmitButton className={btn}>Run T+1 settlement now</SubmitButton></form>}
      />
      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className={th}>Merchant</th>
              <th className={th}>Pay to</th>
              <th className={th}>Sales up to</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th}>Status</th>
              <th className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {settlements.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className={`${td} font-medium`}>{s.merchant.businessName}</td>
                <td className={td}><span className="capitalize">{s.payoutMethod}</span> · {s.payoutAccount}</td>
                <td className={`${td} whitespace-nowrap`}>{s.periodEnd.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" })}</td>
                <td className={`${td} text-right font-semibold`}>{formatBDT(s.net)}</td>
                <td className={td}>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{s.status === "PAID" ? "Paid" : "Pending"}</span>
                </td>
                <td className={td}>
                  <div className="flex justify-end gap-2">
                    <a className={btnSm} href={`/dashboard/settlements/${s.id}/csv`}><Icon name="download" className="h-3.5 w-3.5" />CSV</a>
                    {s.status === "PENDING" && (
                      <form action={markPaid}>
                        <input type="hidden" name="id" value={s.id} />
                        <SubmitButton className={`${btnSm} text-emerald-700`}>Mark paid</SubmitButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {settlements.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">No payouts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
