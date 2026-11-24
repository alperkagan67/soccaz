import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/Pager";
import { personRef } from "@/lib/lobby-namen";
import { CITIES } from "@/lib/validation";
import { listPlayers } from "@/server/profiles";
import { getViewerSicht } from "@/server/viewer-sicht";

export const metadata: Metadata = { title: "Spieler" };

export default async function PlayersPage({ searchParams }: PageProps<"/spieler">) {
  const sp = await searchParams;
  // AC-17 (Entscheid t2q 2026-11-24): Gäste und reine Betreiber sehen Initialen und Zahlen, ohne Link, ohne Position; die Namenssuche gilt nur für Angemeldete (für alle anderen wird `q` auch in der Adresse ignoriert: sonst ließen sich Namen über die Trefferliste erraten)
  const { sicht } = await getViewerSicht();
  const member = sicht === "member";
  const q = member && typeof sp.q === "string" ? sp.q.trim().slice(0, 60) || undefined : undefined;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const { rows, hasMore } = await listPlayers({ q, city, page });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Spieler</h1>
      <form className="flex flex-wrap gap-2" role="search">
        {member && <input name="q" defaultValue={q} placeholder="Name suchen" aria-label="Name" className="field !w-auto min-w-0 flex-1" />}
        <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto">
          <option value="">Alle Städte</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary">Suchen</button>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted">Keine Spieler gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p, i) => {
            const person = personRef(sicht, p.id, p.name, i);
            const inhalt = (
              <>
                <span>
                  <span className="font-semibold" data-testid="person-name">{person.label}</span>
                  {p.isVerifiedPro && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-fg">Profi</span>}
                  <span className="block text-sm text-muted">{[p.city, member ? p.position : null].filter(Boolean).join(" · ") || "Keine Angaben"}</span>
                </span>
                <span className="text-right text-sm text-muted">
                  {p.matches ?? 0} Spiele · {p.goals ?? 0} Tore
                </span>
              </>
            );
            return (
              <li key={person.key}>
                {person.href ? (
                  <Link href={person.href} className="card flex items-center justify-between hover:border-accent/50">{inhalt}</Link>
                ) : (
                  <div className="card flex items-center justify-between">{inhalt}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager path="/spieler" params={{ q, city }} page={page} hasMore={hasMore} />
    </div>
  );
}
