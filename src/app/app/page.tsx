import type { Metadata } from "next";
import Link from "next/link";
import { listMyTeams } from "@/server/teams";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mein Bereich" };

export default async function DashboardPage() {
  const user = await requireUser("/app");
  const myTeams = await listMyTeams(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hey {user.name.split(" ")[0]}</h1>
        <p className="text-muted">{user.position} · {user.city}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/suche/neu" className="btn btn-primary">Gegner suchen</Link>
        <Link href="/suche" className="btn btn-ghost">Spielsuchen ansehen</Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Meine Teams</h2>
          <Link href="/app/teams/neu" className="btn btn-primary !min-h-9">Team gründen</Link>
        </div>
        {myTeams.length === 0 ? (
          <p className="card text-muted">
            Du bist noch in keinem Team. Gründe eins oder öffne einen Einladungslink, den dir ein Team-Admin schickt.
          </p>
        ) : (
          <ul className="space-y-2">
            {myTeams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.slug}`} className="card flex items-center justify-between hover:border-green">
                  <span>
                    <span className="font-semibold">{t.name}</span>
                    <span className="block text-sm text-muted">{t.city}</span>
                  </span>
                  <span className="text-xs text-muted">{t.role === "admin" ? "Team-Admin" : "Spieler"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
