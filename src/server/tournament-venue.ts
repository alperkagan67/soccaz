// Turnier und Halle (Vertrag 012, M5-1): Partnerhalle (Pflicht im Kartenmodell), Zusage der Halle (Schnittstelle mit Attrappe) und der Provisions-Snapshot.
// Die echte Anbindung kommt spaeter: Zugang/Zusage mit 011 M1 (M5-7), der Provisionssatz je Halle mit 009 M2 (M2f). Bis dahin: kein Zugang noetig, Satz 0.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { audit } from "./audit";
import { cardPaymentsEnabled } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ist die Zusage der Halle erfuellt? Gilt nur fuer Hallen mit Zugang (der Zugang wird beim Fixieren des Preises eingefroren). Ohne Zugangspflicht ist keine Zusage noetig;
 * mit Zugangspflicht braucht es die Zusage (venueConfirmedAt). Null im Snapshot (noch nicht fixiert) heisst: keine Zugangspflicht bekannt, keine Zusage verlangt.
 *
 * ACHTUNG (fail-open, nur mit der ATTRAPPE vertretbar): Die Signatur (boolean | null, null => "keine Zusage noetig") weicht von Plan 3.6 ab (boolean). Mit der echten Anbindung (M5-7, 011 M1)
 * gilt im Kartenmodell ein NULL-Snapshot in der Zahlungsphase als FEHLER (fail-closed): ein Turnier darf nicht mit NULL in "payment"/"bereit" durchrutschen. Vor Go-live Pflicht (GO-LIVE-AUDIT).
 */
export function hallZusageOk(t: { venueAccessRequiredSnapshot: boolean | null; venueConfirmedAt: Date | null }): boolean {
  return t.venueAccessRequiredSnapshot !== true || t.venueConfirmedAt !== null;
}

/** Hat die Halle einen Betreiber-Zugang (011 M1)? ATTRAPPE: bis 011 M1 auf main ist, hat keine Halle einen Zugang (heutiges Verhalten, keine Zusage noetig). */
export async function venueHasAccess(_venueId: string): Promise<boolean> {
  return false;
}

/** Provisionssatz der Halle in Prozent (009 M2: venues.commission_percent). ATTRAPPE: 0, bis 009 M2 die Spalte liefert. Berechnet wird in M5-1 nichts, nur eingefroren. */
export async function venueCommissionPercent(_venueId: string): Promise<number> {
  return 0;
}

/** Auswahlliste fuer die Partnerhalle: nur bei eingeschaltetem Kartenmodell (null = Schalter AUS, das Formular bleibt unveraendert), sonst alle aktiven Partnerhallen. */
export async function listPartnerVenueOptions(): Promise<{ id: string; label: string }[] | null> {
  if (!(await cardPaymentsEnabled())) return null;
  const rows = await db.select({ id: venues.id, name: venues.name, city: venues.city }).from(venues).where(and(eq(venues.active, true), eq(venues.isPartner, true))).orderBy(venues.city, venues.name);
  return rows.map((v) => ({ id: v.id, label: [v.name, v.city].join(", ") }));
}

/** Ist die Halle eine aktive Partnerhalle? Nur solche duerfen im Kartenmodell gewaehlt werden. */
export async function isPartnerVenue(exec: Pick<typeof db, "select">, venueId: string): Promise<boolean> {
  if (typeof venueId !== "string" || !UUID.test(venueId)) return false;
  const [v] = await exec.select({ id: venues.id }).from(venues).where(and(eq(venues.id, venueId), eq(venues.active, true), eq(venues.isPartner, true)));
  return Boolean(v);
}

/** Zugang und Provisionssatz beim Fixieren des Preises einfrieren (in der Transaktion des Aufrufers, unter der Turniersperre). */
export async function freezeVenueTerms(tx: Tx, tournamentId: string, venueId: string): Promise<{ accessRequired: boolean; commissionPercent: number }> {
  const accessRequired = await venueHasAccess(venueId);
  const commissionPercent = await venueCommissionPercent(venueId);
  await tx.update(tournaments).set({ venueAccessRequiredSnapshot: accessRequired, commissionPercentSnapshot: commissionPercent.toFixed(2) }).where(eq(tournaments.id, tournamentId));
  return { accessRequired, commissionPercent };
}

/** Der Veranstalter (oder ein Plattform-Admin) waehlt die Partnerhalle, solange der Kader offen ist (der Preis steht noch nicht fest). */
export async function setTournamentVenue(userId: string, isPlatformAdmin: boolean, tournamentId: string, venueId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t) throw new DomainError("Turnier nicht gefunden.");
    if (t.organizerId !== userId && !isPlatformAdmin) throw new DomainError("Nur der Veranstalter kann die Halle wählen.");
    if (t.status !== "registration" || t.bracketGeneratedAt) throw new DomainError("Die Halle lässt sich nur wählen, solange der Kader offen ist.");
    if (!(await isPartnerVenue(tx, venueId))) throw new DomainError("Bitte wähle eine Partnerhalle.");
    await tx.update(tournaments).set({ venueId, venueConfirmedAt: null }).where(eq(tournaments.id, tournamentId)); // eine neue Halle braucht eine neue Zusage
    await audit(userId, "tournament.venue", "tournament", tournamentId, { before: { venueId: t.venueId }, after: { venueId } }, tx);
  });
}
