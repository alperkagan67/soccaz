import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
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
export async function requestVenue(userId: string, input: VenueInput) {
  const v = cleanVenueInput(input);
  const commission = (await defaultCommissionPercent()).toFixed(2);
  return db.transaction(async (tx) => {
    // Sperre je Nutzer (Advisory-Lock, bis zum Ende der Transaktion): Doppelklick und parallele Anfragen laufen nacheinander, Pruefung und Anlage sind atomar
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"venue-request:" + userId}))`);
    const [u] = await tx.select({ id: users.id, bannedAt: users.bannedAt, role: users.role }).from(users).where(eq(users.id, userId));
    if (!u || u.bannedAt) throw new DomainError("Bitte melde dich an.");
    if (isPlatformAdmin(u)) throw new DomainError("Mit einem Admin-Konto kann keine Halle angefragt werden."); // wie inviteVenueManager: ein Admin ist nie Betreiber
    // Eigene offene Anfragen: zwei Abfragen statt einer je Halle (Zugang ueber die gemeinsame Quelle venue-access-rules)
    const myIds = await venueIdsOf(userId, tx);
    const mine = myIds.length ? await tx.select().from(venues).where(and(inArray(venues.id, myIds), eq(venues.approvalStatus, "requested"))) : [];
    const same = mine.find((h) => h.name === v.name && h.city === v.city);
    if (same) return same; // Doppelklick: dieselbe offene Anfrage desselben Betreibers
    if (mine.length >= MAX_OPEN_REQUESTS) throw new DomainError(`Du hast schon ${MAX_OPEN_REQUESTS} offene Hallen-Anfragen. Bitte warte auf die Entscheidung.`);
    const now = new Date();
    const [row] = await tx
      .insert(venues)
      .values({ name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers ?? false, hasParking: v.hasParking ?? false, isPartner: false, active: false, commissionPercent: commission, approvalStatus: "requested", approvalRequestedAt: now, managerUserId: userId })
      .returning();
    await tx.insert(venueAccess).values({ venueId: row.id, userId, status: "active", assignedBy: userId, assignedAt: now });
    await audit(userId, "venue.requested", "venue", row.id, { after: { status: "requested" } }, tx);
    await notifyAdmins(tx, "Neue Hallen-Anfrage", "Eine Halle wartet auf Freischaltung.");
    return row;
  });
}

/** Erneute Anfrage nach einer Ablehnung (nach Aenderung der Angaben), nur durch den Betreiber der Halle (aktiver Zugang). Die Historie bleibt im audit_log. */
export async function resubmitVenue(userId: string, venueId: string, input: VenueInput) {
  const v = cleanVenueInput(input);
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: venues.id, status: venues.approvalStatus }).from(venues).where(eq(venues.id, venueId)).for("update");
    if (!locked || !(await hasVenueAccess(venueId, userId, tx))) throw new DomainError(NOT_FOUND);
    if (locked.status !== "rejected") throw new DomainError("Nur eine abgelehnte Halle kann erneut angefragt werden.");
    const [row] = await tx
      .update(venues)
      .set({ name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers ?? false, hasParking: v.hasParking ?? false, approvalStatus: "requested", active: false, approvalRequestedAt: new Date(), approvalDecidedAt: null, approvalDecidedBy: null, approvalReason: null })
      .where(eq(venues.id, venueId))
      .returning();
    await audit(userId, "venue.requested", "venue", venueId, { after: { status: "requested", resubmit: true } }, tx);
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
