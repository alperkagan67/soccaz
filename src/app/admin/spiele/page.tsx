import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/Pager";
import { formatDateTime } from "@/lib/time";
import { listAllMatches } from "@/server/admin";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Spiele" };

const STATUS: Record<string, string> = { lobby: "Lobby", confirmed: "Bestätigt", played: "Gespielt", disputed: "Strittig", cancelled: "Abgesagt" };

export default async function AdminMatches({ searchParams }: PageProps<"/admin/spiele">) {
  await requirePermission("admin", "/admin/spiele");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = one(sp.status);
  const q = one(sp.q);
  const page = Number(one(sp.page)) || 1;
  const { rows, hasMore } = await listAllMatches({ status, q, page });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Spiele</h1>
      <form className="card grid grid-cols-2 gap-3" method="get">
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="q">Team</label>
          <input id="q" name="q" defaultValue={q ?? ""} className="field" placeholder="Teamname" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field">
            <option value="">Alle</option>
            {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-primary col-span-2">Filtern</button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-muted">Keine Spiele gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.id} className="card flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{m.homeName} <span className="text-muted">gegen</span> {m.awayName}</span>
                <span className="block text-sm text-muted">
                  {formatDateTime(m.startsAt)} Uhr · {STATUS[m.status]} · {m.visibility === "public" ? "öffentlich" : "privat"}
                  {m.venueText ? ` · ${m.venueText}` : ""}
                </span>
              </span>
              <span className="flex gap-2 text-sm">
                <Link href={`/lobby/${m.id}`} className="btn btn-ghost !min-h-9">Lobby</Link>
                <Link href={`/spiele/${m.id}`} className="btn btn-ghost !min-h-9">Spiel</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager path="/admin/spiele" params={{ q, status }} page={page} hasMore={hasMore} />
    </div>
  );
}
