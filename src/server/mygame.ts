import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams } from "@/db/schema";
import { matchmakingQueue } from "@/db/schema-matchmaking";

export type MyGame = {
  kind: "game";
  id: string;
  number: number;
  home: string;
  away: string;
  startsAt: Date;
  timeOpen: boolean;
  phase: string; // kurzer Satz: Was ist gerade dran?
  captain: boolean; // der Betrachter ist Captain eines der Teams
  confirmed: boolean;
};
export type MyOpenLobby = { kind: "open"; id: string; number: number; team: string; teamId: string; windows: { from: string; to: string }[]; durationMin: number };

/** Spiele und offene Lobbys der Person: als Spieler eingetragen oder im Kader eines der beiden Teams. */
export async function myCurrent(userId: string): Promise<{ games: MyGame[]; open: MyOpenLobby[] }> {
  await connection();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const rows = await db
    .select({ id: matches.id, number: matches.number, startsAt: matches.startsAt, schedulingOpen: matches.schedulingOpen, challengeStatus: matches.challengeStatus, vetoStatus: matches.vetoStatus, status: matches.status, homeId: matches.homeTeamId, awayId: matches.awayTeamId, homeName: home.name, awayName: away.name })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(
      and(
        inArray(matches.status, ["lobby", "confirmed"]),
        or(
          sql`exists (select 1 from ${matchParticipants} p where p.match_id = ${matches.id} and p.user_id = ${userId})`,
          sql`exists (select 1 from ${teamMembers} t where t.user_id = ${userId} and t.team_id in (${matches.homeTeamId}, ${matches.awayTeamId}))`,
        ),
      ),
    )
    .orderBy(asc(matches.startsAt))
    .limit(10);
  const adminOf = new Set(
    (await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin")))).map((r) => r.teamId),
  );
  const games: MyGame[] = rows.map((m) => {
    const captain = adminOf.has(m.homeId) || adminOf.has(m.awayId);
    const phase =
      m.challengeStatus === "pending"
        ? adminOf.has(m.awayId) ? "Ihr wurdet herausgefordert: annehmen oder ablehnen" : "Wartet auf die Antwort des herausgeforderten Teams"
        : m.schedulingOpen
          ? captain ? "Uhrzeit wählen: Der Captain stimmt ab" : "Die Captains wählen die Uhrzeit"
          : m.vetoStatus === "halls"
            ? "Die Hallen werden angefragt"
            : m.vetoStatus === "running"
              ? captain ? "Hallen-Veto läuft: Der Captain bannt" : "Hallen-Veto läuft"
              : m.status === "confirmed" ? "Bestätigt: Das Spiel steht" : "Bereit machen und bezahlen";
    return { kind: "game", id: m.id, number: m.number, home: m.homeName, away: m.awayName, startsAt: m.startsAt, timeOpen: m.schedulingOpen, phase, captain, confirmed: m.status === "confirmed" };
  });
  const open = await db
    .select({ id: matchmakingQueue.id, number: matchmakingQueue.number, team: teams.name, teamId: teams.id, windows: matchmakingQueue.windows, durationMin: matchmakingQueue.durationMin })
    .from(matchmakingQueue)
    .innerJoin(teams, eq(teams.id, matchmakingQueue.teamId))
    .innerJoin(teamMembers, and(eq(teamMembers.teamId, matchmakingQueue.teamId), eq(teamMembers.userId, userId)))
    .where(and(eq(matchmakingQueue.status, "waiting"), sql`${matchmakingQueue.expiresAt} >= now()`))
    .orderBy(asc(matchmakingQueue.createdAt));
  return { games, open: open.map((o) => ({ kind: "open" as const, ...o })) };
}
