import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matchResults, matches, teamMembers, teams, users } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { MAX_PER_TEAM, MIN_READY_PER_TEAM } from "@/lib/lobby-rules";
import { GAP_MIN, finalSharePerPlayer, planSchedule, koWinner, knockout, shareRange, standings, drawGroups, groupName, splitEntryFees, tournamentTotalCents, type Fixture, type Played } from "@/lib/tournament";
import { priceFor } from "./pricing";
import { toBerlinInputValue } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { creditWallet, debitWallet, post } from "./ledger";
import { notifyUsers, teamAdminIds } from "./notifications";
import { getSetting } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

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
  if (!Number.isInteger(input.maxTeams) || input.maxTeams < MIN_TOURNAMENT_TEAMS || input.maxTeams > MAX_TOURNAMENT_TEAMS) throw new DomainError(`${MIN_TOURNAMENT_TEAMS} bis ${MAX_TOURNAMENT_TEAMS} Teams.`);
  if (!Number.isInteger(input.durationMin) || input.durationMin < 30 || input.durationMin > 720 || input.durationMin % 15 !== 0) throw new DomainError("Das Turnier dauert 30 Minuten bis 12 Stunden (in 15-Minuten-Schritten).");
  let hourly = input.hourlyCents ?? null;
  if (hourly === null) {
    const standard = await priceFor(db, null, 60);
    if (!standard) throw new DomainError("Für die Halle gibt es keinen Standardpreis. Bitte gib den Hallenpreis pro Stunde an.");
    hourly = standard.priceCents;
  }
  if (!Number.isInteger(hourly) || hourly < 0 || hourly > 100_000) throw new DomainError("Der Hallenpreis liegt zwischen 0 und 1.000 Euro pro Stunde.");
  const totalCents = tournamentTotalCents(hourly, input.durationMin);
  const matchMinutes = input.matchMinutes ?? 15;
  if (!Number.isInteger(matchMinutes) || matchMinutes < 5 || matchMinutes > 90) throw new DomainError("Eine Spielzeit dauert 5 bis 90 Minuten.");
  const [row] = await db
    .insert(tournaments)
    .values({
      organizerId: userId,
      name,
      city: input.city,
      venueText: input.venueText?.trim().slice(0, 120) || null,
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

async function lockTournament(tx: Tx, id: string): Promise<T> {
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
    if (existing) throw new DomainError("Du bist schon im Turnier-Kader.");
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
    // Die Erstattung geht an den, der gezahlt hat: der Spieler selbst oder der Captain, der für das Team gezahlt hat
    await creditWallet(tx, p.paidBy ?? p.userId, { from: "tournament", amountCents: p.paidCents, kind: "tournament_refund", tournamentId: t.id, idempotencyKey: `tournament-refund:${t.id}:${p.userId}:${p.joinedAt.getTime()}:${p.paidAt?.getTime() ?? 0}`, reason: `${reason}: ${t.name}` });
  }
}

/** Spieler verlässt den Turnier-Kader (oder der Captain/Veranstalter entfernt ihn). Bezahlter Eintritt geht aufs Guthaben zurück. */
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
    await refundPlayer(tx, t, p, "Rückerstattung Eintritt");
    await unlockTeam(tx, tournamentId, p.teamId);
    await audit(actorId, "tournament.leave", "tournament", tournamentId, { after: { userId: targetUserId } }, tx);
  });
}

/** Jeder Spieler zahlt seinen Anteil selbst vom Guthaben (erst wenn der Preis feststeht). Doppelklick oder zweite Anfrage buchen nicht doppelt. */
export async function payEntry(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!paymentOpen(t)) throw new DomainError("Bezahlen geht, sobald alle Teams vollzählig sind und der Preis pro Spieler feststeht.");
    const [p] = await tx.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId))).for("update");
    if (!p) throw new DomainError("Du bist nicht im Turnier-Kader.");
    const share = shareOf(t);
    if (share === 0) throw new DomainError("Dieses Turnier ist kostenlos.");
    if (p.paidCents >= share) throw new DomainError("Du hast schon bezahlt.");
    await debitWallet(tx, userId, { to: "tournament", amountCents: share - p.paidCents, kind: "tournament_entry", tournamentId, idempotencyKey: `tournament-entry:${tournamentId}:${userId}:${p.joinedAt.getTime()}:${t.priceRound}`, reason: `Anteil Hallenkosten ${t.name}`, actorId: userId });
    await tx.update(tournamentPlayers).set({ paidCents: share, paidAt: new Date(), paidBy: userId }).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
    await audit(userId, "tournament.pay", "tournament", tournamentId, { after: { cents: share } }, tx);
    await maybeGenerateBracket(tx, t);
  });
}

