import { and, asc, count, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { priceRules, venueAccess, venues } from "@/db/schema-finance";
import { canUser, isPlatformAdmin } from "@/lib/roles";
import { audit } from "./audit";
import { bookingStaffIds } from "./booking";
import { defaultCommissionPercent } from "./commission";
import { notifyUsers } from "./notifications";
import { hasVenueAccess, venueAccessHolderIds, venueIdsOf } from "./venue-access-rules";
import { DomainError } from "./teams";
import type { Tx } from "./tx";
import { cleanVenueInput, type VenueInput } from "./venues";

// Freischaltung von Hallen (Vertrag 013 v3, AC-31): Eine Halle aus der Anfrage ("Anfrage senden") ist "requested" und inaktiv (DB-seitig abgesichert durch venues_requested_inactive_chk: aktiv nur wenn freigegeben);
// nur Admin 1 und Admin 2 (Permission booking) schalten frei oder lehnen ab. Der Server prueft: jeder Leser filtert auf approval_status = 'approved' (siehe grep-Liste im PR),
// und beim Zuordnen einer Halle (Fremd-ID per POST) kommt dieselbe Antwort wie bei einer unbekannten ID ("nicht gefunden", kein Existenz-Leck).
// Protokoll: audit_log (venue.requested/approved/rejected) mit IDs und Grund. Das Freitextfeld "contact" der Halle kann eine E-Mail/Telefonnummer enthalten und ist fuer Admin 1 und Admin 2 sichtbar (bestaetigt); Audit und Mitteilungen enthalten es nie. SPERRREIHENFOLGE: Halle zuerst (FOR UPDATE), wie venue-access.

/** Hoechstens so viele offene Anfragen je Nutzer (Missbrauchsgrenze). */
export const MAX_OPEN_REQUESTS = 3;
/** Hoechstens so viele Anfragen (auch Wiederanfragen) je Akteur und Stunde, gezaehlt aus dem audit_log (venue.requested). */
export const REQUESTS_PER_HOUR = 5;

/** Rate-Limit: wird UNTER dem Advisory-Lock je Nutzer geprueft (kein Wettlauf zwischen zwei Tabs). */
async function assertRateLimit(tx: Tx, userId: string): Promise<void> {
  const [r] = await tx.select({ n: count() }).from(auditLog).where(and(eq(auditLog.actorId, userId), eq(auditLog.action, "venue.requested"), gt(auditLog.at, new Date(Date.now() - 3_600_000))));
  if (r.n >= REQUESTS_PER_HOUR) throw new DomainError("Zu viele Anfragen in kurzer Zeit. Bitte versuche es später noch einmal.");
}

/** Beide Preise (60 und 90 Minuten) oder keiner: ein einzelner Preis wuerde bei der Wiederanfrage alle vorhandenen Regeln loeschen und nur eine anlegen. */
function assertPriceExtras(x: VenueRequestExtras): void {
  if ((x.price60Cents === undefined) !== (x.price90Cents === undefined)) throw new DomainError("Bitte beide Preise angeben (60 und 90 Minuten).");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Preisregeln der Halle fuer 60 und 90 Minuten (Preis = Kosten, Marge 0; Admin 1 stellt die Kosten spaeter), ab heute. Der Tag ist der UTC-Tag, GENAU wie bei addPriceRule und priceFor
 * (sonst laege die Regel zwischen 00:00 und 01:00/02:00 Berlin "in der Zukunft" und priceFor fuende sie nicht). ERSETZT vorhandene Regeln der Halle (Wiederanfrage: kein Verdoppeln; auch
 * Regeln, die Admin 1 an einer abgelehnten Halle angelegt hat). In der Transaktion des Aufrufers.
 */
async function replacePriceRules(tx: Tx, venueId: string, x: VenueRequestExtras): Promise<void> {
  if (x.price60Cents === undefined || x.price90Cents === undefined) return;
  await tx.delete(priceRules).where(eq(priceRules.venueId, venueId));
  const validFrom = new Date().toISOString().slice(0, 10);
  await tx.insert(priceRules).values([
    { venueId, durationMin: 60, priceCents: x.price60Cents, costCents: x.price60Cents, validFrom },
    { venueId, durationMin: 90, priceCents: x.price90Cents, costCents: x.price90Cents, validFrom },
  ]);
}

/** Zaehlt die offenen Anfragen des Nutzers (Zugang ueber die gemeinsame Quelle venue-access-rules). */
async function openRequestsOf(tx: Tx, userId: string) {
  const myIds = await venueIdsOf(userId, tx);
  return myIds.length ? await tx.select().from(venues).where(and(inArray(venues.id, myIds), eq(venues.approvalStatus, "requested"))) : [];
}

/** Audit-Inhalt der Anfrage: Status, Plaetze, Preise je Termin (Cent) und Bedingungstext (Schluessel/Version); NIE Kontakt oder Adresse. */
const requestedAudit = (x: VenueRequestExtras, extra: Record<string, unknown> = {}) => ({
  status: "requested",
  ...extra,
  ...(x.courts !== undefined ? { courts: x.courts } : {}),
  ...(x.price60Cents !== undefined ? { price60Cents: x.price60Cents, price90Cents: x.price90Cents } : {}), // Betreiber-Preise sind kein Personenbezug: Spur fuer einen Streit um die Miete
  ...(x.termsKey ? { termsKey: x.termsKey, termsVersion: x.termsVersion } : {}),
});

/** Zusaetze aus dem Hallen-Onboarding (M2d, src/lib/venue-onboarding.ts): Plaetze, Preise je Termin in Cent (60/90 Minuten), Bedingungstext (Schluessel und Version, ENTWURF bis zur Anwaltspruefung). */
export type VenueRequestExtras = { courts?: number; price60Cents?: number; price90Cents?: number; termsKey?: string; termsVersion?: number };

export const NOT_FOUND = "Halle nicht gefunden.";
const NOT_OPEN = "Diese Halle ist keine offene Anfrage.";

const stripControl = (x: string) => x.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/ {2,}/g, " "); // Steuerzeichen und Zeilenumbrueche raus (Grund steht in Mitteilung und Audit)

function cleanReason(reason: string): string {
  const r = stripControl(reason).trim();
  if (r.length < 3 || r.length > 200) throw new DomainError("Bitte gib einen Grund an (3 bis 200 Zeichen).");
  return r;
}

/** Nur Admin 1 und Admin 2 (Permission booking, 009-Matrix), nicht gesperrt. Die Funktion prueft selbst, nicht nur der Waechter der Server-Aktion. */
async function assertCanDecide(tx: Pick<Tx, "select">, actorId: string): Promise<void> {
  const [a] = await tx.select({ role: users.role, isOwner: users.isOwner, bannedAt: users.bannedAt }).from(users).where(eq(users.id, actorId));
  if (!a || a.bannedAt || !canUser(a, "booking")) throw new DomainError("Das darf nur Admin 1 oder Admin 2.");
}

async function notifyAdmins(tx: Tx, title: string, body: string) {
  await notifyUsers(await bookingStaffIds(tx), { type: "admin.task", title, body, url: "/admin/hallen/anfragen" }, tx);
}


/**
 * Hallen-Anfrage ("Anfrage senden", M2d): legt die Halle im Status "requested" an (inaktiv, keine Partnerhalle, Standard-Provision) mit aktivem Betreiber-Zugang fuer den Anfragenden.
 * Idempotent: dieselbe offene Anfrage desselben Nutzers (Name, Stadt) liefert die vorhandene Halle (Doppelklick).
 */
export async function requestVenue(userId: string, input: VenueInput & VenueRequestExtras) {
  const v = cleanVenueInput(input);
  assertPriceExtras(input);
  const commission = (await defaultCommissionPercent()).toFixed(2);
  return db.transaction(async (tx) => {
    // Sperre je Nutzer (Advisory-Lock, bis zum Ende der Transaktion): Doppelklick und parallele Anfragen laufen nacheinander, Pruefung und Anlage sind atomar
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"venue-request:" + userId}))`);
    const [u] = await tx.select({ id: users.id, bannedAt: users.bannedAt, role: users.role }).from(users).where(eq(users.id, userId));
    if (!u || u.bannedAt) throw new DomainError("Bitte melde dich an.");
    if (isPlatformAdmin(u)) throw new DomainError("Mit einem Admin-Konto kann keine Halle angefragt werden."); // wie inviteVenueManager: ein Admin ist nie Betreiber
    // Eigene offene Anfragen: zwei Abfragen statt einer je Halle (Zugang ueber die gemeinsame Quelle venue-access-rules)
    const mine = await openRequestsOf(tx, userId);
    const same = mine.find((h) => h.name === v.name && h.city === v.city);
    if (same) {
      // Doppelklick: dieselbe offene Anfrage desselben Betreibers. Mit IDENTISCHEN Werten ist das ok (dieselbe Halle); mit ABWEICHENDEN Werten KEIN stilles ok (die neuen Angaben wuerden verschluckt).
      const rules = await tx.select().from(priceRules).where(eq(priceRules.venueId, same.id));
      const price = (d: number) => rules.find((r) => r.durationMin === d)?.priceCents;
      const identical =
        (v.address ?? null) === same.address && (v.contact ?? null) === same.contact && (v.surface ?? null) === same.surface && (v.hasShowers ?? false) === same.hasShowers && (v.hasParking ?? false) === same.hasParking &&
        (input.courts === undefined || input.courts === same.courtCount) &&
        (input.price60Cents === undefined || (input.price60Cents === price(60) && input.price90Cents === price(90)));
      if (!identical) throw new DomainError("Diese Anfrage liegt schon vor, mit anderen Angaben. Bitte warte auf die Entscheidung, bevor du eine geänderte Anfrage sendest.");
      return same;
    }
    await assertRateLimit(tx, userId);
    if (mine.length >= MAX_OPEN_REQUESTS) throw new DomainError(`Du hast schon ${MAX_OPEN_REQUESTS} offene Hallen-Anfragen. Bitte warte auf die Entscheidung.`);
    const now = new Date();
    const [row] = await tx
      .insert(venues)
      .values({ name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers ?? false, hasParking: v.hasParking ?? false, courtCount: input.courts ?? null, isPartner: false, active: false, commissionPercent: commission, approvalStatus: "requested", approvalRequestedAt: now, managerUserId: userId })
      .returning();
    await tx.insert(venueAccess).values({ venueId: row.id, userId, status: "active", assignedBy: userId, assignedAt: now });
    await replacePriceRules(tx, row.id, input);
    await audit(userId, "venue.requested", "venue", row.id, { after: requestedAudit(input) }, tx);
    await notifyAdmins(tx, "Neue Hallen-Anfrage", "Eine Halle wartet auf Freischaltung.");
    return row;
  });
}

/** Erneute Anfrage nach einer Ablehnung (nach Aenderung der Angaben), nur durch den Betreiber der Halle (aktiver Zugang). Die Historie bleibt im audit_log. */
export async function resubmitVenue(userId: string, venueId: string, input: VenueInput & VenueRequestExtras) {
  if (!UUID.test(venueId)) throw new DomainError(NOT_FOUND); // keine UUID: wie eine unbekannte Halle (kein Typfehler der Datenbank)
  const v = cleanVenueInput(input);
  assertPriceExtras(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"venue-request:" + userId}))`); // dieselbe Sperre je Nutzer wie requestVenue (Rate-Limit atomar)
    const [locked] = await tx.select({ id: venues.id, status: venues.approvalStatus }).from(venues).where(eq(venues.id, venueId)).for("update");
    if (!locked || !(await hasVenueAccess(venueId, userId, tx))) throw new DomainError(NOT_FOUND);
    if (locked.status !== "rejected") throw new DomainError("Nur eine abgelehnte Halle kann erneut angefragt werden.");
    await assertRateLimit(tx, userId);
    if ((await openRequestsOf(tx, userId)).length >= MAX_OPEN_REQUESTS) throw new DomainError(`Du hast schon ${MAX_OPEN_REQUESTS} offene Hallen-Anfragen. Bitte warte auf die Entscheidung.`); // dieselbe Obergrenze wie requestVenue
    const [row] = await tx
      .update(venues)
      .set({ name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers ?? false, hasParking: v.hasParking ?? false, ...(input.courts !== undefined ? { courtCount: input.courts } : {}), approvalStatus: "requested", active: false, approvalRequestedAt: new Date(), approvalDecidedAt: null, approvalDecidedBy: null, approvalReason: null })
      .where(eq(venues.id, venueId))
      .returning();
    await replacePriceRules(tx, venueId, input); // ERSETZEN statt verdoppeln
    await audit(userId, "venue.requested", "venue", venueId, { after: requestedAudit(input, { resubmit: true }) }, tx);
    await notifyAdmins(tx, "Neue Hallen-Anfrage", "Eine abgelehnte Halle wurde erneut angefragt.");
    return row;
  });
}

