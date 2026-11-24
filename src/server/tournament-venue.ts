// Turnier und Halle (Vertrag 012, M5-1): Partnerhalle (Pflicht im Kartenmodell), Zusage der Halle (Schnittstelle mit Attrappe) und der Provisions-Snapshot.
// M5-7a/b: Zugang und Provisionssatz kommen aus den echten Quellen (011 M1: venue-access-rules.ts, 009 M2: venues.commission_percent); die Zusage der Halle fuer Turniere steht in tournament-confirm.ts.
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema-finance";
import { paymentCharges } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { percentFromDb } from "@/lib/commission";
import { audit } from "./audit";
import { cardPaymentsEnabled } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";
import { venueHasActiveAccess, venueHasActiveAccessBefore } from "./venue-access-rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ist die Zusage der Halle erfuellt? Gilt nur fuer Hallen mit Zugang (der Zugang wird beim Fixieren des Preises eingefroren). Ohne Zugangspflicht ist keine Zusage noetig;
 * mit Zugangspflicht braucht es die Zusage (venueConfirmedAt). FAIL-CLOSED (M5-7a, G24-012, R-T207b): ein NULL-Snapshot (Zugang nie eingefroren) gilt als NICHT erfuellt; ein Turnier darf nicht mit NULL in
 * "payment" oder "bereit" durchrutschen. (Die Signatur bleibt boolean | null, damit die Aufrufer nicht brechen.)
 */
export function hallZusageOk(t: { venueAccessRequiredSnapshot: boolean | null; venueConfirmedAt: Date | null }): boolean {
  if (t.venueAccessRequiredSnapshot === null) return false;
  return t.venueAccessRequiredSnapshot !== true || t.venueConfirmedAt !== null;
}

type ZusageFacts = { id: string; venueId: string | null; venueAccessRequiredSnapshot: boolean | null; venueConfirmedAt: Date | null };

/**
 * Verlangt dieses Turnier die Zusage der Halle? EINE Regel fuer die Abbuchungspruefung UND die Zusage-Aktion (Invariante R-T251 B: verlangt die Pruefung eine Zusage, muss confirmTournamentVenue sie
 * annehmen): (1) Snapshot true = ja (der Snapshot bleibt massgeblich, auch nach einem Entzug); (2) Snapshot false = nur wenn die Halle JETZT einen aktiven Zugang hat, der STRIKT VOR der Abbuchungsfrist
 * wirksam wurde, und noch KEINE Abbuchungszeile existiert (eine laufende Alles-oder-nichts-Abbuchung wird nie nachtraeglich zusagepflichtig); ohne bekannte Frist (due = null, Altturnier) zaehlt der
 * Live-Zugang NICHT (konsistent mit armConfirmationForNewAccess, das solche Turniere ueberspringt); (3) Snapshot NULL = nein (die Pruefung ist dann fail-closed, hallZusageOk).
 */
export async function zusageRequired(exec: Pick<Tx, "select">, t: ZusageFacts, due: Date | null): Promise<boolean> {
  if (t.venueAccessRequiredSnapshot === true) return true;
  if (t.venueAccessRequiredSnapshot !== false || !t.venueId || !due) return false;
  const [row] = await exec.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.tournamentId, t.id)).limit(1);
  if (row) return false;
  return venueHasActiveAccessBefore(t.venueId, due, exec);
}

/** Ist die Zusage erfuellt (nicht verlangt oder gesetzt)? Mit dem Zugang JETZT (Entscheid t2q, Plan 19.14). NULL-Snapshot bleibt fail-closed (hallZusageOk). */
export async function hallZusageOkLive(exec: Pick<Tx, "select">, t: ZusageFacts, due: Date | null): Promise<boolean> {
  if (t.venueAccessRequiredSnapshot === null) return false;
  return !(await zusageRequired(exec, t, due)) || t.venueConfirmedAt !== null;
}

/** Hat die Halle einen aktiven Betreiber-Zugang (011 M1)? Einzige Quelle: venue-access-rules.ts (aktiv, Konto nicht gesperrt, kein Admin). */
export async function venueHasAccess(venueId: string, exec: Pick<Tx, "select"> = db): Promise<boolean> {
  return venueHasActiveAccess(venueId, exec);
}

/**
 * Provisionssatz der Halle in Prozent (009 M2: venues.commission_percent, Altbestand 0). Nie stilles 0 bei einem Fehler: unbekannte Halle oder ungueltiger Wert ist ein DomainError mit Text fuer den
 * Veranstalter. Ein Satz 0 ist ein gueltiger Wert (Warnung im Admin und in BETRIEB, kein Zwang; Entscheid t2q P-M57-4).
 */
export async function venueCommissionPercent(venueId: string, exec: Pick<Tx, "select"> = db): Promise<number> {
  const [v] = await exec.select({ percent: venues.commissionPercent }).from(venues).where(eq(venues.id, venueId));
  if (!v) throw new DomainError("Die Halle gibt es nicht mehr. Bitte wähle eine andere Halle.");
  const p = percentFromDb(v.percent);
  if (!Number.isFinite(p) || p < 0 || p > 100) throw new DomainError("Für diese Halle ist kein gültiger Provisionssatz hinterlegt. Bitte melde dich beim Admin.");
  return p;
}

