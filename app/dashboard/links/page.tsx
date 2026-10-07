import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CopyButton, SubmitButton } from "@/app/client-ui";
import { btn, btnSm, card, ErrorNote, field, Icon, input, label, PageHeader, panel } from "@/app/ui";
import { can, requireMerchant, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLink, LinkInput, linkUrl } from "@/lib/links";
import { formatBDT, toPaisa } from "@/lib/money";

async function create(formData: FormData) {
  "use server";
  const m = await requireMerchant("MANAGER");
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const amount = rawAmount ? toPaisa(rawAmount) : null;
  if (rawAmount && amount === null) redirect("/dashboard/links?error=Enter+a+valid+amount");
  const parsed = LinkInput.safeParse({ title: formData.get("title"), description: formData.get("description") || undefined, amount });
  if (!parsed.success) redirect(`/dashboard/links?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  await createLink(m.id, parsed.data);
  revalidatePath("/dashboard/links");
}

async function toggle(formData: FormData) {
  "use server";
  const m = await requireMerchant("MANAGER");
  const id = String(formData.get("id"));
  const link = await prisma.paymentLink.findFirst({ where: { id, merchantId: m.id } });
  if (link) await prisma.paymentLink.update({ where: { id }, data: { active: !link.active } });
  revalidatePath("/dashboard/links");
}

export default async function LinksPage(props: PageProps<"/dashboard/links">) {
  const u = await requireUser();
  const m = u.merchant;
  const canEdit = can(u.role, "MANAGER");
  const { error } = await props.searchParams;
  const links = await prisma.paymentLink.findMany({
    where: { merchantId: m.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { payments: { where: { status: "SUCCEEDED" } } } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Payment links" description="Create a link once, share it anywhere: Facebook, WhatsApp, Instagram or SMS." />

      {canEdit && <form action={create} className={`${card} space-y-4`}>
        <h2 className="font-semibold">New link</h2>
        <ErrorNote message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="title">What are you selling?</label>
            <input className={input} id="title" name="title" required maxLength={100} placeholder="Handmade saree" />
          </div>
          <div>
            <label className={label} htmlFor="amount">Price <span className="font-normal text-slate-400">(leave empty to let the buyer choose)</span></label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-slate-400">৳</span>
              <input className={`${field} w-full py-2.5 pl-8 pr-3.5 text-sm`} id="amount" name="amount" inputMode="decimal" placeholder="1,500" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="description">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <input className={input} id="description" name="description" maxLength={500} placeholder="Size, colour, delivery details..." />
          </div>
        </div>
        <SubmitButton className={btn}><Icon name="plus" className="h-4 w-4" />Create link</SubmitButton>
      </form>}

      <section className={panel}>
        <ul className="divide-y divide-slate-100">
          {links.map((l) => {
            const url = linkUrl(l.slug);
            return (
              <li key={l.id} className={`flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center ${l.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{l.title}</p>
                    {!l.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Paused</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {l.amount === null ? "Buyer enters amount" : formatBDT(l.amount)} · {l._count.payments} paid
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-400">{url}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={url} />
                  <a className={btnSm} href={`https://wa.me/?text=${encodeURIComponent(`${l.title} - pay securely here: ${url}`)}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="share" className="h-3.5 w-3.5" />WhatsApp
                  </a>
                  <a className={btnSm} href={`/pay/${l.slug}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="external" className="h-3.5 w-3.5" />Open
                  </a>
                  {canEdit && (
                    <form action={toggle}>
                      <input type="hidden" name="id" value={l.id} />
                      <SubmitButton className={btnSm}>{l.active ? "Pause" : "Activate"}</SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
          {links.length === 0 && (
            <li className="px-5 py-12 text-center">
              <Icon name="link" className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium">No links yet</p>
              {canEdit && <p className="text-sm text-slate-500">Create one above and share it with your buyers.</p>}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
