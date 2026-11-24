import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ActionButton } from "@/components/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HALL_DECLINE_FINAL_NOTE, HALL_DECLINE_NEXT } from "@/lib/hall-decline";
import { replyWindow } from "@/lib/hall-reply-view";
import { formatDateTime } from "@/lib/time";
import { answerHallAction, declineHallAction } from "@/server/matchmaking-actions";
import { listTournamentConfirmations, rentText } from "@/server/tournament-confirm";
import { confirmTournamentVenueAction, declineTournamentVenueFormAction } from "@/server/tournament-confirm-actions";
import { myPendingVenues } from "@/server/venue-approval";
import { requireVenueManager } from "@/server/venue-session";
import { pendingHallInquiries } from "@/server/veto";
import { HallDeclineForm } from "./HallDeclineForm";

export const metadata: Metadata = { title: "Hallen-Anfragen", robots: { index: false } };

/**
 * Für Hallenbetreiber: Welche Teams wollen zu welchem Termin in meine Halle? Frei = bestätigen, belegt = ablehnen (mit Grund).
 * 011 M2b: Look unverändert (Umbau mit 013 M6), nur Inhalt und Verhalten; keine Spielernamen und kein Lobby-Link (AC-5, P8).
 */
export default async function HallInquiriesPage() {
  await connection(); // die Restzeit hängt an der aktuellen Zeit (Cache Components)
  const now = new Date();
  const user = await requireVenueManager("/halle");
  const inquiries = await pendingHallInquiries(user.id);
  const pendingVenues = await myPendingVenues(user.id); // Hallen-Anfragen ohne Freischaltung (013 v3 AC-31)
  const confirmations = await listTournamentConfirmations(user.id); // Turniere, die auf die Zusage der Halle warten (M5-7b, namenfrei)
  return (
    <section className="mx-auto mt-4 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Spielanfragen für eure Halle</h1>
      {pendingVenues.map((v) => (
        <p key={v.id} className="card text-sm" data-testid={`venue-${v.status}`}>
          <strong>{v.name}:</strong> {v.status === "requested" ? "Die Anfrage wartet auf Freischaltung. Bis dahin ist die Halle nicht sichtbar und nicht buchbar." : `Die Anfrage wurde abgelehnt: ${v.reason}. Nach einer Änderung könnt ihr sie erneut senden.`}
          {v.status === "rejected" && (
            <>
              {" "}
              <Link href={`/halle/anfragen?erneut=${v.id}`} className="underline" data-testid="venue-resubmit">Erneut anfragen</Link>
            </>
          )}
        </p>
      ))}
      <p className="text-sm text-muted">Zwei Teams haben sich auf einen Termin geeinigt. Bestätigt, wenn die Halle dann frei ist, oder lehnt ab, wenn sie belegt ist. Die Teams wählen danach unter allen freien Hallen.</p>
      {inquiries.length === 0 ? (
        <p className="card text-muted" data-testid="no-inquiries">Keine offenen Anfragen. Wir benachrichtigen euch, sobald ein Team eure Halle anfragt.</p>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((q) => {
            const uid = `${q.matchId}-${q.venueId}`;
            const window = replyWindow(q.deadline, now);
            return (
              <li key={uid} className="card space-y-2" data-testid="inquiry">
                <h2 className="font-semibold">{q.venueName}</h2>
                <p className="text-sm">
                  <time dateTime={q.startsAt.toISOString()}>{formatDateTime(q.startsAt)} Uhr</time> · {q.durationMin} Minuten
                  <span className="block text-muted">{q.home} gegen {q.away}{q.number ? ` · Spiel #${q.number}` : ""} · {q.players} Spieler</span>
                </p>
                {q.deadline && window.state !== "expired" && (
                  <p className="text-sm" data-testid="inquiry-deadline">
                    Antwort bis <time dateTime={q.deadline.toISOString()}>{formatDateTime(q.deadline)} Uhr</time>
                    {window.remainingText ? ` (noch ${window.remainingText})` : ""}
                    {window.state === "soon" && <strong className="ml-2 whitespace-nowrap"><span aria-hidden>⏱</span> Frist läuft bald ab</strong>}
                    <span className="block text-xs text-muted">Stand beim Laden, der Server prüft die Frist. Ohne Antwort gilt die Halle als belegt.</span>
                  </p>
                )}
                {window.state === "expired" ? (
                  <p className="text-sm" data-testid="inquiry-expired">
                    <span aria-hidden>■ </span>Die Antwortfrist ist abgelaufen. Die Anfrage gilt als nicht beantwortet.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionButton action={answerHallAction.bind(null, q.matchId, q.venueId, true, q.round)} label="Halle ist frei" className="btn btn-primary !min-h-11 !px-4 text-sm" />
                    <details className="w-full" data-testid="decline">
                      <summary className="btn btn-ghost ui-focus !min-h-11 !px-4 cursor-pointer list-none text-sm">Halle ist belegt (Grund angeben)</summary>
                      <div className="mt-2">
                        <HallDeclineForm action={declineHallAction.bind(null, q.matchId, q.venueId, q.round)} uid={uid} />
                      </div>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmations.length > 0 && (
        <section className="space-y-3" aria-labelledby="zusage-turniere" data-testid="tournament-confirmations">
          <h2 id="zusage-turniere" className="text-lg font-semibold">Zusage der Halle</h2>
          <p className="text-sm text-muted">Für diese Turniere fehlt die Zusage der Halle. Ohne Zusage wird nichts abgebucht, und das Turnier fällt zur Frist aus. Ihr sagt ein Turnier im Namen der Halle zu oder lehnt es mit Grund ab.</p>
          <ul className="space-y-3">
            {confirmations.map((c) => (
              <li key={c.tournamentId} className="card space-y-2" data-testid="tournament-confirmation" data-declined={c.declined ? "ja" : undefined}>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm">
                  {c.startsAt ? `${formatDateTime(c.startsAt)} Uhr · ` : ""}{c.durationMin} Minuten
                  <span className="block text-muted">{c.teams} Teams{c.rentCents !== null ? ` · Hallenmiete ${rentText(c.rentCents)}` : ""} · {c.venueName}</span>
                  {c.due && <span className="block text-xs text-muted">Zusage bis {formatDateTime(c.due)} Uhr, sonst fällt das Turnier aus.</span>}
                </p>
                {c.declined ? (
                  <p className="text-sm" data-testid="tournament-declined-note">
                    <span aria-hidden>■ </span>Ihr habt dieses Turnier abgelehnt. {HALL_DECLINE_FINAL_NOTE} {HALL_DECLINE_NEXT}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <ConfirmDialog
                      trigger={{ label: "Zusagen", variant: "primary" }}
                      title={`${c.name} zusagen?`}
                      body="Die Zusage ist verbindlich und lässt sich nicht rückgängig machen. Ihr sagt das Turnier im Namen der Halle zu."
                      confirmLabel="Zusagen"
                      onConfirmAction={confirmTournamentVenueAction.bind(null, c.tournamentId)}
                    />
                    {c.chargesStarted ? (
                      <p className="text-sm text-muted" data-testid="tournament-decline-locked">Die Abbuchung hat begonnen: Ablehnen ist nicht mehr möglich.</p>
                    ) : (
                      <details className="w-full" data-testid="tournament-decline">
                        <summary className="btn btn-ghost ui-focus !min-h-11 !px-4 cursor-pointer list-none text-sm">Turnier ablehnen (Grund angeben)</summary>
                        <div className="mt-2">
                          <HallDeclineForm action={declineTournamentVenueFormAction.bind(null, c.tournamentId)} uid={`t-${c.tournamentId}`} notice={HALL_DECLINE_FINAL_NOTE} />
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
