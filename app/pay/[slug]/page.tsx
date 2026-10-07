import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/app/client-ui";
import { btnLg, BuyerShell, card, clientIp, ErrorNote, errorMessage, field, Icon, input, label, ProviderMark } from "@/app/ui";
import { prisma } from "@/lib/db";
import { formatBDT, toPaisa } from "@/lib/money";
import { createPayment } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";

const Form = z.object({
  amount: z.string().optional(),
  customerName: z.string().trim().min(1, "Enter your name").max(100),
  customerPhone: z.string().trim().regex(/^01[3-9]\d{8}$/, "Enter a valid 11-digit mobile number"),
});

export default async function PayLinkPage(props: PageProps<"/pay/[slug]">) {
  const { slug } = await props.params;
  const { error } = await props.searchParams;
  const link = await prisma.paymentLink.findUnique({ where: { slug }, include: { merchant: true } });
  if (!link || !link.active || link.merchant.kycStatus === "REJECTED") notFound();

  async function start(formData: FormData) {
    "use server";
    const fail = (msg: string) => redirect(`/pay/${slug}?error=${encodeURIComponent(msg)}`);
    if (!rateLimit(`paylink:${await clientIp()}`, 30, 10 * 60_000)) fail("Too many attempts, please wait a few minutes");
    const parsed = Form.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const l = await prisma.paymentLink.findUnique({ where: { slug }, include: { merchant: true } });
    if (!l || !l.active) return fail("This payment link is no longer active");
    const amount = l.amount ?? toPaisa(parsed.data.amount ?? "");
    if (amount === null) return fail("Enter a valid amount");

    let id: string;
    try {
      const p = await createPayment({
        merchantId: l.merchantId,
        linkId: l.id,
        mode: l.merchant.kycStatus === "APPROVED" ? "LIVE" : "TEST",
        amount,
        description: l.title,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
      });
      id = p.id;
    } catch (e) {
      return fail(errorMessage(e, "Could not start payment"));
    }
    redirect(`/checkout/${id}`);
  }

  return (
    <BuyerShell merchant={link.merchant.businessName} test={link.merchant.kycStatus !== "APPROVED"}>
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">{link.title}</h1>
        {link.description && <p className="mt-1 text-sm text-slate-500">{link.description}</p>}
        {link.amount !== null && <p className="mt-4 text-4xl font-semibold tracking-tight">{formatBDT(link.amount)}</p>}

        <form action={start} className="mt-6 space-y-4">
          <ErrorNote message={error} />
          {link.amount === null && (
            <div>
              <label className={label} htmlFor="amount">Amount / টাকার পরিমাণ</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl text-slate-400">৳</span>
                <input className={`${field} w-full py-3 pl-10 pr-4 text-xl font-semibold`} id="amount" name="amount" inputMode="decimal" required placeholder="500" />
              </div>
            </div>
          )}
          <div>
            <label className={label} htmlFor="customerName">Your name / আপনার নাম</label>
            <input className={input} id="customerName" name="customerName" required maxLength={100} autoComplete="name" />
          </div>
          <div>
            <label className={label} htmlFor="customerPhone">Mobile number / মোবাইল নম্বর</label>
            <input className={input} id="customerPhone" name="customerPhone" required inputMode="tel" placeholder="01XXXXXXXXX" autoComplete="tel" maxLength={11} />
          </div>
          <SubmitButton className={`${btnLg} w-full`}>Continue to payment<Icon name="arrow" className="h-4 w-4" /></SubmitButton>
        </form>

        <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4">
          {["bkash", "nagad", "rocket", "upay", "card"].map((id) => <ProviderMark key={id} id={id} className="h-7 w-7 text-[9px]" />)}
        </div>
      </div>
    </BuyerShell>
  );
}
