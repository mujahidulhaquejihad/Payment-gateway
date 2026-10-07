"use client";

import { useActionState } from "react";
import { CopyButton } from "@/app/client-ui";
import { Icon, Spinner } from "@/app/icons";
import { btn, input } from "@/app/styles";
import { createKey } from "./actions";

export default function KeyCreator({ canLive }: { canLive: boolean }) {
  const [state, action, pending] = useActionState(createKey, {});
  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        <div className="w-40">
          <select name="mode" className={input} aria-label="Key mode">
            <option value="test">Test key</option>
            {canLive && <option value="live">Live key</option>}
          </select>
        </div>
        <button disabled={pending} className={btn}>
          {pending ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}Create key
        </button>
      </div>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.key && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">Copy this key now. You won&apos;t see it again.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly aria-label="New API key" className={`${input} font-mono`} value={state.key} onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={state.key} />
          </div>
        </div>
      )}
    </form>
  );
}
