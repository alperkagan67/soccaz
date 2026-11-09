import { randomBytes } from "node:crypto";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams, users } from "@/db/schema";
import { gameInvites } from "@/db/schema-matchmaking";
import { DEFAULT_PRIVATE_PLAYERS, MAX_PRIVATE_PLAYERS, MIN_PRIVATE_PLAYERS } from "@/lib/lobby-rules";
import { parseEuro } from "@/lib/money";
import { audit } from "./audit";
import { cancelMatchTx } from "./lobby";
import { notifyUsers } from "./notifications";
import { paymentsEnabled } from "./settings";
import { privateJoinBlocked } from "./wallet";
import { DomainError } from "./teams";

export type PrivateGameInput = {
  city: string;
  venueText: string;
  startsAt: Date;
  durationMin: number;
  maxPlayers?: number;
  /** Hallenmiete in Cent, Pflicht: 0 ("kostenlos") bis 100.000 (1.000 Euro). Sie wird auf die Spieler aufgeteilt. Fehlt sie, gibt es einen Fehler, keinen Plattformpreis. */
  rentCents?: number | null;
};

const MIN_LEAD_MS = 60 * 60_000;
const MAX_RENT_CENTS = 100_000;
const RENT_ERROR = "Bitte gib die Hallenmiete an (0 bis 1.000 Euro) oder wähle ausdrücklich kostenlos.";

/**
 * Übersetzt die Formularwahl in Cent: "free" = kostenlos (0), "amount" = der eingegebene Betrag. Ohne ausdrückliche Wahl
 * oder mit ungültigem Betrag gibt es einen Fehler. Die Obergrenze prüft `createPrivateGame` zusätzlich.
 */
export function parseRentInput(mode: string, text: string): number {
  if (mode === "free") return 0;
  if (mode !== "amount") throw new DomainError(RENT_ERROR);
  const cents = text.trim() === "" ? null : parseEuro(text);
  if (cents === null || cents > MAX_RENT_CENTS) throw new DomainError(RENT_ERROR);
  return cents;
}
const INVITE_DAYS_AFTER_START = 1;

/**
 * Eine Person legt ein Privatspiel für ihre Freundesgruppe an. Es gibt zwei unsichtbare Spiel-Teams (Rot und Blau), deren Admin der
 * Veranstalter ist, damit Lobby, Zahlung, Ergebnis und Übersicht genau wie beim Teamspiel laufen. Das Spiel ist nie öffentlich
 * sichtbar, nur über den Einladungslink erreichbar und zählt nicht für Elo oder Rangliste.
 */
export async function createPrivateGame(userId: string, input: PrivateGameInput) {
  const maxPlayers = input.maxPlayers ?? DEFAULT_PRIVATE_PLAYERS;
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PRIVATE_PLAYERS || maxPlayers > MAX_PRIVATE_PLAYERS || maxPlayers % 2 !== 0) {
    throw new DomainError(`Die Spielerzahl muss gerade sein, zwischen ${MIN_PRIVATE_PLAYERS} und ${MAX_PRIVATE_PLAYERS}.`);
  }
  if (![60, 90].includes(input.durationMin)) throw new DomainError("Ein Spiel dauert 60 oder 90 Minuten.");
  if (Number.isNaN(input.startsAt.getTime()) || input.startsAt.getTime() < Date.now() + MIN_LEAD_MS) throw new DomainError("Der Termin muss mindestens eine Stunde in der Zukunft liegen.");
  const venue = input.venueText.trim().slice(0, 120);
  if (!venue) throw new DomainError("Bitte gib die Halle oder den Ort an.");
  const rent = input.rentCents;
  if (rent === null || rent === undefined) throw new DomainError(RENT_ERROR);
  if (!Number.isInteger(rent) || rent < 0 || rent > MAX_RENT_CENTS) throw new DomainError("Die Hallenmiete liegt zwischen 0 und 1.000 Euro.");

  return db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id, banned: users.bannedAt }).from(users).where(eq(users.id, userId));
    if (!u || u.banned) throw new DomainError("Dein Konto kann kein Spiel anlegen.");
    const suffix = randomBytes(4).toString("hex");
    const [red, blue] = await tx
      .insert(teams)
      .values([
        { name: "Team Rot", slug: `privat-${suffix}-rot`, city: input.city, createdBy: userId, kind: "private" as const },
        { name: "Team Blau", slug: `privat-${suffix}-blau`, city: input.city, createdBy: userId, kind: "private" as const },
      ])
      .returning({ id: teams.id });
    await tx.insert(teamMembers).values([
      { teamId: red.id, userId, role: "admin" },
      { teamId: blue.id, userId, role: "admin" },
    ]);
    const [match] = await tx
      .insert(matches)
      .values({
        kind: "private",
        visibility: "private",
        homeTeamId: red.id,
        awayTeamId: blue.id,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        venueText: venue,
        maxPlayers,
        schedulingOpen: false,
        priceCents: rent,
        costCents: rent,
      })
      .returning();
    await tx.insert(matchParticipants).values({ matchId: match.id, userId, teamId: null });
    const token = randomBytes(16).toString("base64url");
    await tx.insert(gameInvites).values({ token, matchId: match.id, createdBy: userId, expiresAt: new Date(input.startsAt.getTime() + INVITE_DAYS_AFTER_START * 86_400_000) });
    await audit(userId, "private.create", "match", match.id, { after: { maxPlayers, startsAt: input.startsAt } }, tx);
    return { match, token };
  });
}

