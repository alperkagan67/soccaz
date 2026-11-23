import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { approveVenueAction, rejectVenueAction } from "@/server/admin-finance-actions";
import { formatDateTime } from "@/lib/time";
import { requirePermission } from "@/server/session";
import { listVenueRequests } from "@/server/venue-approval";

export const metadata: Metadata = { title: "Admin: Hallen-Anfragen" };

// Vertrag 013 v3, AC-31: Freischalten oder Ablehnen (mit Grund) durch Admin 1 und Admin 2 (Permission booking). Die Anfragenden erscheinen nur als Zugangsstatus, nie mit E-Mail-Adresse.
export default async function VenueRequestsPage() {
  await requirePermission("booking", "/admin/hallen/anfragen");
  const requests = await listVenueRequests();
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Hallen-Anfragen</h1>
        <Link href="/admin/hallen" className="text-sm text-muted underline">Alle Hallen</Link>
      </div>
      <p className="text-sm text-muted">Eine angefragte Halle ist erst nach der Freischaltung sichtbar und buchbar. Bei einer Ablehnung bekommt der Betreiber den Grund und kann nach einer Änderung erneut anfragen.</p>
      {requests.length === 0 ? (
        <p className="card text-sm text-muted" data-testid="requests-empty">Keine offenen Anfragen.</p>
      ) : (
        <ul className="space-y-4" data-testid="requests-list">
          {requests.map((r) => (
            <li key={r.id} className="card space-y-3" data-testid={`request-${r.id}`}>
              <div>
                <p className="font-semibold">{r.name} <span className="text-muted">· {r.city}</span></p>
                <p className="text-sm text-muted">{[r.address, r.surface, r.contact].filter(Boolean).join(" · ") || "Keine weiteren Angaben"}</p>
                {r.requestedAt && <p className="text-xs text-muted">Angefragt am {formatDateTime(r.requestedAt)}</p>}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ActionForm action={approveVenueAction.bind(null, r.id)} submit="Freischalten" successText="Freigeschaltet.">
                  <p className="text-sm text-muted">Die Halle wird sichtbar und buchbar, der Betreiber bekommt eine Mitteilung.</p>
                </ActionForm>
                <ActionForm action={rejectVenueAction.bind(null, r.id)} submit="Ablehnen" danger successText="Abgelehnt.">
                  <label className="label" htmlFor={`reason-${r.id}`}>Grund (3 bis 200 Zeichen)</label>
                  <input id={`reason-${r.id}`} name="reason" className="field" minLength={3} maxLength={200} required />
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
