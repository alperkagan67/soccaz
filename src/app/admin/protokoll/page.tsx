import type { Metadata } from "next";
import { Pager } from "@/components/Pager";
import { formatDateTime } from "@/lib/time";
import { listAudit } from "@/server/admin";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Protokoll" };

const ENTITIES = ["user", "team", "match", "match_request"];

export default async function AuditPage({ searchParams }: PageProps<"/admin/protokoll">) {
  await requirePermission("admin", "/admin/protokoll");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q);
  const entity = one(sp.entity);
  const action = one(sp.action);
  const page = Number(one(sp.page)) || 1;
  const { rows, hasMore } = await listAudit({ q, entity, action, page });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Änderungsprotokoll</h1>
      <form className="card grid grid-cols-2 gap-3" method="get">
        <div className="col-span-2">
          <label className="label" htmlFor="q">Suche (Person, Aktion oder ID)</label>
          <input id="q" name="q" defaultValue={q ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="entity">Objekt</label>
          <select id="entity" name="entity" defaultValue={entity ?? ""} className="field">
            <option value="">Alle</option>
            {ENTITIES.map((e) => <option key={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="action">Aktion beginnt mit</label>
          <input id="action" name="action" defaultValue={action ?? ""} className="field" placeholder="z. B. result." />
        </div>
        <button className="btn btn-primary col-span-2">Filtern</button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-muted">Keine Einträge.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card text-sm">
              <p>
                <span className="font-semibold">{r.action}</span> <span className="text-muted">· {r.entity} {r.entityId.slice(0, 8)}</span>
              </p>
              <p className="text-muted">{formatDateTime(r.at)} Uhr · {r.actorName ?? "System"}</p>
              {(r.before !== null || r.after !== null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted">Vorher und nachher</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-panel2 p-2 text-xs">{JSON.stringify({ vorher: r.before, nachher: r.after }, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager path="/admin/protokoll" params={{ q, entity, action }} page={page} hasMore={hasMore} />
    </div>
  );
}
