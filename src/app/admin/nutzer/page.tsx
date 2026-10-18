import type { Metadata } from "next";
import { Pager } from "@/components/Pager";
import { formatDateTime } from "@/lib/time";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/roles";
import { listUsers } from "@/server/admin";
import { requirePermission } from "@/server/session";
import { UserActions } from "./UserActions";

export const metadata: Metadata = { title: "Admin: Nutzer" };

export default async function AdminUsers({ searchParams }: PageProps<"/admin/nutzer">) {
  const me = await requirePermission("admin", "/admin/nutzer");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q);
  const role = one(sp.role);
  const banned = one(sp.banned) === "1";
  const page = Number(one(sp.page)) || 1;
  const { rows, hasMore } = await listUsers({ q, role, banned, page });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nutzer</h1>
      <form className="card grid grid-cols-2 gap-3" method="get">
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="q">Name oder E-Mail</label>
          <input id="q" name="q" defaultValue={q ?? ""} className="field" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="role">Rolle</label>
          <select id="role" name="role" defaultValue={role ?? ""} className="field">
            <option value="">Alle</option>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <label className="col-span-2 flex items-center gap-3 text-sm">
          <input type="checkbox" name="banned" value="1" defaultChecked={banned} className="size-5 accent-green" /> Nur gesperrte
        </label>
        <button className="btn btn-primary col-span-2">Filtern</button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-muted">Keine Nutzer gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((u) => (
            <li key={u.id} className="card space-y-2" data-testid={`user-${u.email}`}>
              <div>
                <p className="font-semibold">
                  {u.name}
                  {u.isVerifiedPro && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Profi</span>}
                  {u.bannedAt && <span className="ml-2 rounded bg-red px-1.5 py-0.5 text-xs text-white">Gesperrt</span>}
                </p>
                <p className="text-sm text-muted">{u.email} · {u.city ?? "–"} · seit {formatDateTime(u.createdAt)}</p>
              </div>
              <UserActions userId={u.id} role={u.role} banned={Boolean(u.bannedAt)} pro={u.isVerifiedPro} isSelf={u.id === me.id} />
            </li>
          ))}
        </ul>
      )}
      <Pager path="/admin/nutzer" params={{ q, role, banned: banned ? "1" : undefined }} page={page} hasMore={hasMore} />
    </div>
  );
}
