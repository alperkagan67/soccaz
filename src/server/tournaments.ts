import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { auditLog, matchParticipants, matchResults, matches, notifications, paymentCharges, teamMembers, teams, users } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { abortDeadline, dueWithGrace, fixDeadline, FIX_DEADLINE_HOURS, hasLongLead } from "@/lib/deadlines";
import { MAX_PER_TEAM, MIN_READY_PER_TEAM } from "@/lib/lobby-rules";
import { GAP_MIN, secureRandom, shuffle, finalSharePerPlayer, scheduleFromRows, koWinner, knockout, shareRange, standings, drawGroups, groupName, tournamentTotalCents, type Fixture, type Played } from "@/lib/tournament";
import { priceFor } from "./pricing";
import { toBerlinInputValue } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { notifyUsers, teamAdminIds } from "./notifications";
import { getSetting } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";
import { isOwner, isPlatformAdmin, type Role } from "@/lib/roles";
import { clearTournamentCovers, getTournamentCardDisplays, tournamentAllCardsReady, tournamentCardFlowPaused, tournamentCardMode, tournamentPayBlocked, PAYMENTS_PAUSED, tournamentMissingCards, tournamentTeamCardsReady } from "./tournament-card";
import { hasTournamentChargeRows, prepareCardCancel } from "./payments/tournament-cancel";
import { effectiveGraceEnd, NON_CARD_CODES } from "@/lib/grace";
import { PAUSE_CANCEL_REASON_TOURNAMENT, resumeFloor, resumeUntil, windowEndSql } from "./pause-resume";
import { notifyHolderOnFix } from "./tournament-holders";
import { venueAccessHolderIds } from "./venue-access-rules";
import { freezeVenueTerms, hallZusageOkLive, isPartnerVenue } from "./tournament-venue";
import { venues } from "@/db/schema-finance";
import { cardPaymentsEnabled, tournamentPaymentsActive } from "./settings";
import { zahlungenAus } from "./zahlungen-aus";
import { ZAHLUNGEN_AUS_HINWEIS } from "@/lib/zahlungen-aus";

export const MAX_ENTRY_FEE_CENTS = 50_000;
export const MIN_TOURNAMENT_TEAMS = 4;
export const MAX_TOURNAMENT_TEAMS = 32;
/** Mindestens so viele Spieler braucht ein Turnier-Team, damit der Captain bereit drücken kann. */
export const MIN_PLAYERS_PER_TEAM = MIN_READY_PER_TEAM;

/** Provision der Plattform auf die Eintrittsgelder, in Prozent (Einstellung, Standard 10). */
export async function commissionPercent(exec: Pick<typeof db, "select"> = db): Promise<number> {
  const v = await getSetting<number>("tournament_commission_percent", 10, exec);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
}

export async function setOrganizer(actorId: string, userId: string, value: boolean) {
  const [row] = await db.update(users).set({ isOrganizer: value }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!row) throw new DomainError("Nutzer nicht gefunden.");
  await audit(actorId, value ? "organizer.grant" : "organizer.revoke", "user", userId, {});
}

export type TournamentInput = {
  name: string;
  city: string;
  venueText?: string;
  /** Partnerhalle (012 M5-1): Pflicht im Kartenmodell, wenn das Turnier etwas kostet. */
  venueId?: string;
  startsAt: Date;
  registrationDeadline: Date;
  maxTeams: number;
  /** Dauer des Turniers in Minuten (Hallenzeit). */
  durationMin: number;
  /** Hallenpreis pro Stunde in Cent; leer = Standardpreis der Plattform. Die Gesamtkosten werden durch alle Spieler geteilt. */
  hourlyCents?: number | null;
  isPrivate?: boolean;
  matchMinutes?: number;
};

/** Der endgültige Preis pro Spieler: erst bekannt, wenn alle Teams vollzählig gemeldet haben (Phase "Zahlung"). */
export const shareOf = (t: { finalShareCents: number | null }): number => t.finalShareCents ?? 0;

/** Nur freigeschaltete Veranstalter (und Plattform-Admins) legen Turniere an. Das Turnier ist standardmäßig privat und läuft im K.-o.-System. */
export async function createTournament(userId: string, input: TournamentInput) {
  const [u] = await db.select({ isOrganizer: users.isOrganizer, role: users.role }).from(users).where(eq(users.id, userId));
  if (!u || (!u.isOrganizer && u.role !== "admin")) throw new DomainError("Turniere dürfen nur freigeschaltete Veranstalter anlegen. Melde dich beim Socaz-Admin (Telefon oder E-Mail), dann schalten wir dich frei.");
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) throw new DomainError("Der Name braucht 3 bis 80 Zeichen.");
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  const now = Date.now();
  if (Number.isNaN(input.startsAt.getTime()) || input.startsAt.getTime() <= now) throw new DomainError("Bitte wähle einen Termin in der Zukunft.");
  if (Number.isNaN(input.registrationDeadline.getTime()) || input.registrationDeadline.getTime() <= now) throw new DomainError("Der Anmeldeschluss muss in der Zukunft liegen.");
  if (input.registrationDeadline.getTime() >= input.startsAt.getTime()) throw new DomainError("Der Anmeldeschluss muss vor dem Turnierbeginn liegen.");
  // Mit mindestens 48 Stunden Vorlauf schließt die Lobby 48 Stunden vor dem Start (Vertrag 008 AC-12): der Anmeldeschluss darf nicht später liegen.
  // Bei weniger als 48 Stunden Vorlauf gilt nur "vor dem Start" (Sofortbuchung und 1-h-Abbruch).
  if (hasLongLead(input.startsAt, new Date(now)) && input.registrationDeadline.getTime() > fixDeadline(input.startsAt).getTime()) {
    throw new DomainError(`Der Anmeldeschluss muss mindestens ${FIX_DEADLINE_HOURS} Stunden vor dem Turnierbeginn liegen.`);
  }
  if (!Number.isInteger(input.maxTeams) || input.maxTeams < MIN_TOURNAMENT_TEAMS || input.maxTeams > MAX_TOURNAMENT_TEAMS) throw new DomainError(`${MIN_TOURNAMENT_TEAMS} bis ${MAX_TOURNAMENT_TEAMS} Teams.`);
  if (!Number.isInteger(input.durationMin) || input.durationMin < 30 || input.durationMin > 720 || input.durationMin % 15 !== 0) throw new DomainError("Das Turnier dauert 30 Minuten bis 12 Stunden (in 15-Minuten-Schritten).");
  let hourly = input.hourlyCents ?? null;
  if (hourly === null && (await zahlungenAus())) hourly = 0; // Zahlungen AUS: kostenlos, kein Standardpreis noetig (Gratis-Turnier, Entscheid t2q 2026-11-24)
  if (hourly === null) {
    const standard = await priceFor(db, null, 60);
    if (!standard) throw new DomainError("Für die Halle gibt es keinen Standardpreis. Bitte gib den Hallenpreis pro Stunde an.");
    hourly = standard.priceCents;
  }
  if (!Number.isInteger(hourly) || hourly < 0 || hourly > 100_000) throw new DomainError("Der Hallenpreis liegt zwischen 0 und 1.000 Euro pro Stunde.");
  const totalCents = tournamentTotalCents(hourly, input.durationMin);
  // Partnerhalle (012 M5-1): im Kartenmodell Pflicht, sobald das Turnier etwas kostet; eine gewaehlte Halle muss immer eine aktive Partnerhalle sein
  let venueId: string | null = null;
  let venueLabel: string | null = null;
  if (input.venueId) {
    if (!(await isPartnerVenue(db, input.venueId))) throw new DomainError("Bitte wähle eine Partnerhalle.");
    venueId = input.venueId;
    const [v] = await db.select({ name: venues.name, address: venues.address }).from(venues).where(eq(venues.id, venueId));
    venueLabel = [v?.name, v?.address].filter(Boolean).join(", ") || null;
  } else if (totalCents > 0 && (await cardPaymentsEnabled())) {
    throw new DomainError("Bitte wähle eine Partnerhalle.");
  }
  const matchMinutes = input.matchMinutes ?? 15;
  if (!Number.isInteger(matchMinutes) || matchMinutes < 5 || matchMinutes > 90) throw new DomainError("Eine Spielzeit dauert 5 bis 90 Minuten.");
  const [row] = await db
    .insert(tournaments)
    .values({
      organizerId: userId,
      name,
      city: input.city,
      venueText: input.venueText?.trim().slice(0, 120) || venueLabel?.slice(0, 120) || null,
      venueId,
      startsOn: toBerlinInputValue(input.startsAt).slice(0, 10),
      startsAt: input.startsAt,
      registrationDeadline: input.registrationDeadline,
      format: "knockout",
      maxTeams: input.maxTeams,
      entryFeeCents: 0,
      totalCents,
      hourlyCents: hourly,
      durationMin: input.durationMin,
      isPrivate: input.isPrivate ?? true,
      inviteToken: randomBytes(16).toString("base64url"),
      matchMinutes,
    })
    .returning();
  await audit(userId, "tournament.create", "tournament", row.id, { after: { ...row, inviteToken: undefined } });
  return row;
}

type T = typeof tournaments.$inferSelect;

export async function lockTournament(tx: Tx, id: string): Promise<T> {
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, id)).for("update");
  if (!t) throw new DomainError("Turnier nicht gefunden.");
  return t;
}

async function isTeamAdmin(tx: Pick<typeof db, "select">, userId: string, teamId: string) {
  const [m] = await tx.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return m?.role === "admin";
}

async function canManage(tx: Pick<typeof db, "select">, userId: string, t: { organizerId: string }) {
  if (t.organizerId === userId) return true;
  const [u] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return u?.role === "admin";
}

const registrationOpen = (t: T) => t.status === "registration" && !t.bracketGeneratedAt;
const paymentOpen = (t: T) => t.status === "payment" && !t.bracketGeneratedAt;
const deadlinePassed = (t: T) => Boolean(t.registrationDeadline && t.registrationDeadline.getTime() <= Date.now());

function requireOpen(t: T) {
  if (!registrationOpen(t)) throw new DomainError("Die Anmeldung ist geschlossen.");
  if (deadlinePassed(t)) throw new DomainError("Der Anmeldeschluss ist vorbei.");
}

/** Der Captain meldet sein Team an: mit einem bestehenden Team (dort ist er Team-Admin). Es gibt genau einen Captain pro Team. */
export async function registerTeam(userId: string, tournamentId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    requireOpen(t);
    if (!(await isTeamAdmin(tx, userId, teamId))) throw new DomainError("Nur Team-Admins können ihr Team anmelden.");
    const [team] = await tx.select({ archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, teamId));
    if (!team || team.archivedAt) throw new DomainError("Team nicht gefunden.");
    const [{ n }] = await tx.select({ n: count() }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId));
    if (n >= t.maxTeams) throw new DomainError("Das Turnier ist voll.");
    const [already] = await tx.select({ teamId: tournamentTeams.teamId }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
    if (already) throw new DomainError("Euer Team ist schon angemeldet.");
    const [other] = await tx.select({ teamId: tournamentPlayers.teamId }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
    if (other) throw new DomainError("Du bist schon in einem anderen Team dieses Turniers.");

    await tx.insert(tournamentTeams).values({ tournamentId, teamId, captainId: userId });
    await tx.insert(tournamentPlayers).values({ tournamentId, teamId, userId }); // der Captain spielt mit und zahlt wie alle
    await audit(userId, "tournament.register", "tournament", tournamentId, { after: { teamId } }, tx);
  });
}

