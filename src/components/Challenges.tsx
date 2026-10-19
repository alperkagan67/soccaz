import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import type { ChallengeRow } from "@/server/requests";

/** Herausforderungen sind privat: Sie erscheinen nur beim herausgeforderten Team und beim Absender. Hier stehen sie an einem Ort. */
export function Challenges({ incoming, outgoing }: { incoming: ChallengeRow[]; outgoing: ChallengeRow[] }) {
  if (incoming.length === 0 && outgoing.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Herausforderungen" data-testid="challenges">
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-green">Herausforderungen an euch ({incoming.length})</h2>
          <ul className="space-y-2">
            {incoming.map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center justify-between gap-2 border-green/50" data-testid="challenge-incoming">
                <span>
                  <Link href={`/teams/${c.fromSlug}`} className="font-semibold hover:text-green">{c.fromTeam}</Link> fordert <span className="font-semibold">{c.toTeam}</span> heraus
                  <span className="block text-sm text-muted">
                    {formatDateTime(c.startsAt)} Uhr · {c.durationMin} Min · {c.city}
                  </span>
                  {c.note && <span className="block text-xs text-muted">{c.note}</span>}
                </span>
                <Link href={`/suche/${c.id}`} className="btn btn-primary !min-h-9 !px-3 text-sm">Ansehen und annehmen</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Eure Herausforderungen ({outgoing.length})</h2>
          <ul className="space-y-2">
            {outgoing.map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center justify-between gap-2" data-testid="challenge-outgoing">
                <span>
                  <span className="font-semibold">{c.fromTeam}</span> fordert <Link href={`/teams/${c.toSlug}`} className="font-semibold hover:text-green">{c.toTeam}</Link> heraus
                  <span className="block text-sm text-muted">
                    {formatDateTime(c.startsAt)} Uhr · {c.durationMin} Min · wartet auf Antwort
                  </span>
                </span>
                <Link href={`/suche/${c.id}`} className="btn btn-ghost !min-h-9 !px-3 text-sm">Öffnen</Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Herausforderungen sind privat: Nur das herausgeforderte Team sieht sie (in „Mein Bereich“, in der Glocke und über den Link). Wollt ihr, dass alle Teams eure Suche sehen, legt eine normale öffentliche Spielsuche an.</p>
        </div>
      )}
    </section>
  );
}
