import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/app/client-ui";
import { btn, card, ErrorNote, Icon, input, label, PageHeader } from "@/app/ui";
import { requireMerchant, requireUser, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const KINDS = { trade_license: "Trade License", nid: "Owner NID (front & back)", bank_proof: "Bank statement / cheque leaf" } as const;
// Detected from file contents, not the browser-supplied MIME type.
const SIGNATURES: [string, number[]][] = [
  [".pdf", [0x25, 0x50, 0x44, 0x46]],
  [".png", [0x89, 0x50, 0x4e, 0x47]],
  [".jpg", [0xff, 0xd8, 0xff]],
];
const MAX_BYTES = 5 * 1024 * 1024;

const MAX_DOCS = 20;
const PAYOUT_METHODS = [["bank", "Bank"], ["bkash", "bKash"], ["nagad", "Nagad"]] as const;

const Payout = z.object({
  payoutMethod: z.enum(["bank", "bkash", "nagad"]),
  payoutAccount: z.string().trim().min(5, "Enter your account details").max(200),
  password: z.string().min(1, "Enter your password to change the payout account").max(200),
});

// Changing where money goes is the highest-value takeover target, so it needs the password, not just a session.
async function savePayout(formData: FormData) {
  "use server";
  const u = await requireUser("OWNER");
  const m = u.merchant;
  const fail = (msg: string) => redirect(`/dashboard/kyc?error=${encodeURIComponent(msg)}`);
  const parsed = Payout.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!rateLimit(`payout:${m.id}`, 5, 15 * 60_000)) return fail("Too many attempts, try again later");
  const { password, ...data } = parsed.data;
  if (!(await verifyPassword(password, u.passwordHash))) return fail("Incorrect password");
  await prisma.merchant.update({ where: { id: m.id }, data });
  revalidatePath("/dashboard/kyc");
}

async function upload(formData: FormData) {
  "use server";
  const m = await requireMerchant("OWNER");
  const kind = String(formData.get("kind"));
  const file = formData.get("file");
  const fail = (msg: string) => redirect(`/dashboard/kyc?error=${encodeURIComponent(msg)}`);
  if (!(kind in KINDS)) fail("Choose a document type");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file");
  if (file.size > MAX_BYTES) fail("File must be 5 MB or smaller");
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = SIGNATURES.find(([, sig]) => sig.every((b, i) => bytes[i] === b))?.[0];
  if (!ext) return fail("Only PDF, JPG or PNG files are accepted");
  if ((await prisma.kycDocument.count({ where: { merchantId: m.id } })) >= MAX_DOCS) return fail("Document limit reached, contact support");

  // Stored under a random name; the original name is only kept as metadata.
  const dir = path.join(UPLOAD_DIR, m.id);
  await mkdir(dir, { recursive: true });
  const stored = path.join(dir, `${randomBytes(12).toString("hex")}${ext}`);
  await writeFile(stored, bytes);
  await prisma.kycDocument.create({ data: { merchantId: m.id, kind, fileName: file.name.slice(0, 200), path: path.relative(UPLOAD_DIR, stored) } });
  revalidatePath("/dashboard/kyc");
}

export default async function KycPage(props: PageProps<"/dashboard/kyc">) {
  const m = await requireMerchant("OWNER");
  const { error } = await props.searchParams;
  const docs = await prisma.kycDocument.findMany({ where: { merchantId: m.id }, orderBy: { createdAt: "desc" } });

  const uploaded = new Map(docs.map((d) => [d.kind, d.fileName]));
  const docsDone = Object.keys(KINDS).every((k) => uploaded.has(k));
  const steps: [string, boolean][] = [
    ["Payout account", Boolean(m.payoutAccount)],
    [`Documents ${Object.keys(KINDS).filter((k) => uploaded.has(k)).length}/3`, docsDone],
    [m.kycStatus === "APPROVED" ? "Approved" : m.kycStatus === "REJECTED" ? "Not approved" : "Review", m.kycStatus === "APPROVED"],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Verify your business"
        description={m.kycStatus === "APPROVED" ? "You're verified and accepting real payments." : "Complete these steps to accept real money. We review within 1 business day."}
      />

      <ol className="grid grid-cols-3 gap-2">
        {steps.map(([text, done], i) => (
          <li key={i} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              {done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="truncate">{text}</span>
          </li>
        ))}
      </ol>

      <ErrorNote message={error} />

      <form action={savePayout} className={`${card} space-y-5`}>
        <div>
          <h2 className="font-semibold">Where should we send your money?</h2>
          <p className="text-sm text-slate-500">Payouts arrive the next business day.</p>
        </div>
        <fieldset>
          <legend className={label}>Payout method</legend>
          <div className="grid grid-cols-3 gap-2">
            {PAYOUT_METHODS.map(([value, text]) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="payoutMethod" value={value} defaultChecked={(m.payoutMethod ?? "bank") === value} className="peer sr-only" />
                <span className="flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-700 peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-500/15">
                  {text}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={label} htmlFor="payoutAccount">Account details</label>
          <input className={input} id="payoutAccount" name="payoutAccount" defaultValue={m.payoutAccount ?? ""} required placeholder="Bank, branch and account number, or wallet number" />
        </div>
        <div>
          <label className={label} htmlFor="payoutPassword">Confirm with your password</label>
          <input className={input} id="payoutPassword" name="password" type="password" autoComplete="current-password" required />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500"><Icon name="lock" className="h-3.5 w-3.5" />Required to protect where your money goes.</p>
        </div>
        <SubmitButton className={btn}>Save payout account</SubmitButton>
      </form>

      <form action={upload} className={`${card} space-y-5`}>
        <div>
          <h2 className="font-semibold">Business documents</h2>
          <p className="text-sm text-slate-500">Clear photos or scans. PDF, JPG or PNG up to 5 MB.</p>
        </div>
        <ul className="space-y-2">
          {Object.entries(KINDS).map(([k, text]) => (
            <li key={k} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-sm">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${uploaded.has(k) ? "bg-emerald-600 text-white" : "border border-dashed border-slate-300 text-slate-400"}`}>
                {uploaded.has(k) && <Icon name="check" className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 font-medium">{text}</span>
              <span className="max-w-[40%] truncate text-xs text-slate-500">{uploaded.get(k) ?? "Missing"}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
          <div>
            <label className={label} htmlFor="kind">Document</label>
            <select className={input} id="kind" name="kind" defaultValue={Object.keys(KINDS).find((k) => !uploaded.has(k))}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="file">File</label>
            <input
              className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200`}
              id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required
            />
          </div>
        </div>
        <SubmitButton className={btn}><Icon name="upload" className="h-4 w-4" />Upload document</SubmitButton>
      </form>
    </div>
  );
}
