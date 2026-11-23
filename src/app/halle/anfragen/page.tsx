import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { isPlatformAdmin } from "@/lib/roles";
import { defaultCommissionPercent } from "@/server/commission";
import { requireUser } from "@/server/session";
import { requestVenueAction, resubmitVenueAction } from "@/server/venue-request-actions";
import { myPendingVenues } from "@/server/venue-approval";
import { HalleOnboarding } from "./HalleOnboarding";

export const metadata: Metadata = { title: "Halle anfragen", robots: { index: false } };

/**
 * Hallen-Onboarding (Vertrag 013 v3, M2d, AC-25): Schritt für Schritt eine Halle anfragen. Eine neue Seite für einen neuen Ablauf; die Schritte laufen auf DIESER URL (AC-5).
 * Der Server prüft alles (Aktion `requestVenueAction`: Sitzung, gemeinsame Prüfung aus `venue-onboarding.ts`, Rate-Limit, Obergrenze offener Anfragen); die Seite steuert nur die Anzeige.
 * `?erneut=<Halle>`: erneute Anfrage nach einer Ablehnung (nur für die eigene abgelehnte Halle, sonst die normale Anfrage).
 */
export default async function HallRequestPage({ searchParams }: PageProps<"/halle/anfragen">) {
  await connection();
  const user = await requireUser("/halle/anfragen");
  const sp = await searchParams;
  const again = typeof sp.erneut === "string" ? sp.erneut : null;
  const rejected = again ? (await myPendingVenues(user.id)).find((v) => v.id === again && v.status === "rejected") : undefined;
  const commission = await defaultCommissionPercent();

  return (
    <section className="mx-auto mt-4 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{rejected ? `Erneut anfragen: ${rejected.name}` : "Halle anfragen"}</h1>
      <p className="text-sm text-muted">
        Du betreibst eine Halle und möchtest Spiele und Turniere über Soccaz anbieten? In fünf kurzen Schritten sendest du uns die Angaben. Wir prüfen sie und schalten die Halle frei; bis dahin ist sie nicht sichtbar und nicht buchbar.
      </p>
      {isPlatformAdmin(user) ? (
        <p className="card text-sm" data-testid="onboarding-admin-hint">
          Mit einem Admin-Konto kannst du keine Halle anfragen. Melde dich mit einem normalen Konto an oder lege die Halle unter <Link href="/admin/hallen" className="underline">Hallen</Link> an.
        </p>
      ) : (
        <HalleOnboarding
          commissionPercent={commission}
          abschlussAction={rejected ? resubmitVenueAction.bind(null, rejected.id) : requestVenueAction}
          anfangswerte={rejected ? { name: rejected.name } : undefined}
        />
      )}
    </section>
  );
}
