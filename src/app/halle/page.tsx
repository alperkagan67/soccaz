import type { Metadata } from "next";
import { connection } from "next/server";
import { ActionButton } from "@/components/ActionButton";
import { replyWindow } from "@/lib/hall-reply-view";
import { formatDateTime } from "@/lib/time";
import { answerHallAction, declineHallAction } from "@/server/matchmaking-actions";
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
  return (
    <section className="mx-auto mt-4 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Spielanfragen für eure Halle</h1>
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
                    <span className="block text-xs text-muted">Ohne Antwort gilt die Halle als belegt.</span>
                  </p>
                )}
                {window.state === "expired" ? (
                  <p className="text-sm" data-testid="inquiry-expired">
                    <span aria-hidden>■ </span>Die Antwortfrist ist abgelaufen. Die Anfrage gilt als nicht beantwortet.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionButton action={answerHallAction.bind(null, q.matchId, q.venueId, true)} label="Halle ist frei" className="btn btn-primary !min-h-11 !px-4 text-sm" />
                    <details className="w-full" data-testid="decline">
                      <summary className="btn btn-ghost ui-focus !min-h-11 !px-4 cursor-pointer list-none text-sm">Halle ist belegt (Grund angeben)</summary>
                      <div className="mt-2">
                        <HallDeclineForm action={declineHallAction.bind(null, q.matchId, q.venueId)} uid={uid} />
                      </div>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
