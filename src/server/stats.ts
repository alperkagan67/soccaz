import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchEvents, matchParticipants, matchResults, matches, teams, users } from "@/db/schema";
import { lateCancels, matchFinalizations, mvpVotes, playerStats, ratingHistory, teamStats, userBadges, userReliability } from "@/db/schema-community";
import { BADGES, earnedBadges, type BadgeCode } from "@/lib/badges";
import { average, eloDelta, initialTeamElo, playerDelta } from "@/lib/elo";
import { audit } from "./audit";
import { teamName } from "./names";
import { notifyUsers } from "./notifications";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

export const MVP_WINDOW_HOURS = 24;
export const NO_SHOW_WINDOW_DAYS = 7;

async function ensureTeamStats(tx: Tx, teamId: string) {
  const [existing] = await tx.select().from(teamStats).where(eq(teamStats.teamId, teamId));
  if (existing) return existing;
  const [t] = await tx.select({ strength: teams.strength }).from(teams).where(eq(teams.id, teamId));
  const [row] = await tx.insert(teamStats).values({ teamId, elo: initialTeamElo(t?.strength ?? 3) }).onConflictDoNothing().returning();
  if (row) return row;
  return (await tx.select().from(teamStats).where(eq(teamStats.teamId, teamId)))[0];
}

/**
 * Rechnet ein gespieltes Spiel in Statistik, Elo, Zuverlässigkeit und Abzeichen ein. Läuft in derselben Transaktion
 * wie das Ergebnis und genau einmal pro Spiel (Marker `match_finalizations`).
 */
export async function applyMatchStats(tx: Tx, matchId: string): Promise<void> {
  const marked = await tx.insert(matchFinalizations).values({ matchId }).onConflictDoNothing().returning({ matchId: matchFinalizations.matchId });
  if (marked.length === 0) return;

  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId));
  const [result] = await tx.select().from(matchResults).where(eq(matchResults.matchId, matchId));
  if (!match || !result) return;
  const hs = result.homeScore;
  const as = result.awayScore;

  // --- Teams
  const home = await ensureTeamStats(tx, match.homeTeamId);
  const away = await ensureTeamStats(tx, match.awayTeamId);
  const dHome = eloDelta(home.elo, away.elo, hs, as);
  const outcome = (gf: number, ga: number) => (gf > ga ? "wins" : gf === ga ? "draws" : "losses");
  for (const [row, gf, ga, delta] of [[home, hs, as, dHome], [away, as, hs, -dHome]] as const) {
    const kind = outcome(gf, ga);
    await tx
      .update(teamStats)
      .set({
        matches: sql`${teamStats.matches} + 1`,
        wins: kind === "wins" ? sql`${teamStats.wins} + 1` : teamStats.wins,
        draws: kind === "draws" ? sql`${teamStats.draws} + 1` : teamStats.draws,
        losses: kind === "losses" ? sql`${teamStats.losses} + 1` : teamStats.losses,
        goalsFor: sql`${teamStats.goalsFor} + ${gf}`,
        goalsAgainst: sql`${teamStats.goalsAgainst} + ${ga}`,
        elo: row.elo + delta,
        lastPlayedAt: match.startsAt,
      })
      .where(eq(teamStats.teamId, row.teamId));
    await tx.insert(ratingHistory).values({ kind: "team", subjectId: row.teamId, matchId, eloBefore: row.elo, eloAfter: row.elo + delta });
  }

  // --- Spieler
  const players = await tx
    .select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, matchId), isNotNull(matchParticipants.teamId)));
  if (players.length === 0) {
    await tx.update(matches).set({ finalizedAt: new Date() }).where(eq(matches.id, matchId));
    return;
  }
  const ids = players.map((p) => p.userId);
  for (const id of ids) await tx.insert(playerStats).values({ userId: id }).onConflictDoNothing();
  await tx.insert(userReliability).values(ids.map((userId) => ({ userId }))).onConflictDoNothing();

  const stats = await tx.select().from(playerStats).where(inArray(playerStats.userId, ids));
  const statsOf = new Map(stats.map((s) => [s.userId, s]));
  const events = await tx.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
  const count = (userId: string, type: string) => events.filter((e) => e.userId === userId && e.type === type).length;
  const avgElo = (teamId: string) => average(players.filter((p) => p.teamId === teamId).map((p) => statsOf.get(p.userId)!.elo));

  const newBadges: { userId: string; code: BadgeCode }[] = [];
  for (const p of players) {
    const s = statsOf.get(p.userId)!;
    const isHome = p.teamId === match.homeTeamId;
    const gf = isHome ? hs : as;
    const ga = isHome ? as : hs;
    const kind = outcome(gf, ga);
    const goals = count(p.userId, "goal");
    const yellow = count(p.userId, "yellow_card");
    const red = count(p.userId, "red_card");
    const carded = yellow + red > 0;
    const delta = playerDelta(s.elo, avgElo(isHome ? match.awayTeamId : match.homeTeamId), gf, ga);

    const next = {
      matches: s.matches + 1,
      wins: s.wins + (kind === "wins" ? 1 : 0),
      goals: s.goals + goals,
      cleanStreak: carded ? 0 : s.cleanStreak + 1,
      winStreak: kind === "wins" ? s.winStreak + 1 : 0,
    };
    await tx
      .update(playerStats)
      .set({
        matches: next.matches,
        wins: next.wins,
        draws: s.draws + (kind === "draws" ? 1 : 0),
        losses: s.losses + (kind === "losses" ? 1 : 0),
        goals: next.goals,
        yellowCards: s.yellowCards + yellow,
        redCards: s.redCards + red,
        cleanStreak: next.cleanStreak,
        winStreak: next.winStreak,
        elo: s.elo + delta,
        lastPlayedAt: match.startsAt,
      })
      .where(eq(playerStats.userId, p.userId));
    await tx.insert(ratingHistory).values({ kind: "user", subjectId: p.userId, matchId, eloBefore: s.elo, eloAfter: s.elo + delta });
    await tx.update(userReliability).set({ attended: sql`${userReliability.attended} + 1` }).where(eq(userReliability.userId, p.userId));

    for (const code of earnedBadges({ ...next, mvps: s.mvps, goalsInThisMatch: goals })) newBadges.push({ userId: p.userId, code });
  }

  if (newBadges.length > 0) {
    const inserted = await tx
      .insert(userBadges)
      .values(newBadges.map((b) => ({ userId: b.userId, code: b.code, matchId })))
      .onConflictDoNothing()
      .returning({ userId: userBadges.userId, code: userBadges.code });
    for (const b of inserted) {
      await notifyUsers([b.userId], { type: "result.final", title: "Neues Abzeichen", body: `${BADGES[b.code as BadgeCode].name}: ${BADGES[b.code as BadgeCode].description}`, url: `/spieler/${b.userId}` }, tx);
    }
  }
  await tx.update(matches).set({ finalizedAt: new Date() }).where(eq(matches.id, matchId));
  await audit(null, "stats.applied", "match", matchId, { after: { players: players.length, homeEloDelta: dHome } }, tx);
}

