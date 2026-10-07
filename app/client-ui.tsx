"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon, Spinner, type IconName } from "./icons";
import { btnSm } from "./styles";

export function NavLink({ href, icon, children, exact = false }: { href: string; icon: IconName; children: ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-white/[.08] text-white" : "text-slate-400 hover:bg-white/[.04] hover:text-slate-100"}`}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 hidden w-0.5 rounded-full bg-emerald-400 md:block" />}
      <Icon name={icon} className={`h-[18px] w-[18px] shrink-0 transition ${active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}`} />
      {children}
    </Link>
  );
}

export function CopyButton({ text, label = "Copy", className = btnSm }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

/**
 * Submit button that disables the whole form while its server action runs and marks the clicked button.
 * With `spinner={false}` the children style themselves via `group-data-[pending]:` instead.
 */
export function SubmitButton({ children, className, name, value, spinner = true }: { children: ReactNode; className: string; name?: string; value?: string; spinner?: boolean }) {
  const { pending, data } = useFormStatus();
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button className={`group ${className}`} name={name} value={value} disabled={pending} data-pending={mine || undefined}>
      {mine && spinner && <Spinner />}
      {children}
    </button>
  );
}
