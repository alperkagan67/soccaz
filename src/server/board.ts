import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matchRequests, matches, teams, users } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { initialTeamElo, expectedScore } from "@/lib/elo";
import { lightFor, type Light } from "@/components/PlayerLight";
import { isSubstituteByRank } from "@/lib/lobby-rules";
import { berlinDayRange } from "@/lib/time";
import { listOpenSearches } from "./matchmaking";
import { teamRoster } from "./roster";

export type BoardTeam = { id: string; name: string; slug: string; city: string; elo: number; playedMatches: number; strength: number; verified: boolean; members: number };
export type BoardPlayer = { userId: string; name: string; light: Light; isSubstitute: boolean; isPro: boolean };
export type RosterEntry = { userId: string; name: string; position: string | null; elo: number | null; isAdmin: boolean };

export type BoardMatch = {
  kind: "match";
  number: number;
  id: string;
  startsAt: Date;
  schedulingOpen: boolean;
  vetoRunning: boolean;
  durationMin: number;
  venue: string | null;
  confirmed: boolean;
  challengePending: boolean;
  home: BoardTeam;
  away: BoardTeam;
  homePlayers: BoardPlayer[];
  awayPlayers: BoardPlayer[];
  winChanceHome: number;
  readyHome: number;
  readyAway: number;
  freeHome: number;
  freeAway: number;
  strangers: number;
};

export type BoardSearch = {
  kind: "search";
  sub: "queue" | "request" | "challenge";
  target: BoardTeam | null; // bei Herausforderungen das herausgeforderte Team
  number: number;
  id: string;
  team: BoardTeam;
  roster: RosterEntry[];
  city: string;
  durationMin: number;
  startsAt: Date | null; // Spielsuche mit festem Termin
  windows: { from: string; to: string }[]; // Matchmaking: Zeitfenster
  note: string | null;
  wantStrengthMin: number | null;
  wantStrengthMax: number | null;
  createdAt: Date;
};

export type BoardEntry = BoardMatch | BoardSearch;

const MAX_PER_TEAM = 6; // 5 Spieler plus 1 Ersatz

async function teamInfo(ids: string[]): Promise<Map<string, BoardTeam>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      city: teams.city,
      strength: teams.strength,
      verified: teams.isVerified,
      elo: teamStats.elo,
      played: teamStats.matches,
      members: sql<number>`(select count(*)::int from team_members m where m.team_id = ${teams.id})`,
    })
    .from(teams)
    .leftJoin(teamStats, eq(teamStats.teamId, teams.id))
    .where(inArray(teams.id, ids));
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, slug: r.slug, city: r.city, strength: r.strength, verified: r.verified, elo: r.elo ?? initialTeamElo(r.strength), playedMatches: r.played ?? 0, members: r.members }]));
}

/**
 * Alle offenen Lobbys und Suchen, öffentlich einsehbar: laufende Lobbys mit Spielern und Ampel, Teams im Matchmaking
 * und Spielsuchen mit festem Termin. Sortiert nach Anstoß (Suchen ohne Termin am Ende, älteste zuerst).
 */
export type BoardFilter = { city?: string; durationMin?: number; kind?: "match" | "search"; date?: string; minStrength?: number; maxStrength?: number };

