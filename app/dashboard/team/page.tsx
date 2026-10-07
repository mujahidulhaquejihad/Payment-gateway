import { SubmitButton } from "@/app/client-ui";
import { avatar, btnSm, card, field, PageHeader, panel } from "@/app/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeRole, removeMember } from "./actions";
import MemberCreator from "./member-creator";

const ROLES = [
  ["OWNER", "Owner", "Everything, including payouts, verification, team and API keys."],
  ["MANAGER", "Manager", "Create links, refund payments, export data and see customers."],
  ["VIEWER", "Viewer", "Read-only: see payments, customers, analytics and payouts."],
] as const;

export default async function TeamPage() {
  const owner = await requireUser("OWNER");
  const users = await prisma.user.findMany({ where: { merchantId: owner.merchantId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Team" description="Give staff their own login instead of sharing yours." />

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">Add a person</h2>
        <MemberCreator />
        <dl className="grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          {ROLES.map(([, name, text]) => (
            <div key={name}>
              <dt className="font-medium">{name}</dt>
              <dd className="text-slate-500">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={panel}>
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <span className={`${avatar} h-9 w-9 text-sm`}>
                {u.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}{u.id === owner.id && <span className="font-normal text-slate-400"> (you)</span>}</p>
                <p className="truncate text-sm text-slate-500">
                  {u.email}
                  {u.totpEnabled && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">2-step on</span>}
                  {u.mustChangePassword && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Hasn&apos;t logged in yet</span>}
                </p>
              </div>
              {u.role === "OWNER" ? (
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">Owner</span>
              ) : (
                <div className="flex gap-2">
                  <form action={changeRole} className="flex gap-1.5">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className={`${field} px-2.5 py-1.5 text-xs`}>
                      <option value="MANAGER">Manager</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <SubmitButton className={btnSm}>Save</SubmitButton>
                  </form>
                  <form action={removeMember}>
                    <input type="hidden" name="id" value={u.id} />
                    <SubmitButton className={`${btnSm} text-rose-700`}>Remove</SubmitButton>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