// ---------------------------------------------------------------------------------------------
// Nicht erschienen und späte Abmeldung (Zuverlässigkeit)
// ---------------------------------------------------------------------------------------------

/** Abmeldung weniger als 24 Stunden vor dem Spiel, nachdem man schon bereit war. */
export async function recordLateCancel(tx: Tx, userId: string, matchId: string) {
  const inserted = await tx.insert(lateCancels).values({ userId, matchId }).onConflictDoNothing().returning({ userId: lateCancels.userId });
  if (inserted.length === 0) return;
  await tx.insert(userReliability).values({ userId, lateCancels: 1 }).onConflictDoUpdate({ target: userReliability.userId, set: { lateCancels: sql`${userReliability.lateCancels} + 1` } });
}

/** Team-Admin oder Plattform-Admin markiert, wer nicht erschienen ist (bis 7 Tage nach dem Spiel). */
export async function markNoShow(actorId: string, matchId: string, userId: string, value: boolean) {
  await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match || match.status !== "played") throw new DomainError("Nur bei gespielten Spielen möglich.");
    if (Date.now() - match.startsAt.getTime() > NO_SHOW_WINDOW_DAYS * 86_400_000) throw new DomainError("Das Spiel liegt zu lange zurück.");

    const [part] = await tx.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
    if (!part || !part.teamId) throw new DomainError("Dieser Spieler stand nicht auf der Liste.");
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId));
    const isAdminOfTeam = await tx.execute(sql`select 1 from team_members where team_id = ${part.teamId} and user_id = ${actorId} and role = 'admin'`);
    if (actor?.role !== "admin" && isAdminOfTeam.rows.length === 0) throw new DomainError("Nur Team-Admins können das markieren.");
    if (actorId === userId) throw new DomainError("Du kannst dich nicht selbst als nicht erschienen markieren.");
    if (part.noShow === value) return;

    await tx.update(matchParticipants).set({ noShow: value }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
    await tx.insert(userReliability).values({ userId }).onConflictDoNothing();
    await tx
      .update(userReliability)
      .set(value ? { attended: sql`greatest(${userReliability.attended} - 1, 0)`, noShows: sql`${userReliability.noShows} + 1` } : { attended: sql`${userReliability.attended} + 1`, noShows: sql`greatest(${userReliability.noShows} - 1, 0)` })
      .where(eq(userReliability.userId, userId));
    await audit(actorId, value ? "reliability.no_show" : "reliability.no_show_undo", "match", matchId, { after: { userId } }, tx);
  });
}