async function decide(actorId: string, venueId: string, to: "approved" | "rejected", reason: string | null) {
  await db.transaction(async (tx) => {
    await assertCanDecide(tx, actorId);
    const [v] = await tx.select({ id: venues.id, status: venues.approvalStatus }).from(venues).where(eq(venues.id, venueId)).for("update");
    if (!v) throw new DomainError(NOT_FOUND);
    if (v.status !== "requested") throw new DomainError(NOT_OPEN);
    await tx
      .update(venues)
      .set({ approvalStatus: to, active: to === "approved", approvalDecidedAt: new Date(), approvalDecidedBy: actorId, approvalReason: reason })
      .where(eq(venues.id, venueId));
    await audit(actorId, to === "approved" ? "venue.approved" : "venue.rejected", "venue", venueId, { before: { status: "requested" }, after: { status: to, ...(reason ? { reason } : {}) } }, tx);
    await notifyUsers(
      await venueAccessHolderIds(venueId, tx),
      to === "approved"
        ? { type: "system", title: "Halle freigeschaltet", body: "Deine Halle ist freigeschaltet und kann jetzt gefunden und gebucht werden.", url: "/halle" }
        : { type: "system", title: "Halle abgelehnt", body: `Deine Hallen-Anfrage wurde abgelehnt: ${reason}. Du kannst sie nach einer Änderung erneut senden.`, url: "/halle" },
      tx,
    );
  });
}

