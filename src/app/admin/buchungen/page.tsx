import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { updateBookingAction } from "@/server/admin-finance-actions";
import { canTransition, listBookingJobs, type BookingStatus } from "@/server/booking";
import { requirePermission } from "@/server/session";
import { listVenues } from "@/server/venues";

export const metadata: Metadata = { title: "Admin: Buchungen" };

const LABEL: Record<BookingStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  booked: "Gebucht",
  unavailable: "Halle nicht verfügbar",
  confirmed: "Von der Halle bestätigt",
  withdrawn: "Zurückgezogen",
  done: "Erledigt",
};
const ORDER: BookingStatus[] = ["open", "in_progress", "booked", "unavailable", "confirmed", "done"];

export default async function BookingsPage() {
  await requirePermission("booking", "/admin/buchungen");
  const [jobs, venues] = await Promise.all([listBookingJobs(), listVenues(false)]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hallen-Buchungen</h1>
      <p className="text-sm text-muted">Bestätigte und bezahlte Spiele brauchen eine Halle. Buche sie per Telefon, Mail oder Webseite und trage hier Halle, Status und Nachweis ein. Die Kosten buchst du unter Finanzen.</p>

      {jobs.length === 0 ? (
        <p className="card text-muted">Keine offenen Buchungsaufträge.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id} className="card space-y-3" data-testid={`job-${j.matchId}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{j.homeName} gegen {j.awayName}</span>
                <span className="rounded bg-panel2 px-2 py-0.5 text-xs" data-testid="job-status">{LABEL[j.status]}</span>
              </div>
              <p className="text-sm text-muted">
                {formatDateTime(j.startsAt)} Uhr · {j.durationMin} Min
                {j.priceCents !== null && ` · Spieler zahlen ${formatEuro(j.priceCents)}`}
                {j.costCents !== null && ` · Halle kostet ${formatEuro(j.costCents)}`}
                {j.venueName && ` · ${j.venueName}`}
                {j.assignee && ` · bearbeitet von ${j.assignee}`}
              </p>
              <ActionForm action={updateBookingAction.bind(null, j.id)} submit="Speichern" keepOnSuccess className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor={`status-${j.id}`}>Status</label>
                    <select id={`status-${j.id}`} name="status" defaultValue={j.status} className="field">
                      {ORDER.filter((s) => canTransition(j.status, s)).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`venue-${j.id}`}>Halle</label>
                    <select id={`venue-${j.id}`} name="venueId" defaultValue={j.venueId ?? ""} className="field">
                      <option value="">–</option>
                      {venues.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.city})</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={`note-${j.id}`}>Notiz</label>
                  <input id={`note-${j.id}`} name="note" defaultValue={j.note ?? ""} className="field" />
                </div>
                <div>
                  <label className="label" htmlFor={`proof-${j.id}`}>Nachweis (Link zur Bestätigung)</label>
                  <input id={`proof-${j.id}`} name="proofUrl" defaultValue={j.proofUrl ?? ""} className="field" placeholder="https://" />
                </div>
              </ActionForm>
              <Link href={`/admin/finanzen/spiel/${j.matchId}`} className="text-sm underline">Finanzen zu diesem Spiel</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