// ---------------------------------------------------------------------------------------------
// Spieler des Spiels
// ---------------------------------------------------------------------------------------------

export async function castMvpVote(voterId: string, matchId: string, candidateId: string) {
  if (voterId === candidateId) throw new DomainError("Du kannst nicht für dich selbst stimmen.");
  await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match || match.status !== "played" || !match.finalizedAt) throw new DomainError("Abstimmen ist erst nach dem Spiel möglich.");
    if (match.mvpClosedAt || Date.now() - match.finalizedAt.getTime() > MVP_WINDOW_HOURS * 3_600_000) throw new DomainError("Die Abstimmung ist beendet.");

    const parts = await tx
      .select({ userId: matchParticipants.userId, noShow: matchParticipants.noShow })
      .from(matchParticipants)
      .where(and(eq(matchParticipants.matchId, matchId), isNotNull(matchParticipants.teamId), inArray(matchParticipants.userId, [voterId, candidateId])));
    const voter = parts.find((p) => p.userId === voterId);
    const candidate = parts.find((p) => p.userId === candidateId);
    if (!voter || voter.noShow) throw new DomainError("Nur Mitspieler dürfen abstimmen.");
    if (!candidate || candidate.noShow) throw new DomainError("Dieser Spieler steht nicht zur Wahl.");

    await tx
      .insert(mvpVotes)
      .values({ matchId, voterId, candidateId })
      .onConflictDoUpdate({ target: [mvpVotes.matchId, mvpVotes.voterId], set: { candidateId, at: new Date() } });
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

/** Wertet beendete Abstimmungen aus: eindeutiger Sieger bekommt den Titel und ein Abzeichen, bei Gleichstand gibt es keinen. */
export async function closeMvpVoting(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MVP_WINDOW_HOURS * 3_600_000);
  const due = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.status, "played"), isNotNull(matches.finalizedAt), lt(matches.finalizedAt, cutoff), isNull(matches.mvpClosedAt)));
  let closed = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [match] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
      if (!match || match.mvpClosedAt) return;
      const tally = await tx
        .select({ candidateId: mvpVotes.candidateId, n: sql<number>`count(*)::int` })
        .from(mvpVotes)
        .where(eq(mvpVotes.matchId, id))
        .groupBy(mvpVotes.candidateId)
        .orderBy(sql`count(*) desc`);
      const winner = tally.length > 0 && (tally.length === 1 || tally[0].n > tally[1].n) ? tally[0].candidateId : null;
      await tx.update(matches).set({ mvpClosedAt: now, mvpUserId: winner }).where(eq(matches.id, id));
      if (winner) {
        await tx.insert(playerStats).values({ userId: winner }).onConflictDoNothing();
        const [s] = await tx.update(playerStats).set({ mvps: sql`${playerStats.mvps} + 1` }).where(eq(playerStats.userId, winner)).returning();
        const codes: BadgeCode[] = [];
        if (s.mvps >= 1) codes.push("mvp_1");
        if (s.mvps >= 5) codes.push("mvp_5");
        const got = await tx.insert(userBadges).values(codes.map((code) => ({ userId: winner, code, matchId: id }))).onConflictDoNothing().returning({ code: userBadges.code });
        await notifyUsers(
          [winner],
          { type: "result.final", title: "Spieler des Spiels", body: `Du wurdest bei ${await teamName(tx, match.homeTeamId)} gegen ${await teamName(tx, match.awayTeamId)} zum Spieler des Spiels gewählt${got.length ? ` und hast ein Abzeichen bekommen` : ""}.`, url: `/spiele/${id}` },
          tx,
        );
      }
      await audit(null, "mvp.closed", "match", id, { after: { winner, votes: tally.reduce((s, t) => s + t.n, 0) } }, tx);
      await tx.execute(sql`select pg_notify('lobby', ${id})`);
      closed += 1;
    });
  }
  return closed;
}
