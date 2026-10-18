import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { tournamentMatches, tournamentTeams, tournaments, type TournamentFormat } from "@/db/schema-league";
import { CITIES } from "@/lib/validation";
import { drawGroups, groupFixtures, groupName, knockout, koFromGroups, koWinner, roundRobin, splitEntryFees, standings, validateTeamCount, type Fixture, type Played } from "@/lib/tournament";
import { audit } from "./audit";
import { creditWallet, debitWallet, post } from "./ledger";
import { notifyUsers, teamAdminIds } from "./notifications";
import { getSetting } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

export const MAX_ENTRY_FEE_CENTS = 50_000;

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);

/** Provision der Plattform auf die Startgelder, in Prozent (Einstellung, Standard 10). */
export async function commissionPercent(exec: Pick<typeof db, "select"> = db): Promise<number> {
  const v = await getSetting<number>("tournament_commission_percent", 10, exec);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
}

export async function setOrganizer(actorId: string, userId: string, value: boolean) {
  const [row] = await db.update(users).set({ isOrganizer: value }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!row) throw new DomainError("Nutzer nicht gefunden.");
  await audit(actorId, value ? "organizer.grant" : "organizer.revoke", "user", userId, {});
}

export type TournamentInput = { name: string; city: string; venueText?: string; startsOn: string; format: TournamentFormat; maxTeams: number; entryFeeCents: number };

export async function createTournament(userId: string, input: TournamentInput) {
  const [u] = await db.select({ isOrganizer: users.isOrganizer, role: users.role }).from(users).where(eq(users.id, userId));
  if (!u || (!u.isOrganizer && u.role !== "admin")) throw new DomainError("Turniere dürfen nur freigeschaltete Veranstalter anlegen.");
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) throw new DomainError("Der Name braucht 3 bis 80 Zeichen.");
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  if (!isDay(input.startsOn) || input.startsOn < today()) throw new DomainError("Bitte wähle einen Tag in der Zukunft.");
  if (!["round_robin", "knockout", "groups_ko"].includes(input.format)) throw new DomainError("Ungültiges Format.");
  if (!Number.isInteger(input.maxTeams) || input.maxTeams < 2 || input.maxTeams > 32) throw new DomainError("2 bis 32 Teams.");
  const countError = validateTeamCount(input.format, input.maxTeams);
  if (countError && input.format === "groups_ko") throw new DomainError(countError);
  if (!Number.isInteger(input.entryFeeCents) || input.entryFeeCents < 0 || input.entryFeeCents > MAX_ENTRY_FEE_CENTS) throw new DomainError("Das Startgeld liegt zwischen 0 und 500 Euro.");
  const [row] = await db
    .insert(tournaments)
    .values({ organizerId: userId, name, city: input.city, venueText: input.venueText?.trim().slice(0, 120) || null, startsOn: input.startsOn, format: input.format, maxTeams: input.maxTeams, entryFeeCents: input.entryFeeCents })
    .returning();
  await audit(userId, "tournament.create", "tournament", row.id, { after: row });
  return row;
}

async function lockTournament(tx: Tx, id: string) {
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

/** Team-Admin meldet sein Team an. Das Startgeld wird sofort vom Guthaben abgebucht und liegt auf dem Turnierkonto, bis das Turnier endet. */
export async function registerTeam(userId: string, tournamentId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (t.status !== "registration") throw new DomainError("Die Anmeldung ist geschlossen.");
    if (!(await isTeamAdmin(tx, userId, teamId))) throw new DomainError("Nur Team-Admins können ihr Team anmelden.");
    const [team] = await tx.select({ archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, teamId));
    if (!team || team.archivedAt) throw new DomainError("Team nicht gefunden.");
    const [{ n }] = await tx.select({ n: count() }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId));
    if (n >= t.maxTeams) throw new DomainError("Das Turnier ist voll.");
    const [already] = await tx.select({ teamId: tournamentTeams.teamId }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId)));
    if (already) throw new DomainError("Euer Team ist schon angemeldet.");

    if (t.entryFeeCents > 0) {
      await debitWallet(tx, userId, { to: "tournament", amountCents: t.entryFeeCents, kind: "tournament_entry", tournamentId, idempotencyKey: `tournament-entry:${tournamentId}:${teamId}`, reason: `Startgeld ${t.name}`, actorId: userId });
    }
    await tx.insert(tournamentTeams).values({ tournamentId, teamId, paidBy: userId, feeCents: t.entryFeeCents });
    await audit(userId, "tournament.register", "tournament", tournamentId, { after: { teamId, fee: t.entryFeeCents } }, tx);
  });
}

