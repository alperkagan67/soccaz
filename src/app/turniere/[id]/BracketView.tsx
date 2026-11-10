import type { ReactNode } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { roundTitle } from "@/lib/tournament";
import { LiveBadge } from "./LiveBadge";
import { decideShootoutAction } from "@/server/tournament-actions";

type Match = {
  id: string;
  slot: number;
  teamA: string | null;
  teamB: string | null;
  nameA: string | null;
  nameB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  shootoutWinner: string | null;
  matchId: string | null;
  court?: number | null;
  startIso?: string | null;
  endIso?: string | null;
  pendingShootout: boolean;
};
type Stage = { stage: string; matches: Match[] };


/**
 * Turnier-Bracket als Baum: Links die erste Runde, rechts das Finale. Die Größe passt sich der Teamzahl an (Freilose stehen
 * schon in der zweiten Runde). Jeder Kasten führt zum Spiel, wo die Captains das Ergebnis melden und bestätigen.
 */
export function BracketView({ tournamentId, stages, manage, info }: { tournamentId: string; stages: Stage[]; manage: boolean; info?: ReactNode }) {
  const rounds = stages
    .filter((s) => s.stage.startsWith("ko:"))
    .map((s) => ({ ...s, n: Number(s.stage.slice(3)) }))
    .sort((a, b) => b.n - a.n);
  if (rounds.length === 0) return null;
  const size = rounds[0].n;
  const rows = size / 2;
  const cols = { gridTemplateColumns: `repeat(${rounds.length}, minmax(200px, 1fr))`, minWidth: `${rounds.length * 232}px` };

  // Bei acht und mehr Plätzen liegt die Anzeige im freien Feld über dem Finale, sonst steht sie darüber
  const infoInGrid = rows >= 4;
  return (
    <div className="overflow-x-auto pb-2" data-testid="bracket">
      {info && !infoInGrid && <div className="mx-auto mb-3 max-w-xs">{info}</div>}
      <div className="grid gap-x-8 pb-2" style={cols}>
        {rounds.map((r) => (
          <h3 key={r.stage} className="text-center text-sm font-semibold" data-testid="bracket-stage">{roundTitle(r.n)}</h3>
        ))}
      </div>
      <div className="grid gap-x-8" style={{ ...cols, gridTemplateRows: `repeat(${rows}, minmax(92px, auto))` }}>
        {info && infoInGrid && (
          <div className="flex items-center py-2" style={{ gridColumn: rounds.length, gridRow: 1 }}>{info}</div>
        )}
        {rounds.flatMap((r, ci) => {
          const span = size / r.n;
          const last = ci === rounds.length - 1;
          return r.matches.map((m) => {
            const done = m.scoreA !== null && m.scoreB !== null;
            const winA = done && (m.scoreA! > m.scoreB! || (m.scoreA === m.scoreB && m.shootoutWinner === m.teamA));
            const winB = done && (m.scoreB! > m.scoreA! || (m.scoreA === m.scoreB && m.shootoutWinner === m.teamB));
            const row = (name: string | null, score: number | null, win: boolean, badge?: ReactNode) => (
              <div className={`flex items-center justify-between gap-2 px-3 py-1.5 ${win ? "font-bold text-accent-fg" : ""}`}>
                <span className="truncate">{name ?? <span className="text-muted">offen</span>}</span>
                {badge}
                <span className="font-heading tabular-nums">{score ?? ""}</span>
              </div>
            );
            return (
              <div key={m.id} className="relative flex items-center py-2" style={{ gridColumn: ci + 1, gridRow: `${m.slot * span + 1} / span ${span}` }}>
                {ci > 0 && <span className="absolute -left-4 top-1/2 h-px w-4 bg-line" aria-hidden />}
                {!last && <span className="absolute -right-4 top-1/2 h-px w-4 bg-line" aria-hidden />}
                {!last && m.slot % 2 === 0 && <span className="absolute -right-4 top-1/2 w-px bg-line" style={{ height: "100%" }} aria-hidden />}
                <div className="w-full rounded-lg border border-line bg-panel text-sm" data-testid="tournament-match">
                  {row(m.nameA, m.scoreA, winA, !done && m.teamA && m.teamB && m.startIso && m.endIso ? <LiveBadge startIso={m.startIso} endIso={m.endIso} /> : undefined)}
                  <div className="h-px bg-line" />
                  {row(m.nameB, m.scoreB, winB)}
                  {m.court && m.startIso && (
                    <p className="border-t border-line px-3 py-1 text-center text-xs text-muted">Platz {m.court} · {new Date(m.startIso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr</p>
                  )}
                  {m.matchId && !done && (
                    <p className="border-t border-line px-3 py-1 text-center text-xs">
                      <Link href={`/spiele/${m.matchId}`} className="text-accent-fg underline">Zum Spiel</Link>
                    </p>
                  )}
                  {m.pendingShootout && manage && m.teamA && m.teamB && (
                    <div className="space-y-1 border-t border-line p-2 text-center text-xs" data-testid="shootout">
                      <p className="text-muted">Unentschieden: Sieger im Siebenmeterschießen</p>
                      <div className="flex flex-wrap justify-center gap-1">
                        <ActionButton action={decideShootoutAction.bind(null, tournamentId, m.id, m.teamA)} label={m.nameA ?? ""} className="btn btn-primary !min-h-8 !px-2 text-xs" />
                        <ActionButton action={decideShootoutAction.bind(null, tournamentId, m.id, m.teamB)} label={m.nameB ?? ""} className="btn btn-primary !min-h-8 !px-2 text-xs" />
                      </div>
                    </div>
                  )}
                  {m.pendingShootout && !manage && <p className="border-t border-line px-3 py-1 text-center text-xs text-muted">Unentschieden: Der Veranstalter trägt das Siebenmeterschießen ein.</p>}
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
