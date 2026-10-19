import Link from "next/link";
import { STRENGTH_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import type { OpenSearch } from "@/server/matchmaking";
import { AcceptSearch } from "./AcceptSearch";

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

function wanted(min: number | null, max: number | null): string {
  if (min === null && max === null) return "egal";
  const lo = min ?? 1;
  const hi = max ?? 5;
  return lo === hi ? `Stufe ${lo} (${STRENGTH_LABELS[lo]})` : `Stufe ${lo} bis ${hi} (${STRENGTH_LABELS[lo]} bis ${STRENGTH_LABELS[hi]})`;
}

/**
 * Offene Suchen im Matchmaking mit allen Angaben, die ein anderes Team für die Entscheidung braucht.
 * `mine` sind die Teams der angemeldeten Person (als Admin), mit denen sie annehmen kann.
 */
export function OpenSearches({ searches, mine, myWaitingTeamIds }: { searches: OpenSearch[]; mine: { id: string; name: string; elo: number; strength: number }[]; myWaitingTeamIds: string[] }) {
  if (searches.length === 0) {
    return (
      <p className="card text-sm text-muted" data-testid="open-searches-empty">
        Gerade sucht kein Team im Matchmaking. Stell dein Team in die Warteschlange, dann sehen es andere hier.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="open-searches">
      {searches.map((s) => {
        const own = myWaitingTeamIds.includes(s.teamId);
        const candidates = mine.filter((t) => t.id !== s.teamId);
        return (
          <li key={s.id} className="card space-y-3" data-testid="open-search">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/teams/${s.teamSlug}`} className="text-lg font-semibold hover:text-green">
                  {s.teamName}
                </Link>
                {s.verified && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Verifiziert</span>}
                {own && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-xs text-muted">Euer Team</span>}
                <p className="text-sm text-muted">
                  {s.city} · {s.durationMin} Minuten
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-heading text-xl font-bold tabular-nums">Elo {s.elo}</p>
                <p className="text-xs text-muted">{s.playedMatches === 0 ? "geschätzt aus der Selbsteinschätzung" : `aus ${s.playedMatches} Spielen`}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Spielstärke (Selbsteinschätzung)</dt>
                <dd>{s.strength} von 5 · {STRENGTH_LABELS[s.strength]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Kader</dt>
                <dd>{s.members} {s.members === 1 ? "Spieler" : "Spieler"} (5 spielen, 1 Ersatz)</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Gesucht: Spielstärke des Gegners</dt>
                <dd>{wanted(s.wantStrengthMin, s.wantStrengthMax)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted">Zeitfenster, in denen das Team kann</dt>
                <dd>
                  <ul className="space-y-0.5">
                    {s.windows.map((w) => (
                      <li key={w.from}>
                        {formatDateTime(new Date(w.from))} bis {time(w.to)} Uhr
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              {s.note && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs text-muted">Hinweis</dt>
                  <dd className="whitespace-pre-line">{s.note}</dd>
                </div>
              )}
            </dl>

            <p className="text-xs text-muted">
              Sucht seit {formatDateTime(s.createdAt)} Uhr · die Suche läuft bis {formatDateTime(s.expiresAt)} Uhr
            </p>

            {!own && candidates.length > 0 && (
              <AcceptSearch entryId={s.id} teams={candidates} opponent={{ name: s.teamName, elo: s.elo, wantMin: s.wantStrengthMin, wantMax: s.wantStrengthMax }} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