/** Der Einladungslink eines Privatspiels, nur für den Veranstalter. */
export async function getGameInviteToken(userId: string, matchId: string): Promise<string | null> {
  const [m] = await db.select({ kind: matches.kind, home: matches.homeTeamId }).from(matches).where(eq(matches.id, matchId));
  if (!m || m.kind !== "private") return null;
  const [admin] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, m.home), eq(teamMembers.userId, userId), eq(teamMembers.role, "admin")));
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!admin && u?.role !== "admin") return null;
  const [row] = await db.select({ token: gameInvites.token }).from(gameInvites).where(and(eq(gameInvites.matchId, matchId), gt(gameInvites.expiresAt, new Date()))).limit(1);
  return row?.token ?? null;
}

export async function getGameInvitePreview(token: string) {
  await connection();
  const [row] = await db
    .select({ matchId: matches.id, number: matches.number, startsAt: matches.startsAt, durationMin: matches.durationMin, venueText: matches.venueText, status: matches.status, maxPlayers: matches.maxPlayers, expiresAt: gameInvites.expiresAt, organizer: users.name, organizerId: gameInvites.createdBy })
    .from(gameInvites)
    .innerJoin(matches, eq(matches.id, gameInvites.matchId))
    .innerJoin(users, eq(users.id, gameInvites.createdBy))
    .where(eq(gameInvites.token, token));
  if (!row) return { status: "invalid" as const };
  if (row.expiresAt.getTime() < Date.now()) return { status: "expired" as const };
  if (row.status === "cancelled") return { status: "cancelled" as const };
  const [{ players }] = await db.select({ players: count() }).from(matchParticipants).where(eq(matchParticipants.matchId, row.matchId));
  return { status: "valid" as const, game: row, players };
}

/** Wer den Link hat, tritt dem Spiel bei (zunächst ohne Team; der Veranstalter teilt ein oder lässt zufällig einteilen). Mehrfach ist harmlos. */
export async function joinPrivateGame(userId: string, token: string): Promise<{ matchId: string; already: boolean }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(gameInvites).where(eq(gameInvites.token, token));
    if (!inv) throw new DomainError("Dieser Einladungslink ist ungültig.");
    if (inv.expiresAt.getTime() < Date.now()) throw new DomainError("Dieser Einladungslink ist abgelaufen. Bitte frag den Veranstalter nach einem neuen.");
    const [match] = await tx.select().from(matches).where(eq(matches.id, inv.matchId)).for("update");
    if (!match || match.kind !== "private") throw new DomainError("Dieses Spiel gibt es nicht mehr.");
    if (match.status === "cancelled") throw new DomainError("Dieses Spiel wurde abgesagt.");
    if (match.status !== "lobby" && match.status !== "confirmed") throw new DomainError("Dieses Spiel ist schon vorbei.");
    const [existing] = await tx.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, userId)));
    if (existing) return { matchId: match.id, already: true };
    if (await privateJoinBlocked(tx, match)) throw new DomainError("Ab 48 Stunden vor Anstoß ist die Teilnehmerliste gesperrt: Es kann nur noch ein Ersatz für einen ausgestiegenen Spieler beitreten.");
    const [{ n }] = await tx.select({ n: count() }).from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    if (n >= (match.maxPlayers ?? DEFAULT_PRIVATE_PLAYERS)) throw new DomainError("Das Spiel ist schon voll.");
    await tx.insert(matchParticipants).values({ matchId: match.id, userId, teamId: null });
    await audit(userId, "private.join", "match", match.id, {}, tx);
    const [name] = await tx.select({ name: users.name, nick: users.nickname }).from(users).where(eq(users.id, userId));
    await notifyUsers([inv.createdBy], { type: "lobby.joined", title: "Neuer Spieler im Privatspiel", body: `${name?.nick ?? name?.name ?? "Jemand"} ist beigetreten. Teile die Spieler jetzt in die Teams ein.`, url: `/lobby/${match.id}` }, tx, userId);
    return { matchId: match.id, already: false };
  });
}


