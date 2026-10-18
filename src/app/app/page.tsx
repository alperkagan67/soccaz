import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { phaseOf, PHASE_LABEL } from "@/lib/result-rules";
import { myMatches } from "@/server/lobby";
import { listMyTeams } from "@/server/teams";
import { requireUser } from "@/server/session";
import { walletBalance } from "@/server/ledger";
import { paymentsEnabled } from "@/server/settings";
import { formatEuro } from "@/lib/money";
import { db } from "@/db";

export const metadata: Metadata = { title: "Mein Bereich" };

export default async function DashboardPage() {
  const user = await requireUser("/app");
  const [myTeams, games, payOn, balance] = await Promise.all([listMyTeams(user.id), myMatches(user.id), paymentsEnabled(), walletBalance(db, user.id)]);
  const now = new Date();

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

      {(payOn || balance > 0) && (
        <Link href="/app/guthaben" className="card flex items-center justify-between hover:border-green" data-testid="wallet-card">
          <span className="text-muted">Guthaben</span>
          <span className="font-heading text-xl font-bold tabular-nums">{formatEuro(balance)}</span>
        </Link>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Meine Spiele</h2>
        {games.length === 0 ? (
          <p className="card text-muted">Noch keine Spiele. Suche einen Gegner oder nimm eine Spielsuche an.</p>
        ) : (
          <ul className="space-y-2">
            {games.map((g) => {
              const phase = phaseOf({ status: g.status, startsAt: g.startsAt, hasPendingResult: false, now });
              const href = phase === "upcoming" && (g.status === "lobby" || g.status === "confirmed") ? `/lobby/${g.id}` : `/spiele/${g.id}`;
              return (
                <li key={g.id}>
                  <Link href={href} className="card flex items-center justify-between gap-3 hover:border-green">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{g.homeName} <span className="text-muted">gegen</span> {g.awayName}</span>
                      <span className="block text-sm text-muted">{formatDateTime(g.startsAt)} Uhr · {g.durationMin} Min</span>
                    </span>
                    <span className={`shrink-0 text-xs ${g.status === "confirmed" ? "text-green" : g.status === "cancelled" || g.status === "disputed" ? "text-coral" : "text-muted"}`}>
                      {g.status === "confirmed" && phase === "upcoming" ? "Bestätigt" : g.status === "lobby" && phase === "upcoming" ? "Wartet auf Spieler" : PHASE_LABEL[phase]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
