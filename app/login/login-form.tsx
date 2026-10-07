"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, Spinner } from "@/app/icons";
import { btn, input, label } from "@/app/styles";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [needCode, setNeedCode] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), code: fd.get("code") ?? "", redirect: false });
    setPending(false);
    if (res?.ok) return router.push("/dashboard");
    if (res?.error === "OTP_REQUIRED") return setNeedCode(true);
    setError(res?.error === "OTP_INVALID" ? "That code didn't work. Wait for a new one and try again." : "Invalid email or password, or too many attempts.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />{error}
        </p>
      )}
      <div>
        <label className={label} htmlFor="email">Email</label>
        <input className={input} id="email" name="email" type="email" autoComplete="email" required placeholder="you@business.com" />
      </div>
      <div>
        <label className={label} htmlFor="password">Password</label>
        <input className={input} id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {needCode && (
        <div>
          <label className={label} htmlFor="code">6-digit code from your authenticator app</label>
          <input className={`${input} tracking-[.3em]`} id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus />
        </div>
      )}
      <button disabled={pending} className={`${btn} w-full`}>
        {pending && <Spinner />}
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