/** Ein Mitglied eines angemeldeten Teams tritt dem Turnier-Kader bei. Ändert sich der Kader, gilt "Team vollzählig" nicht mehr. */
export async function joinAsPlayer(userId: string, tournamentId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    requireOpen(t);
    const [entry] = await tx.select({ teamId: tournamentTeams.teamId }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
    if (!entry) throw new DomainError("Dieses Team ist nicht im Turnier.");
    const [member] = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (!member) throw new DomainError("Nur Mitglieder des Teams können dem Turnier beitreten. Tritt zuerst über den Einladungslink des Teams bei.");
    const [existing] = await tx.select({ teamId: tournamentPlayers.teamId }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
    if (existing) throw new DomainError(existing.teamId === teamId ? "Du bist schon im Turnier-Kader." : "Du bist schon in einem anderen Team dieses Turniers. Ein Konto spielt je Turnier nur in einem Team.");
    const [{ n }] = await tx.select({ n: count() }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, teamId)));
    if (n >= MAX_PER_TEAM) throw new DomainError("Der Kader ist voll.");
    await tx.insert(tournamentPlayers).values({ tournamentId, teamId, userId });
    await unlockTeam(tx, tournamentId, teamId);
    await audit(userId, "tournament.join", "tournament", tournamentId, { after: { teamId } }, tx);
  });
}

type PlayerRow = typeof tournamentPlayers.$inferSelect;

async function refundPlayer(tx: Tx, t: T, p: PlayerRow, reason: string) {
  if (p.paidCents > 0) {
    // 012 M6b b2-ii: Es gibt kein Guthaben mehr. Altgeld (paid_cents > 0 aus dem früheren Guthabenmodell) wird NICHT erstattet, sondern protokolliert (Anzahl/Betrag, ohne Personendaten),
    // damit Admin 1 es klärt. Das Team ist dann nicht mehr vollständig: "Bereit" gilt nicht mehr. Karten-Abbuchungen erstattet allein der Kartenpfad (tournament-refund.ts).
    await tx.update(tournamentTeams).set({ paidReadyAt: null }).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, p.teamId)));
    // Je Spieler, Bezahlzeitpunkt und Anlass nur EIN Eintrag (Wiederholung schreibt nicht doppelt). userId/paidBy sind interne IDs, kein Name und keine E-Mail: der Anspruch bleibt zuordenbar, auch wenn die Zeile gleich gelöscht/genullt wird.
    const claimKey = `${p.userId}:${p.paidAt?.getTime() ?? 0}:${reason}`;
    const [seen] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, "tournament.refund_skipped"), eq(auditLog.entity, "tournament"), eq(auditLog.entityId, t.id), sql`${auditLog.after}->>'claimKey' = ${claimKey}`)).limit(1);
    if (!seen) await audit(null, "tournament.refund_skipped", "tournament", t.id, { after: { claimKey, userId: p.userId, paidBy: p.paidBy, teamId: p.teamId, paidAt: p.paidAt, amountCents: p.paidCents, reason, note: "keine Guthaben-Erstattung mehr (012 M6b): manuell klären" } }, tx);
  }
}

/** Spieler verlässt den Turnier-Kader (oder der Captain/Veranstalter entfernt ihn). Altgeld (früheres Guthabenmodell) wird nur protokolliert (refundPlayer). */
export async function leavePlayer(actorId: string, tournamentId: string, targetUserId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!registrationOpen(t)) throw new DomainError("Jetzt ist keine Änderung mehr möglich.");
    const [p] = await tx.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, targetUserId)));
    if (!p) throw new DomainError("Dieser Spieler ist nicht im Kader.");
    const [entry] = await tx.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, p.teamId)));
    if (entry?.captainId === targetUserId) throw new DomainError("Der Captain kann nicht austreten. Das Team muss sich abmelden.");
    const allowed = actorId === targetUserId || entry?.captainId === actorId || (await canManage(tx, actorId, t));
    if (!allowed) throw new DomainError("Dazu fehlt dir die Berechtigung.");
    await tx.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, targetUserId)));
    await clearTournamentCovers(tx, tournamentId, targetUserId); // eine Uebernahme endet mit dem Platz (Einwilligung gilt nur fuer diese Konstellation)
    await refundPlayer(tx, t, p, "Rückerstattung Eintritt");
    await unlockTeam(tx, tournamentId, p.teamId);
    await audit(actorId, "tournament.leave", "tournament", tournamentId, { after: { userId: targetUserId } }, tx);
  });
}

/** Ein Team ist vollzählig, wenn genug Spieler im Kader sind (4 bis 6). */
async function rosterReady(tx: Pick<typeof db, "select">, tournamentId: string, teamId: string): Promise<boolean> {
  const [{ n }] = await tx.select({ n: count() }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, teamId)));
  return n >= MIN_PLAYERS_PER_TEAM && n <= MAX_PER_TEAM;
}

/** Wer in den Kader kommt oder geht, hebt die "vollzählig"-Meldung des Teams auf (solange der Preis noch nicht feststeht). */
async function unlockTeam(tx: Tx, tournamentId: string, teamId: string) {
  await tx.update(tournamentTeams).set({ readyAt: null, paidReadyAt: null }).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
}

/**
 * Der Captain drückt "Bereit", nachdem sein Team vollständig bezahlt hat (egal wer gezahlt hat). Nur in der Zahlungsphase vor dem Bracket.
 * Die Prüfung läuft hier auf dem Server, nicht nur in der Oberfläche. `ready_at` ("Kader vollzählig") bleibt unberührt.
 */
export async function setPaidReady(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!paymentOpen(t)) throw new DomainError("Bereit geht erst in der Zahlungsphase, bevor das Bracket steht.");
    if (await tournamentPayBlocked(tx, t)) throw new DomainError(PAYMENTS_PAUSED);
    const [entry] = await tx.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.captainId, userId)));
    if (!entry) throw new DomainError("Nur der Captain eines angemeldeten Teams kann Bereit drücken.");
    if (await tournamentCardMode(tx, tournamentId)) {
      // Kartenmodell (012 M5-3): "Bereit" heisst "Karte hinterlegt" (eigene Karte oder gueltiger Uebernehmer im Team); nichts wird bezahlt. Das Bracket entsteht erst nach der Abbuchung (M5-4).
      if (!(await tournamentTeamCardsReady(tx, tournamentId, entry.teamId))) throw new DomainError("Bereit geht erst, wenn alle Spieler deines Teams eine Karte hinterlegt haben.");
      if (!entry.paidReadyAt) {
        await tx.update(tournamentTeams).set({ paidReadyAt: new Date() }).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, entry.teamId)));
        await audit(userId, "tournament.paidready", "tournament", tournamentId, { after: { teamId: entry.teamId, card: true } }, tx);
      }
      return;
    }
    const share = shareOf(t);
    const players = await tx.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, entry.teamId))).for("update");
    if (players.length === 0 || !players.every((p) => share === 0 || p.paidCents >= share)) throw new DomainError("Bereit geht erst, wenn alle Spieler deines Teams bezahlt haben.");
    if (!entry.paidReadyAt) {
      await tx.update(tournamentTeams).set({ paidReadyAt: new Date() }).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, entry.teamId)));
      await audit(userId, "tournament.paidready", "tournament", tournamentId, { after: { teamId: entry.teamId } }, tx);
    }
    await maybeGenerateBracket(tx, t); // das Bracket entsteht, sobald das letzte Team bereit ist
  });
}

/**
 * Der Captain meldet: "Mein Team ist vollzählig" (oder nimmt es zurück, solange der Preis noch nicht feststeht).
 * Haben alle Captains gemeldet, wird der Preis pro Spieler automatisch berechnet und die Zahlung beginnt.
 */
export async function setRosterComplete(userId: string, tournamentId: string, complete: boolean) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!registrationOpen(t)) throw new DomainError("Der Preis steht schon fest, jetzt ist keine Änderung am Kader mehr möglich.");
    const [entry] = await tx.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.captainId, userId)));
    if (!entry) throw new DomainError("Nur der Captain eines angemeldeten Teams kann den Kader als vollzählig melden.");
    if (complete && !(await rosterReady(tx, tournamentId, entry.teamId))) {
      throw new DomainError(`Vollzählig geht mit ${MIN_PLAYERS_PER_TEAM} bis ${MAX_PER_TEAM} Spielern im Kader.`);
    }
    await tx.update(tournamentTeams).set({ readyAt: complete ? new Date() : null }).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, entry.teamId)));
    await audit(userId, complete ? "tournament.roster.complete" : "tournament.roster.open", "tournament", tournamentId, { after: { teamId: entry.teamId } }, tx);
    await maybeFixPrice(tx, t);
  });
}

/**
 * Sind alle Plätze belegt und alle Teams vollzählig, steht die Spielerzahl fest: Der Preis pro Spieler ist Hallenkosten geteilt
 * durch alle Spieler (aufgerundet). Der Kader ist ab jetzt gesperrt, alle Spieler bekommen den Preis und können bezahlen.
 */
