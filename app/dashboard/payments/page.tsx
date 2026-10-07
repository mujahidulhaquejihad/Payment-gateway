import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/app/client-ui";
import { btnGhost, btnSm, ErrorNote, errorMessage, field, Icon, input, inputSm, Notice, PageHeader, panel, ProviderMark, segment, segmented, StatusBadge, td, th } from "@/app/ui";
import { can, requireMerchant, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { PaymentStatus } from "@/lib/generated/prisma/client";
import { formatBDT, toPaisa } from "@/lib/money";
import { paymentFilter, refundPayment } from "@/lib/payments";
import { notifyMerchant } from "@/lib/webhooks";

async function refund(formData: FormData) {
  "use server";
  const m = await requireMerchant("MANAGER");
  const id = String(formData.get("id"));
  const raw = String(formData.get("amount") ?? "").trim();
  const amount = raw ? toPaisa(raw) : undefined;
  let msg = "Refund completed";
  if (amount === null) msg = "Enter a valid refund amount";
  else {
    try {
      await refundPayment(m.id, id, amount);
      after(() => notifyMerchant(id, "payment.refunded"));
    } catch (e) {
      msg = errorMessage(e, "Refund failed");
    }
  }
  redirect(`/dashboard/payments?${msg === "Refund completed" ? "notice" : "error"}=${encodeURIComponent(msg)}`);
}

const FILTERS: [PaymentStatus | undefined, string][] = [
  [undefined, "All"],
  ["SUCCEEDED", "Paid"],
  ["PENDING", "Pending"],
  ["FAILED", "Failed"],
  ["REFUNDED", "Refunded"],
];

const PAGE_SIZE = 50;

export default async function PaymentsPage(props: PageProps<"/dashboard/payments">) {
  const u = await requireUser();
  const m = u.merchant;
  const canManage = can(u.role, "MANAGER");
  const sp = await props.searchParams;
  const { where, mode, status, q, from, to } = paymentFilter(m.id, m.kycStatus === "APPROVED", sp);
  const page = Math.min(Math.max(Math.trunc(Number(sp.page)) || 1, 1), 1000);
  const rows = await prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 });
  const payments = rows.slice(0, PAGE_SIZE);
  const qs = (over: Record<string, string | undefined> = {}) =>
    `?${new URLSearchParams(Object.entries({ mode: mode.toLowerCase(), status, q, from, to, ...over }).filter((e): e is [string, string] => e[1] !== undefined))}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every payment made through your links and API."
        action={canManage && <a className={btnGhost} href={`/dashboard/payments/export${qs()}`}><Icon name="download" className="h-4 w-4" />Export CSV</a>}
      />
      <ErrorNote message={sp.error} />
      <Notice message={sp.notice} />

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="mode" value={mode.toLowerCase()} />
        {status && <input type="hidden" name="status" value={status} />}
        <div className="relative flex-1">
          <label htmlFor="q" className="sr-only">Search</label>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="q" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Name, phone, payment ID or transaction ID" className={`${field} w-full py-2.5 pl-10 pr-3.5 text-sm`} />
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate-500">From<input name="from" type="date" defaultValue={from} className={input} /></label>
          <label className="flex-1 text-xs text-slate-500">To<input name="to" type="date" defaultValue={to} className={input} /></label>
        </div>
        <button className={btnGhost}>Search</button>
        {(q || from || to) && <Link href={qs({ q: undefined, from: undefined, to: undefined })} className={btnGhost}>Clear</Link>}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`${segmented} overflow-x-auto`}>
          {FILTERS.map(([s, text]) => (
            <Link key={text} href={qs({ status: s })} className={segment(status === s)}>{text}</Link>
          ))}
        </div>
        <div className={segmented}>
          {(["live", "test"] as const).map((md) => (
            <Link key={md} href={qs({ mode: md })} className={segment(mode === md.toUpperCase())}>{md}</Link>
          ))}
        </div>
      </div>

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className={th}>Customer</th>
              <th className={th}>Method</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th}>Status</th>
              <th className={th}>Date</th>
              <th className={th}><span className="sr-only">Refund</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className={td}>
                  <p className="font-medium">{p.customerName ?? "Customer"}</p>
                  <p className="text-xs text-slate-500">{p.customerPhone ?? p.description ?? ""}</p>
                  <p className="font-mono text-[11px] text-slate-400">{p.id}</p>
                </td>
                <td className={td}>
                  {p.provider ? (
                    <span className="inline-flex items-center gap-2 capitalize"><ProviderMark id={p.provider} className="h-6 w-6 text-[8px]" />{p.provider}</span>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <p className="font-semibold">{formatBDT(p.amount)}</p>
                  {p.fee > 0 && <p className="text-xs text-slate-400">fee {formatBDT(p.fee)}</p>}
                  {p.refundedAmount > 0 && <p className="text-xs text-violet-600">-{formatBDT(p.refundedAmount)} refunded</p>}
                </td>
                <td className={td}><StatusBadge status={p.status} /></td>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{p.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</td>
                <td className={td}>
                  {canManage && (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") && (
                    <form action={refund} className="flex justify-end gap-1.5">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="amount" aria-label="Refund amount (empty for full)" placeholder="Full" inputMode="decimal" className={inputSm} />
                      <SubmitButton className={btnSm}>Refund</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">No payments match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(page > 1 || rows.length > PAGE_SIZE) && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link className={btnSm} href={qs({ page: String(page - 1) })}>Previous</Link> : <span />}
          <span className="text-slate-500">Page {page}</span>
          {rows.length > PAGE_SIZE ? <Link className={btnSm} href={qs({ page: String(page + 1) })}>Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