/**
 * Auswahlliste fuer die Partnerhalle: nur bei eingeschaltetem Kartenmodell (null = Schalter AUS, das Formular bleibt unveraendert), sonst alle aktiven Partnerhallen. Seit M5-7b auch Hallen MIT
 * Betreiber-Zugang (die Zusage der Halle gibt es jetzt; die 7a-Sperre ist aufgehoben). Die Eintraege sind genau die, die isPartnerVenue annimmt (Test).
 */
export async function listPartnerVenueOptions(opts: { force?: boolean } = {}): Promise<{ id: string; label: string }[] | null> {
  if (!opts.force && !(await cardPaymentsEnabled())) return null; // force: nach einer Ablehnung der Halle (die es nur im Kartenfluss gibt) bleibt die Hallenwahl auch bei Notschalter moeglich
  const rows = await db.select({ id: venues.id, name: venues.name, city: venues.city }).from(venues).where(and(eq(venues.active, true), eq(venues.approvalStatus, "approved"), eq(venues.isPartner, true))).orderBy(venues.city, venues.name);
  return rows.map((v) => ({ id: v.id, label: [v.name, v.city].join(", ") }));
}

/** Ist die Halle eine aktive Partnerhalle? Nur solche duerfen fuer ein Turnier gewaehlt werden (mit oder ohne Betreiber-Zugang; mit Zugang braucht das Turnier die Zusage der Halle, M5-7b). */
export async function isPartnerVenue(exec: Pick<typeof db, "select">, venueId: string): Promise<boolean> {
  if (typeof venueId !== "string" || !UUID.test(venueId)) return false;
  const [v] = await exec.select({ id: venues.id }).from(venues).where(and(eq(venues.id, venueId), eq(venues.active, true), eq(venues.approvalStatus, "approved"), eq(venues.isPartner, true)));
  return Boolean(v);
}

/** Zugang und Provisionssatz beim Fixieren einfrieren (in der Transaktion des Aufrufers, unter der Turniersperre). */
export async function freezeVenueTerms(tx: Tx, tournamentId: string, venueId: string): Promise<{ accessRequired: boolean; commissionPercent: number }> {
  const accessRequired = await venueHasAccess(venueId, tx);
  const commissionPercent = await venueCommissionPercent(venueId, tx);
  await tx.update(tournaments).set({ venueAccessRequiredSnapshot: accessRequired, commissionPercentSnapshot: commissionPercent.toFixed(2) }).where(eq(tournaments.id, tournamentId));
  return { accessRequired, commissionPercent };
}



/** Die Bedingungen, unter denen die Halle zugesagt hat (Entscheid t2q F7): Halle, Termin, Dauer, Hallenmiete. Aendert sich eine davon, gilt die Zusage nicht mehr. */
export type VenueTerms = { venueId: string | null; startsAt: Date | null; durationMin: number | null; totalCents: number | null };

export function venueTermsChanged(a: VenueTerms, b: VenueTerms): boolean {
  return a.venueId !== b.venueId || (a.startsAt?.getTime() ?? null) !== (b.startsAt?.getTime() ?? null) || a.durationMin !== b.durationMin || a.totalCents !== b.totalCents;
}

/**
 * Setzt die Zusage der Halle zurueck, wenn sich Halle, Termin, Dauer oder Hallenmiete geaendert haben (F7). In der Transaktion des Aufrufers unter der Turniersperre. Es gibt heute keinen Weg,
 * Termin, Dauer oder Miete eines angelegten Turniers zu aendern; jeder kuenftige Weg MUSS diesen Helfer rufen (Strukturtest: tests/unit/venue-terms-reset.test.ts).
 * Gibt zurueck, ob eine Zusage zurueckgesetzt wurde.
 */
export async function resetVenueConfirmationIfTermsChanged(tx: Tx, tournamentId: string, before: VenueTerms, after: VenueTerms): Promise<boolean> {
  if (!venueTermsChanged(before, after)) return false;
  // Zusage UND Ablehnung der Halle gelten nur fuer die alten Bedingungen (Backlog 161); die Trigger-Spalten _by/_code folgen dem Zeitstempel
  const reset = await tx.update(tournaments).set({ venueConfirmedAt: null, venueConfirmedBy: null, venueDeclinedAt: null }).where(and(eq(tournaments.id, tournamentId), or(isNotNull(tournaments.venueConfirmedAt), isNotNull(tournaments.venueDeclinedAt)))).returning({ id: tournaments.id });
  return reset.length > 0;
}

/** Der Veranstalter (oder ein Plattform-Admin) waehlt die Partnerhalle, solange der Kader offen ist (der Preis steht noch nicht fest). */
export async function setTournamentVenue(userId: string, isPlatformAdmin: boolean, tournamentId: string, venueId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t) throw new DomainError("Turnier nicht gefunden.");
    if (t.organizerId !== userId && !isPlatformAdmin) throw new DomainError("Nur der Veranstalter kann die Halle wählen.");
    if (t.status !== "registration" || t.bracketGeneratedAt) throw new DomainError("Die Halle lässt sich nur wählen, solange der Kader offen ist.");
    if (!(await isPartnerVenue(tx, venueId))) throw new DomainError("Bitte wähle eine Partnerhalle.");
    await tx.update(tournaments).set({ venueId, venueConfirmedAt: null, venueConfirmedBy: null, venueDeclinedAt: null }).where(eq(tournaments.id, tournamentId)); // eine neue Halle braucht eine neue Zusage; eine Ablehnung (auch derselben Halle) ist erledigt
    await audit(userId, "tournament.venue", "tournament", tournamentId, { before: { venueId: t.venueId }, after: { venueId } }, tx);
  });
}
