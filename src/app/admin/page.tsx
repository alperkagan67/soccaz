import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { getOverview, listDisputed, listStaleMatches } from "@/server/admin";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  await requirePermission("dashboard");
  const [o, disputed, stale] = await Promise.all([getOverview(), listDisputed(), listStaleMatches()]);
  const stats = [
    ["Nutzer", o.users],
    ["Teams", o.teams],
    ["Offene Suchen", o.openRequests],
    ["Kommende Spiele", o.upcoming],
    ["Laufende Spiele", o.live],
    ["Unzugestellte Meldungen", o.undelivered],
  ] as const;
  const openTasks = disputed.length + stale.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      <section className="space-y-2" aria-label="Aufgaben">
        <h2 className="text-lg font-semibold">Aufgaben {openTasks > 0 && <span className="ml-1 rounded-full bg-pink px-2 py-0.5 text-xs text-white">{openTasks}</span>}</h2>
        {openTasks === 0 ? (
          <p className="card text-muted">Nichts zu tun.</p>
        ) : (
          <ul className="space-y-2">
            {disputed.map((d) => (
              <li key={d.matchId}>
                <Link href={`/spiele/${d.matchId}`} className="card block border-coral hover:border-green">
                  <span className="font-semibold">Streitfall: {d.homeName} gegen {d.awayName}</span>
                  <span className="block text-sm text-muted">
                    {formatDateTime(d.startsAt)} Uhr · gemeldet {d.homeScore ?? "–"}:{d.awayScore ?? "–"}
                    {d.reason ? ` · „${d.reason}“` : ""}
                  </span>
                </Link>
              </li>
            ))}
            {stale.map((s) => (
              <li key={s.matchId}>
                <Link href={`/spiele/${s.matchId}`} className="card block hover:border-green">
                  <span className="font-semibold">Ohne Ergebnis: {s.homeName} gegen {s.awayName}</span>
                  <span className="block text-sm text-muted">Anstoß {formatDateTime(s.startsAt)} Uhr, seit über 6 Stunden kein Ergebnis gemeldet.</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Zahlen">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="card">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