async function maybeFixPrice(tx: Tx, t: T) {
  const [fresh] = await tx.select().from(tournaments).where(eq(tournaments.id, t.id));
  if (!fresh || fresh.status !== "registration") return;
  const entries = await tx.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  if (entries.length !== fresh.maxTeams || entries.length < MIN_TOURNAMENT_TEAMS) return;
  if (!entries.every((e) => e.readyAt)) return;
  const everyone = await tx.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  const share = fresh.totalCents !== null ? finalSharePerPlayer(fresh.totalCents, everyone.length) : fresh.entryFeeCents;
  // Kartenmodell: ohne Partnerhalle wird der Preis nicht fixiert (die Abbuchung geht an die Halle, Provision und Zusage haengen an ihr)
  const cardMode = (await tournamentCardMode(tx, t.id)) || (await tournamentCardFlowPaused(tx, t.id)); // Zahlungen AUS: Turnier mit Preis bleibt im Kartenfluss, eingefroren (nie still gratis)
  if (cardMode && !fresh.venueId) throw new DomainError("Für dieses Turnier ist noch keine Partnerhalle gewählt. Der Veranstalter muss zuerst eine Halle wählen.");
  await tx.update(tournaments).set({ status: "payment", finalShareCents: share, priceRound: fresh.priceRound + 1 }).where(eq(tournaments.id, t.id));
  if (cardMode && fresh.venueId) {
    const frozen = await freezeVenueTerms(tx, t.id, fresh.venueId); // Zugang und Provisionssatz einfrieren (spaetere Aenderungen wirken nicht)
    // Entscheid t2q A: Zugangsinhaber der Halle erfahren beim Fixieren, dass eine Zusage gefragt ist (entprellt, im Savepoint; dynamischer Import gegen den Importkreis)
    if (frozen.accessRequired) {
      await notifyHolderOnFix(tx, { id: t.id, name: fresh.name, venueId: fresh.venueId, startsAt: fresh.startsAt, priceRound: fresh.priceRound + 1 }, await chargeDueAt(tx, fresh));
    }
  }
  await audit(null, "tournament.price", "tournament", t.id, { after: { share, players: everyone.length } }, tx);
  await notifyUsers(
    [...new Set(everyone.map((p) => p.userId))],
    (await zahlungenAus(tx)) && !cardMode && share === 0 // nur ohne Preis: ein Turnier MIT Preis (Altbestand) behaelt die Preis-Meldung
      ? { type: "system", title: "Alle Teams sind vollzählig", body: `${fresh.name}: Alle Teams sind vollzählig. Die Captains drücken jetzt „Bereit“. ${ZAHLUNGEN_AUS_HINWEIS}`, url: `/turniere/${t.id}` }
      : { type: "payment", title: "Der Preis steht fest", body: share > 0 ? `${fresh.name}: Dein Anteil beträgt ${(share / 100).toFixed(2).replace(".", ",")} €. Bezahle jetzt in der Turnier-Lobby.` : `${fresh.name}: Das Turnier ist kostenlos.`, url: `/turniere/${t.id}` },
    tx,
  );
  await maybeGenerateBracket(tx, { ...fresh, status: "payment", finalShareCents: share, priceRound: fresh.priceRound + 1 });
}

/**
 * Der Veranstalter öffnet die Kader wieder (z. B. weil jemand nicht zahlt): Alle bereits gezahlten Anteile werden vollständig
 * erstattet (an den Zahler), der Preis wird später neu berechnet. Nur in der Zahlungsphase, vor dem Bracket.
 */
export async function reopenRosters(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann die Kader wieder öffnen.");
    if (!paymentOpen(t)) throw new DomainError("Das geht nur, solange die Zahlung läuft und das Bracket noch nicht steht.");
    // Kartenmodell: Gibt es schon Abbuchungszeilen (auch nur teilweise erfolgreich, Alles-oder-nichts-Fenster), würde das Öffnen den Preis neu rechnen und die Anmeldung neu starten, die erfolgreichen
    // Abbuchungen blieben ohne Erstattung bestehen und der Spieler würde bei der nächsten Preisrunde ein zweites Mal belastet (Geld). Deshalb abgelehnt: ab der ersten Abbuchung gibt es nur die Absage (Admin 1, mit Erstattung).
    if (await hasTournamentChargeRows(tx, tournamentId)) throw new DomainError("Die Abbuchung hat begonnen: Kader öffnen ist nicht mehr möglich. Das Turnier kann nur noch Admin 1 absagen, dabei wird erstattet.");
    const players = await tx.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
    for (const p of players) {
      await refundPlayer(tx, t, p, "Rückerstattung: Kader wieder geöffnet");
      await tx.update(tournamentPlayers).set({ paidCents: 0, paidAt: null, paidBy: null }).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, p.userId)));
    }
    await tx.update(tournamentTeams).set({ readyAt: null, paidReadyAt: null }).where(eq(tournamentTeams.tournamentId, tournamentId));
    // beim Wiederoeffnen werden Zugangs- und Provisions-Snapshot verworfen; sie werden beim naechsten Fixieren neu eingefroren. Die Zusage der Halle bleibt (sie gilt fuer die Halle, nicht fuer den Preis).
    await tx.update(tournaments).set({ status: "registration", finalShareCents: null, venueAccessRequiredSnapshot: null, commissionPercentSnapshot: null }).where(eq(tournaments.id, tournamentId));
    await notifyUsers([...new Set(players.map((p) => p.userId)), ...new Set(players.flatMap((p) => (p.paidBy ? [p.paidBy] : [])))], { type: "system", title: "Kader wieder offen", body: `${t.name}: Der Veranstalter hat die Kader wieder geöffnet. ${players.some((p) => p.paidCents > 0) ? "Für Eintritte aus der früheren Guthaben-Zeit meldet sich die Plattform bei dir." : "Es war noch nichts abgebucht."} Der Preis wird neu berechnet.`, url: `/turniere/${tournamentId}` }, tx);
    await audit(userId, "tournament.reopen", "tournament", tournamentId, { after: { refundSkipped: players.filter((p) => p.paidCents > 0).length } }, tx);
  });
}

/** Team abmelden (Captain) oder entfernen (Veranstalter). Alle bezahlten Eintritte des Teams werden erstattet. So lässt sich ein fehlendes Team ersetzen. */
export async function withdrawTeam(userId: string, tournamentId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!registrationOpen(t)) throw new DomainError("Nach dem Start ist keine Abmeldung mehr möglich.");
    const [entry] = await tx.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
    if (!entry) throw new DomainError("Das Team ist nicht angemeldet.");
    const manager = await canManage(tx, userId, t);
    if (entry.captainId !== userId && !manager) throw new DomainError("Nur der Captain oder der Veranstalter kann das Team abmelden.");
    if (manager && entry.captainId !== userId && deadlinePassed(t)) throw new DomainError("Nach dem Anmeldeschluss kann der Veranstalter keine Teams mehr ersetzen. Er kann das Turnier absagen.");
    const players = await tx.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, teamId)));
    for (const p of players) await refundPlayer(tx, t, p, "Rückerstattung Eintritt");
    await tx.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, teamId)));
    await tx.delete(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
    if (manager && entry.captainId !== userId) {
      await notifyUsers(await teamAdminIds(tx, teamId), { type: "system", title: "Team aus dem Turnier genommen", body: `Der Veranstalter hat euer Team aus ${t.name} genommen. ${players.some((p) => p.paidCents > 0) ? "Für Eintritte aus der früheren Guthaben-Zeit meldet sich die Plattform." : "Es war nichts abgebucht."}`, url: `/turniere/${tournamentId}` }, tx);
    }
    await audit(userId, "tournament.withdraw", "tournament", tournamentId, { after: { teamId } }, tx);
  });
}

/**
 * Nach dem Anmeldeschluss, wenn nicht alle Plätze belegt sind: Der Veranstalter spielt mit den angemeldeten Teams
 * (mindestens 4). Die Teamzahl wird auf die Anmeldungen gesenkt, danach gelten dieselben Regeln.
 */
export async function closeWithJoinedTeams(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann das.");
    if (!registrationOpen(t)) throw new DomainError("Das Turnier läuft schon oder ist beendet.");
    if (!deadlinePassed(t)) throw new DomainError("Das geht erst nach dem Anmeldeschluss.");
    const [{ n }] = await tx.select({ n: count() }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId));
    if (n < MIN_TOURNAMENT_TEAMS) throw new DomainError(`Mit weniger als ${MIN_TOURNAMENT_TEAMS} Teams findet das Turnier nicht statt. Du kannst es absagen.`);
    if (n === t.maxTeams) throw new DomainError("Es sind schon alle Plätze belegt.");
    await tx.update(tournaments).set({ maxTeams: n }).where(eq(tournaments.id, tournamentId));
    await audit(userId, "tournament.shrink", "tournament", tournamentId, { before: { maxTeams: t.maxTeams }, after: { maxTeams: n } }, tx);
    // Sind jetzt alle vorhandenen Teams vollzählig, steht der Preis fest
    await maybeFixPrice(tx, { ...t, maxTeams: n });
  });
}

/**
 * Job: Ist der Anmeldeschluss erreicht und das Turnier nicht voll, bekommt der Veranstalter genau eine Benachrichtigung
 * (Weitermachen ab 4 Teams oder Absagen). Läuft unter der Turniersperre; ein zweiter Lauf findet die Meldung und tut nichts.
 */
export async function notifyRegistrationDeadlines(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const due = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.status, "registration"), isNull(tournaments.bracketGeneratedAt), sql`${tournaments.registrationDeadline} <= ${now}`, sql`${tournaments.registrationDeadline} > ${since}`))
    .orderBy(asc(tournaments.registrationDeadline), asc(tournaments.id));
  let sent = 0;
  for (const { id } of due) {
    // Ein Fehler bei einem Turnier bricht die übrigen nicht ab; geloggt wird nur die Turnier-ID und die Fehlerart (keine Personendaten)
    try {
      // Der Zähler zählt nur, was die Transaktion wirklich festgeschrieben hat: erst NACH dem Commit addieren (ein Rollback nach dem Eintragen darf ihn nicht erhöhen, Backlog 3)
      sent += await db.transaction(async (tx) => {
        const t = await lockTournament(tx, id);
        if (!registrationOpen(t) || !t.registrationDeadline || t.registrationDeadline.getTime() > now.getTime()) return 0;
        const [{ n }] = await tx.select({ n: count() }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, id));
        if (n >= t.maxTeams) return 0;
        const url = `/turniere/${id}`;
        const title = "Anmeldeschluss erreicht";
        const [already] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, t.organizerId), eq(notifications.type, "system"), eq(notifications.url, url), eq(notifications.title, title))).limit(1);
        if (already) return 0;
        const body = n >= MIN_TOURNAMENT_TEAMS
          ? `${t.name}: ${n} von ${t.maxTeams} Teams sind angemeldet. Du kannst mit diesen Teams weitermachen oder das Turnier absagen.`
          : `${t.name}: Nur ${n} von ${t.maxTeams} Teams sind angemeldet. Mit weniger als ${MIN_TOURNAMENT_TEAMS} Teams findet das Turnier nicht statt, du kannst es absagen.`;
        return notifyUsers([t.organizerId], { type: "system", title, body, url }, tx);
      });
    } catch (error) {
      console.error("notifyRegistrationDeadlines: Fehler bei Turnier", id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return sent;
}

async function insertFixtures(tx: Tx, tournamentId: string, fixtures: Fixture[]) {
  if (fixtures.length === 0) return;
  const inserted = await tx
    .insert(tournamentMatches)
    .values(fixtures.map((f) => ({ tournamentId, stage: f.stage, round: f.round, slot: f.slot, teamA: f.a, teamB: f.b })))
    .returning({ id: tournamentMatches.id, stage: tournamentMatches.stage, round: tournamentMatches.round, slot: tournamentMatches.slot });
  const key = (s: { stage: string; round: number; slot: number }) => `${s.stage}|${s.round}|${s.slot}`;
  const ids = new Map(inserted.map((r) => [key(r), r.id]));
  for (const f of fixtures) {
    if (!f.feeds) continue;
    await tx.update(tournamentMatches).set({ feedsMatchId: ids.get(key(f.feeds)) ?? null, feedsSide: f.feeds.side }).where(eq(tournamentMatches.id, ids.get(key(f))!));
  }
}

/** Zufallsquelle der Auslosung; Tests setzen eine feste Quelle (null = Standard). */
let drawRandom: () => number = secureRandom;
export function setDrawRandom(random: (() => number) | null) {
  drawRandom = random ?? secureRandom;
}

/**
 * Erzeugt das K.-o.-Bracket genau einmal, sobald der Preis feststeht, alle Spieler bezahlt haben und jedes Team nach der Zahlung "Bereit" gedrückt hat (`paid_ready_at`).
 * Läuft unter der Turniersperre und setzt `bracket_generated_at`, damit eine zweite Auslösung nichts mehr tut.
 */
export async function maybeGenerateBracket(tx: Tx, t: T) {
  const [fresh] = await tx.select().from(tournaments).where(eq(tournaments.id, t.id));
  if (!fresh || fresh.status !== "payment" || fresh.bracketGeneratedAt) return;
  const entries = await tx.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id)).orderBy(asc(tournamentTeams.registeredAt));
  if (entries.length !== fresh.maxTeams || entries.length < MIN_TOURNAMENT_TEAMS) return;
  const share = shareOf(fresh);
  const everyone = await tx.select({ paid: tournamentPlayers.paidCents }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  // Kartenmodell (M5-4): "gebucht" = settled_at ist gesetzt (alle Abbuchungen erfolgreich); dann zaehlt nicht paid_cents (bleibt 0). Altmodell: settled_at wird erst beim Ende gesetzt.
  const booked = fresh.settledAt !== null;
  if (!booked && !everyone.every((p) => share === 0 || p.paid >= share)) return;
  if (!entries.every((e) => e.readyAt && e.paidReadyAt)) return; // alle Teams: Kader vollzählig und nach voller Zahlung bereit

  await tx.update(tournaments).set({ status: "running", bracketGeneratedAt: new Date() }).where(eq(tournaments.id, t.id));
  await insertFixtures(tx, t.id, knockout(shuffle(entries.map((e) => e.teamId), drawRandom)));
  await createGames(tx, fresh);
  for (const e of entries) await notifyUsers(await teamAdminIds(tx, e.teamId), { type: "system", title: "Das Bracket steht", body: `${fresh.name}: Alle Teams sind bereit, das Bracket ist jetzt sichtbar.`, url: `/turniere/${t.id}` }, tx);
  await audit(null, "tournament.bracket", "tournament", t.id, { after: { teams: entries.length } }, tx);
}

