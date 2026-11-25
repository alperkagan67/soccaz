import type { Metadata } from "next";
import Link from "next/link";
import { nextQuarterHourInput } from "@/lib/time";
import { formatEuro } from "@/lib/money";
import { db } from "@/db";
import { priceFor } from "@/server/pricing";
import { commissionPercent } from "@/server/tournaments";
import { getSetting } from "@/server/settings";
import { zahlungenAus } from "@/server/zahlungen-aus";
import { listPartnerVenueOptions } from "@/server/tournament-venue";
import { requireUser } from "@/server/session";
import { TournamentForm } from "./TournamentForm";

export const metadata: Metadata = { title: "Turnier anlegen" };

export default async function NewTournamentPage() {
  const user = await requireUser("/app/turniere/neu");
  const allowed = user.isOrganizer || user.role === "admin";
  const phone = allowed ? "" : await getSetting<string>("emergency_phone", "");
  const min = nextQuarterHourInput();
  const standard = allowed ? await priceFor(db, null, 60) : null;
  const commission = await commissionPercent();
  // Kartenmodell (012 M5-1): Partnerhalle waehlen. Bei ausgeschaltetem Schalter bleibt das Formular unveraendert.
  const partnerVenues = await listPartnerVenueOptions();
  const free = await zahlungenAus(); // Zahlungen AUS (payments_enabled aus, Produktion, Entscheid t2q): kostenloses Turnier ohne Preisangabe
  return (
    <section className="mx-auto mt-4 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Turnier anlegen</h1>
      {allowed ? (
        <TournamentForm min={min} defaultCity={user.city} standardHourly={standard ? formatEuro(standard.priceCents) : null} commission={commission} partnerVenues={partnerVenues} free={free} />
      ) : (
        <div className="card space-y-2" data-testid="organizer-info">
          <p>Turniere dürfen nur freigeschaltete Veranstalter anlegen.</p>
          <p className="text-sm text-muted">
            Du möchtest ein Turnier starten? {phone ? "Ruf den Socaz-Admin an oder schreib uns eine E-Mail" : "Schreib uns eine E-Mail"}, dann klären wir alles und schalten dich frei.
          </p>
          {phone && <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`} className="btn btn-primary w-full">{phone} anrufen</a>}
          <Link href="/kontakt" className="btn btn-ghost w-full">E-Mail an den Admin (Kontaktseite)</Link>
        </div>
      )}
    </section>
  );
}