/**
 * Der Captain zahlt für sein Team: für alle Spieler, die noch nicht bezahlt haben, oder nur für einen einzelnen Spieler (`targetUserId`).
 * Alle anderen Spieler können weiter selbst zahlen. Alles oder nichts: reicht das Guthaben nicht, wird nichts gebucht.
 * Die Erstattung (nur bei Absage oder wenn der Veranstalter den Kader wieder öffnet) geht an den Captain, weil er gezahlt hat.
 */
export async function payForTeam(userId: string, tournamentId: string, targetUserId?: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!paymentOpen(t)) throw new DomainError("Bezahlen geht, sobald alle Teams vollzählig sind und der Preis pro Spieler feststeht.");
    const [entry] = await tx.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.captainId, userId)));
    if (!entry) throw new DomainError("Nur der Captain eines angemeldeten Teams kann für andere Spieler bezahlen.");
    const share = shareOf(t);
    if (share === 0) throw new DomainError("Dieses Turnier ist kostenlos.");
    const players = await tx.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, entry.teamId))).for("update");
    if (targetUserId && !players.some((p) => p.userId === targetUserId)) throw new DomainError("Dieser Spieler ist nicht in deinem Team.");
    const open = players.filter((p) => p.paidCents < share && (!targetUserId || p.userId === targetUserId));
    if (open.length === 0) throw new DomainError(targetUserId ? "Dieser Spieler hat schon bezahlt." : "Euer Team ist schon komplett bezahlt.");
    for (const p of open) {
      await debitWallet(tx, userId, { to: "tournament", amountCents: share - p.paidCents, kind: "tournament_entry", tournamentId, idempotencyKey: `tournament-entry:${tournamentId}:${p.userId}:${p.joinedAt.getTime()}:${t.priceRound}`, reason: `Anteil Hallenkosten (Captain zahlt) ${t.name}`, actorId: userId });
      await tx.update(tournamentPlayers).set({ paidCents: share, paidAt: new Date(), paidBy: userId }).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, p.userId)));
    }
    await audit(userId, "tournament.payteam", "tournament", tournamentId, { after: { players: open.length, single: Boolean(targetUserId) } }, tx);
    await maybeGenerateBracket(tx, t);
  });
}

/** Ein Team ist vollzählig, wenn genug Spieler im Kader sind (4 bis 6). */
async function rosterReady(tx: Pick<typeof db, "select">, tournamentId: string, teamId: string): Promise<boolean> {
  const [{ n }] = await tx.select({ n: count() }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.teamId, teamId)));
  return n >= MIN_PLAYERS_PER_TEAM && n <= MAX_PER_TEAM;
}

/** Wer in den Kader kommt oder geht, hebt die "vollzählig"-Meldung des Teams auf (solange der Preis noch nicht feststeht). */
async function unlockTeam(tx: Tx, tournamentId: string, teamId: string) {
  await tx.update(tournamentTeams).set({ readyAt: null }).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
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
  await tx.update(tournaments).set({ status: "payment", finalShareCents: share, priceRound: fresh.priceRound + 1 }).where(eq(tournaments.id, t.id));
  await audit(null, "tournament.price", "tournament", t.id, { after: { share, players: everyone.length } }, tx);
  await notifyUsers(
    [...new Set(everyone.map((p) => p.userId))],
    { type: "payment", title: "Der Preis steht fest", body: share > 0 ? `${fresh.name}: Dein Anteil beträgt ${(share / 100).toFixed(2).replace(".", ",")} €. Bezahle jetzt in der Turnier-Lobby.` : `${fresh.name}: Das Turnier ist kostenlos.`, url: `/turniere/${t.id}` },
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
    const players = await tx.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
    for (const p of players) {
      await refundPlayer(tx, t, p, "Rückerstattung: Kader wieder geöffnet");
      await tx.update(tournamentPlayers).set({ paidCents: 0, paidAt: null, paidBy: null }).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, p.userId)));
    }
    await tx.update(tournamentTeams).set({ readyAt: null }).where(eq(tournamentTeams.tournamentId, tournamentId));
    await tx.update(tournaments).set({ status: "registration", finalShareCents: null }).where(eq(tournaments.id, tournamentId));
    await notifyUsers([...new Set(players.map((p) => p.userId)), ...new Set(players.flatMap((p) => (p.paidBy ? [p.paidBy] : [])))], { type: "system", title: "Kader wieder offen", body: `${t.name}: Der Veranstalter hat die Kader wieder geöffnet. Bereits gezahlte Anteile wurden erstattet, der Preis wird neu berechnet.`, url: `/turniere/${tournamentId}` }, tx);
    await audit(userId, "tournament.reopen", "tournament", tournamentId, { after: { refunded: players.filter((p) => p.paidCents > 0).length } }, tx);
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
      await notifyUsers(await teamAdminIds(tx, teamId), { type: "system", title: "Team aus dem Turnier genommen", body: `Der Veranstalter hat euer Team aus ${t.name} genommen. Bezahlte Eintritte wurden erstattet.`, url: `/turniere/${tournamentId}` }, tx);
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

