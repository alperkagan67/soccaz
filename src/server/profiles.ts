import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import { matchEvents, matchParticipants, matchResults, matches, teamMembers, teams, users } from "@/db/schema";
import { playerStats, teamStats, userBadges, userReliability } from "@/db/schema-community";
import { reliabilityPercent } from "@/lib/badges";
import { ELO_MIN_GAMES_FOR_RANKING } from "@/lib/elo";
import type { Role } from "@/lib/roles";

export type Viewer = { id: string; role: Role } | null;
const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];
const likeTerm = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export type PlayerResultRow = { matchId: string; startsAt: Date; teamName: string; opponentName: string; goalsFor: number; goalsAgainst: number; outcome: "W" | "D" | "L"; goals: number };

/** Kann diese Person Zuverlässigkeit sehen? Nur man selbst, Plattform-Admins und Admins eines Teams des Spielers. */
async function canSeeReliability(viewer: Viewer, userId: string): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.id === userId || viewer.role === "admin") return true;
  const r = await db.execute(sql`select 1 from team_members a join team_members b on b.team_id = a.team_id where a.user_id = ${viewer.id} and a.role = 'admin' and b.user_id = ${userId} limit 1`);
  return r.rows.length > 0;
}

export async function getPlayerProfile(userId: string, viewer: Viewer) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.bannedAt || !user.onboardedAt) return null;
  const isSelf = viewer?.id === user.id;
  const isAdmin = viewer?.role === "admin";
  if (!user.profilePublic && !isSelf && !isAdmin) return { hidden: true as const, name: user.name };

  const [stats] = await db.select().from(playerStats).where(eq(playerStats.userId, userId));
  const badges = await db.select({ code: userBadges.code, awardedAt: userBadges.awardedAt }).from(userBadges).where(eq(userBadges.userId, userId)).orderBy(desc(userBadges.awardedAt));
  const myTeams = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug, role: teamMembers.role, isVerified: teams.isVerified })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, userId), isNull(teams.archivedAt)))
    .orderBy(asc(teams.name));

  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const recent = await db
    .select({
      matchId: matches.id,
      startsAt: matches.startsAt,
      homeId: matches.homeTeamId,
      homeName: home.name,
      awayName: away.name,
      homeScore: matchResults.homeScore,
      awayScore: matchResults.awayScore,
      teamId: matchParticipants.teamId,
      goals: sql<number>`(select count(*)::int from ${matchEvents} e where e.match_id = ${matches.id} and e.user_id = ${userId} and e.type = 'goal')`,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .innerJoin(matchResults, eq(matchResults.matchId, matches.id))
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(and(eq(matchParticipants.userId, userId), eq(matches.status, "played"), eq(matches.visibility, "public"), eq(matchParticipants.noShow, false)))
    .orderBy(desc(matches.startsAt))
    .limit(10);
  const results: PlayerResultRow[] = recent.map((r) => {
    const isHome = r.teamId === r.homeId;
    const gf = isHome ? r.homeScore : r.awayScore;
    const ga = isHome ? r.awayScore : r.homeScore;
    return { matchId: r.matchId, startsAt: r.startsAt, teamName: isHome ? r.homeName : r.awayName, opponentName: isHome ? r.awayName : r.homeName, goalsFor: gf, goalsAgainst: ga, outcome: gf > ga ? "W" : gf === ga ? "D" : "L", goals: r.goals };
  });

  let rank: number | null = null;
  if (stats && stats.matches >= ELO_MIN_GAMES_FOR_RANKING) {
    const [r] = rows<{ n: number }>(
      await db.execute(sql`select count(*)::int + 1 as n from player_stats s join users u on u.id = s.user_id where s.matches >= ${ELO_MIN_GAMES_FOR_RANKING} and s.elo > ${stats.elo} and u.profile_public and u.banned_at is null and u.city is not distinct from ${user.city}`),
    );
    rank = r.n;
  }

  let reliability: number | null | undefined;
  if (await canSeeReliability(viewer, userId)) {
    const [rel] = await db.select().from(userReliability).where(eq(userReliability.userId, userId));
    reliability = rel ? reliabilityPercent(rel) : null;
  }

  return {
    hidden: false as const,
    user: { id: user.id, name: user.name, city: user.city, position: user.position, avatarUrl: user.avatarUrl, isVerifiedPro: user.isVerifiedPro, createdAt: user.createdAt, profilePublic: user.profilePublic },
    stats: stats ?? { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, yellowCards: 0, redCards: 0, mvps: 0, elo: 1000, cleanStreak: 0, winStreak: 0 },
    badges,
    teams: myTeams,
    results,
    cityRank: rank,
    reliability,
    isSelf,
  };
}

export async function listPlayers(filter: { q?: string; city?: string; page?: number }) {
  await connection();
  const page = Math.max(1, filter.page ?? 1);
  const list = await db
    .select({ id: users.id, name: users.name, city: users.city, position: users.position, isVerifiedPro: users.isVerifiedPro, matches: playerStats.matches, goals: playerStats.goals, elo: playerStats.elo })
    .from(users)
    .leftJoin(playerStats, eq(playerStats.userId, users.id))
    .where(and(eq(users.profilePublic, true), isNull(users.bannedAt), sql`${users.onboardedAt} is not null`, filter.city ? eq(users.city, filter.city) : undefined, filter.q ? or(ilike(users.name, likeTerm(filter.q))) : undefined))
    .orderBy(desc(sql`coalesce(${playerStats.matches}, 0)`), asc(users.name))
    .limit(31)
    .offset((page - 1) * 30);
  return { rows: list.slice(0, 30), hasMore: list.length > 30, page };
}

export async function getTeamProfile(slug: string) {
  await connection();
  const [team] = await db.select().from(teams).where(eq(teams.slug, slug));
  if (!team || team.archivedAt) return null;
  const [stats] = await db.select().from(teamStats).where(eq(teamStats.teamId, team.id));

  let cityRank: number | null = null;
  if (stats && stats.matches >= ELO_MIN_GAMES_FOR_RANKING) {
    const [r] = rows<{ n: number }>(
      await db.execute(sql`select count(*)::int + 1 as n from team_stats s join teams t on t.id = s.team_id where s.matches >= ${ELO_MIN_GAMES_FOR_RANKING} and s.elo > ${stats.elo} and t.city = ${team.city} and t.archived_at is null`),
    );
    cityRank = r.n;
  }

  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const base = db
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      status: matches.status,
      homeId: matches.homeTeamId,
      homeName: home.name,
      homeSlug: home.slug,
      awayName: away.name,
      awaySlug: away.slug,
      homeScore: matchResults.homeScore,
      awayScore: matchResults.awayScore,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .leftJoin(matchResults, eq(matchResults.matchId, matches.id));
  const mine = or(eq(matches.homeTeamId, team.id), eq(matches.awayTeamId, team.id));
  const recent = await base.where(and(mine, eq(matches.status, "played"), eq(matches.visibility, "public"))).orderBy(desc(matches.startsAt)).limit(8);
  const upcoming = await base
    .where(and(mine, eq(matches.status, "confirmed"), eq(matches.visibility, "public"), gte(matches.startsAt, new Date())))
    .orderBy(asc(matches.startsAt))
    .limit(5);

  return {
    team,
    stats: stats ?? { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, elo: 0 },
    hasStats: Boolean(stats),
    cityRank,
    recent,
    upcoming,
  };
}

// ---------------------------------------------------------------------------------------------
// Ranglisten
// ---------------------------------------------------------------------------------------------

export async function leaderboards(filter: { city?: string; monthStart: Date; monthEnd: Date }) {
  await connection();
  const city = filter.city ?? null;
  const monthly = rows<{ id: string; name: string; slug: string; city: string; played: number; wins: number; draws: number; losses: number; gd: number; gf: number; points: number }>(
    await db.execute(sql`
      with m as (
        select mt.home_team_id as team_id, r.home_score as gf, r.away_score as ga from matches mt join match_results r on r.match_id = mt.id
          where mt.status = 'played' and mt.starts_at >= ${filter.monthStart} and mt.starts_at < ${filter.monthEnd}
        union all
        select mt.away_team_id, r.away_score, r.home_score from matches mt join match_results r on r.match_id = mt.id
          where mt.status = 'played' and mt.starts_at >= ${filter.monthStart} and mt.starts_at < ${filter.monthEnd}
      )
      select t.id, t.name, t.slug, t.city, count(*)::int as played,
        sum(case when m.gf > m.ga then 1 else 0 end)::int as wins,
        sum(case when m.gf = m.ga then 1 else 0 end)::int as draws,
        sum(case when m.gf < m.ga then 1 else 0 end)::int as losses,
        sum(m.gf - m.ga)::int as gd, sum(m.gf)::int as gf,
        sum(case when m.gf > m.ga then 3 when m.gf = m.ga then 1 else 0 end)::int as points
      from m join teams t on t.id = m.team_id
      where t.archived_at is null and (${city}::text is null or t.city = ${city})
      group by t.id, t.name, t.slug, t.city
      order by points desc, gd desc, gf desc, t.name asc limit 30`),
  );

  const teamElo = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug, city: teams.city, elo: teamStats.elo, matches: teamStats.matches, wins: teamStats.wins })
    .from(teamStats)
    .innerJoin(teams, eq(teams.id, teamStats.teamId))
    .where(and(gte(teamStats.matches, ELO_MIN_GAMES_FOR_RANKING), isNull(teams.archivedAt), city ? eq(teams.city, city) : undefined))
    .orderBy(desc(teamStats.elo), asc(teams.name))
    .limit(30);

  const playerBase = db
    .select({ id: users.id, name: users.name, city: users.city, isVerifiedPro: users.isVerifiedPro, elo: playerStats.elo, matches: playerStats.matches, goals: playerStats.goals })
    .from(playerStats)
    .innerJoin(users, eq(users.id, playerStats.userId));
  const visible = and(eq(users.profilePublic, true), isNull(users.bannedAt), city ? eq(users.city, city) : undefined);
  const scorers = await playerBase.where(and(visible, gte(playerStats.goals, 1))).orderBy(desc(playerStats.goals), asc(users.name)).limit(20);
  const playerElo = await playerBase.where(and(visible, gte(playerStats.matches, ELO_MIN_GAMES_FOR_RANKING))).orderBy(desc(playerStats.elo), asc(users.name)).limit(20);

  return { monthly, teamElo, scorers, playerElo };
}