// ---------------------------------------------------------------------------------------------
// Mietprüfung (AC-9)
// ---------------------------------------------------------------------------------------------

/**
 * Zeitpunkt der Mietprüfung, an EINER Stelle: 24 Stunden vor Anstoß, wenn das Spiel bei der Anlage mindestens 24 Stunden Vorlauf hatte;
 * sonst 1 Stunde vor Anstoß (der Mindestvorlauf). Ein kurzfristig angelegtes Spiel wird so nie sofort abgesagt.
 */
export const RENT_CHECK_HOURS = 24;
export const RENT_CHECK_SHORT_LEAD_HOURS = 1;

export function rentCheckAt(startsAt: Date, createdAt: Date): Date {
  const leadHours = (startsAt.getTime() - createdAt.getTime()) / 3_600_000;
  const before = leadHours >= RENT_CHECK_HOURS ? RENT_CHECK_HOURS : RENT_CHECK_SHORT_LEAD_HOURS;
  return new Date(startsAt.getTime() - before * 3_600_000);
}

/**
 * Prüft Privatspiele mit Miete: Ist die Summe der tatsächlich bezahlten Anteile kleiner als die Miete, wird das Spiel abgesagt und alle
 * bekommen ihren Anteil zurück (auch offene Ansprüche von Aussteigern; die Absage nutzt dafür die vorhandene Erstattung mit festen Schlüsseln).
 * Gedeckte Spiele bleiben unverändert, kostenlose und Spiele ohne aktive Zahlungen werden nie abgesagt. Läuft im 5-Minuten-Job, je Spiel in
 * eigener Transaktion unter der Spielsperre (Zahlungen laufen unter derselben Sperre), ein Fehler bei einem Spiel stoppt die anderen nicht.
 * Idempotent: ein abgesagtes Spiel wird nicht noch einmal angefasst.
 */
export async function cancelUncoveredPrivateGames(now: Date = new Date()): Promise<number> {
  if (!(await paymentsEnabled())) return 0;
  const candidates = await db
    .select({ id: matches.id, startsAt: matches.startsAt, createdAt: matches.createdAt })
    .from(matches)
    .where(and(eq(matches.kind, "private"), inArray(matches.status, ["lobby", "confirmed"]), gt(matches.priceCents, 0), sql`${matches.startsAt} > ${now}`));
  let cancelled = 0;
  for (const c of candidates) {
    if (rentCheckAt(c.startsAt, c.createdAt).getTime() > now.getTime()) continue;
    try {
      await db.transaction(async (tx) => {
        const [m] = await tx.select().from(matches).where(eq(matches.id, c.id)).for("update");
        if (!m || m.kind !== "private" || (m.status !== "lobby" && m.status !== "confirmed") || !m.priceCents || m.priceCents <= 0) return;
        const [{ paid }] = await tx.select({ paid: sql<number>`coalesce(sum(${matchParticipants.paidCents}), 0)::int` }).from(matchParticipants).where(eq(matchParticipants.matchId, m.id));
        if (paid >= m.priceCents) return; // Miete gedeckt: nichts zu tun
        await cancelMatchTx(tx, m, null, "Die Hallenmiete war 24 Stunden vor Anstoß nicht gedeckt. Alle bekommen ihren Anteil zurück.");
        await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
        cancelled += 1;
      });
    } catch (error) {
      console.error("cancelUncoveredPrivateGames: Fehler bei Spiel", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return cancelled;
}
