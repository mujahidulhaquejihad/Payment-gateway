import Link from "next/link";
import { field, Icon, PageHeader, panel, Stat, td, th } from "@/app/ui";
import { requireMerchant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { formatBDT } from "@/lib/money";

const SORTS = {
  recent: ["Last purchase", Prisma.sql`last DESC NULLS LAST`],
  spent: ["Total spent", Prisma.sql`spent DESC`],
  orders: ["Orders", Prisma.sql`orders DESC, spent DESC`],
} as const;
const LIMIT = 200;

type Row = { phone: string; name: string | null; orders: number; spent: bigint; last: Date | null };

export default async function CustomersPage(props: PageProps<"/dashboard/customers">) {
  const m = await requireMerchant();
  const sp = await props.searchParams;
  const mode = m.kycStatus === "APPROVED" ? "LIVE" : "TEST";
  const sort = (Object.keys(SORTS) as (keyof typeof SORTS)[]).find((s) => s === sp.sort) ?? "recent";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  // Buyers are identified by mobile number, which every checkout collects.
  const paid = Prisma.sql`"merchantId" = ${m.id} AND mode = ${mode}::"Mode" AND "customerPhone" IS NOT NULL
    AND status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')`;
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const search = q ? Prisma.sql`AND ("customerPhone" LIKE ${like} OR "customerName" ILIKE ${like})` : Prisma.empty;

  const [rows, [totals]] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT "customerPhone" AS phone,
        (array_agg("customerName" ORDER BY "paidAt" DESC) FILTER (WHERE "customerName" IS NOT NULL))[1] AS name,
        COUNT(*)::int AS orders, SUM(amount - "refundedAmount") AS spent, MAX("paidAt") AS last
      FROM "Payment" WHERE ${paid} ${search}
      GROUP BY "customerPhone" ORDER BY ${SORTS[sort][1]} LIMIT ${LIMIT}`,
    prisma.$queryRaw<{ customers: number; repeat: number }[]>`
      SELECT COUNT(*)::int AS customers, COUNT(*) FILTER (WHERE n > 1)::int AS repeat
      FROM (SELECT COUNT(*) AS n FROM "Payment" WHERE ${paid} GROUP BY "customerPhone") t`,
  ]);
  const href = (s: string) => `?${new URLSearchParams({ sort: s, ...(q && { q }) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description={`Everyone who has paid you${mode === "TEST" ? " in test mode" : ""}, grouped by mobile number.`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon="users" tone="bg-emerald-50 text-emerald-600" label="Customers" value={String(totals.customers)} hint="Paid at least once" />
        <Stat icon="bolt" tone="bg-violet-50 text-violet-600" label="Repeat buyers" value={String(totals.repeat)} hint="Paid two or more times" />
        <Stat icon="chart" tone="bg-sky-50 text-sky-600" label="Repeat rate" value={`${totals.customers ? Math.round((totals.repeat / totals.customers) * 100) : 0}%`} hint="Share of customers who came back" />
      </div>

      <form className="relative max-w-md">
        <input type="hidden" name="sort" value={sort} />
        <label htmlFor="q" className="sr-only">Search customers</label>
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input id="q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search by name or phone" className={`${field} w-full py-2.5 pl-10 pr-3.5 text-sm`} />
      </form>

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className={th}>Customer</th>
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
                <th key={s} className={`${th} ${s === "recent" ? "" : "text-right"}`} aria-sort={sort === s ? "descending" : undefined}>
                  <Link href={href(s)} className={sort === s ? "text-slate-900" : "hover:text-slate-900"}>{SORTS[s][0]}{sort === s && " ↓"}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.phone} className="hover:bg-slate-50/60">
                <td className={td}>
                  <Link href={`/dashboard/payments?${new URLSearchParams({ mode: mode.toLowerCase(), q: r.phone })}`} className="group">
                    <p className="font-medium group-hover:text-emerald-700">
                      {r.name ?? "Customer"}
                      {r.orders > 1 && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Repeat</span>}
                    </p>
                    <p className="text-xs text-slate-500">{r.phone}</p>
                  </Link>
                </td>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{r.last?.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" })}</td>
                <td className={`${td} whitespace-nowrap text-right font-semibold`}>{formatBDT(Number(r.spent))}</td>
                <td className={`${td} text-right`}>{r.orders}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-500">{q ? "No customers match this search." : "No paying customers yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length === LIMIT && <p className="text-center text-xs text-slate-400">Showing the top {LIMIT}. Search to find others.</p>}
    </div>
  );
}
