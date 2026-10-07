import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CopyButton, SubmitButton } from "@/app/client-ui";
import { btn, btnGhost, card, ErrorNote, Icon, input, label, Notice, PageHeader } from "@/app/ui";
import { consumeTotp, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { newTotpKey, openSecret, otpauthUri, base32, sealSecret } from "@/lib/totp";

const back = (kind: "error" | "notice", msg: string) => redirect(`/dashboard/account?${kind}=${encodeURIComponent(msg)}`);

// Every sensitive change here re-checks the password, so a stolen session alone cannot lock the real user out.
async function checkPassword(u: { id: string; passwordHash: string }, password: FormDataEntryValue | null) {
  if (!rateLimit(`account:${u.id}`, 10, 15 * 60_000)) back("error", "Too many attempts, try again later");
  const pw = String(password ?? "");
  if (!pw || pw.length > 200 || !(await verifyPassword(pw, u.passwordHash))) back("error", "Incorrect current password");
}

const NewPassword = z
  .object({ password: z.string().min(10, "New password must be at least 10 characters").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, "The new passwords don't match");

async function changePassword(formData: FormData) {
  "use server";
  const u = await requireUser("VIEWER", { allowPasswordChange: true });
  await checkPassword(u, formData.get("current"));
  const parsed = NewPassword.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return back("error", parsed.error.issues[0].message);
  if (await verifyPassword(parsed.data.password, u.passwordHash)) return back("error", "Choose a password different from the current one");
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false, tokenVersion: { increment: 1 } },
  });
  redirect("/login?signedout=1");
}

async function signOutEverywhere() {
  "use server";
  const u = await requireUser("VIEWER", { allowPasswordChange: true });
  await prisma.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } } });
  redirect("/login?signedout=1");
}

async function startTotp() {
  "use server";
  const u = await requireUser();
  // Never overwrite an active secret; it must be turned off (password + code) first.
  if (u.totpEnabled) return back("error", "2-step login is already on");
  await prisma.user.update({ where: { id: u.id }, data: { totpSecret: sealSecret(newTotpKey()), totpLastStep: 0 } });
  revalidatePath("/dashboard/account");
}

async function enableTotp(formData: FormData) {
  "use server";
  const u = await requireUser();
  if (u.totpEnabled || !u.totpSecret) return back("error", "Start the setup again");
  await checkPassword(u, formData.get("password"));
  if (!(await consumeTotp(u, String(formData.get("code") ?? "")))) return back("error", "That code didn't match. Check your phone's time and try the newest code.");
  await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true } });
  back("notice", "2-step login is on. You'll need a code from your app each time you log in.");
}

async function disableTotp(formData: FormData) {
  "use server";
  const u = await requireUser();
  if (!u.totpEnabled) return back("error", "2-step login is already off");
  await checkPassword(u, formData.get("password"));
  if (!(await consumeTotp(u, String(formData.get("code") ?? "")))) return back("error", "That code didn't match");
  await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null } });
  back("notice", "2-step login is off");
}

const codeInput = `${input} tracking-[.3em]`;

export default async function AccountPage(props: PageProps<"/dashboard/account">) {
  const u = await requireUser("VIEWER", { allowPasswordChange: true });
  const { error, notice } = await props.searchParams;
  const key = !u.totpEnabled && u.totpSecret ? openSecret(u.totpSecret) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Account" description={`Signed in as ${u.email}`} />
      <ErrorNote message={error} />
      <Notice message={notice} />

      <form action={changePassword} className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">Change password</h2>
          <p className="text-sm text-slate-500">You&apos;ll be signed out everywhere and asked to log in with the new password.</p>
        </div>
        <div>
          <label className={label} htmlFor="current">Current password</label>
          <input className={input} id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="password">New password</label>
            <input className={input} id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required />
          </div>
          <div>
            <label className={label} htmlFor="confirm">Repeat new password</label>
            <input className={input} id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={200} required />
          </div>
        </div>
        <SubmitButton className={btn}>Change password</SubmitButton>
      </form>

      {!u.mustChangePassword && (
        <section className={`${card} space-y-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">2-step login</h2>
              <p className="text-sm text-slate-500">Ask for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) when you log in.</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.totpEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {u.totpEnabled ? "On" : "Off"}
            </span>
          </div>

          {u.totpEnabled ? (
            <form action={disableTotp} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label className={label} htmlFor="off-password">Password</label>
                <input className={input} id="off-password" name="password" type="password" autoComplete="current-password" required />
              </div>
              <div>
                <label className={label} htmlFor="off-code">Code from app</label>
                <input className={codeInput} id="off-code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required />
              </div>
              <SubmitButton className={btnGhost}>Turn off</SubmitButton>
            </form>
          ) : key ? (
            <form action={enableTotp} className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>Open your authenticator app and add an account with this setup key (or tap the link on your phone).</li>
                <li>Enter the 6-digit code it shows, with your password, to finish.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <code className="flex-1 break-all font-mono text-sm tracking-wider">{base32(key).match(/.{1,4}/g)?.join(" ")}</code>
                <CopyButton text={base32(key)} label="Copy key" />
                <a className={btnGhost} href={otpauthUri(u.email, key)}><Icon name="external" className="h-4 w-4" />Open in app</a>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className={label} htmlFor="on-code">Code from app</label>
                  <input className={codeInput} id="on-code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required />
                </div>
                <div>
                  <label className={label} htmlFor="on-password">Password</label>
                  <input className={input} id="on-password" name="password" type="password" autoComplete="current-password" required />
                </div>
                <SubmitButton className={btn}>Turn on</SubmitButton>
              </div>
            </form>
          ) : (
            <form action={startTotp}>
              <SubmitButton className={btn}><Icon name="shield" className="h-4 w-4" />Set up 2-step login</SubmitButton>
            </form>
          )}
        </section>
      )}

      <form action={signOutEverywhere} className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <h2 className="font-semibold">Sign out everywhere</h2>
          <p className="text-sm text-slate-500">Ends every session on every device, including this one. Use it if you lost a phone or logged in on a shared computer.</p>
        </div>
        <SubmitButton className={`${btnGhost} shrink-0`}><Icon name="logout" className="h-4 w-4" />Sign out everywhere</SubmitButton>
      </form>
    </div>
  );
}
