import Link from "next/link";
import { CopyButton } from "@/app/client-ui";
import { avatar, btn, Icon, PageHeader, panel, Stat, StatusBadge } from "@/app/ui";
import { can, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linkUrl } from "@/lib/links";
import { formatBDT } from "@/lib/money";
import { settlementCutoff } from "@/lib/settlement";

const PAID = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

export default async function Overview() {
  const u = await requireUser();
  const m = u.merchant;
  const mode = m.kycStatus === "APPROVED" ? "LIVE" : "TEST";
  const [today, unsettled, unsettledRefunds, recent, link] = await Promise.all([
    prisma.payment.aggregate({ where: { merchantId: m.id, mode, status: { in: [...PAID] }, paidAt: { gte: settlementCutoff() } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { merchantId: m.id, mode: "LIVE", status: { in: [...PAID] }, settlementId: null }, _sum: { amount: true, fee: true } }),
    prisma.refund.aggregate({ where: { settlementId: null, payment: { merchantId: m.id, mode: "LIVE" } }, _sum: { amount: true } }),
    prisma.payment.findMany({ where: { merchantId: m.id, mode }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.paymentLink.findFirst({ where: { merchantId: m.id, active: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const pending = (unsettled._sum.amount ?? 0) - (unsettled._sum.fee ?? 0) - (unsettledRefunds._sum.amount ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${u.name.split(" ")[0]}`}
        description="Here's how your business is doing today."
        action={can(u.role, "MANAGER") && <Link href="/dashboard/links" className={btn}><Icon name="plus" className="h-4 w-4" />New payment link</Link>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon="bolt" tone="bg-emerald-50 text-emerald-600" label="Today's sales" value={formatBDT(today._sum.amount ?? 0)} hint={`${today._count} payment${today._count === 1 ? "" : "s"}${mode === "TEST" ? " · test mode" : ""}`} />
        <Stat icon="bank" tone="bg-sky-50 text-sky-600" label="Next payout" value={formatBDT(Math.max(pending, 0))} hint="Sent the next business day (T+1)" />
        <div className="relative isolate flex flex-col overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-[0_12px_32px_-16px_rgb(15_23_42/.5)]">
          <div aria-hidden className="absolute -right-10 -top-10 -z-10 h-40 w-40 rounded-full bg-emerald-500/30 blur-2xl" />
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-slate-400">Share & get paid</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-emerald-300"><Icon name="share" className="h-4 w-4" /></span>
          </div>
          {link ? (
            <>
              <p className="mt-3 truncate text-lg font-semibold">{link.title}</p>
              <p className="truncate font-mono text-xs text-slate-400">{linkUrl(link.slug)}</p>
              <div className="mt-auto pt-4"><CopyButton text={linkUrl(link.slug)} label="Copy link" /></div>
            </>
          ) : (
            <Link href="/dashboard/links" className="mt-4 text-sm font-semibold text-emerald-300 hover:underline">Create your first link →</Link>
          )}
        </div>
      </div>

      <section className={panel}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Recent payments</h2>
          <Link href="/dashboard/payments" className="text-sm font-medium text-emerald-700 hover:underline">View all</Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {recent.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className={`${avatar} h-9 w-9 text-sm`}>
                {(p.customerName ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.customerName ?? "Customer"}</p>
                <p className="truncate text-xs text-slate-500">{p.description ?? p.id} · {p.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatBDT(p.amount)}</p>
                <StatusBadge status={p.status} />
              </div>
            </li>
          ))}
          {recent.length === 0 && (
            <li className="px-5 py-12 text-center">
              <Icon name="card" className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium">No payments yet</p>
              <p className="text-sm text-slate-500">Share a payment link and your sales will show up here.</p>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
