import { and, asc, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";

export type MyChargeFailure = { matchId: string; number: number };

/**
 * Fehlgeschlagene Abbuchungen der PERSON SELBST in kommenden Spielen (Fehlerzustand auf `/app`, N4-FZ-1): nur der eigene Platz, nie der eines anderen.
 * Dritte sehen nie einen Zahlstatus (012 AC-12/AC-20); der Captain sieht die Betroffenen seines Teams in der Lobby, nicht hier. Nur Lesen.
 */
export async function myChargeFailures(userId: string): Promise<MyChargeFailure[]> {
  await connection();
  return db
    .select({ matchId: matches.id, number: matches.number })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(eq(matchParticipants.userId, userId), eq(matchParticipants.cardStatus, "failed"), inArray(matches.status, ["lobby", "confirmed"])))
    .orderBy(asc(matches.startsAt));
}
