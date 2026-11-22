import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { matchHallRequests } from "@/db/schema-matchmaking";
import { isPlatformAdmin } from "@/lib/roles";
import { audit } from "./audit";
import { DomainError } from "./teams";
import type { Tx } from "./tx";
import { settleHallCheck } from "./veto";
import { INVITE_VALID_DAYS, isAnonymizedEmail, normalizeEmail } from "./venue-access-rules";

export { INVITE_VALID_DAYS, normalizeEmail } from "./venue-access-rules";

// Schreiben der Betreiber-Zugänge (Vertrag 011 M1, Entscheide t9 P1 bis P11). Alles in Transaktionen; venues.manager_user_id wird in jedem Pfad mitgeschrieben (Rückfall bis 011 M4).
// Das Eingriffsprotokoll enthält nur IDs und den Grund, nie die E-Mail-Adresse.
// SPERRREIHENFOLGE (einheitlich, gegen Verklemmungen): erst venues (nach id sortiert), dann venue_access, dann matches (nach id sortiert). answerHallRequest sperrt nur das Spiel und liest den Zugang ohne Sperre.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Zuordnen und Entziehen darf nur Admin 1 (Vertrag 011 AC-7): auch die Funktion prüft es selbst, nicht nur der Wächter der Server-Aktion. */
async function assertOwner(tx: Pick<Tx, "select">, actorId: string): Promise<void> {
  const [a] = await tx.select({ isOwner: users.isOwner }).from(users).where(eq(users.id, actorId));
  if (!a?.isOwner) throw new DomainError("Das darf nur Admin 1.");
}

function cleanReason(reason: string): string {
  const r = reason.trim();
  if (r.length < 3 || r.length > 200) throw new DomainError("Bitte gib einen Grund an (3 bis 200 Zeichen).");
  return r;
}

/** Sperrt Hallen nach id sortiert (immer als Erstes, vor venue_access und matches). */
async function lockVenues(tx: Tx, venueIds: string[]): Promise<void> {
  const ids = [...new Set(venueIds)].sort();
  if (ids.length) await tx.select({ id: venues.id }).from(venues).where(inArray(venues.id, ids)).orderBy(asc(venues.id)).for("update");
}

/**
 * Offene Anfragen einer Halle ohne Zugang werden „unmanaged“ (keine stille Ablehnung, Entscheid P5); danach läuft die Auswertung weiter.
 * Reihenfolge wie answerHallRequest: ZUERST die Spiele sperren (nach id sortiert), erst dann die Anfragezeilen ändern (sonst Verklemmung mit einer gleichzeitigen Antwort).
 */
async function releasePendingRequests(tx: Tx, venueId: string, now: Date = new Date()): Promise<void> {
  const pending = await tx.select({ matchId: matchHallRequests.matchId }).from(matchHallRequests).where(and(eq(matchHallRequests.venueId, venueId), eq(matchHallRequests.status, "pending")));
  const ids = [...new Set(pending.map((r) => r.matchId))].sort();
  if (ids.length === 0) return;
  const locked = await tx.select().from(matches).where(inArray(matches.id, ids)).orderBy(asc(matches.id)).for("update");
  await tx.update(matchHallRequests).set({ status: "unmanaged" }).where(and(eq(matchHallRequests.venueId, venueId), eq(matchHallRequests.status, "pending")));
  for (const m of locked) await settleHallCheck(tx, m, now);
}

/** Setzt den offenen (eingeladenen oder aktiven) Zugang einer Halle auf „entzogen“. Gibt die Zeile zurück oder null. */
async function revokeOpen(tx: Tx, venueId: string, now: Date) {
  const [open] = await tx
    .update(venueAccess)
    .set({ status: "revoked", revokedAt: now, invitedEmail: null })
    .where(and(eq(venueAccess.venueId, venueId), sql`${venueAccess.status} <> 'revoked'`))
    .returning({ id: venueAccess.id });
  if (open) {
    await tx.update(venues).set({ managerUserId: null }).where(eq(venues.id, venueId));
    await releasePendingRequests(tx, venueId, now);
  }
  return open ?? null;
}