/** Zeitplan der K.-o.-Runden aus den Spielzeilen (null ohne Starttermin oder bei anderen Formaten). Plan-Slots sind auf die ECHTEN Slots der Zeilen abgebildet (Freilose, scheduleFromRows). */
function scheduleOf(t: T, rows: { stage: string; slot: number }[]) {
  if (!t.startsAt) return null;
  return scheduleFromRows(rows, t.startsAt, t.durationMin ?? 120);
}

/** Für jede Paarung, deren beide Teams feststehen, entsteht ein echtes Spiel (Captain meldet, der andere bestätigt). */
async function createGames(tx: Tx, t: T) {
  const open = await tx
    .select()
    .from(tournamentMatches)
    .where(and(eq(tournamentMatches.tournamentId, t.id), isNull(tournamentMatches.matchId), isNotNull(tournamentMatches.teamA), isNotNull(tournamentMatches.teamB)))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
  const plan = scheduleOf(t, await tx.select({ stage: tournamentMatches.stage, slot: tournamentMatches.slot }).from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id)));
  const base = (t.startsAt ?? new Date()).getTime();
  for (const tm of open) {
    const block = plan?.blocks.find((b) => b.games.some((g) => !g.fun && g.stage === tm.stage && g.slot === tm.slot));
    const startsAt = block?.startsAt ?? new Date(base + (tm.round - 1) * (t.matchMinutes + 10) * 60_000);
    const minutes = plan ? plan.slotMinutes : t.matchMinutes;
    const [game] = await tx
      .insert(matches)
      .values({ kind: "tournament", homeTeamId: tm.teamA!, awayTeamId: tm.teamB!, startsAt, durationMin: minutes, venueText: t.venueText, visibility: "private", status: "confirmed", schedulingOpen: false })
      .returning({ id: matches.id });
    const players = await tx.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), inArray(tournamentPlayers.teamId, [tm.teamA!, tm.teamB!])));
    if (players.length) await tx.insert(matchParticipants).values(players.map((p) => ({ matchId: game.id, userId: p.userId, teamId: p.teamId, readyAt: new Date(), paidCents: p.paidCents, paidAt: p.paidAt }))).onConflictDoNothing();
    await tx.update(tournamentMatches).set({ matchId: game.id }).where(eq(tournamentMatches.id, tm.id));
    await notifyUsers(
      [...(await teamAdminIds(tx, tm.teamA!)), ...(await teamAdminIds(tx, tm.teamB!))],
      { type: "match.scheduled", title: "Euer Turnierspiel steht fest", body: `${t.name}: ${startsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" })} Uhr.`, url: `/spiele/${game.id}` },
      tx,
    );
  }
}

type TmRow = typeof tournamentMatches.$inferSelect;

/** Sieger rückt ins Folgespiel; das Folgespiel entsteht, sobald beide Teams feststehen. Das Finale beendet das Turnier. */
async function completeKo(tx: Tx, t: T, tm: TmRow, winner: string) {
  if (tm.feedsMatchId && tm.feedsSide) {
    await tx.update(tournamentMatches).set(tm.feedsSide === "a" ? { teamA: winner } : { teamB: winner }).where(eq(tournamentMatches.id, tm.feedsMatchId));
    await createGames(tx, t);
    return;
  }
  await finishTournament(tx, t, winner);
}

/** Finalizer: Ein Turnierspiel ist gespielt. Eintragen, Sieger weiterführen. Bei Gleichstand entscheidet der Veranstalter das Siebenmeterschießen. */
// SPERRREIHENFOLGE: der Aufrufer haelt schon das SPIEL; hier kommt das TURNIER dazu (Spiel -> Turnier). Das ist die einzige erlaubte Rueckrichtung, weil die Absage ihre Spiele mit NOWAIT sperrt und unter
// der Turniersperre nie wartet (lockTournamentGames); siehe docs/BETRIEB.md.
export async function advanceFromMatch(tx: Tx, matchId: string): Promise<void> {
  const [tm] = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.matchId, matchId));
  if (!tm || tm.scoreA !== null) return;
  const [result] = await tx.select().from(matchResults).where(eq(matchResults.matchId, matchId));
  if (!result || !tm.teamA || !tm.teamB) return;
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tm.tournamentId)).for("update");
  if (!t || t.status !== "running") return;
  await tx.update(tournamentMatches).set({ scoreA: result.homeScore, scoreB: result.awayScore, playedAt: new Date() }).where(eq(tournamentMatches.id, tm.id));
  const winner = koWinner({ a: tm.teamA, b: tm.teamB, scoreA: result.homeScore, scoreB: result.awayScore });
  if (!winner) {
    await notifyUsers([t.organizerId], { type: "system", title: "Siebenmeterschießen eintragen", body: `${t.name}: Ein Spiel endete unentschieden. Bitte trage den Sieger ein.`, url: `/turniere/${t.id}` }, tx);
    return;
  }
  await completeKo(tx, t, tm, winner);
}

/** Bei Gleichstand im K.-o.-Spiel trägt der Veranstalter den Sieger des Siebenmeterschießens ein. */
export async function decideShootout(userId: string, tournamentId: string, tournamentMatchId: string, winnerTeamId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann das eintragen.");
    if (t.status !== "running") throw new DomainError("Das Turnier läuft nicht.");
    const [tm] = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.id, tournamentMatchId), eq(tournamentMatches.tournamentId, tournamentId)));
    if (!tm || tm.scoreA === null || tm.scoreA !== tm.scoreB || tm.shootoutWinner) throw new DomainError("Hier ist kein Siebenmeterschießen offen.");
    if (winnerTeamId !== tm.teamA && winnerTeamId !== tm.teamB) throw new DomainError("Das Team spielt in diesem Spiel nicht.");
    await tx.update(tournamentMatches).set({ shootoutWinner: winnerTeamId }).where(eq(tournamentMatches.id, tm.id));
    await audit(userId, "tournament.shootout", "tournament", tournamentId, { after: { matchId: tm.id, winnerTeamId } }, tx);
    await completeKo(tx, t, tm, winnerTeamId);
  });
}

