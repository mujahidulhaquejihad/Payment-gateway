"use client";

import { useActionState } from "react";
import { CopyButton } from "@/app/client-ui";
import { Icon, Spinner } from "@/app/icons";
import { btn, input, label } from "@/app/styles";
import { addMember } from "./actions";

export default function MemberCreator() {
  const [state, action, pending] = useActionState(addMember, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_10rem]">
        <div>
          <label className={label} htmlFor="name">Name</label>
          <input className={input} id="name" name="name" required maxLength={100} autoComplete="off" />
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input className={input} id="email" name="email" type="email" required autoComplete="off" placeholder="staff@business.com" />
        </div>
        <div>
          <label className={label} htmlFor="role">Role</label>
          <select className={input} id="role" name="role" defaultValue="VIEWER">
            <option value="MANAGER">Manager</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </div>
      </div>
      <button disabled={pending} className={btn}>
        {pending ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}Add person
      </button>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.password && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">Share this temporary password with {state.email}. You won&apos;t see it again.</p>
          <p className="text-emerald-800">They&apos;ll choose their own password the first time they log in.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly aria-label="Temporary password" className={`${input} font-mono`} value={state.password} onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={state.password} />
          </div>
        </div>
      )}
    </form>
  );
}