export async function listBoard(filter: BoardFilter = {}): Promise<BoardEntry[]> {
  await connection();
  const day = filter.date ? berlinDayRange(filter.date) : null;
  const strengthOk = (s: number) => (filter.minStrength === undefined || s >= filter.minStrength) && (filter.maxStrength === undefined || s <= filter.maxStrength);
  const out: BoardEntry[] = [];

  if (filter.kind !== "search") {
    const rows = await db
      .select()
      .from(matches)
      .where(and(eq(matches.visibility, "public"), inArray(matches.status, ["lobby", "confirmed"]), or(gt(matches.startsAt, new Date()), eq(matches.schedulingOpen, true)), filter.durationMin ? eq(matches.durationMin, filter.durationMin) : undefined))
      .orderBy(asc(matches.startsAt))
      .limit(60);
    const ids = [...new Set(rows.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
    const info = await teamInfo(ids);
    const parts = rows.length
      ? await db
          .select({ matchId: matchParticipants.matchId, teamId: matchParticipants.teamId, userId: users.id, name: users.name, pro: users.isVerifiedPro, fromOutside: matchParticipants.isSubstitute, readyAt: matchParticipants.readyAt, paid: matchParticipants.paidCents })
          .from(matchParticipants)
          .innerJoin(users, eq(users.id, matchParticipants.userId))
          .where(inArray(matchParticipants.matchId, rows.map((m) => m.id)))
          .orderBy(asc(matchParticipants.joinedAt), asc(users.name))
      : [];
    for (const m of rows) {
      const home = info.get(m.homeTeamId)!;
      const away = info.get(m.awayTeamId)!;
      if (filter.city && home.city !== filter.city && away.city !== filter.city) continue;
      if (day && !(m.startsAt >= day.from && m.startsAt < day.to)) continue;
      const confirmed = m.status === "confirmed";
      const players = (teamId: string): BoardPlayer[] => {
        let rank = 0;
        return parts
          .filter((p) => p.matchId === m.id && p.teamId === teamId)
          .map((p) => {
            const isSubstitute = isSubstituteByRank(rank, p.fromOutside);
            rank += 1;
            return { userId: p.userId, name: p.name, light: lightFor({ ready: p.readyAt !== null, paid: p.paid > 0 }, confirmed), isSubstitute, isPro: p.pro };
          });
      };
      const homePlayers = players(home.id);
      const awayPlayers = players(away.id);
      out.push({
        kind: "match",
        number: m.number,
        id: m.id,
        startsAt: m.startsAt,
        schedulingOpen: m.schedulingOpen,
        vetoRunning: m.vetoStatus === "running",
        durationMin: m.durationMin,
        venue: m.venueText,
        confirmed,
        challengePending: m.challengeStatus === "pending",
        home,
        away,
        homePlayers,
        awayPlayers,
        winChanceHome: Math.round(expectedScore(home.elo, away.elo) * 100),
        readyHome: homePlayers.filter((p) => p.light !== "red").length,
        readyAway: awayPlayers.filter((p) => p.light !== "red").length,
        freeHome: Math.max(MAX_PER_TEAM - homePlayers.length, 0),
        freeAway: Math.max(MAX_PER_TEAM - awayPlayers.length, 0),
        strangers: parts.filter((p) => p.matchId === m.id && p.teamId === null).length,
      });
    }
  }

  if (filter.kind !== "match") {
    const queue = await listOpenSearches({ city: filter.city, durationMin: filter.durationMin });
    const requests = await db
      .select({ id: matchRequests.id, number: matchRequests.number, teamId: matchRequests.teamId, targetTeamId: matchRequests.targetTeamId, city: matchRequests.city, startsAt: matchRequests.startsAt, durationMin: matchRequests.durationMin, note: matchRequests.note, createdAt: matchRequests.createdAt, strength: matchRequests.strength })
      .from(matchRequests)
      .where(and(eq(matchRequests.status, "open"), or(and(eq(matchRequests.visibility, "public"), isNull(matchRequests.targetTeamId)), isNotNull(matchRequests.targetTeamId)), gt(matchRequests.startsAt, new Date()), day ? and(gte(matchRequests.startsAt, day.from), lt(matchRequests.startsAt, day.to)) : undefined, filter.city ? eq(matchRequests.city, filter.city) : undefined, filter.durationMin ? eq(matchRequests.durationMin, filter.durationMin) : undefined))
      .orderBy(asc(matchRequests.startsAt))
      .limit(60);
    const info = await teamInfo([...new Set([...queue.map((q) => q.teamId), ...requests.flatMap((r) => (r.targetTeamId ? [r.teamId, r.targetTeamId] : [r.teamId]))])]);
    const rosterOf = async (teamId: string): Promise<RosterEntry[]> => (await teamRoster(teamId)).map((m) => ({ userId: m.userId, name: m.name, position: m.position, elo: m.elo, isAdmin: m.isAdmin }));
    for (const q of queue) {
      const team = info.get(q.teamId)!;
      if (!strengthOk(team.strength)) continue;
      if (day && !q.windows.some((w) => new Date(w.from) < day.to && new Date(w.to) > day.from)) continue;
      out.push({ kind: "search", sub: "queue", target: null, number: q.number, id: q.id, team, roster: await rosterOf(q.teamId), city: q.city, durationMin: q.durationMin, startsAt: null, windows: q.windows, note: q.note, wantStrengthMin: q.wantStrengthMin, wantStrengthMax: q.wantStrengthMax, createdAt: q.createdAt });
    }
    for (const r of requests) {
      const team = info.get(r.teamId)!;
      if (!strengthOk(r.strength)) continue;
      out.push({ kind: "search", sub: r.targetTeamId ? "challenge" : "request", target: r.targetTeamId ? (info.get(r.targetTeamId) ?? null) : null, number: r.number, id: r.id, team, roster: await rosterOf(r.teamId), city: r.city, durationMin: r.durationMin, startsAt: r.startsAt, windows: [], note: r.note, wantStrengthMin: r.strength, wantStrengthMax: r.strength, createdAt: r.createdAt });
    }
  }

  const when = (e: BoardEntry) => (e.kind === "match" ? e.startsAt.getTime() : e.startsAt ? e.startsAt.getTime() : Number.MAX_SAFE_INTEGER);
  return out.sort((a, b) => when(a) - when(b) || (a.kind === "search" && b.kind === "search" ? a.createdAt.getTime() - b.createdAt.getTime() : 0));
}
