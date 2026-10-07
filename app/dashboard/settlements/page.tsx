import Link from "next/link";
import { btnSm, Icon, PageHeader, panel, td, th } from "@/app/ui";
import { requireMerchant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBDT } from "@/lib/money";

const date = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" });

export default async function SettlementsPage() {
  const m = await requireMerchant();
  const settlements = await prisma.settlement.findMany({ where: { merchantId: m.id }, orderBy: { periodEnd: "desc" }, take: 100 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description={
          m.payoutMethod ? (
            <>Live payments are sent the next business day to <span className="font-medium capitalize text-slate-700">{m.payoutMethod}</span> · {m.payoutAccount}</>
          ) : (
            <>Add a payout account under <Link href="/dashboard/kyc" className="font-medium text-emerald-700 hover:underline">Verification</Link> to receive money.</>
          )
        }
      />
      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className={th}>Sales up to</th>
              <th className={`${th} text-right`}>Sales</th>
              <th className={`${th} text-right`}>Fees</th>
              <th className={`${th} text-right`}>Refunds</th>
              <th className={`${th} text-right`}>You receive</th>
              <th className={th}>Status</th>
              <th className={th}><span className="sr-only">Statement</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {settlements.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className={`${td} whitespace-nowrap`}>{date(s.periodEnd)}</td>
                <td className={`${td} text-right`}>{formatBDT(s.gross)}</td>
                <td className={`${td} text-right text-slate-500`}>-{formatBDT(s.fees)}</td>
                <td className={`${td} text-right text-slate-500`}>-{formatBDT(s.refunds)}</td>
                <td className={`${td} text-right font-semibold`}>{formatBDT(s.net)}</td>
                <td className={td}>
                  {s.status === "PAID" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><Icon name="check" className="h-3 w-3" />Paid {s.paidAt && date(s.paidAt)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700"><Icon name="clock" className="h-3 w-3" />Processing</span>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  <a className={btnSm} href={`/dashboard/settlements/${s.id}/csv`}><Icon name="download" className="h-3.5 w-3.5" />CSV</a>
                </td>
              </tr>
            ))}
            {settlements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Icon name="bank" className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium">No payouts yet</p>
                  <p className="text-sm text-slate-500">Your first payout appears the day after your first live sale.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
