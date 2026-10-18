import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matchParticipants, matches, teams, users } from "@/db/schema";

export async function getLobby(matchId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  const home = alias(teams, "home");
  const away = alias(teams, "away");

  const [match] = await db
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      durationMin: matches.durationMin,
      venueText: matches.venueText,
      visibility: matches.visibility,
      status: matches.status,
      homeId: home.id,
      homeName: home.name,
      homeSlug: home.slug,
      awayId: away.id,
      awayName: away.name,
      awaySlug: away.slug,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(eq(matches.id, matchId));
  if (!match) return null;

  const participants = await db
    .select({
      userId: users.id,
      name: users.name,
      teamId: matchParticipants.teamId,
      isSubstitute: matchParticipants.isSubstitute,
      readyAt: matchParticipants.readyAt,
    })
    .from(matchParticipants)
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(asc(matchParticipants.joinedAt));

  return { match, participants };
}
