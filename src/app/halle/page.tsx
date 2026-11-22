import type { Metadata } from "next";
import { ActionButton } from "@/components/ActionButton";
import { formatDateTime } from "@/lib/time";
import { answerHallAction } from "@/server/matchmaking-actions";
import { listTournamentConfirmations, rentText } from "@/server/tournament-confirm";
import { confirmTournamentVenueAction } from "@/server/tournament-confirm-actions";
import { requireVenueManager } from "@/server/venue-session";
import { pendingHallInquiries } from "@/server/veto";

export const metadata: Metadata = { title: "Hallen-Anfragen", robots: { index: false } };

/** Für Hallenbetreiber: Welche Teams wollen zu welchem Termin in meine Halle? Frei = bestätigen, belegt = ablehnen. */
export default async function HallInquiriesPage() {
  const user = await requireVenueManager("/halle");
  const inquiries = await pendingHallInquiries(user.id);
  const confirmations = await listTournamentConfirmations(user.id); // Turniere, die auf die Zusage der Halle warten (M5-7b, namenfrei)
  return (
    <section className="mx-auto mt-4 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Spielanfragen für eure Halle</h1>
      <p className="text-sm text-muted">Zwei Teams haben sich auf einen Termin geeinigt. Bestätigt, wenn die Halle dann frei ist, oder lehnt ab, wenn sie belegt ist. Die Teams wählen danach unter allen freien Hallen per Veto.</p>
      {inquiries.length === 0 ? (
        <p className="card text-muted" data-testid="no-inquiries">Keine offenen Anfragen. Wir benachrichtigen euch, sobald ein Team eure Halle anfragt. Ist hier nichts zu sehen, ist für dieses Konto noch keine Halle hinterlegt.</p>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((q) => (
            <li key={`${q.matchId}-${q.venueId}`} className="card space-y-2" data-testid="inquiry">
              <p className="font-semibold">{q.venueName}</p>
              <p className="text-sm">
                {formatDateTime(q.startsAt)} Uhr · {q.durationMin} Minuten
                <span className="block text-muted">{q.home} gegen {q.away}{q.number ? ` · Spiel #${q.number}` : ""} · {q.players} Spieler</span>
                {q.deadline && <span className="block text-xs text-muted">Antwort bis {formatDateTime(q.deadline)} Uhr, sonst gilt die Halle als belegt.</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={answerHallAction.bind(null, q.matchId, q.venueId, true)} label="Halle ist frei" className="btn btn-primary !min-h-9 !px-3 text-sm" />
                <ActionButton action={answerHallAction.bind(null, q.matchId, q.venueId, false)} label="Halle ist belegt" className="btn btn-ghost !min-h-9 !px-3 text-sm" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirmations.length > 0 && (
        <section className="space-y-3" aria-labelledby="zusage-turniere" data-testid="tournament-confirmations">
          <h2 id="zusage-turniere" className="text-lg font-semibold">Zusage der Halle</h2>
          <p className="text-sm text-muted">Für diese Turniere fehlt die Zusage der Halle. Ohne Zusage wird nichts abgebucht, und das Turnier fällt zur Frist aus. Ein Turnier zusagt ihr im Namen der Halle.</p>
          <ul className="space-y-3">
            {confirmations.map((c) => (
              <li key={c.tournamentId} className="card space-y-2" data-testid="tournament-confirmation">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm">
                  {c.startsAt ? `${formatDateTime(c.startsAt)} Uhr · ` : ""}{c.durationMin} Minuten
                  <span className="block text-muted">{c.teams} Teams{c.rentCents !== null ? ` · Hallenmiete ${rentText(c.rentCents)}` : ""} · {c.venueName}</span>
                  {c.due && <span className="block text-xs text-muted">Zusage bis {formatDateTime(c.due)} Uhr, sonst fällt das Turnier aus.</span>}
                </p>
                <ActionButton action={confirmTournamentVenueAction.bind(null, c.tournamentId)} label="Zusagen" className="btn btn-primary !min-h-9 !px-3 text-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
