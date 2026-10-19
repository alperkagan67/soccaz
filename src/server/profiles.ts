import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import { matchEvents, matchParticipants, matchResults, matches, teamMembers, teams, users } from "@/db/schema";
import { playerStats, ratingHistory, teamStats, userBadges, userReliability } from "@/db/schema-community";
import { reliabilityPercent } from "@/lib/badges";
import { ELO_MIN_GAMES_FOR_RANKING } from "@/lib/elo";
import type { Role } from "@/lib/roles";

/** Elo-Verlauf einer Person oder eines Teams: Startwert plus Wert nach jedem der letzten Spiele (älteste zuerst). */
export async function eloSeries(kind: "user" | "team", subjectId: string, limit = 20): Promise<number[]> {
  const rows = await db
    .select({ before: ratingHistory.eloBefore, after: ratingHistory.eloAfter })
    .from(ratingHistory)
    .where(and(eq(ratingHistory.kind, kind), eq(ratingHistory.subjectId, subjectId)))
    .orderBy(desc(ratingHistory.at))
    .limit(limit);
  if (rows.length === 0) return [];
  const asc = rows.reverse();
  return [asc[0].before, ...asc.map((r) => r.after)];
}

/** Direktvergleich zweier Teams aus allen gespielten, öffentlichen Spielen. */
export async function headToHead(teamId: string, otherId: string) {
  const r = rows<{ wins: number; draws: number; losses: number; gf: number; ga: number }>(
    await db.execute(sql`
      select coalesce(sum(case when (m.home_team_id = ${teamId} and r.home_score > r.away_score) or (m.away_team_id = ${teamId} and r.away_score > r.home_score) then 1 else 0 end), 0)::int as wins,
             coalesce(sum(case when r.home_score = r.away_score then 1 else 0 end), 0)::int as draws,
             coalesce(sum(case when (m.home_team_id = ${teamId} and r.home_score < r.away_score) or (m.away_team_id = ${teamId} and r.away_score < r.home_score) then 1 else 0 end), 0)::int as losses,
             coalesce(sum(case when m.home_team_id = ${teamId} then r.home_score else r.away_score end), 0)::int as gf,
             coalesce(sum(case when m.home_team_id = ${teamId} then r.away_score else r.home_score end), 0)::int as ga
      from matches m join match_results r on r.match_id = m.id
      where m.status = 'played' and m.visibility = 'public'
        and ((m.home_team_id = ${teamId} and m.away_team_id = ${otherId}) or (m.home_team_id = ${otherId} and m.away_team_id = ${teamId}))`),
  )[0];
  return { ...r, games: r.wins + r.draws + r.losses };
}

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

  const form = results.slice(0, 5).map((r) => r.outcome);
  const played = stats?.matches ?? 0;
  return {
    hidden: false as const,
    bio: user.bio,
    form,
    eloHistory: await eloSeries("user", userId),
    winRate: played ? Math.round(((stats?.wins ?? 0) / played) * 100) : null,
    goalsPerGame: played ? Math.round(((stats?.goals ?? 0) / played) * 10) / 10 : null,
    gamer: { nickname: user.nickname, accentColor: user.accentColor, shirtNumber: user.shirtNumber, favoriteClub: user.favoriteClub, strongFoot: user.strongFoot },
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

export type ScheduleRow = {
  matchId: string;
  startsAt: Date;
  status: string;
  teamName: string;
  opponentName: string;
  venue: string | null;
  schedulingOpen: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
  outcome: "W" | "D" | "L" | null;
  goals: number;
  yellow: number;
  red: number;
  mvp: boolean;
  isPrivate: boolean;
};

const HISTORY_PAGE = 10;

/**
 * Spiele einer Person: kommende (Lobby oder bestätigt) und vergangene (gespielt), neueste zuerst, seitenweise.
 * Fremde sehen nur öffentliche Spiele, die Person selbst und Plattform-Admins alle.
 */
export async function playerSchedule(userId: string, seesPrivate: boolean, page = 1) {
  await connection();
  const privacy = seesPrivate ? sql`true` : sql`m.visibility = 'public'`;
  const base = (statusFilter: ReturnType<typeof sql>, order: ReturnType<typeof sql>, limit: number, offset: number) =>
    db.execute(sql`
      select m.id as match_id, m.starts_at, m.status, m.venue_text as venue, m.scheduling_open, m.visibility = 'private' as is_private, m.mvp_user_id = ${userId} as mvp,
        t.name as team_name, o.name as opponent_name,
        case when mp.team_id = m.home_team_id then r.home_score else r.away_score end as goals_for,
        case when mp.team_id = m.home_team_id then r.away_score else r.home_score end as goals_against,
        (select count(*)::int from match_events e where e.match_id = m.id and e.user_id = ${userId} and e.type = 'goal') as goals,
        (select count(*)::int from match_events e where e.match_id = m.id and e.user_id = ${userId} and e.type = 'yellow_card') as yellow,
        (select count(*)::int from match_events e where e.match_id = m.id and e.user_id = ${userId} and e.type = 'red_card') as red
      from match_participants mp
      join matches m on m.id = mp.match_id
      join teams t on t.id = mp.team_id
      join teams o on o.id = case when mp.team_id = m.home_team_id then m.away_team_id else m.home_team_id end
      left join match_results r on r.match_id = m.id
      where mp.user_id = ${userId} and mp.team_id is not null and mp.no_show = false and ${statusFilter} and ${privacy}
      order by ${order} limit ${limit} offset ${offset}`);
  type Raw = { match_id: string; starts_at: Date; status: string; venue: string | null; scheduling_open: boolean; is_private: boolean; mvp: boolean; team_name: string; opponent_name: string; goals_for: number | null; goals_against: number | null; goals: number; yellow: number; red: number };
  const map = (r: Raw): ScheduleRow => ({
    matchId: r.match_id,
    startsAt: new Date(r.starts_at),
    status: r.status,
    teamName: r.team_name,
    opponentName: r.opponent_name,
    venue: r.venue,
    schedulingOpen: r.scheduling_open,
    goalsFor: r.goals_for,
    goalsAgainst: r.goals_against,
    outcome: r.goals_for === null || r.goals_against === null ? null : r.goals_for > r.goals_against ? "W" : r.goals_for === r.goals_against ? "D" : "L",
    goals: r.goals,
    yellow: r.yellow,
    red: r.red,
    mvp: r.mvp,
    isPrivate: r.is_private,
  });
  const upcoming = (await base(sql`m.status in ('lobby', 'confirmed') and m.starts_at > now()`, sql`m.starts_at asc`, 10, 0)).rows as Raw[];
  const past = (await base(sql`m.status = 'played'`, sql`m.starts_at desc`, HISTORY_PAGE + 1, (page - 1) * HISTORY_PAGE)).rows as Raw[];
  return { upcoming: upcoming.map(map), past: past.slice(0, HISTORY_PAGE).map(map), hasMorePast: past.length > HISTORY_PAGE, page };
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

export async function getTeamProfile(slug: string, vsTeamId?: string | null) {
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

  const form = recent.slice(0, 5).map((m) => {
    const home = m.homeId === team.id;
    const gf = (home ? m.homeScore : m.awayScore) ?? 0;
    const ga = (home ? m.awayScore : m.homeScore) ?? 0;
    return (gf > ga ? "W" : gf === ga ? "D" : "L") as "W" | "D" | "L";
  });
  const topScorers = rows<{ id: string; name: string; goals: number }>(
    await db.execute(sql`
      select u.id, u.name, count(*)::int as goals
      from match_events e join users u on u.id = e.user_id join matches m on m.id = e.match_id
      where e.type = 'goal' and e.team_id = ${team.id} and m.status = 'played' and m.visibility = 'public' and u.profile_public
      group by u.id, u.name order by goals desc, u.name limit 3`),
  );
  const played = stats?.matches ?? 0;
  return {
    team,
    form,
    topScorers,
    eloHistory: await eloSeries("team", team.id),
    winRate: played ? Math.round(((stats?.wins ?? 0) / played) * 100) : null,
    goalsPerGame: played ? Math.round(((stats?.goalsFor ?? 0) / played) * 10) / 10 : null,
    vs: vsTeamId && vsTeamId !== team.id ? await headToHead(vsTeamId, team.id) : null,
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