/** Admin 1 gibt eine Google-E-Mail für eine Halle frei (keine Mail-Zustellung, Entscheid P1). Ein bisheriger Zugang wird sofort entzogen und ersetzt. Der Zugang wird erst beim nächsten verifizierten Google-Login aktiv (P10). */
export async function inviteVenueManager(actorId: string, venueId: string, email: string, reason: string): Promise<{ accessId: string }> {
  const mail = normalizeEmail(email);
  if (mail.length > 254 || !EMAIL.test(mail)) throw new DomainError("Bitte gib eine gültige E-Mail-Adresse an.");
  if (isAnonymizedEmail(mail)) throw new DomainError("Diese Adresse kann nicht zugeordnet werden.");
  const why = cleanReason(reason);
  return db.transaction(async (tx) => {
    await assertOwner(tx, actorId);
    const [v] = await tx.select({ id: venues.id }).from(venues).where(eq(venues.id, venueId)).for("update");
    if (!v) throw new DomainError("Halle nicht gefunden.");
    const [u] = await tx.select({ role: users.role, bannedAt: users.bannedAt }).from(users).where(eq(users.email, mail));
    if (isPlatformAdmin(u)) throw new DomainError("Ein Admin-Konto kann keine Halle betreiben.");
    if (u?.bannedAt) throw new DomainError("Dieses Konto ist gesperrt.");
    const now = new Date();
    const replaced = await revokeOpen(tx, venueId, now);
    const [row] = await tx.insert(venueAccess).values({ venueId, invitedEmail: mail, status: "invited", invitedAt: now, assignedBy: actorId }).returning({ id: venueAccess.id });
    await audit(actorId, "venue.access.invite", "venue", venueId, { after: { accessId: row.id, replacedAccessId: replaced?.id ?? null, reason: why } }, tx);
    return { accessId: row.id };
  });
}

/** Entzieht den Zugang einer Halle (auch eine noch nicht eingelöste Einladung): wirkt sofort, Historie bleibt. */
export async function revokeVenueAccess(actorId: string, venueId: string, reason: string): Promise<boolean> {
  const why = cleanReason(reason);
  return db.transaction(async (tx) => {
    await assertOwner(tx, actorId);
    const [v] = await tx.select({ id: venues.id }).from(venues).where(eq(venues.id, venueId)).for("update");
    if (!v) throw new DomainError("Halle nicht gefunden.");
    const old = await revokeOpen(tx, venueId, new Date());
    if (old) await audit(actorId, "venue.access.revoke", "venue", venueId, { before: { accessId: old.id }, after: { reason: why } }, tx);
    return Boolean(old);
  });
}

/**
 * Konto-Löschung: alle Zugänge dieses Kontos UND noch offene Einladungen an die Adresse dieses Kontos werden entzogen, die E-Mail geleert (Datenschutz: die Adresse darf nach der
 * Anonymisierung nirgends stehen bleiben); offene Anfragen der Hallen werden „unmanaged“. Aufruf VOR der Anonymisierung der Kontoadresse.
 */
export async function revokeAccessOfUser(tx: Tx, userId: string, now: Date = new Date()): Promise<void> {
  const [me] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const mail = me ? normalizeEmail(me.email) : "";
  const mine = sql`(${venueAccess.userId} = ${userId} or (${venueAccess.status} = 'invited' and lower(${venueAccess.invitedEmail}) = ${mail}))`;
  const candidates = await tx.select({ venueId: venueAccess.venueId }).from(venueAccess).where(and(mine, sql`${venueAccess.status} <> 'revoked'`));
  await lockVenues(tx, candidates.map((c) => c.venueId));
  const rows = await tx
    .update(venueAccess)
    .set({ status: "revoked", revokedAt: now, invitedEmail: null })
    .where(and(mine, sql`${venueAccess.status} <> 'revoked'`))
    .returning({ venueId: venueAccess.venueId, id: venueAccess.id });
  for (const r of rows.sort((x, y) => x.venueId.localeCompare(y.venueId))) {
    await tx.update(venues).set({ managerUserId: null }).where(and(eq(venues.id, r.venueId), eq(venues.managerUserId, userId)));
    await releasePendingRequests(tx, r.venueId, now);
    await audit(userId, "venue.access.revoke", "venue", r.venueId, { before: { accessId: r.id }, after: { reason: "Konto gelöscht" } }, tx);
  }
}

/**
 * Einlösen beim Login: ein einziges bedingtes UPDATE über alle offenen Einladungen dieser E-Mail (Mehr-Hallen-Einladung, die Halle ist im Login unbekannt).
 * Nur Google mit verifizierter E-Mail (nie der Dev-Login), E-Mail exakt (klein, getrimmt), Einladung höchstens 14 Tage alt, Konto nicht gesperrt und kein Admin-Konto:
 * die Prüfung steht im selben Statement. Parallele Logins lösen jede Zeile höchstens einmal ein. Danach hängt der Zugang an user_id, die E-Mail löst nie wieder auf.
 */