/**
 * Erzeugt das K.-o.-Bracket genau einmal, sobald der Preis feststeht und alle Spieler bezahlt haben (bei einem kostenlosen Turnier sofort).
 * Läuft unter der Turniersperre und setzt `bracket_generated_at`, damit eine zweite Auslösung nichts mehr tut.
 */
async function maybeGenerateBracket(tx: Tx, t: T) {
  const [fresh] = await tx.select().from(tournaments).where(eq(tournaments.id, t.id));
  if (!fresh || fresh.status !== "payment" || fresh.bracketGeneratedAt) return;
  const entries = await tx.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id)).orderBy(asc(tournamentTeams.registeredAt));
  if (entries.length !== fresh.maxTeams || entries.length < MIN_TOURNAMENT_TEAMS) return;
  const share = shareOf(fresh);
  const everyone = await tx.select({ paid: tournamentPlayers.paidCents }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  if (!everyone.every((p) => share === 0 || p.paid >= share)) return;

  await tx.update(tournaments).set({ status: "running", bracketGeneratedAt: new Date() }).where(eq(tournaments.id, t.id));
  await insertFixtures(tx, t.id, knockout(entries.map((e) => e.teamId)));
  await createGames(tx, fresh);
  for (const e of entries) await notifyUsers(await teamAdminIds(tx, e.teamId), { type: "system", title: "Das Bracket steht", body: `${fresh.name}: Alle haben bezahlt, das Bracket ist jetzt sichtbar.`, url: `/turniere/${t.id}` }, tx);
  await audit(null, "tournament.bracket", "tournament", t.id, { after: { teams: entries.length } }, tx);
}

/** Zeitplan der K.-o.-Runden aus den Spielzeilen (null ohne Starttermin oder bei anderen Formaten). */
function scheduleOf(t: T, rows: { stage: string }[]) {
  if (!t.startsAt || rows.length === 0 || rows.some((r) => !r.stage.startsWith("ko:"))) return null;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);
  const rounds = [...counts].map(([stage, games]) => ({ stage, games })).sort((a, b) => Number(b.stage.slice(3)) - Number(a.stage.slice(3)));
  return planSchedule(rounds, t.startsAt, t.durationMin ?? 120);
}

/** Für jede Paarung, deren beide Teams feststehen, entsteht ein echtes Spiel (Captain meldet, der andere bestätigt). */
async function createGames(tx: Tx, t: T) {
  const open = await tx
    .select()
    .from(tournamentMatches)
    .where(and(eq(tournamentMatches.tournamentId, t.id), isNull(tournamentMatches.matchId), isNotNull(tournamentMatches.teamA), isNotNull(tournamentMatches.teamB)))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
  const plan = scheduleOf(t, await tx.select({ stage: tournamentMatches.stage }).from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id)));
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

