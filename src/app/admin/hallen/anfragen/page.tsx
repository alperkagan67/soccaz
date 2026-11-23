import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { approveVenueAction, rejectVenueAction } from "@/server/admin-finance-actions";
import { formatDateTime } from "@/lib/time";
import { requirePermission } from "@/server/session";
import { listRejectedVenues, listVenueRequests } from "@/server/venue-approval";

export const metadata: Metadata = { title: "Admin: Hallen-Anfragen" };

// Vertrag 013 v3, AC-31: Freischalten oder Ablehnen (mit Grund) durch Admin 1 und Admin 2 (Permission booking). Die Anfragenden erscheinen nur als Zugangsstatus, nie mit E-Mail-Adresse.
export default async function VenueRequestsPage({ searchParams }: PageProps<"/admin/hallen/anfragen">) {
  await requirePermission("booking", "/admin/hallen/anfragen");
  const sp = await searchParams;
  const showRejected = (Array.isArray(sp.abgelehnt) ? sp.abgelehnt[0] : sp.abgelehnt) === "1";
  const requests = await listVenueRequests();
  const rejected = showRejected ? await listRejectedVenues() : [];
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Hallen-Anfragen</h1>
        <span className="flex gap-3 text-sm">
          <Link href={showRejected ? "/admin/hallen/anfragen" : "/admin/hallen/anfragen?abgelehnt=1"} className="text-muted underline" data-testid="toggle-rejected">{showRejected ? "Abgelehnte ausblenden" : "Abgelehnte anzeigen"}</Link>
          <Link href="/admin/hallen" className="text-muted underline">Alle Hallen</Link>
        </span>
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
      {showRejected && (
        <section className="space-y-2" aria-labelledby="rejected-title">
          <h2 id="rejected-title" className="text-lg font-semibold">Abgelehnte Anfragen</h2>
          {rejected.length === 0 ? (
            <p className="card text-sm text-muted" data-testid="rejected-empty">Keine abgelehnten Anfragen.</p>
          ) : (
            <ul className="space-y-2" data-testid="rejected-list">
              {rejected.map((r) => (
                <li key={r.id} className="card text-sm">
                  <span className="font-semibold">{r.name}</span> <span className="text-muted">· {r.city}</span>
                  <span className="block text-muted">Grund: {r.reason}{r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
