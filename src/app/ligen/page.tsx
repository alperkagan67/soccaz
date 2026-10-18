import type { Metadata } from "next";
import Link from "next/link";
import { listLeagues } from "@/server/leagues";

export const metadata: Metadata = { title: "Ligen" };

export default async function LeaguesPage({ searchParams }: PageProps<"/ligen">) {
  const sp = await searchParams;
  const all = sp.alle === "1";
  const leagues = await listLeagues({ includeFinished: all });
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Ligen</h1>
        <p className="text-muted">Alle gespielten Spiele zwischen den Teams einer Liga zählen automatisch für die Tabelle.</p>
      </header>
      {leagues.length === 0 ? (
        <p className="card text-muted">Gerade läuft keine Liga.</p>
      ) : (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link href={`/ligen/${l.id}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
                <span>
                  <span className="font-semibold">{l.name}</span>
                  <span className="block text-sm text-muted">
                    {l.city ?? "Ganz NRW"} · {l.starts_on} bis {l.ends_on}
                  </span>
                </span>
                <span className="text-right text-sm">
                  {l.status === "finished" ? <span className="text-green">Meister: {l.champion ?? "–"}</span> : <span className="text-muted">{l.teams} Teams</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={all ? "/ligen" : "/ligen?alle=1"} className="text-sm text-green underline">
        {all ? "Nur laufende Ligen" : "Auch beendete Ligen zeigen"}
      </Link>
    </div>
  );
}