/** Zahlt den Veranstalter aus (Eintritte abzüglich Provision) und verbucht die Provision als Umsatz. Genau einmal pro Turnier. */
async function settle(tx: Tx, t: T) {
  const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${tournamentPlayers.paidCents}), 0)`.mapWith(Number) }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
  const { commission, payout } = splitEntryFees(total, await commissionPercent(tx));
  if (payout > 0) await creditWallet(tx, t.organizerId, { from: "tournament", amountCents: payout, kind: "tournament_payout", tournamentId: t.id, idempotencyKey: `tournament-payout:${t.id}`, reason: `Auszahlung Eintritte ${t.name}` });
  if (commission > 0) await post(tx, { debit: { account: "tournament" }, credit: { account: "revenue" }, amountCents: commission, kind: "tournament_commission", tournamentId: t.id, idempotencyKey: `tournament-commission:${t.id}`, reason: `Provision ${t.name}` });
  await tx.update(tournaments).set({ settledAt: new Date() }).where(eq(tournaments.id, t.id));
  await audit(null, "tournament.settle", "tournament", t.id, { after: { total, commission, payout } }, tx);
}

/** Absagen: Alle bezahlten Eintritte gehen vollständig aufs Guthaben der Spieler zurück. Nur möglich, solange noch kein Spiel gespielt ist. */
export async function cancelTournament(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann absagen.");
    if (t.status === "finished" || t.status === "cancelled") throw new DomainError("Das Turnier ist schon beendet oder abgesagt.");
    const played = await tx.select({ id: tournamentMatches.id }).from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), isNotNull(tournamentMatches.scoreA))).limit(1);
    if (played.length > 0) throw new DomainError("Es gibt schon Ergebnisse. Bitte wende dich an die Plattform.");
    const players = await tx.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
    for (const p of players) {
      await refundPlayer(tx, t, p, "Rückerstattung abgesagtes Turnier");
    }
    await notifyUsers(players.map((p) => p.userId), { type: "system", title: "Turnier abgesagt", body: `${t.name} findet nicht statt. Dein Eintritt wurde vollständig erstattet.`, url: `/turniere/${tournamentId}` }, tx);
    const games = await tx.select({ matchId: tournamentMatches.matchId }).from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), isNotNull(tournamentMatches.matchId)));
    const gameIds = games.map((g) => g.matchId!).filter(Boolean);
    if (gameIds.length) await tx.update(matches).set({ status: "cancelled" }).where(inArray(matches.id, gameIds));
    await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
    await tx.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, tournamentId));
    await audit(userId, "tournament.cancel", "tournament", tournamentId, { after: { refunded: players.filter((p) => p.paidCents > 0).length } }, tx);
  });
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
    .select({ teamId: teams.id, name: teams.name, slug: teams.slug, captainId: tournamentTeams.captainId, readyAt: tournamentTeams.readyAt })
    .from(tournamentTeams)
    .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
    .where(eq(tournamentTeams.tournamentId, id))
    .orderBy(asc(tournamentTeams.registeredAt));
  const players = await db
    .select({ teamId: tournamentPlayers.teamId, userId: users.id, name: sql<string>`coalesce(${users.nickname}, ${users.name})`, paidCents: tournamentPlayers.paidCents, paidBy: tournamentPlayers.paidBy })
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
  const teamViews = await Promise.all(
    entries.map(async (e) => {
      const list = players.filter((p) => p.teamId === e.teamId);
      return {
        ...e,
        captainName: spectator ? "–" : (list.find((p) => p.userId === e.captainId)?.name ?? "–"),
        ready: Boolean(e.readyAt), // Team vollzählig gemeldet
        dueCents: priceFixed && !spectator ? list.reduce((sum, p) => sum + Math.max(share - p.paidCents, 0), 0) : 0,
        anyPaid: !spectator && list.some((p) => p.paidCents > 0),
        complete: await rosterReady(db, t.id, e.teamId),
        players: spectator ? [] : list.map((p) => ({ userId: p.userId, name: p.name, paidByOther: p.paidBy !== null && p.paidBy !== p.userId, paid: priceFixed && (share === 0 || p.paidCents >= share), isCaptain: p.userId === e.captainId })),
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
          iPaid: myPlayer ? priceFixed && (share === 0 || myPlayer.paidCents >= share) : false,
          myDueCents: myPlayer && priceFixed ? Math.max(share - myPlayer.paidCents, 0) : 0,
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
        games: b.games.map((g) => {
          if (g.fun) return { court: g.court, fun: true, matchId: null, nameA: losers[0] ? nameOf.get(losers[0]) ?? "?" : null, nameB: losers[1] ? nameOf.get(losers[1]) ?? "?" : null };
          const m = matchRows.find((x) => x.stage === g.stage && x.slot === g.slot)!;
          return { court: g.court, fun: false, matchId: m.matchId, nameA: m.teamA ? nameOf.get(m.teamA) ?? "?" : null, nameB: m.teamB ? nameOf.get(m.teamB) ?? "?" : null };
        }),
      })),
    },
    stages: stages.map((stage) => ({ stage, matches: matchRows.filter((m) => m.stage === stage).map((m) => ({ ...m, court: courtOf(m.stage, m.slot)?.court ?? null, startIso: courtOf(m.stage, m.slot)?.startsAt.toISOString() ?? null, nameA: m.teamA ? nameOf.get(m.teamA) ?? "?" : null, nameB: m.teamB ? nameOf.get(m.teamB) ?? "?" : null, pendingShootout: m.scoreA !== null && m.scoreA === m.scoreB && !m.shootoutWinner })) })),
    tables: legacyTables.map((tb) => ({ ...tb, rows: tb.rows.map((r) => ({ ...r, name: nameOf.get(r.teamId) ?? "?", slug: entries.find((e) => e.teamId === r.teamId)?.slug ?? "" })) })),
    winner: t.winnerTeamId ? (nameOf.get(t.winnerTeamId) ?? null) : null,
  };
}
