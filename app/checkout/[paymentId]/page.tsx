import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/app/client-ui";
import { BuyerShell, card, clientIp, ErrorNote, errorMessage, Icon, ProviderMark, Spinner } from "@/app/ui";
import { prisma } from "@/lib/db";
import { formatBDT } from "@/lib/money";
import { startCheckout } from "@/lib/payments";
import { providersFor } from "@/lib/providers";

export default async function CheckoutPage(props: PageProps<"/checkout/[paymentId]">) {
  const { paymentId } = await props.params;
  const { error } = await props.searchParams;
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { merchant: true } });
  if (!payment) notFound();
  if (payment.status !== "CREATED") redirect(`/pay/result/${payment.id}`);

  async function pay(formData: FormData) {
    "use server";
    let url: string;
    try {
      url = await startCheckout(paymentId, String(formData.get("provider")), await clientIp());
    } catch (e) {
      return redirect(`/checkout/${paymentId}?error=${encodeURIComponent(errorMessage(e, "Could not reach the payment provider, please try another method"))}`);
    }
    redirect(url);
  }

  const providers = providersFor(payment.mode);
  return (
    <BuyerShell merchant={payment.merchant.businessName} test={payment.mode === "TEST"}>
      <div className={card}>
        <div className="rounded-xl bg-slate-50 px-4 py-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount to pay</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">{formatBDT(payment.amount)}</p>
          {payment.description && <p className="mt-1 text-sm text-slate-500">{payment.description}</p>}
        </div>

        <form action={pay} className="mt-6 space-y-2.5">
          <ErrorNote message={error} />
          <p className="pb-1 text-sm font-medium text-slate-700">Choose how to pay / পেমেন্ট মাধ্যম বেছে নিন</p>
          {providers.map((p) => (
            <SubmitButton
              key={p.id}
              name="provider"
              value={p.id}
              spinner={false}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-slate-900/10 shadow-[0_1px_2px_rgb(15_23_42/.05)] transition duration-150 hover:-translate-y-px hover:bg-emerald-50/40 hover:ring-emerald-500/50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-wait data-[pending]:bg-emerald-50/60 data-[pending]:ring-2 data-[pending]:ring-emerald-500"
            >
              <ProviderMark id={p.id} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{p.label}</span>
                {p.sandboxHint && <span className="block truncate text-xs text-slate-400">{p.sandboxHint}</span>}
              </span>
              <Icon name="arrow" className="h-4 w-4 text-slate-400 group-data-[pending]:hidden" />
              <span className="hidden text-emerald-600 group-data-[pending]:inline-flex"><Spinner /></span>
            </SubmitButton>
          ))}
          {providers.length === 0 && <ErrorNote message="No payment methods are available right now. Please try again later." />}
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">You&apos;ll confirm on your wallet or bank&apos;s secure page. We never see your PIN or card details.</p>
    </BuyerShell>
  );
}
