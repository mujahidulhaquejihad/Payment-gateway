import Link from "next/link";
import { NavLink } from "@/app/client-ui";
import { Icon, Logo } from "@/app/ui";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="flex-1">
      <header className="bg-slate-950 text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-5 py-3">
          <span className="text-white"><Logo /></span>
          <span className="mr-4 rounded-full bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-300 ring-1 ring-inset ring-violet-400/25">Admin</span>
          <NavLink href="/admin/merchants" icon="users">Merchants</NavLink>
          <NavLink href="/admin/settlements" icon="bank">Payouts</NavLink>
          <Link href="/dashboard" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white">
            <Icon name="home" className="h-4 w-4" />Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl animate-rise px-5 py-8">{children}</main>
    </div>
  );
}
