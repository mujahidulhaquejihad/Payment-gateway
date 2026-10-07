import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/app/client-ui";
import { btn, btnGhost, card, Icon, ProviderMark } from "@/app/ui";
import { prisma } from "@/lib/db";
import { formatBDT } from "@/lib/money";
import { mockState } from "@/lib/providers/mock";

export default async function MockGatewayPage(props: PageProps<"/mock-gateway/[ref]">) {
  const { ref } = await props.params;
  const payment = await prisma.payment.findFirst({ where: { providerRef: ref, status: "PENDING" }, include: { merchant: true } });
  if (!payment || !mockState.has(ref)) notFound();
  const provider = payment.provider!;

  async function decide(formData: FormData) {
    "use server";
    const ok = formData.get("result") === "success";
    const s = mockState.get(ref);
    if (s?.status === "PENDING") mockState.set(ref, { ...s, status: ok ? "SUCCEEDED" : "FAILED" });
    redirect(`/api/webhooks/${provider}?ref=${encodeURIComponent(ref)}&status=${ok ? "success" : "failure"}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-slate-900 px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <p className="mb-4 flex items-center justify-center gap-2 text-center text-xs font-medium text-slate-400">
          <Icon name="bolt" className="h-3.5 w-3.5" />Simulated gateway · sandbox only
        </p>
        <div className={card}>
          <div className="flex items-center gap-3">
            <ProviderMark id={provider} />
            <div>
              <p className="font-semibold capitalize">{provider === "card" ? "Card payment" : provider}</p>
              <p className="text-xs text-slate-500">{payment.merchant.businessName}</p>
            </div>
          </div>
          <p className="mt-6 text-center text-4xl font-semibold tracking-tight">{formatBDT(payment.amount)}</p>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            In production this is the {provider === "card" ? "acquiring bank's hosted card page (MPGS / CyberSource) with 3-D Secure" : `${provider} wallet login with OTP and PIN`}.
          </p>
          <form action={decide} className="mt-6 grid grid-cols-2 gap-3">
            <SubmitButton name="result" value="failure" className={btnGhost}>Decline</SubmitButton>
            <SubmitButton name="result" value="success" className={btn}>Approve</SubmitButton>
          </form>
        </div>
      </div>
    </main>
  );
}
