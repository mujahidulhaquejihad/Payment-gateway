import { revalidatePath } from "next/cache";
import { SubmitButton } from "@/app/client-ui";
import { btn, btnSm, card, Icon, PageHeader } from "@/app/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function setKyc(formData: FormData) {
  "use server";
  await requireAdmin();
  const status = formData.get("status") === "APPROVED" ? "APPROVED" : "REJECTED";
  await prisma.merchant.update({ where: { id: String(formData.get("id")) }, data: { kycStatus: status } });
  revalidatePath("/admin/merchants");
}

const KYC_PILL = { PENDING: "bg-amber-50 text-amber-700", APPROVED: "bg-emerald-50 text-emerald-700", REJECTED: "bg-rose-50 text-rose-700" } as const;

export default async function AdminMerchants() {
  await requireAdmin();
  const merchants = await prisma.merchant.findMany({
    orderBy: [{ kycStatus: "asc" }, { createdAt: "desc" }],
    include: { kycDocuments: true },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Merchants" description={`${merchants.filter((m) => m.kycStatus === "PENDING").length} waiting for review`} />
      {merchants.map((m) => (
        <div key={m.id} className={`${card} flex flex-col gap-4 md:flex-row md:items-start md:justify-between`}>
          <div className="min-w-0 text-sm">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold">{m.businessName}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${KYC_PILL[m.kycStatus]}`}>{m.kycStatus.toLowerCase()}</span>
            </div>
            <p className="mt-1 text-slate-500">{m.ownerName} · {m.email} · {m.phone}</p>
            <p className="text-slate-500">Payout: {m.payoutMethod ? <span className="capitalize">{m.payoutMethod} · {m.payoutAccount}</span> : <span className="text-rose-600">not set</span>}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {m.kycDocuments.map((d) => (
                <a key={d.id} className={btnSm} href={`/admin/kyc/${d.id}`}>
                  <Icon name="download" className="h-3.5 w-3.5" />{d.kind.replace("_", " ")}
                </a>
              ))}
              {m.kycDocuments.length === 0 && <span className="text-xs text-slate-400">No documents uploaded</span>}
            </div>
          </div>
          <form action={setKyc} className="flex shrink-0 gap-2">
            <input type="hidden" name="id" value={m.id} />
            {m.kycStatus !== "REJECTED" && <SubmitButton name="status" value="REJECTED" className={`${btnSm} text-rose-600`}>Reject</SubmitButton>}
            {m.kycStatus !== "APPROVED" && <SubmitButton name="status" value="APPROVED" className={btn}>Approve</SubmitButton>}
          </form>
        </div>
      ))}
    </div>
  );
}