async function refundEntry(tx: Tx, t: { id: string; name: string }, row: { teamId: string; paidBy: string | null; feeCents: number }, reason: string) {
  if (row.feeCents > 0 && row.paidBy) {
    await creditWallet(tx, row.paidBy, { from: "tournament", amountCents: row.feeCents, kind: "tournament_refund", tournamentId: t.id, idempotencyKey: `tournament-refund:${t.id}:${row.teamId}`, reason: `${reason}: ${t.name}` });
  }
}

export async function withdrawTeam(userId: string, tournamentId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (t.status !== "registration") throw new DomainError("Nach dem Start ist keine Abmeldung mehr möglich.");
    if (!(await isTeamAdmin(tx, userId, teamId)) && !(await canManage(tx, userId, t))) throw new DomainError("Nur Team-Admins können das Team abmelden.");
    const [row] = await tx.delete(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, teamId))).returning();
    if (!row) throw new DomainError("Das Team ist nicht angemeldet.");
    await refundEntry(tx, t, row, "Rückerstattung Startgeld");
    await audit(userId, "tournament.withdraw", "tournament", tournamentId, { after: { teamId } }, tx);
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
    await tx
      .update(tournamentMatches)
      .set({ feedsMatchId: ids.get(key(f.feeds)) ?? null, feedsSide: f.feeds.side })
      .where(eq(tournamentMatches.id, ids.get(key(f))!));
  }
}

/** Startet das Turnier: Anmeldung schließt, der Spielplan wird in der Reihenfolge der Anmeldung gesetzt. */
export async function startTournament(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann das Turnier starten.");
    if (t.status !== "registration") throw new DomainError("Das Turnier läuft schon oder ist beendet.");
    const entries = await tx.select({ teamId: tournamentTeams.teamId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId)).orderBy(asc(tournamentTeams.registeredAt));
    const ids = entries.map((e) => e.teamId);
    const problem = validateTeamCount(t.format, ids.length);
    if (problem) throw new DomainError(problem);

    const fixtures = t.format === "round_robin" ? roundRobin(ids) : t.format === "knockout" ? knockout(ids) : groupFixtures(ids).fixtures;
    await insertFixtures(tx, tournamentId, fixtures);
    await tx.update(tournaments).set({ status: "running" }).where(eq(tournaments.id, tournamentId));
    for (const id of ids) await notifyUsers(await teamAdminIds(tx, id), { type: "system", title: "Turnier gestartet", body: `${t.name}: Der Spielplan steht.`, url: `/turniere/${tournamentId}` }, tx);
    await audit(userId, "tournament.start", "tournament", tournamentId, { after: { teams: ids.length } }, tx);
  });
}

type MatchRow = typeof tournamentMatches.$inferSelect;

const played = (m: MatchRow): Played | null => (m.teamA && m.teamB && m.scoreA !== null && m.scoreB !== null ? { a: m.teamA, b: m.teamB, scoreA: m.scoreA, scoreB: m.scoreB } : null);

/** Ergebnis eintragen. Wirkt auf die Tabelle, schiebt K.-o.-Sieger weiter, baut nach der Gruppenphase die K.-o.-Runde und beendet das Turnier. */
export async function reportResult(userId: string, tournamentId: string, matchId: string, input: { scoreA: number; scoreB: number; shootoutWinner?: string | null }) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann Ergebnisse eintragen.");
    if (t.status !== "running") throw new DomainError("Das Turnier läuft nicht.");
    const [m] = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.id, matchId), eq(tournamentMatches.tournamentId, tournamentId)));
    if (!m) throw new DomainError("Spiel nicht gefunden.");
    if (!m.teamA || !m.teamB) throw new DomainError("Die Paarung steht noch nicht fest.");
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99;
    if (!ok(input.scoreA) || !ok(input.scoreB)) throw new DomainError("Bitte gib Tore von 0 bis 99 ein.");

    const isKo = m.stage.startsWith("ko:");
    let shootout: string | null = null;
    if (isKo) {
      const winner = koWinner({ a: m.teamA, b: m.teamB, scoreA: input.scoreA, scoreB: input.scoreB, shootoutWinner: input.shootoutWinner });
      if (!winner) throw new DomainError("Im K.-o.-Spiel muss es einen Sieger geben. Bei Gleichstand bitte den Sieger des Siebenmeterschießens wählen.");
      shootout = input.scoreA === input.scoreB ? winner : null;
      // Ändern geht nur, solange das Folgespiel noch nicht gespielt ist
      if (m.feedsMatchId) {
        const [next] = await tx.select({ scoreA: tournamentMatches.scoreA }).from(tournamentMatches).where(eq(tournamentMatches.id, m.feedsMatchId));
        if (next && next.scoreA !== null) throw new DomainError("Das Folgespiel ist schon gespielt. Das Ergebnis kann nicht mehr geändert werden.");
      }
      if (m.feedsMatchId && m.feedsSide) {
        await tx.update(tournamentMatches).set(m.feedsSide === "a" ? { teamA: winner } : { teamB: winner }).where(eq(tournamentMatches.id, m.feedsMatchId));
      }
    }
    await tx.update(tournamentMatches).set({ scoreA: input.scoreA, scoreB: input.scoreB, shootoutWinner: shootout, playedAt: new Date() }).where(eq(tournamentMatches.id, matchId));
    await audit(userId, "tournament.result", "tournament", tournamentId, { after: { matchId, scoreA: input.scoreA, scoreB: input.scoreB } }, tx);

    await progress(tx, t);
  });
}