export async function redeemVenueInvites(input: { userId: string; email: string; provider: string; emailVerified: boolean | undefined }): Promise<number> {
  if (input.provider !== "google" || input.emailVerified !== true) return 0;
  const mail = normalizeEmail(input.email);
  if (!mail || isAnonymizedEmail(mail)) return 0;
  return db.transaction(async (tx) => {
    // erst die Hallen der offenen Einladungen sperren (sortiert), dann das UPDATE: gleiche Reihenfolge wie Einladen/Entziehen
    const open = await tx.select({ venueId: venueAccess.venueId }).from(venueAccess).where(and(eq(venueAccess.status, "invited"), sql`lower(${venueAccess.invitedEmail}) = ${mail}`));
    if (open.length === 0) return 0;
    await lockVenues(tx, open.map((o) => o.venueId));
    const res = await tx.execute<{ id: string; venue_id: string }>(sql`
      update venue_access set user_id = ${input.userId}, status = 'active', assigned_at = now()
      where status = 'invited' and user_id is null and lower(invited_email) = ${mail}
        and invited_at > now() - make_interval(days => ${INVITE_VALID_DAYS})
        and exists (select 1 from users u where u.id = ${input.userId} and lower(u.email) = ${mail} and u.banned_at is null and u.role <> 'admin')
      returning id, venue_id`);
    const rows = res.rows;
    if (rows.length === 0) return 0;
    await tx.update(venues).set({ managerUserId: input.userId }).where(and(inArray(venues.id, rows.map((r) => r.venue_id)), sql`${venues.managerUserId} is null`));
    for (const r of rows) await audit(input.userId, "venue.access.redeem", "venue", r.venue_id, { after: { accessId: r.id } }, tx);
    return rows.length;
  });
}

export type VenueAccessRow = { venueId: string; status: "invited" | "active" | "revoked"; invitedAt: Date; assignedAt: Date | null; hasAccount: boolean; invitedEmail: string | null };

/** Übersicht der Zugänge für den Admin. Die E-Mail-Adresse liefert die Abfrage nur an Admin 1 (Entscheid P7), nie an Admin 2 oder Betreiber. */
export async function listVenueAccess(viewer: { isOwner: boolean }): Promise<VenueAccessRow[]> {
  const rows = await db
    .select({ venueId: venueAccess.venueId, status: venueAccess.status, invitedAt: venueAccess.invitedAt, assignedAt: venueAccess.assignedAt, userId: venueAccess.userId, invitedEmail: venueAccess.invitedEmail })
    .from(venueAccess)
    .where(sql`${venueAccess.status} <> 'revoked'`)
    .orderBy(asc(venueAccess.venueId));
  return rows.map((r) => ({ venueId: r.venueId, status: r.status, invitedAt: r.invitedAt, assignedAt: r.assignedAt, hasAccount: r.userId !== null, invitedEmail: viewer.isOwner ? r.invitedEmail : null }));
}

/** Aufbewahrung der Adresse einer abgelaufenen Einladung (Entscheid t9 R1): 30 Tage nach Ablauf (Einladung gilt 14 Tage), also 44 Tage nach dem Einladen. */
export const INVITE_ADDRESS_RETENTION_DAYS = 30;

/**
 * Job: Einladungen, die seit mehr als INVITE_VALID_DAYS + INVITE_ADDRESS_RETENTION_DAYS Tagen offen sind, werden `revoked`, die Adresse wird geleert (Datenminimierung, R1).
 * (Ein Entzug oder Rückzug leert die Adresse schon sofort, die Konto-Löschung ebenso.) Sperrreihenfolge wie überall: erst die Hallen (SKIP LOCKED: zwei Läufe tun nie dasselbe,
 * eine gerade bearbeitete Halle kommt im nächsten Lauf dran), dann venue_access. Idempotent; das Eingriffsprotokoll enthält nur IDs und den Grund, nie die Adresse.
 */
export async function expireVenueInvites(now: Date = new Date(), limit = 100): Promise<number> {
  const cutoff = new Date(now.getTime() - (INVITE_VALID_DAYS + INVITE_ADDRESS_RETENTION_DAYS) * 86_400_000);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ venueId: venueAccess.venueId })
      .from(venueAccess)
      .where(and(eq(venueAccess.status, "invited"), sql`${venueAccess.invitedAt} < ${cutoff}`))
      .orderBy(asc(venueAccess.venueId))
      .limit(limit);
    if (due.length === 0) return 0;
    const locked = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(inArray(venues.id, [...new Set(due.map((d) => d.venueId))]))
      .orderBy(asc(venues.id))
      .for("update", { skipLocked: true });
    if (locked.length === 0) return 0;
    // invited_at-Bedingung auch im UPDATE: Verteidigungsschicht gegen eine Neu-Einladung, die zwischen Auswahl und Sperre eintrifft (nur per Rennen testbar)
    const rows = await tx
      .update(venueAccess)
      .set({ status: "revoked", revokedAt: now, invitedEmail: null })
      .where(and(inArray(venueAccess.venueId, locked.map((l) => l.id)), eq(venueAccess.status, "invited"), sql`${venueAccess.invitedAt} < ${cutoff}`))
      .returning({ id: venueAccess.id, venueId: venueAccess.venueId });
    for (const r of rows.sort((a, b) => a.venueId.localeCompare(b.venueId))) {
      await audit(null, "venue.access.expire", "venue", r.venueId, { before: { accessId: r.id }, after: { reason: "Einladung abgelaufen, Adresse nach Aufbewahrungsfrist geleert" } }, tx);
    }
    return rows.length;
  });
}
