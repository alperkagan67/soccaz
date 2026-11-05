import Link from "next/link";
import { KickoffCountdown } from "@/components/KickoffCountdown";

type Match = { teamA: string | null; teamB: string | null; nameA: string | null; nameB: string | null; scoreA: number | null; matchId: string | null };

/**
 * Anzeige oben rechts im Bracket: vor dem Start der Countdown bis zum Anstoß, danach das laufende bzw. nächste Spiel mit
 * Fortschritt, am Ende der Turniersieger.
 */
export function BoardInfo({ startsAtIso, status, winner, matches }: { startsAtIso: string | null; status: string; winner: string | null; matches: Match[] }) {
  const played = matches.filter((m) => m.scoreA !== null).length;
  const next = matches.find((m) => m.scoreA === null && m.teamA && m.teamB);

  let body;
  if (status === "finished" || winner) {
    body = (
      <>
        <p className="text-xs uppercase tracking-wide text-muted">Turniersieger</p>
        <p className="font-heading text-lg font-extrabold text-green">🏆 {winner ?? "–"}</p>
      </>
    );
  } else if (startsAtIso && new Date(startsAtIso).getTime() > Date.now()) {
    body = <KickoffCountdown startsAtIso={startsAtIso} compact />;
  } else {
    body = (
      <>
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-wide text-muted">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green" aria-hidden /> Turnier läuft
        </p>
        <p className="text-sm">{played} von {matches.length} Spielen gespielt</p>
        {next && (
          <p className="text-xs text-muted">
            Als Nächstes: {next.matchId ? <Link href={`/spiele/${next.matchId}`} className="text-green underline">{next.nameA} – {next.nameB}</Link> : `${next.nameA} – ${next.nameB}`}
          </p>
        )}
      </>
    );
  }
  return (
    <div className="w-full space-y-1 rounded-lg border border-line bg-panel p-3 text-center" data-testid="board-info">
      {body}
    </div>
  );
}
