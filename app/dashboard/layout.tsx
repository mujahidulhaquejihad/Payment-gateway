import Link from "next/link";
import { NavLink } from "@/app/client-ui";
import { Icon, Logo } from "@/app/ui";
import { can, requireUser } from "@/lib/auth";
import type { Role } from "@/lib/generated/prisma/client";

const nav = [
  ["Sell", [
    ["/dashboard", "Overview", "home", "VIEWER"],
    ["/dashboard/analytics", "Analytics", "chart", "VIEWER"],
    ["/dashboard/links", "Payment links", "link", "VIEWER"],
    ["/dashboard/payments", "Payments", "card", "VIEWER"],
    ["/dashboard/customers", "Customers", "users", "VIEWER"],
    ["/dashboard/settlements", "Payouts", "bank", "VIEWER"],
  ]],
  ["Settings", [
    ["/dashboard/kyc", "Verification", "shield", "OWNER"],
    ["/dashboard/team", "Team", "team", "OWNER"],
    ["/dashboard/developers", "Developers", "code", "OWNER"],
    ["/dashboard/account", "Account", "user", "VIEWER"],
  ]],
] as const satisfies readonly (readonly [string, readonly (readonly [string, string, string, Role])[]])[];

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const u = await requireUser("VIEWER", { allowPasswordChange: true });
  const m = u.merchant;
  const live = m.kycStatus === "APPROVED";
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="relative isolate overflow-hidden bg-slate-950 text-slate-300 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div aria-hidden className="absolute -left-20 -top-20 -z-10 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="flex items-center justify-between px-5 py-4 md:py-5">
          <Link href="/dashboard" className="text-white"><Logo /></Link>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${live ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25" : "bg-amber-400/10 text-amber-300 ring-amber-400/25"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
            {live ? "Live" : "Test"}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:pb-0">
          {nav.map(([group, items]) => {
            const visible = items.filter(([, , , min]) => can(u.role, min));
            return (
              visible.length > 0 && (
                <div key={group} className="flex gap-1 md:mb-5 md:flex-col md:gap-0.5">
                  <p className="hidden px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:block">{group}</p>
                  {visible.map(([href, text, icon]) => (
                    <NavLink key={href} href={href} icon={icon} exact={href === "/dashboard"}>{text}</NavLink>
                  ))}
                </div>
              )
            );
          })}
          {u.isAdmin && <NavLink href="/admin/merchants" icon="lock">Admin</NavLink>}
          <Link href="/api/auth/signout" className="flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/[.04] hover:text-white md:hidden">
            <Icon name="logout" className="h-[18px] w-[18px]" />Sign out
          </Link>
        </nav>
        <div className="m-3 hidden items-center gap-3 rounded-xl bg-white/[.04] p-3 ring-1 ring-white/[.06] md:flex">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-semibold text-white">
            {u.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{m.businessName}</p>
            <p className="truncate text-xs text-slate-400">{u.name} · {u.role.toLowerCase()}</p>
          </div>
          <Link href="/api/auth/signout" title="Sign out" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <Icon name="logout" className="h-[18px] w-[18px]" />
            <span className="sr-only">Sign out</span>
          </Link>
        </div>
      </aside>

      <main className="relative isolate min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-emerald-100/40 to-transparent" />
        <div className="mx-auto max-w-6xl animate-rise">
          {u.mustChangePassword ? (
            <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
              <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0" />
              <p><span className="font-semibold">Choose your own password to continue.</span> You signed in with a temporary password.</p>
            </div>
          ) : !live && (
            <div className={`mb-6 flex flex-col gap-3 rounded-2xl px-5 py-4 ring-1 ring-inset sm:flex-row sm:items-center sm:justify-between ${m.kycStatus === "REJECTED" ? "bg-rose-50 text-rose-800 ring-rose-600/20" : "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 ring-amber-600/20"}`}>
              <div className="flex items-start gap-3 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-amber-600/10">
                  <Icon name={m.kycStatus === "REJECTED" ? "alert" : "bolt"} className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold">{m.kycStatus === "REJECTED" ? "Verification was not approved" : "You're in test mode"}</p>
                  <p className="opacity-80">
                    {m.kycStatus === "REJECTED" ? "Please contact support to continue." : "Payments are simulated. Verify your business to accept real money."}
                  </p>
                </div>
              </div>
              {m.kycStatus === "PENDING" && can(u.role, "OWNER") && (
                <Link href="/dashboard/kyc" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                  Go live <Icon name="arrow" className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
