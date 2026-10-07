import Link from "next/link";
import { card, PageHeader, PROVIDER_BRAND, ProviderMark, segment, segmented, Stat } from "@/app/ui";
import { requireMerchant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatBDT } from "@/lib/money";
import { settlementCutoff } from "@/lib/settlement";

const RANGES = [7, 30, 90] as const;
const PAID = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
const DAY = 86400_000;
// Calendar day in Asia/Dhaka (UTC+6, no DST).
const dhakaDate = (t: number) => new Date(t + 6 * 3600_000).toISOString().slice(0, 10);

export default async function AnalyticsPage(props: PageProps<"/dashboard/analytics">) {
  const m = await requireMerchant();
  const sp = await props.searchParams;
  const range = RANGES.find((r) => String(r) === sp.range) ?? 30;
  const mode = m.kycStatus === "APPROVED" ? "LIVE" : "TEST";
  const since = new Date(settlementCutoff().getTime() - (range - 1) * DAY);
  const paidWhere: Prisma.PaymentWhereInput = { merchantId: m.id, mode, status: { in: [...PAID] }, paidAt: { gte: since } };

  const [daily, byMethod, attempts, refunds] = await Promise.all([
    prisma.$queryRaw<{ day: string; revenue: bigint }[]>`
      SELECT to_char((("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS day, SUM(amount) AS revenue
      FROM "Payment"
      WHERE "merchantId" = ${m.id} AND mode = ${mode}::"Mode" AND status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED') AND "paidAt" >= ${since}
      GROUP BY 1`,
    prisma.payment.groupBy({ by: ["provider"], where: paidWhere, _sum: { amount: true }, _count: true }),
    prisma.payment.groupBy({ by: ["status"], where: { merchantId: m.id, mode, createdAt: { gte: since }, status: { not: "CREATED" } }, _count: true }),
    prisma.refund.aggregate({ where: { createdAt: { gte: since }, payment: { merchantId: m.id, mode } }, _sum: { amount: true } }),
  ]);

  const perDay = new Map(daily.map((d) => [d.day, Number(d.revenue)]));
  const days = Array.from({ length: range }, (_, i) => {
    const day = dhakaDate(since.getTime() + i * DAY);
    return { day, revenue: perDay.get(day) ?? 0 };
  });
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const revenue = byMethod.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const orders = byMethod.reduce((s, r) => s + r._count, 0);
  const count = (pred: (s: string) => boolean) => attempts.filter((a) => pred(a.status)).reduce((s, a) => s + a._count, 0);
  const succeeded = count((s) => (PAID as readonly string[]).includes(s));
  const finished = succeeded + count((s) => s === "FAILED");
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`How your sales are doing${mode === "TEST" ? " (test mode)" : ""}.`}
        action={
          <div className={segmented}>
            {RANGES.map((r) => (
              <Link key={r} href={`?range=${r}`} className={segment(r === range)}>{r} days</Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="bolt" tone="bg-emerald-50 text-emerald-600" label="Sales" value={formatBDT(revenue)} hint={`${orders} paid order${orders === 1 ? "" : "s"}`} />
        <Stat icon="card" tone="bg-sky-50 text-sky-600" label="Average order" value={formatBDT(orders ? Math.round(revenue / orders) : 0)} hint="Sales ÷ paid orders" />
        <Stat icon="check" tone="bg-violet-50 text-violet-600" label="Success rate" value={finished ? `${Math.round((succeeded / finished) * 100)}%` : "–"} hint={`${succeeded} of ${finished} completed checkouts`} />
        <Stat icon="arrow" tone="bg-rose-50 text-rose-600" label="Refunded" value={formatBDT(refunds._sum.amount ?? 0)} hint="Returned to buyers" />
      </div>

      <section className={card}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Daily sales</h2>
          <p className="text-sm text-slate-500">Peak <span className="font-semibold tabular-nums text-slate-900">{formatBDT(max === 1 ? 0 : max)}</span></p>
        </div>
        <div className="relative mt-6 h-52">
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-dashed border-slate-900/[.06]" />)}
          </div>
          <div className="relative flex h-full items-end gap-px sm:gap-1" role="img" aria-label={`Daily sales for the last ${range} days, highest ${formatBDT(max === 1 ? 0 : max)}`}>
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${label(d.day)}: ${formatBDT(d.revenue)}`}>
                <div
                  className={`w-full rounded-t-md transition duration-200 ${d.revenue ? "bg-gradient-to-t from-emerald-600 to-teal-300 group-hover:from-emerald-500 group-hover:to-emerald-300" : "bg-slate-900/[.06]"}`}
                  style={{ height: d.revenue ? `${Math.max((d.revenue / max) * 100, 2)}%` : "3px" }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>{label(days[0].day)}</span>
          <span>{label(days[Math.floor(range / 2)].day)}</span>
          <span>{label(days[range - 1].day)}</span>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Sales by payment method</h2>
        <ul className="mt-4 space-y-4">
          {byMethod.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)).map((r) => {
            const amount = r._sum.amount ?? 0;
            const pct = revenue ? Math.round((amount / revenue) * 100) : 0;
            const id = r.provider ?? "unknown";
            return (
              <li key={id} className="flex items-center gap-3">
                <ProviderMark id={id} className="h-8 w-8 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium capitalize">{id}</span>
                    <span className="text-slate-500">{formatBDT(amount)} · {r._count} · {pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${PROVIDER_BRAND[id]?.[1] ?? "bg-slate-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
          {byMethod.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No sales in this period yet.</li>}
        </ul>
      </section>
    </div>
  );
}