/** Nach jedem Ergebnis: Gruppenphase fertig? Turnier fertig? */
async function progress(tx: Tx, t: typeof tournaments.$inferSelect) {
  const all = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
  const entries = await tx.select({ teamId: tournamentTeams.teamId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id)).orderBy(asc(tournamentTeams.registeredAt));
  const ids = entries.map((e) => e.teamId);

  if (t.format === "groups_ko") {
    const groupMatches = all.filter((m) => m.stage.startsWith("group:"));
    const hasKo = all.some((m) => m.stage.startsWith("ko:"));
    if (!hasKo && groupMatches.length > 0 && groupMatches.every((m) => played(m))) {
      const groups = drawGroups(ids);
      const tables = groups.map((members, i) => standings(members, groupMatches.filter((m) => m.stage === `group:${groupName(i)}`).map((m) => played(m)!)).map((r) => r.teamId));
      await insertFixtures(tx, t.id, koFromGroups(tables));
      for (const id of ids) await notifyUsers(await teamAdminIds(tx, id), { type: "system", title: "K.-o.-Runde steht", body: `${t.name}: Die Gruppenphase ist beendet, die K.-o.-Runde beginnt.`, url: `/turniere/${t.id}` }, tx);
      return;
    }
  }

  let winnerId: string | null = null;
  if (t.format === "round_robin") {
    if (all.length > 0 && all.every((m) => played(m))) winnerId = standings(ids, all.map((m) => played(m)!))[0].teamId;
  } else {
    const ko = all.filter((m) => m.stage.startsWith("ko:"));
    if (ko.length > 0 && ko.every((m) => played(m))) {
      const final = ko.reduce((best, m) => (Number(m.stage.slice(3)) < Number(best.stage.slice(3)) ? m : best));
      winnerId = koWinner({ a: final.teamA!, b: final.teamB!, scoreA: final.scoreA!, scoreB: final.scoreB!, shootoutWinner: final.shootoutWinner });
    }
  }
  if (winnerId) await finishTournament(tx, t, winnerId, ids);
}

async function finishTournament(tx: Tx, t: typeof tournaments.$inferSelect, winnerId: string, teamIds: string[]) {
  await tx.update(tournaments).set({ status: "finished", winnerTeamId: winnerId }).where(eq(tournaments.id, t.id));
  await settle(tx, t);
  const [winner] = await tx.select({ name: teams.name }).from(teams).where(eq(teams.id, winnerId));
  for (const id of teamIds) {
    await notifyUsers(await teamAdminIds(tx, id), { type: "system", title: "Turnier beendet", body: id === winnerId ? `Ihr habt ${t.name} gewonnen. Glückwunsch!` : `${t.name} ist beendet. Sieger: ${winner?.name ?? "–"}.`, url: `/turniere/${t.id}` }, tx);
  }
}

