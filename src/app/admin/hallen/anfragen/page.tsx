import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { approveVenueAction, rejectVenueAction } from "@/server/admin-finance-actions";
import { requirePermission } from "@/server/session";
import { listRejectedVenues, listVenueRequests } from "@/server/venue-approval";
import { VenueRequestList } from "./VenueRequestList";

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
      <VenueRequestList approveAction={approveVenueAction} rejectAction={rejectVenueAction} requests={requests.map((r) => ({ id: r.id, name: r.name, city: r.city, address: r.address, surface: r.surface, contact: r.contact, requestedLabel: r.requestedAt ? formatDateTime(r.requestedAt) : null }))} />
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