/** Freischalten: Status approved und active (atomar). Nur aus "requested". */
export async function approveVenue(actorId: string, venueId: string) {
  await decide(actorId, venueId, "approved", null);
}

/** Ablehnen mit Grund (3 bis 200 Zeichen). Nur aus "requested". */
export async function rejectVenue(actorId: string, venueId: string, reason: string) {
  const r = cleanReason(reason);
  await decide(actorId, venueId, "rejected", r);
}

/** Offene Anfragen fuer die Admin-Ansicht (aelteste zuerst); ohne Betreiber-Adressen, nur ob ein Zugang besteht. */
export async function listVenueRequests() {
  await connection();
  const rows = await db
    .select({ id: venues.id, name: venues.name, city: venues.city, address: venues.address, contact: venues.contact, surface: venues.surface, requestedAt: venues.approvalRequestedAt })
    .from(venues)
    .where(eq(venues.approvalStatus, "requested"))
    .orderBy(asc(venues.approvalRequestedAt), asc(venues.id));
  return rows;
}

/** Status der eigenen noch nicht freigegebenen Hallen fuer den Betreiber (Seite /halle): offene Anfrage oder Ablehnung mit Grund. Freigegebene Hallen erscheinen nicht. */
export async function myPendingVenues(userId: string) {
  await connection();
  const ids = await venueIdsOf(userId);
  if (ids.length === 0) return [];
  return db
    .select({ id: venues.id, name: venues.name, status: venues.approvalStatus, reason: venues.approvalReason })
    .from(venues)
    .where(and(inArray(venues.id, ids), ne(venues.approvalStatus, "approved")))
    .orderBy(asc(venues.name));
}

/** Zahl der offenen Anfragen (Hinweis in der Admin-Navigation und auf /admin/hallen). */
export async function countVenueRequests(): Promise<number> {
  await connection();
  const [r] = await db.select({ n: count() }).from(venues).where(eq(venues.approvalStatus, "requested"));
  return r.n;
}

/** Abgelehnte Anfragen (nur Ansicht, neueste zuerst): Name, Stadt, Grund und Zeitpunkt, ohne Betreiber-Angaben. */
export async function listRejectedVenues() {
  await connection();
  return db
    .select({ id: venues.id, name: venues.name, city: venues.city, reason: venues.approvalReason, decidedAt: venues.approvalDecidedAt })
    .from(venues)
    .where(eq(venues.approvalStatus, "rejected"))
    .orderBy(desc(venues.approvalDecidedAt), asc(venues.id));
}