/** Zahlt den Veranstalter aus (Startgelder abzüglich Provision) und verbucht die Provision als Umsatz. Genau einmal pro Turnier. */
async function settle(tx: Tx, t: typeof tournaments.$inferSelect) {
  const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${tournamentTeams.feeCents}), 0)`.mapWith(Number) }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  const { commission, payout } = splitEntryFees(total, await commissionPercent(tx));
  if (payout > 0) await creditWallet(tx, t.organizerId, { from: "tournament", amountCents: payout, kind: "tournament_payout", tournamentId: t.id, idempotencyKey: `tournament-payout:${t.id}`, reason: `Auszahlung Startgelder ${t.name}` });
  if (commission > 0) await post(tx, { debit: { account: "tournament" }, credit: { account: "revenue" }, amountCents: commission, kind: "tournament_commission", tournamentId: t.id, idempotencyKey: `tournament-commission:${t.id}`, reason: `Provision ${t.name}` });
  await tx.update(tournaments).set({ settledAt: new Date() }).where(eq(tournaments.id, t.id));
  await audit(null, "tournament.settle", "tournament", t.id, { after: { total, commission, payout } }, tx);
}

/** Absagen: alle Startgelder gehen zurück. Nur möglich, solange noch kein Ergebnis eingetragen ist. */
export async function cancelTournament(userId: string, tournamentId: string) {
  await db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId);
    if (!(await canManage(tx, userId, t))) throw new DomainError("Nur der Veranstalter kann absagen.");
    if (t.status === "finished" || t.status === "cancelled") throw new DomainError("Das Turnier ist schon beendet oder abgesagt.");
    const results = await tx.select({ id: tournamentMatches.id }).from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), sql`${tournamentMatches.scoreA} is not null`)).limit(1);
    if (results.length > 0) throw new DomainError("Es gibt schon Ergebnisse. Bitte wende dich an die Plattform.");
    const entries = await tx.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId));
    for (const e of entries) {
      await refundEntry(tx, t, e, "Rückerstattung abgesagtes Turnier");
      await notifyUsers(await teamAdminIds(tx, e.teamId), { type: "system", title: "Turnier abgesagt", body: `${t.name} findet nicht statt. Das Startgeld wurde erstattet.`, url: `/turniere/${tournamentId}` }, tx);
    }
    await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
    await tx.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, tournamentId));
    await audit(userId, "tournament.cancel", "tournament", tournamentId, { after: { refunded: entries.length } }, tx);
  });
}

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

export async function listTournaments(filter: { city?: string } = {}) {
  await connection();
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
      teams: sql<number>`(select count(*)::int from tournament_teams x where x.tournament_id = ${tournaments.id})`,
    })
    .from(tournaments)
    .where(and(inArray(tournaments.status, ["registration", "running", "finished"]), filter.city ? eq(tournaments.city, filter.city) : undefined))
    .orderBy(sql`${tournaments.status} = 'finished'`, desc(tournaments.startsOn))
    .limit(50);
}

export async function myTournaments(userId: string) {
  return db.select({ id: tournaments.id, name: tournaments.name, status: tournaments.status, startsOn: tournaments.startsOn }).from(tournaments).where(eq(tournaments.organizerId, userId)).orderBy(desc(tournaments.createdAt)).limit(30);
}

export async function getTournament(id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) return null;
  const [organizer] = await db.select({ name: users.name }).from(users).where(eq(users.id, t.organizerId));
  const entries = await db
    .select({ teamId: teams.id, name: teams.name, slug: teams.slug })
    .from(tournamentTeams)
    .innerJoin(teams, eq(teams.id, tournamentTeams.teamId))
    .where(eq(tournamentTeams.tournamentId, id))
    .orderBy(asc(tournamentTeams.registeredAt));
  const matchRows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id)).orderBy(asc(tournamentMatches.stage), asc(tournamentMatches.round), asc(tournamentMatches.slot));
  const nameOf = new Map(entries.map((e) => [e.teamId, e.name]));

  const ids = entries.map((e) => e.teamId);
  const results = (rows: MatchRow[]) => rows.map(played).filter((p): p is Played => p !== null);
  const tables =
    t.format === "round_robin"
      ? [{ name: "Tabelle", rows: standings(ids, results(matchRows)) }]
      : t.format === "groups_ko"
        ? drawGroups(ids).map((members, i) => ({ name: `Gruppe ${groupName(i)}`, rows: standings(members, results(matchRows.filter((m) => m.stage === `group:${groupName(i)}`))) }))
        : [];
  const stages = [...new Set(matchRows.map((m) => m.stage))].sort((a, b) => {
    const rank = (s: string) => (s.startsWith("group:") ? 0 : s === "round" ? 0 : 100 - Number(s.slice(3)));
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return {
    tournament: t,
    organizerName: organizer?.name ?? "–",
    entries,
    stages: stages.map((stage) => ({ stage, matches: matchRows.filter((m) => m.stage === stage).map((m) => ({ ...m, nameA: m.teamA ? nameOf.get(m.teamA) ?? "?" : null, nameB: m.teamB ? nameOf.get(m.teamB) ?? "?" : null })) })),
    tables: tables.map((tb) => ({ ...tb, rows: tb.rows.map((r) => ({ ...r, name: nameOf.get(r.teamId) ?? "?", slug: entries.find((e) => e.teamId === r.teamId)?.slug ?? "" })) })),
    winner: t.winnerTeamId ? (nameOf.get(t.winnerTeamId) ?? null) : null,
  };
}
