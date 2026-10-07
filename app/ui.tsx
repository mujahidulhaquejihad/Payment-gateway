import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { PaymentStatus } from "@/lib/generated/prisma/client";
import { PaymentError } from "@/lib/payments";
import { ipFrom } from "@/lib/rate-limit";
import Link from "next/link";
import { Icon, type IconName, Logo } from "./icons";
import { card, panel } from "./styles";

export const avatar = "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 font-semibold text-slate-600 ring-1 ring-slate-900/5";

export * from "./icons";
export * from "./styles";

const STATUS: Record<PaymentStatus, [label: string, pill: string, dot: string]> = {
  CREATED: ["Not started", "bg-slate-50 text-slate-600 ring-slate-500/20", "bg-slate-400"],
  PENDING: ["Pending", "bg-amber-50 text-amber-700 ring-amber-600/20", "bg-amber-500 animate-pulse"],
  SUCCEEDED: ["Paid", "bg-emerald-50 text-emerald-700 ring-emerald-600/20", "bg-emerald-500"],
  FAILED: ["Failed", "bg-rose-50 text-rose-700 ring-rose-600/20", "bg-rose-500"],
  PARTIALLY_REFUNDED: ["Partly refunded", "bg-violet-50 text-violet-700 ring-violet-600/20", "bg-violet-500"],
  REFUNDED: ["Refunded", "bg-violet-50 text-violet-700 ring-violet-600/20", "bg-violet-500"],
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const [text, pill, dot] = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

const note = "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm ring-1 ring-inset animate-rise";

export function ErrorNote({ message }: { message?: string | string[] }) {
  if (!message) return null;
  return (
    <p role="alert" className={`${note} bg-rose-50 text-rose-700 ring-rose-600/15`}>
      <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
      {String(message)}
    </p>
  );
}

export function Notice({ message }: { message?: string | string[] }) {
  if (!message) return null;
  return (
    <p role="status" className={`${note} bg-emerald-50 text-emerald-800 ring-emerald-600/15`}>
      <Icon name="check" className="mt-px h-4 w-4 shrink-0" />
      {String(message)}
    </p>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-slate-950">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ icon, label, value, hint, tone }: { icon: IconName; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className={`${card} relative overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:ring-slate-900/10`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

/** Brand colour and short mark for each payment method. */
export const PROVIDER_BRAND: Record<string, [mark: string, color: string]> = {
  bkash: ["bK", "bg-pink-600"],
  nagad: ["N", "bg-orange-500"],
  rocket: ["R", "bg-purple-700"],
  upay: ["U", "bg-sky-600"],
  card: ["VISA", "bg-slate-800"],
};

export function ProviderMark({ id, className = "h-10 w-10 text-xs" }: { id: string; className?: string }) {
  const [mark, color] = PROVIDER_BRAND[id] ?? [id.slice(0, 2).toUpperCase(), "bg-slate-500"];
  return <span className={`flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.22)] ${color} ${className}`}>{mark}</span>;
}

/** Soft emerald glow over a dot texture, used behind buyer and auth pages. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="absolute -top-48 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-300/40 via-teal-200/40 to-sky-200/40 blur-3xl" />
    </div>
  );
}

/** Frame for every buyer-facing page: who is being paid, test-mode warning, and a trust footer. */
export function BuyerShell({ merchant, test, children }: { merchant?: string; test?: boolean; children: ReactNode }) {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center px-4 py-8 sm:py-14">
      <Backdrop />
      <div className="w-full max-w-md animate-rise">
        {test && (
          <p className="mb-4 flex items-center justify-center gap-2 rounded-full bg-amber-100/80 px-3 py-1.5 text-center text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-500/20 backdrop-blur">
            <Icon name="bolt" className="h-3.5 w-3.5" />Test mode · no real money moves
          </p>
        )}
        {merchant && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-white/60 p-2.5 pr-4 ring-1 ring-slate-900/5 backdrop-blur">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.3)]">
              {merchant.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Paying / প্রাপক</p>
              <p className="truncate font-semibold">{merchant}</p>
            </div>
            <Icon name="shield" className="ml-auto h-5 w-5 shrink-0 text-emerald-600" />
          </div>
        )}
        {children}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <Icon name="lock" className="h-3.5 w-3.5" />Secured by <span className="font-semibold text-slate-500">SME Pay</span>
        </p>
      </div>
    </main>
  );
}

const AUTH_POINTS: [IconName, string][] = [
  ["wallet", "bKash, Nagad, Rocket, Upay and cards in one link"],
  ["bank", "Next-day payouts to your bank or wallet"],
  ["shield", "Buyers confirm on their wallet's own secure page"],
];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="grid flex-1 lg:grid-cols-[1fr_1.1fr]">
      <section className="relative isolate hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots-light [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div aria-hidden className="absolute -left-32 top-1/3 -z-10 h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 right-0 -z-10 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
        <Link href="/"><Logo /></Link>
        <div className="my-auto max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.02em]">
            Get paid online,<br /><span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">the simple way.</span>
          </h2>
          <ul className="mt-10 space-y-4">
            {AUTH_POINTS.map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[.06] text-emerald-300 ring-1 ring-white/10"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">Trusted by f-commerce sellers, tutors and small shops across Bangladesh.</p>
      </section>

      <section className="relative isolate flex flex-col items-center justify-center px-4 py-10 sm:py-16">
        <Backdrop />
        <Link href="/" className="lg:hidden"><Logo /></Link>
        <div className={`${panel} mt-8 w-full max-w-md animate-rise p-8 lg:mt-0`}>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
        <p className="mt-6 text-sm text-slate-500">{footer}</p>
      </section>
    </main>
  );
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return ipFrom((n) => h.get(n));
}

export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof PaymentError) return e.message;
  console.error(e);
  return fallback;
}
