// Turnier und Halle (Vertrag 012, M5-1): Partnerhalle (Pflicht im Kartenmodell), Zusage der Halle (Schnittstelle mit Attrappe) und der Provisions-Snapshot.
// M5-7a: Zugang und Provisionssatz kommen jetzt aus den echten Quellen (011 M1: venue-access-rules.ts, 009 M2: venues.commission_percent). Die Zusage der Halle fuer Turniere (M5-7b) fehlt noch:
// bis dahin sind im Kartenmodell nur Hallen OHNE Betreiber-Zugang waehlbar, und das Fixieren wird bei einer Halle mit Zugang verweigert (assertVenueFixable).
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { percentFromDb } from "@/lib/commission";
import { audit } from "./audit";
import { cardPaymentsEnabled } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";
import { venueHasActiveAccess, venueIdsWithActiveAccess } from "./venue-access-rules";

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

const NO_ACCESS_YET_TEXT = "Diese Halle hat inzwischen einen Betreiber-Zugang; die Online-Zusage für Turniere folgt. Bitte wähle eine andere Halle.";

/** Hinweis an den Veranstalter, solange die Online-Zusage fuer Turniere (M5-7b) fehlt. */
export const NO_ONLINE_CONFIRM_HINT = "Halle noch ohne Online-Zusage";

/**
 * Auswahlliste fuer die Partnerhalle: nur bei eingeschaltetem Kartenmodell (null = Schalter AUS, das Formular bleibt unveraendert), sonst alle aktiven Partnerhallen. Hallen MIT Betreiber-Zugang sind bis
 * M5-7b nicht waehlbar (unavailable), aber sichtbar mit dem Hinweis statt stillem Fehlen (Entscheid t2q P-M57-2). Die waehlbaren Eintraege sind genau die, die isPartnerVenue annimmt (Test).
 */
export async function listPartnerVenueOptions(): Promise<{ id: string; label: string; unavailable: boolean }[] | null> {
  if (!(await cardPaymentsEnabled())) return null;
  const rows = await db.select({ id: venues.id, name: venues.name, city: venues.city }).from(venues).where(and(eq(venues.active, true), eq(venues.isPartner, true))).orderBy(venues.city, venues.name);
  const withAccess = await venueIdsWithActiveAccess(); // eine Abfrage statt einer je Halle
  return rows.map((v) => ({ id: v.id, label: [v.name, v.city].join(", "), unavailable: withAccess.has(v.id) }));
}

/**
 * Ist die Halle eine aktive Partnerhalle, die fuer ein Turnier gewaehlt werden darf? Im Kartenmodell zusaetzlich: OHNE aktiven Betreiber-Zugang (bis M5-7b gibt es keine Zusage; Entscheid t2q P-M57-2).
 * Bei ausgeschaltetem Kartenmodell gilt nur die Partnerhalle (das Turnier laeuft im alten Modell, die Zusage spielt keine Rolle).
 */
export async function isPartnerVenue(exec: Pick<typeof db, "select">, venueId: string): Promise<boolean> {
  if (typeof venueId !== "string" || !UUID.test(venueId)) return false;
  const [v] = await exec.select({ id: venues.id }).from(venues).where(and(eq(venues.id, venueId), eq(venues.active, true), eq(venues.isPartner, true)));
  if (!v) return false;
  if (await cardPaymentsEnabled()) return !(await venueHasActiveAccess(venueId, exec));
  return true;
}

/**
 * Text, wenn eine Halle nicht gewaehlt werden darf: eine aktive Partnerhalle MIT Betreiber-Zugang bekommt den Hinweis zur fehlenden Online-Zusage (nicht "keine Partnerhalle"), alles andere den
 * bisherigen Text. Nur aufrufen, wenn isPartnerVenue false ergab.
 */
export async function venueRejectionText(exec: Pick<typeof db, "select">, venueId: string): Promise<string> {
  if (typeof venueId === "string" && UUID.test(venueId)) {
    const [v] = await exec.select({ id: venues.id }).from(venues).where(and(eq(venues.id, venueId), eq(venues.active, true), eq(venues.isPartner, true)));
    if (v && (await venueHasActiveAccess(venueId, exec))) return `${NO_ONLINE_CONFIRM_HINT}. Bitte wähle eine andere Halle.`;
  }
  return "Bitte wähle eine Partnerhalle.";
}

/**
 * Prueft VOR dem Statuswechsel auf "payment", ob die Halle fixierbar ist (M5-7a, Plan 19.9 Punkt 2): hat sie inzwischen einen aktiven Betreiber-Zugang (Einladung eingeloest), gibt es bis M5-7b keine
 * Zusage, das Turnier waere unbuchbar (Absage zur Frist). Dann wird das Fixieren mit klarer Meldung verweigert (kein Absturz in der Transaktion, nichts geaendert).
 */
export async function assertVenueFixable(tx: Tx, venueId: string): Promise<void> {
  if (await venueHasActiveAccess(venueId, tx)) throw new DomainError(NO_ACCESS_YET_TEXT);
}

/** Zugang und Provisionssatz beim Fixieren einfrieren (in der Transaktion des Aufrufers, unter der Turniersperre). */
export async function freezeVenueTerms(tx: Tx, tournamentId: string, venueId: string): Promise<{ accessRequired: boolean; commissionPercent: number }> {
  const accessRequired = await venueHasAccess(venueId, tx);
  // Zweite, ENTSCHEIDENDE Pruefung auf derselben Lesung, die eingefroren wird: assertVenueFixable (vorher) und diese Lesung sind getrennte Abfragen (READ COMMITTED); wird der Zugang dazwischen
  // eingeloest, wuerde `true` eingefroren und das Turnier waere unbuchbar. Der DomainError rollt die Transaktion des Aufrufers (Statuswechsel) zurueck. Entfaellt mit M5-7b.
  if (accessRequired) throw new DomainError(NO_ACCESS_YET_TEXT);
  const commissionPercent = await venueCommissionPercent(venueId, tx);
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
    if (!(await isPartnerVenue(tx, venueId))) throw new DomainError(await venueRejectionText(tx, venueId));
    await tx.update(tournaments).set({ venueId, venueConfirmedAt: null }).where(eq(tournaments.id, tournamentId)); // eine neue Halle braucht eine neue Zusage
    await audit(userId, "tournament.venue", "tournament", tournamentId, { before: { venueId: t.venueId }, after: { venueId } }, tx);
  });
}
