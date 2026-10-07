import Link from "next/link";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/app/client-ui";
import { btn, btnGhost, BuyerShell, card, Icon, type IconName } from "@/app/ui";
import { prisma } from "@/lib/db";
import type { PaymentStatus } from "@/lib/generated/prisma/client";
import { formatBDT } from "@/lib/money";
import { syncPayment } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { notifyMerchant } from "@/lib/webhooks";

const VIEW: Record<PaymentStatus, [title: string, subtitle: string, icon: IconName, tone: string]> = {
  CREATED: ["Payment not started", "Choose a payment method to continue.", "clock", "bg-slate-100 text-slate-500"],
  PENDING: ["Confirming your payment…", "This usually takes a few seconds. This page updates by itself. / অপেক্ষা করুন", "clock", "bg-amber-100 text-amber-600"],
  SUCCEEDED: ["Payment successful", "Thank you! Your payment has been received. / পেমেন্ট সফল", "check", "bg-emerald-100 text-emerald-600"],
  FAILED: ["Payment failed", "No money was taken. You can try again. / পেমেন্ট ব্যর্থ", "x", "bg-rose-100 text-rose-600"],
  PARTIALLY_REFUNDED: ["Partly refunded", "Part of this payment was refunded to you. / আংশিক ফেরত", "check", "bg-violet-100 text-violet-600"],
  REFUNDED: ["Refunded", "This payment was refunded to you. / ফেরত দেওয়া হয়েছে", "check", "bg-violet-100 text-violet-600"],
};

export default async function ResultPage(props: PageProps<"/pay/result/[paymentId]">) {
  const { paymentId } = await props.params;
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { merchant: true, link: true } });
  if (!payment) notFound();

  async function recheck() {
    "use server";
    // Each recheck calls the provider; cap it per payment so the button cannot be used to hammer their API.
    const p = rateLimit(`recheck:${paymentId}`, 10, 10 * 60_000) ? await prisma.payment.findUnique({ where: { id: paymentId } }) : null;
    if (p && (await syncPayment(p).catch(() => false))) {
      after(() => notifyMerchant(paymentId, "payment.updated"));
    }
    redirect(`/pay/result/${paymentId}`);
  }

  const [title, subtitle, icon, tone] = VIEW[payment.status];
  const back = payment.redirectUrl ? `${payment.redirectUrl}${payment.redirectUrl.includes("?") ? "&" : "?"}payment_id=${payment.id}&status=${payment.status}` : null;
  const rows: [string, string | null][] = [
    ["Paid to", payment.merchant.businessName],
    ["Method", payment.provider],
    ["Transaction ID", payment.providerTrxId],
    ["Reference", payment.id],
    ["Date", (payment.paidAt ?? payment.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })],
  ];

  return (
    <BuyerShell test={payment.mode === "TEST"}>
      {/* Re-reads the status while the provider confirms; the callback or cron does the actual update. */}
      {payment.status === "PENDING" && <meta httpEquiv="refresh" content="5" />}
      <div className={`${card} text-center`}>
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${tone}`}>
          <Icon name={icon} className={`h-8 w-8 ${payment.status === "PENDING" ? "animate-pulse" : ""}`} />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <p className="mt-5 text-4xl font-semibold tracking-tight">{formatBDT(payment.amount)}</p>

        <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100 text-left text-sm">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-slate-500">{k}</dt>
              <dd className={`truncate text-right font-medium ${k === "Reference" || k === "Transaction ID" ? "font-mono text-xs leading-5" : ""} ${k === "Method" ? "capitalize" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-col gap-2">
          {payment.status === "PENDING" && (
            <form action={recheck}>
              <SubmitButton className={`${btn} w-full`}>Check status now</SubmitButton>
            </form>
          )}
          {payment.status === "CREATED" && <Link className={btn} href={`/checkout/${payment.id}`}>Continue to payment</Link>}
          {payment.status === "FAILED" && payment.link?.active && <Link className={btn} href={`/pay/${payment.link.slug}`}>Try again / আবার চেষ্টা করুন</Link>}
          {back && <a className={btnGhost} href={back}>Return to {payment.merchant.businessName}</a>}
        </div>
      </div>
      {payment.status === "SUCCEEDED" && <p className="mt-4 text-center text-xs text-slate-400">Keep the reference number for your records.</p>}
    </BuyerShell>
  );
}
