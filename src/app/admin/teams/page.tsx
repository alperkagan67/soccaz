import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/Pager";
import { listAdminTeams } from "@/server/admin";
import { requirePermission } from "@/server/session";
import { TeamActions } from "./TeamActions";

export const metadata: Metadata = { title: "Admin: Teams" };

export default async function AdminTeams({ searchParams }: PageProps<"/admin/teams">) {
  await requirePermission("admin", "/admin/teams");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q);
  const page = Number(one(sp.page)) || 1;
  const { rows, hasMore } = await listAdminTeams({ q, page });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Teams</h1>
      <form className="card flex gap-2" method="get">
        <label className="sr-only" htmlFor="q">Suche</label>
        <input id="q" name="q" defaultValue={q ?? ""} className="field" placeholder="Name oder Stadt" />
        <button className="btn btn-primary">Suchen</button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-muted">Keine Teams gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id} className="card space-y-2" data-testid={`team-${t.slug}`}>
              <p className="font-semibold">
                <Link href={`/teams/${t.slug}`} className="hover:text-green">{t.name}</Link>
                {t.isVerified && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Verifiziert</span>}
              </p>
              <p className="text-sm text-muted">{t.city} · {t.members} {t.members === 1 ? "Mitglied" : "Mitglieder"}</p>
              <TeamActions teamId={t.id} name={t.name} verified={t.isVerified} others={rows.filter((o) => o.id !== t.id).map((o) => ({ id: o.id, name: o.name }))} />
            </li>
          ))}
        </ul>
      )}
      <Pager path="/admin/teams" params={{ q }} page={page} hasMore={hasMore} />
    </div>
  );
}