async function finishTournament(tx: Tx, t: T, winnerId: string) {
  await tx.update(tournaments).set({ status: "finished", winnerTeamId: winnerId }).where(eq(tournaments.id, t.id));
  await settle(tx, t);
  const [winner] = await tx.select({ name: teams.name }).from(teams).where(eq(teams.id, winnerId));
  const entries = await tx.select({ teamId: tournamentTeams.teamId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  for (const e of entries) {
    await notifyUsers(await teamAdminIds(tx, e.teamId), { type: "system", title: "Turnier beendet", body: e.teamId === winnerId ? `Ihr habt ${t.name} gewonnen. Glückwunsch!` : `${t.name} ist beendet. Sieger: ${winner?.name ?? "–"}.`, url: `/turniere/${t.id}` }, tx);
  }
}

/**
 * Schließt die Abrechnung ab (genau einmal pro Turnier). Kartenmodell: schon bei der Abbuchung gebucht (settled_at), es gibt KEINE Veranstalter-Auszahlung (Preisgeld stillgelegt, 012 M6b F4).
 * Altgeld aus dem Guthabenmodell (paid_cents > 0) wird nicht ausgezahlt, sondern nur protokolliert (tournament.settle_skipped, ohne Personendaten); nichts wird gebucht.
 */
async function settle(tx: Tx, t: T) {
  const [cur] = await tx.select({ settledAt: tournaments.settledAt }).from(tournaments).where(eq(tournaments.id, t.id));
  if (cur?.settledAt) return;
  const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${tournamentPlayers.paidCents}), 0)`.mapWith(Number) }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  if (total > 0) await audit(null, "tournament.settle_skipped", "tournament", t.id, { after: { totalCents: total, note: "Altgeld nicht ausgezahlt (Preisgeld stillgelegt, 012 M6b): manuell klären" } }, tx);
  await tx.update(tournaments).set({ settledAt: new Date() }).where(eq(tournaments.id, t.id));
  await audit(null, "tournament.settle", "tournament", t.id, { after: { total } }, tx);
}

/** Absagen: Abgebuchte Anteile gehen per Karte zurück (Kartenpfad); Altgeld wird nur protokolliert. Nur möglich, solange noch kein Spiel gespielt ist. */
export async function cancelTournament(userId: string, tournamentId: string) {
  try {
    return await cancelTournamentOnce(userId, tournamentId);
  } catch (error) {
    await noteBusy(error); // Protokoll NACH dem Rollback
    throw error;
  }
}

async function cancelTournamentOnce(userId: string, tournamentId: string) {
  const proposed = await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann absagen.");
    // Kartenmodell (AC-21): nach der ersten Abbuchung sagt nur Admin 1 ab (Rolle owner); der Veranstalter und Admin 2 nur davor. Die automatische Absage (Job) ist ausgenommen.
    if (await hasTournamentChargeRows(tx, tournamentId)) {
      const [u] = await tx.select({ role: users.role, isOwner: users.isOwner }).from(users).where(eq(users.id, userId));
      if (!isOwner(u)) {
        // Vorschlagsweg (009 AC-9): die Absage wird NICHT ausgefuehrt (keine Erstattung), aber als Vorschlag gespeichert; Admin 1 bekommt eine Mitteilung und entscheidet. Nur fuer offene Turniere; je Person und Turnier
        // einmal (Wiederholungen schreiben nichts mehr)
        if (t.status === "finished" || t.status === "cancelled") throw new DomainError("Das Turnier ist schon beendet oder abgesagt.");
        const [dup] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, "tournament.cancel_proposal"), eq(auditLog.entityId, tournamentId), eq(auditLog.actorId, userId))).limit(1);
        if (!dup) {
          await audit(userId, "tournament.cancel_proposal", "tournament", tournamentId, { after: { status: t.status } }, tx);
          const owners = await tx.select({ id: users.id }).from(users).where(eq(users.isOwner, true));
          await notifyUsers(owners.map((x) => x.id), { type: "system", title: "Absagevorschlag", body: `Zu ${t.name} liegt ein Absagevorschlag vor. Nach der ersten Abbuchung kannst nur du das Turnier absagen.`, url: `/turniere/${t.id}` }, tx);
        }
        return true;
      }
    }
    await cancelTournamentTx(tx, t, userId);
    return false;
  });
  if (proposed) throw new DomainError("Nach der ersten Abbuchung kann nur Admin 1 das Turnier absagen. Dein Absagevorschlag ist gespeichert.");
}

/** Das Turnier ist gerade in Bearbeitung (ein Spiel ist gesperrt): die Absage/Loeschung wartet nie, sondern meldet das und wird wiederholt (Job: naechster Lauf). */
export class TournamentBusyError extends DomainError {
  constructor(message: string, readonly tournamentId: string | null = null) {
    super(message);
  }
}

const isLockNotAvailable = (e: unknown): boolean => (e as { code?: string })?.code === "55P03" || (e as { cause?: { code?: string } })?.cause?.code === "55P03";
const BUSY_BACKOFF_MS = [50, 100, 200];

/** Protokoll NACH dem Rollback (eigene Verbindung, ohne Personendaten): das Turnier war beschaeftigt (Backlog 144). Nie werfen. */
export async function noteBusy(error: unknown): Promise<void> {
  if (!(error instanceof TournamentBusyError) || !error.tournamentId) return;
  try {
    await audit(null, "tournament.cancel_busy", "tournament", error.tournamentId, {}, db);
  } catch {
    /* das Protokoll ist Zugabe */
  }
}

/**
 * SPERRREIHENFOLGE (Backlog 144, docs/BETRIEB.md): Halle -> Zugang -> TURNIER -> SPIEL -> Zahlungszeile -> Nutzer. Wer das Turnier haelt und Spiele braucht (Absage, Kontoloeschung), darf auf ein Spiel NIE warten:
 * Pfade, die ein Spiel zuerst halten (Ergebnis-Finalizer advanceFromMatch: Spiel -> Turnier), liefen sonst in einen Zyklus (Postgres-Deadlock 40P01). Darum: die Spiele sortiert mit NOWAIT sperren, bei gesperrtem
 * Spiel bis zu dreimal kurz wiederholen (50/100/200 ms, je im Savepoint, die Transaktion bleibt benutzbar), danach TournamentBusyError ("bitte gleich noch einmal"; der Job versucht es im naechsten Lauf, nie
 * stilles Auslassen). Das Protokoll (noteBusy) schreibt der Aufrufer NACH dem Rollback.
 */
export async function lockGamesNoWait(tx: Tx, gameIds: string[], tournamentId: string | null = null): Promise<string[]> {
  const ids = [...new Set(gameIds)].sort();
  if (ids.length === 0) return ids;
  for (let attempt = 0; attempt <= BUSY_BACKOFF_MS.length; attempt++) {
    try {
      await tx.transaction(async (sp) => {
        await sp.select({ id: matches.id }).from(matches).where(inArray(matches.id, ids)).orderBy(matches.id).for("update", { noWait: true });
      });
      return ids;
    } catch (error) {
      if (!isLockNotAvailable(error)) throw error;
      if (attempt < BUSY_BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, BUSY_BACKOFF_MS[attempt]));
        continue;
      }
      throw new TournamentBusyError("Das Turnier ist gerade in Bearbeitung. Bitte gleich noch einmal versuchen.", tournamentId);
    }
  }
  return ids;
}

/** Die Spiele eines Turniers sortiert und ohne Warten sperren (siehe lockGamesNoWait). */
export async function lockTournamentGames(tx: Tx, tournamentId: string): Promise<string[]> {
  const games = await tx.select({ matchId: tournamentMatches.matchId }).from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), isNotNull(tournamentMatches.matchId)));
  return lockGamesNoWait(tx, games.map((g) => g.matchId!).filter(Boolean), tournamentId);
}

/** Sagt ein Turnier unter der Turniersperre ab und erstattet alle Eintritte (feste Schlüssel, genau einmal). `actorId` null = Job. */
async function cancelTournamentTx(tx: Tx, t: T, actorId: string | null, cause?: (card: boolean) => string) {
  const tournamentId = t.id;
  if (t.status === "finished" || t.status === "cancelled") throw new DomainError("Das Turnier ist schon beendet oder abgesagt.");
  const played = await tx.select({ id: tournamentMatches.id }).from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), isNotNull(tournamentMatches.scoreA))).limit(1);
  if (played.length > 0) throw new DomainError("Es gibt schon Ergebnisse. Bitte wende dich an die Plattform.");
  const gameIds = await lockTournamentGames(tx, tournamentId); // K1: Spiele sortiert und OHNE Warten sperren, VOR allen Erstattungs-/Zahlungsschreibungen (Sperrreihenfolge, Backlog 144)
  const players = await tx.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
  // Kartenmodell (M5-5): Erstattungszeilen fuer alle erfolgreichen Abbuchungen, Provisions-Storno im selben Schritt; sonst nur Protokoll für Altgeld (kein Guthaben mehr)
  const card = (await hasTournamentChargeRows(tx, tournamentId)) || (await tournamentCardMode(tx, tournamentId));
  let refundedCards = 0;
  const payerIds: string[] = [];
  if (card) {
    const r = await prepareCardCancel(tx, t, new Date());
    refundedCards = r.refunded;
    payerIds.push(...r.payerIds);
    for (const p of players) if (p.paidCents > 0) await refundPlayer(tx, t, p, "Rückerstattung abgesagtes Turnier (Altgeld)"); // Mischzustand: Altgeld neben Kartenabbuchungen nicht still lassen
  } else {
    for (const p of players) {
      await refundPlayer(tx, t, p, "Rückerstattung abgesagtes Turnier");
    }
  }
  const reason = cause ? cause(card) : null;
  const body = card
    ? `${t.name} findet nicht statt${reason ? `: ${reason}` : "."} ${refundedCards > 0 ? "Bereits abgebuchte Anteile werden auf die Karte erstattet." : "Es wurde nichts von deiner Karte abgebucht."}`
    : `${t.name} findet nicht statt${reason ? `: ${reason}` : "."} ${players.some((p) => p.paidCents > 0) ? "Für bereits bezahlte Eintritte aus der früheren Guthaben-Zeit meldet sich die Plattform bei dir." : "Es wurde nichts bezahlt."}`;
  await notifyUsers([...new Set([...players.map((p) => p.userId), ...players.flatMap((p) => (p.paidBy ? [p.paidBy] : [])), ...payerIds, t.organizerId])], { type: "system", title: "Turnier abgesagt", body, url: `/turniere/${tournamentId}` }, tx);
  // Entscheid t2q (Plan 19.14): wurde das Turnier ohne Zusage der Halle abgesagt, erfahren die Zugangsinhaber der Halle es (ohne Namen Dritter; Savepoint, ein Fehler kippt die Absage nie)
  if (t.venueId && !t.venueConfirmedAt && t.venueAccessRequiredSnapshot === true) {
    try {
      await tx.transaction(async (sp) => {
        await notifyUsers(await venueAccessHolderIds(t.venueId!, sp), { type: "system", title: "Turnier abgesagt", body: `${t.name} wurde abgesagt, weil die Zusage der Halle fehlte oder das Turnier nicht zustande kam.`, url: "/halle" }, sp);
      });
    } catch {
      /* Zugabe */
    }
  }
  if (gameIds.length) await tx.update(matches).set({ status: "cancelled" }).where(inArray(matches.id, gameIds));
  await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
  await tx.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, tournamentId));
  await audit(actorId, "tournament.cancel", "tournament", tournamentId, { after: { refunded: card ? refundedCards : 0, refundSkipped: players.filter((p) => p.paidCents > 0).length, card, byJob: actorId === null } }, tx);
}

/**
 * Frist-Job für Turniere (Vertrag 008 v4, AC-11 und AC-16), im 5-Minuten-Takt, je Turnier in eigener Transaktion unter der Turniersperre:
 * - Anlage mit mindestens 48 Stunden Vorlauf: 48 Stunden vor dem Start ist die Lobby zu. Steht bis dahin das Bracket nicht (alle Teams vollzählig,
 *   alle Spieler bezahlt, alle Captains bereit), fällt das Turnier aus und alle bekommen ihren Eintritt zurück.
 * - Anlage unter 48 Stunden Vorlauf: 1 Stunde vor dem Start gilt dasselbe.
 * "Gebucht" ist ein Turnier, sobald das Bracket erzeugt ist (`maybeGenerateBracket`, sofort nach der letzten Zahlung und dem letzten "Bereit"); gebuchte Turniere
 * fasst der Job nie an. Eine Karenz von 12 Stunden gilt ab dem Zeitpunkt, an dem der Preis feststand (erst dann kann bezahlt werden).
 * Altturniere (angelegt mit Anmeldeschluss später als 48 Stunden vor dem Start) bleiben bei den alten Regeln. Nachholbar und idempotent.
 */
export async function closeTournamentsAtDeadline(now: Date = new Date()): Promise<number> {
  const candidates = await db
    .select()
    .from(tournaments)
    .where(and(inArray(tournaments.status, ["registration", "payment"]), isNull(tournaments.bracketGeneratedAt), isNotNull(tournaments.startsAt), sql`${tournaments.startsAt} > ${now}`));
  let cancelled = 0;
  const preResume = await resumeUntil(); // nur für die Kandidatenauswahl: die Entscheidung liest unter der Turniersperre frisch
  for (const c of candidates) {
    try {
      // Vorprüfung ohne Sperre (billig); die Fälligkeit wird unter der Sperre neu berechnet, denn Preisfestlegung oder wieder geöffnete Kader
      // im Fenster dazwischen verschieben die Karenz
      const pre = await dueOf(db, c);
      if (!pre || resumeFloor(pre.due, c.startsAt!, preResume).due.getTime() > now.getTime()) continue;
      await db.transaction(async (tx) => {
        const t = await lockTournament(tx, c.id);
        if ((t.status !== "registration" && t.status !== "payment") || t.bracketGeneratedAt || !t.startsAt || t.startsAt.getTime() <= now.getTime()) return;
        const locked = await dueOf(tx, t);
        if (!locked) return;
        const floored = resumeFloor(locked.due, t.startsAt, await resumeUntil(tx)); // Karenz nach der Pause: frühestens Wiedereinschalten + 2 Stunden, nie über den Start hinaus
        if (floored.due.getTime() > now.getTime()) return;
        // Kartenmodell (M5-4): ist abgebucht oder die Abbuchung angelaufen/faellig (alle Teams bereit, Zusage da), faellt das Turnier hier NICHT aus; Fehlschlaege behandelt die Abbuchung (M5-5)
        if (await chargeUnderway(tx, t)) return;
        await cancelTournamentTx(tx, t, null, (card) => floored.capped ? PAUSE_CANCEL_REASON_TOURNAMENT : `Zur Frist (${locked.long ? "48 Stunden" : "1 Stunde"} vor dem Start) waren nicht alle Teams vollzählig, ${card ? "mit Karte" : "bezahlt"} und bereit.`);
        cancelled += 1;
      });
    } catch (error) {
      console.error("closeTournamentsAtDeadline: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
      await noteBusy(error);
    }
  }
  return cancelled;
}

/**
 * Alles-oder-nichts (Vertrag 012, Z3): ist bei einem Turnier im Kartenmodell eine Abbuchung gescheitert und das Nachzahlfenster dieser Zeile abgelaufen (effektives Ende: das fruehere von
 * grace_until und Start minus 1 Stunde), wird das Turnier abgesagt; alle erfolgreichen Abbuchungen werden erstattet, die Provision storniert (cancelTournamentTx). Nur Kartenprobleme zaehlen
 * (keine technischen Codes). Je Turnier eine eigene Transaktion unter der Turniersperre, Bedingung wird dort neu geprueft (die Zeile kann inzwischen erfolgreich nachgezahlt sein). Idempotent.
 */
export async function cancelTournamentsAfterWindow(now: Date = new Date()): Promise<number> {
  if (!(await tournamentPaymentsActive())) return 0; // Schalter AUS: nicht wegen Fenster absagen (Plan 17.2); nach dem Wiedereinschalten laeuft die Pruefung weiter
  const NON_CARD = NON_CARD_CODES;
  const preResume = await resumeUntil(); // nur für die Kandidatenauswahl; die Entscheidung liest unter der Turniersperre frisch
  const expired = (tx: Pick<Tx, "execute">, id: string | null, resume: Awaited<ReturnType<typeof resumeUntil>>) =>
    tx.execute(sql`select distinct t.id from tournaments t join payment_charges c on c.tournament_id = t.id
      where t.status = 'payment' and t.bracket_generated_at is null and t.settled_at is null ${id ? sql`and t.id = ${id}` : sql``}
        and c.status in ('failed', 'requires_action') and c.grace_until is not null and c.failure_code is not null and c.failure_code not in (${sql.join(NON_CARD.map((c) => sql`${c}`), sql`, `)})
        and ${windowEndSql(sql`c.grace_until`, sql`t.starts_at`, resume)} <= ${now}`);
  const candidates = (await expired(db, null, preResume)).rows as { id: string }[];
  let cancelled = 0;
  for (const c of candidates) {
    try {
      await db.transaction(async (tx) => {
        const t = await lockTournament(tx, c.id);
        if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt) return;
        if ((await expired(tx, c.id, await resumeUntil(tx))).rows.length === 0) return; // inzwischen nachgezahlt oder anderer Stand
        await cancelTournamentTx(tx, t, null, () => "Eine Abbuchung ist nicht gelungen und das Nachzahlfenster ist abgelaufen.");
        cancelled += 1;
      });
    } catch (error) {
      console.error("cancelTournamentsAfterWindow: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
      await noteBusy(error);
    }
  }
  return cancelled;
}

/** Zeitpunkt der Abbuchung bzw. der Frist (Vorlauf ab 48 Stunden: Start minus 48 h mit Karenz; kuerzer: Start minus 1 Stunde). null = Altturnier ohne neue Fristregel. */
export async function chargeDueAt(tx: Pick<typeof db, "select">, t: Pick<T, "id" | "startsAt" | "createdAt" | "registrationDeadline">): Promise<Date | null> {
  if (!t.startsAt) return null;
  const long = hasLongLead(t.startsAt, t.createdAt);
  if (!long) return abortDeadline(t.startsAt);
  if (!t.registrationDeadline || t.registrationDeadline.getTime() > fixDeadline(t.startsAt).getTime()) return null;
  return dueWithGrace(fixDeadline(t.startsAt), await tournamentPayOpenAt(tx, t), t.startsAt, t.createdAt);
}

/** Erinnerungsstufen vor der Frist (Entscheid t2q): 24 h und 6 h vorher, je Stufe einmal je Turnier. */
const CARD_REMINDER_STAGES = [24, 6] as const;

/**
 * Vorwarnung "Karte fehlt: ohne sie faellt das Turnier aus" (Entscheid t2q zu B7: zur Frist faellt ein Turnier mit fehlender Karte sofort aus, nichts abgebucht). Je Stufe (24 h, 6 h vor der Frist)
 * genau einmal je Turnier (Audit-Eintrag unter der Turniersperre), nur an die Betroffenen und den Captain ihres Teams, ohne Namen Dritter; nie an den Veranstalter. Nur im Kartenmodell,
 * nur in der Zahlungsphase vor der Frist. Gibt die Zahl der benachrichtigten Turniere zurueck.
 */
export async function notifyMissingCardReminders(now: Date = new Date()): Promise<number> {
  const candidates = await db.select().from(tournaments).where(and(eq(tournaments.status, "payment"), isNull(tournaments.bracketGeneratedAt), isNull(tournaments.settledAt), isNotNull(tournaments.startsAt)));
  let sent = 0;
  for (const c of candidates) {
    try {
      await db.transaction(async (tx) => {
        const t = await lockTournament(tx, c.id);
        if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt || !(await tournamentCardMode(tx, t.id))) return;
        const due = await chargeDueAt(tx, t);
        if (!due || now.getTime() >= due.getTime()) return;
        const stage = CARD_REMINDER_STAGES.find((h) => now.getTime() >= due.getTime() - h * 3_600_000 && !(CARD_REMINDER_STAGES.some((g) => g < h && now.getTime() >= due.getTime() - g * 3_600_000)));
        if (stage === undefined) return;
        const missing = await tournamentMissingCards(tx, t.id);
        if (missing.length === 0) return;
        const [done] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, `tournament.card_reminder.${stage}`), eq(auditLog.entityId, t.id))).limit(1);
        if (done) return;
        const captains = await tx.select({ teamId: tournamentTeams.teamId, captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
        const captainOf = (teamId: string | null) => captains.find((x) => x.teamId === teamId)?.captainId ?? null;
        const players = [...new Set(missing.map((m) => m.userId))];
        const capIds = [...new Set(missing.map((m) => captainOf(m.teamId)).filter((x): x is string => Boolean(x)))].filter((x) => !players.includes(x));
        const url = `/turniere/${t.id}`;
        await notifyUsers(players, { type: "payment", title: "Karte fehlt", body: `${t.name}: Du hast noch keine Karte hinterlegt. Ohne Karte fällt das Turnier aus. Die Frist ist in etwa ${stage} Stunden.`, url }, tx);
        await notifyUsers(capIds, { type: "payment", title: "Karte fehlt", body: `${t.name}: In deinem Team fehlt noch eine Karte. Ohne sie fällt das Turnier aus. Die Frist ist in etwa ${stage} Stunden.`, url }, tx);
        await audit(null, `tournament.card_reminder.${stage}`, "tournament", t.id, { after: { players: players.length, captains: capIds.length } }, tx);
        sent += 1;
      });
    } catch (error) {
      console.error("notifyMissingCardReminders: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return sent;
}

/** Kartenmodell: laeuft die Abbuchung oder ist sie faellig (Zeilen vorhanden, oder alle Teams bereit und die Zusage der Halle erfuellt)? Dann wird das Turnier nicht wegen der Frist abgesagt. Unter der Turniersperre. */
async function chargeUnderway(tx: Tx, t: T): Promise<boolean> {
  const [row] = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.tournamentId, t.id)).limit(1);
  if (!(await tournamentCardMode(tx, t.id))) {
    // Schalter AUS (Plan 17.2): Kartenfluss mit Zeilen oder eingefrorenem Zugangs-Snapshot wird NICHT wegen der Frist abgesagt (die Abschaltung ist keine Schuld der Spieler); bucht nach, sobald der Schalter wieder EIN ist
    if (row) return true;
    if (await tournamentCardFlowPaused(tx, t.id)) return true; // Pause (Zahlungen AN + Karte AUS) oder Zahlungen AUS bei Karte AN: Turnier mit Preis wird nie wegen der Frist abgesagt, auch ohne Snapshot (Preis in der Pause festgelegt)
    if (t.venueAccessRequiredSnapshot === null || (await tournamentPaymentsActive())) return false;
    const paid = await tx.select({ id: tournamentPlayers.userId }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), gt(tournamentPlayers.paidCents, 0))).limit(1);
    return paid.length === 0;
  }
  if (row) return true;
  if (t.status !== "payment" || !t.venueId || t.venueAccessRequiredSnapshot === null || !(await hallZusageOkLive(tx, t, await chargeDueAt(tx, t)))) return false;
  const entries = await tx.select({ ready: tournamentTeams.paidReadyAt }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  if (!(entries.length === t.maxTeams && entries.every((e) => e.ready !== null))) return false;
  // M5-5 (haengt ohne Zeilen): fehlen zur Frist Karten (z. B. nach "Bereit" entfernt), ist das Turnier NICHT abbuchbar und faellt aus (nichts abgebucht), statt still zu haengen
  return tournamentAllCardsReady(tx, t.id);
}

/** Fälligkeit der Frist eines Turniers (null = Altturnier oder ohne Start: der Job fasst es nicht an). */
async function dueOf(exec: Pick<typeof db, "select">, t: Pick<T, "id" | "startsAt" | "createdAt" | "registrationDeadline">): Promise<{ due: Date; long: boolean } | null> {
  if (!t.startsAt) return null;
  const long = hasLongLead(t.startsAt, t.createdAt);
  if (long && (!t.registrationDeadline || t.registrationDeadline.getTime() > fixDeadline(t.startsAt).getTime())) return null; // Altturnier: alte Regeln
  const payOpenAt = await tournamentPayOpenAt(exec, t);
  return { due: dueWithGrace(long ? fixDeadline(t.startsAt) : abortDeadline(t.startsAt), payOpenAt, t.startsAt, t.createdAt), long };
}

/** Ab wann kann bezahlt werden? Ab dem (letzten) Festlegen des Preises (Audit "tournament.price"), sonst ab der Anlage. */
export async function tournamentPayOpenAt(exec: Pick<typeof db, "select">, t: Pick<T, "id" | "createdAt">): Promise<Date> {
  const [row] = await exec
    .select({ at: sql<Date | null>`max(${auditLog.at})`.mapWith(auditLog.at) })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "tournament"), eq(auditLog.entityId, t.id), eq(auditLog.action, "tournament.price")));
  return row?.at && row.at.getTime() > t.createdAt.getTime() ? row.at : t.createdAt;
}

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

export async function listTournaments(filter: { city?: string; viewerId?: string | null } = {}) {
  await connection();
  const visible = filter.viewerId ? or(eq(tournaments.isPrivate, false), eq(tournaments.organizerId, filter.viewerId)) : eq(tournaments.isPrivate, false);
  return db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      city: tournaments.city,
      startsOn: tournaments.startsOn,
      format: tournaments.format,
      status: tournaments.status,
      deadlinePassed: sql<boolean>`coalesce(${tournaments.registrationDeadline} <= now(), false)`, // Anmeldeschluss vorbei (wie deadlinePassed oben)
      maxTeams: tournaments.maxTeams,
      entryFeeCents: tournaments.entryFeeCents,
      isPrivate: tournaments.isPrivate,
      teams: sql<number>`(select count(*)::int from tournament_teams x where x.tournament_id = ${tournaments.id})`,
    })
    .from(tournaments)
    .where(and(inArray(tournaments.status, ["registration", "payment", "running", "finished"]), visible, filter.city ? eq(tournaments.city, filter.city) : undefined))
    .orderBy(sql`${tournaments.status} = 'finished'`, desc(tournaments.startsOn))
    .limit(50);
}

/**
 * Ist der Nutzer Captain (Team-Admin) eines Teams? Nur für die ANZEIGE der Anmelden-Handlung in der Turnierliste. Angemeldet wird allein in `registerTeam`: dort prüft der Server Team-Admin und offene Anmeldung (nicht diese Funktion).
 */
export async function isCaptainOfAnyTeam(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), isNull(teams.archivedAt)))
    .limit(1);
  return Boolean(row);
}

export async function myTournaments(userId: string) {
  return db.select({ id: tournaments.id, name: tournaments.name, status: tournaments.status, startsOn: tournaments.startsOn }).from(tournaments).where(eq(tournaments.organizerId, userId)).orderBy(desc(tournaments.createdAt)).limit(30);
}

const playedOf = (m: TmRow): Played | null => (m.teamA && m.teamB && m.scoreA !== null && m.scoreB !== null ? { a: m.teamA, b: m.teamB, scoreA: m.scoreA, scoreB: m.scoreB } : null);

export type TournamentViewer = { id: string; role: string } | null;

/**
 * Die einzige Lesefunktion für ein Turnier (Seite und Daten). Private Turniere sieht nur, wer den Einladungstoken hat,
 * der Veranstalter, Plattform-Admins und Mitglieder angemeldeter Teams. Das Bracket (Spiele) wird erst ausgeliefert, wenn es erzeugt wurde.
 */
export async function getTournament(id: string, viewer: TournamentViewer = null, token?: string | null) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) return null;

  const entries = await db
    .select({ teamId: teams.id, name: teams.name, slug: teams.slug, captainId: tournamentTeams.captainId, readyAt: tournamentTeams.readyAt, paidReadyAt: tournamentTeams.paidReadyAt })
    .from(tournamentTeams)
    .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
    .where(eq(tournamentTeams.tournamentId, id))
    .orderBy(asc(tournamentTeams.registeredAt));
  const players = await db
    .select({ teamId: tournamentPlayers.teamId, userId: users.id, name: sql<string>`coalesce(${users.nickname}, ${users.name})`, paidCents: tournamentPlayers.paidCents, paidBy: tournamentPlayers.paidBy, coveredBy: tournamentPlayers.coveredByUserId })
    .from(tournamentPlayers)
    .innerJoin(users, eq(users.id, tournamentPlayers.userId))
    .where(eq(tournamentPlayers.tournamentId, id))
    .orderBy(asc(tournamentPlayers.joinedAt));

  const isOrganizer = Boolean(viewer && (viewer.id === t.organizerId || viewer.role === "admin"));
  const myPlayer = viewer ? players.find((p) => p.userId === viewer.id) : undefined;
  const memberTeams = viewer ? (await db.select({ teamId: teamMembers.teamId, role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.userId, viewer.id))) : [];
  const inTournament = memberTeams.some((m) => entries.some((e) => e.teamId === m.teamId));
  const tokenOk = Boolean(token && t.inviteToken && token === t.inviteToken);
  // Das Bracket ist für alle sichtbar (auch ohne Konto): Wer ein privates Turnier nicht kennt, sieht nur die Spielübersicht,
  // aber weder Einladungslink noch Kader noch Zahlungsstand. Mitmachen geht nur über den Einladungslink.
  const spectator = t.isPrivate && !isOrganizer && !inTournament && !tokenOk;

  const organizer = (await db.select({ name: users.name }).from(users).where(eq(users.id, t.organizerId)))[0];
  const nameOf = new Map(entries.map((e) => [e.teamId, e.name]));
  const bracketVisible = Boolean(t.bracketGeneratedAt);
  const matchRows = bracketVisible ? await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id)).orderBy(asc(tournamentMatches.stage), asc(tournamentMatches.round), asc(tournamentMatches.slot)) : [];
  const stages = [...new Set(matchRows.map((m) => m.stage))].sort((a, b) => {
    const rank = (s: string) => (s.startsWith("group:") ? 0 : s === "round" ? 0 : 100 - Number(s.slice(3)));
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const plan = bracketVisible ? scheduleOf(t, matchRows) : null;
  const courtOf = (stage: string, slot: number) => plan?.blocks.flatMap((b) => b.games.map((g) => ({ ...g, startsAt: b.startsAt, endsAt: b.endsAt }))).find((g) => !g.fun && g.stage === stage && g.slot === slot);
  const semis = matchRows.filter((m) => m.stage === "ko:4");
  const losers = semis.flatMap((m) => {
    if (!m.teamA || !m.teamB || m.scoreA === null || m.scoreB === null) return [];
    const w = koWinner({ a: m.teamA, b: m.teamB, scoreA: m.scoreA, scoreB: m.scoreB, shootoutWinner: m.shootoutWinner });
    return w ? [w === m.teamA ? m.teamB : m.teamA] : [];
  });
  const ids = entries.map((e) => e.teamId);
  const legacyTables =
    bracketVisible && t.format === "round_robin"
      ? [{ name: "Tabelle", rows: standings(ids, matchRows.map(playedOf).filter((p): p is Played => p !== null)) }]
      : bracketVisible && t.format === "groups_ko"
        ? drawGroups(ids).map((members, i) => ({ name: `Gruppe ${groupName(i)}`, rows: standings(members, matchRows.filter((m) => m.stage === `group:${groupName(i)}`).map(playedOf).filter((p): p is Played => p !== null)) }))
        : [];

  const share = shareOf(t);
  const priceFixed = t.finalShareCents !== null;
  // Kartenmodell (012 M5-3): Ampel = Karte hinterlegt (oder Anteil uebernommen), nichts wird bezahlt. Der Server entscheidet die Sichtbarkeit je Betrachter (Plan v3, Matrix).
  const payBlocked = (t.status === "registration" || t.status === "payment") && (await tournamentPayBlocked(db, t)); // Zahlungen AUS: kein Guthaben-Bezahlknopf, Kartenansicht
  const cardMode = (t.status === "registration" || t.status === "payment") && ((await tournamentCardMode(db, t.id)) || payBlocked);
  const cards = cardMode ? await getTournamentCardDisplays(t.id, { id: viewer?.id ?? null, platformAdmin: isPlatformAdmin(viewer ? { role: viewer.role as Role } : null) }) : null;
  // gedeckt = Karte hinterlegt ODER Anteil uebernommen; die Captain-Sicht liefert bei Uebernahme {status: "none", covered: true} (Markierung), das zaehlt als gedeckt
  const cardOk = (userId: string) => cards?.[userId]?.status === "card_ready" || cards?.[userId]?.covered === true;
  const teamViews = await Promise.all(
    entries.map(async (e) => {
      const list = players.filter((p) => p.teamId === e.teamId);
      const { paidReadyAt, ...rest } = e;
      return {
        ...rest,
        captainName: spectator ? "–" : (list.find((p) => p.userId === e.captainId)?.name ?? "–"),
        ready: Boolean(e.readyAt), // Team vollzählig gemeldet
        paidReady: !spectator && Boolean(paidReadyAt), // Captain hat nach voller Zahlung "Bereit" gedrückt
        dueCents: !cardMode && priceFixed && !spectator ? list.reduce((sum, p) => sum + Math.max(share - p.paidCents, 0), 0) : 0,
        cardMissing: cardMode && !spectator && list.some((p) => cards?.[p.userId] !== undefined) ? list.filter((p) => !cardOk(p.userId)).length : 0, // nur im eigenen Team bekannt (sonst 0)
        // Kartenmodell: Spieler-Ampeln nur, wo der Server sie dem Betrachter zeigt (eigenes Team, Plattform-Admin); sonst nur "Karten komplett/unvollstaendig" je Team
        showLights: !cardMode || list.some((p) => cards?.[p.userId] !== undefined),
        // Aggregat "Karten komplett" nur fuer Mitglieder des Teams (sehen ohnehin die Ampeln), den Veranstalter und Plattform-Admins; Gaeste und fremde Spieler sehen es nie (Entscheid t9)
        cardsComplete: cardMode && isOrganizer && !list.some((p) => cards?.[p.userId] !== undefined) ? await tournamentTeamCardsReady(db, t.id, e.teamId) : null,
        anyPaid: !spectator && list.some((p) => p.paidCents > 0),
        complete: await rosterReady(db, t.id, e.teamId),
        players: spectator ? [] : list.map((p) => ({ userId: p.userId, name: p.name, paidByOther: p.paidBy !== null && p.paidBy !== p.userId, paid: cardMode ? cardOk(p.userId) : priceFixed && (share === 0 || p.paidCents >= share), covered: cards?.[p.userId]?.covered === true, isCaptain: p.userId === e.captainId })),
      };
    }),
  );

  const open = registrationOpen(t) && !deadlinePassed(t);
  const adminTeams = memberTeams.filter((m) => m.role === "admin").map((m) => m.teamId);
  const adminTeamRows = adminTeams.length ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(and(inArray(teams.id, adminTeams), isNull(teams.archivedAt))) : [];
  const captainOf = viewer ? entries.find((e) => e.captainId === viewer.id) : undefined;
  const showToken = isOrganizer || inTournament;
  const canJoin = open && !spectator;

  return {
    tournament: { ...t, inviteToken: showToken ? t.inviteToken : null },
    organizerName: organizer?.name ?? "–",
    teams: teamViews,
    viewer: viewer
      ? {
          isOrganizer,
          captainTeamId: captainOf?.teamId ?? null,
          myTeamId: myPlayer?.teamId ?? null,
          iPaid: myPlayer ? (cardMode ? cardOk(myPlayer.userId) : priceFixed && (share === 0 || myPlayer.paidCents >= share)) : false,
          myDueCents: myPlayer && priceFixed && !cardMode ? Math.max(share - myPlayer.paidCents, 0) : 0,
          // Kartenmodell: habe ich selbst eine Karte (nicht nur einen Uebernehmer), und wessen Anteil uebernehme ich (nur der Platz, den der Server aus der Datenbank kennt)
          hasOwnCard: myPlayer ? cardOk(myPlayer.userId) && cards?.[myPlayer.userId]?.covered !== true : false,
          coveringUserId: viewer ? (players.find((p) => p.coveredBy === viewer.id && p.teamId === myPlayer?.teamId)?.userId ?? null) : null,
          registerableTeams: canJoin && !captainOf && !myPlayer ? adminTeamRows.filter((x) => !entries.some((e) => e.teamId === x.id)) : [],
          joinableTeamIds: canJoin && !myPlayer ? memberTeams.map((m) => m.teamId).filter((tid) => entries.some((e) => e.teamId === tid)) : [],
        }
      : null,
    pricing: {
      totalCents: t.totalCents,
      hourlyCents: t.hourlyCents,
      durationMin: t.durationMin,
      shareCents: priceFixed ? share : null,
      finalShareCents: t.finalShareCents,
      players: players.length,
      range: t.totalCents !== null ? shareRange(t.totalCents, t.maxTeams, MIN_PLAYERS_PER_TEAM, MAX_PER_TEAM) : null,
      commissionPercent: await commissionPercent(),
    },
    cardMode,
    paymentsPaused: payBlocked,
    registrationOpen: open,
    deadlinePassed: deadlinePassed(t),
    bracketVisible,
    schedule: plan && {
      slotMinutes: plan.slotMinutes,
      gapMinutes: GAP_MIN,
      blocks: plan.blocks.map((b) => ({
        label: b.label,
        startIso: b.startsAt.toISOString(),
        endIso: b.endsAt.toISOString(),
        games: b.games.flatMap((g) => {
          if (g.fun) return [{ court: g.court, fun: true, matchId: null, nameA: losers[0] ? nameOf.get(losers[0]) ?? "?" : null, nameB: losers[1] ? nameOf.get(losers[1]) ?? "?" : null }];
          const m = matchRows.find((x) => x.stage === g.stage && x.slot === g.slot);
          if (!m) {
            console.error("getTournament: Planpaarung ohne Spielzeile ausgelassen", { tournamentId: t.id, stage: g.stage, slot: g.slot }); // ohne Namen; sollte nie vorkommen (scheduleFromRows bildet auf echte Zeilen ab)
            return []; // defensiv: die Seite stürzt nie ab
          }
          return [{ court: g.court, fun: false, matchId: m.matchId, nameA: m.teamA ? nameOf.get(m.teamA) ?? "?" : null, nameB: m.teamB ? nameOf.get(m.teamB) ?? "?" : null }];
        }),
      })),
    },
    stages: stages.map((stage) => ({ stage, matches: matchRows.filter((m) => m.stage === stage).map((m) => ({ ...m, court: courtOf(m.stage, m.slot)?.court ?? null, startIso: courtOf(m.stage, m.slot)?.startsAt.toISOString() ?? null, endIso: courtOf(m.stage, m.slot)?.endsAt.toISOString() ?? null, nameA: m.teamA ? nameOf.get(m.teamA) ?? "?" : null, nameB: m.teamB ? nameOf.get(m.teamB) ?? "?" : null, pendingShootout: m.scoreA !== null && m.scoreA === m.scoreB && !m.shootoutWinner })) })),
    tables: legacyTables.map((tb) => ({ ...tb, rows: tb.rows.map((r) => ({ ...r, name: nameOf.get(r.teamId) ?? "?", slug: entries.find((e) => e.teamId === r.teamId)?.slug ?? "" })) })),
    winner: t.winnerTeamId ? (nameOf.get(t.winnerTeamId) ?? null) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Eingefrorene Turniere bei Schalter AUS (Backlog 141, Entscheid t2q Plan-OK 012-Rest): Frist- und Fensterjob sagen bei ausgeschaltetem Kartenmodell NICHT ab (Notabschaltung ist keine Schuld der
// Spieler). Solche Turniere bleiben in payment. Damit sie nicht unbemerkt haengen: Alarm an Admin 1 ab 6 Stunden nach dem Zeitpunkt, an dem sonst gehandelt worden waere, danach alle 12 Stunden erneut,
// bis das Turnier geloest ist (Schalter AN oder abgesagt). KEINE automatische Absage: Admin 1 entscheidet (Absage ueber die Admin-Oberflaeche).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
export const FROZEN_FIRST_HOURS = 6;
export const FROZEN_REPEAT_HOURS = 12;

/** Stufe der Erinnerung: 0 ab 6 h nach `since`, dann je 12 h eine weitere; undefined = noch nicht faellig. Rein rechnerisch (Unit-Test). */
export function frozenStage(now: Date, since: Date): number | undefined {
  const t = now.getTime() - since.getTime() - FROZEN_FIRST_HOURS * 3_600_000;
  return t < 0 ? undefined : Math.floor(t / (FROZEN_REPEAT_HOURS * 3_600_000));
}

/** Seit wann haette der Job gehandelt (Frist erreicht oder Nachzahlfenster einer gescheiterten Zeile abgelaufen)? null = noch nicht. Nur Turniere mit Kartenfluss. */
async function frozenSince(exec: Pick<typeof db, "select" | "execute">, t: T): Promise<Date | null> {
  const candidates: Date[] = [];
  const due = await chargeDueAt(exec, t);
  if (due) candidates.push(due);
  if (t.startsAt) {
    const w = await exec.execute(sql`select min(least(c.grace_until, ${t.startsAt}::timestamptz - interval '1 hour')) as ends from payment_charges c
      where c.tournament_id = ${t.id} and c.status in ('failed', 'requires_action') and c.grace_until is not null and c.failure_code is not null and c.failure_code not in (${sql.join(NON_CARD_CODES.map((x) => sql`${x}`), sql`, `)})`);
    const ends = (w.rows as { ends: Date | string | null }[])[0]?.ends;
    if (ends) candidates.push(new Date(ends));
  }
  return candidates.length === 0 ? null : new Date(Math.min(...candidates.map((d) => d.getTime())));
}

/** Eingefrorene Turniere (nur bei Schalter AUS): id und Zeitpunkt, ab dem gehandelt worden waere. Kartenfluss = Snapshot gesetzt oder Abbuchungszeilen. */
export async function frozenTournaments(exec: Pick<typeof db, "select" | "execute">, now: Date): Promise<{ id: string; since: Date }[]> {
  if (await tournamentPaymentsActive()) return [];
  const rows = await exec
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.status, "payment"), isNull(tournaments.bracketGeneratedAt), isNull(tournaments.settledAt), isNotNull(tournaments.startsAt), or(isNotNull(tournaments.venueAccessRequiredSnapshot), sql`exists (select 1 from payment_charges c where c.tournament_id = ${tournaments.id})`)));
  const out: { id: string; since: Date }[] = [];
  for (const t of rows) {
    const since = await frozenSince(exec, t);
    if (since && now.getTime() >= since.getTime()) out.push({ id: t.id, since });
  }
  return out;
}

/**
 * Mitteilung an Admin 1 (Owner) zu eingefrorenen Turnieren: ab 6 h, dann alle 12 h, je Stufe einmal je Turnier (Audit-Marker unter der Turniersperre). OHNE Personendaten und ohne Turniername.
 * In einem Savepoint (ein Fehler kippt den Job nicht). Gibt die Zahl der benachrichtigten Turniere zurueck.
 */
export async function notifyFrozenTournaments(now: Date = new Date(), opts: { candidates?: { id: string; since: Date }[] } = {}): Promise<number> {
  const frozen = opts.candidates ?? (await frozenTournaments(db, now)); // opts.candidates nur fuer Tests (veraltete Liste)
  let sent = 0;
  for (const f of frozen) {
    try {
      await db.transaction(async (tx) => {
        const t = await lockTournament(tx, f.id);
        if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt || (await tournamentPaymentsActive())) return; // inzwischen geloest
        // Frist/Fenster UNTER der Sperre neu rechnen (R-T269): wurde zwischenzeitlich nachgezahlt oder ist das Turnier nicht mehr eingefroren, keine Mitteilung; die Stufe stammt aus dieser Rechnung
        const since = await frozenSince(tx, t);
        if (!since || now.getTime() < since.getTime()) return;
        const stage = frozenStage(now, since);
        if (stage === undefined) return;
        const action = `tournament.frozen_notice.${stage}`;
        const [done] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, t.id))).limit(1);
        if (done) return;
        const hours = Math.floor((now.getTime() - since.getTime()) / 3_600_000);
        // nur Admin 1 und nicht gesperrt (wie evidence-head)
        const owners = await tx.select({ id: users.id }).from(users).where(and(eq(users.isOwner, true), isNull(users.bannedAt)));
        // Savepoint nur um die Mitteilung: scheitert sie, wird die Transaktion dieses Turniers zurueckgerollt (kein Marker, naechster Lauf versucht es erneut); die anderen Turniere und der Job laufen weiter (aeusseres try/catch)
        await tx.transaction(async (sp) => {
          await notifyUsers(owners.map((o) => o.id), { type: "system", title: "Turnier eingefroren", body: `Ein Turnier ist bei ausgeschaltetem Kartenmodell eingefroren (seit etwa ${hours} Stunden). Bitte entscheiden: Kartenmodell einschalten oder das Turnier absagen.`, url: `/turniere/${t.id}` }, sp);
        });
        await audit(null, action, "tournament", t.id, { after: { hours } }, tx);
        sent += 1;
      });
    } catch (error) {
      console.error("notifyFrozenTournaments: Fehler bei Turnier", f.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return sent;
}

/** "Meine Turniere" (TURNIER_ONLY-Dashboard): Turniere, in denen die Person im Kader steht oder die sie veranstaltet; nur Name, Stand, Datum (keine Personendaten Dritter). */
export async function myTournamentsAsPlayerOrOrganizer(userId: string) {
  const asPlayer = await db
    .select({ id: tournaments.id, name: tournaments.name, status: tournaments.status, startsOn: tournaments.startsOn })
    .from(tournamentPlayers)
    .innerJoin(tournaments, eq(tournaments.id, tournamentPlayers.tournamentId))
    .where(eq(tournamentPlayers.userId, userId));
  const asOrganizer = await myTournaments(userId);
  const byId = new Map<string, { id: string; name: string; status: (typeof tournaments.$inferSelect)["status"]; startsOn: string; organizer: boolean }>();
  for (const t of asPlayer) byId.set(t.id, { ...t, organizer: false });
  for (const t of asOrganizer) byId.set(t.id, { ...t, organizer: true });
  return [...byId.values()].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
}
