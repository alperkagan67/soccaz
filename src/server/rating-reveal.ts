import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, teams, users } from "@/db/schema";
import { ratingHistory } from "@/db/schema-community";
import { RATING, playerCardFor, type PlayerCardData } from "@/lib/player-card";
import type { RevealSide } from "@/lib/rating-reveal";
import { ratingFromElo, tierFromRating } from "@/lib/rating";

/**
 * Wertungsänderung nach einem bestätigten Ergebnis (Vertrag 013 v3, AC-20), NUR für den Betrachter selbst (AC-17: kein Aufdecken fremder Änderungen).
 * Gibt null, wenn: nicht angemeldet, das Spiel nicht "played" ist, der Betrachter nicht eingeteilt war oder nicht erschienen ist, oder es für ihn keine Verlaufszeile gibt
 * (Privatspiele zählen nicht für Elo). Keine rohe Elo, keine fremden Daten: nur Wertung und Stufe vorher und nachher plus die schon gefilterte Karte des Betrachters.
 */
export type RatingReveal = { before: RevealSide; after: RevealSide; card: PlayerCardData };

export async function getRatingReveal(matchId: string, viewerId: string | null | undefined): Promise<RatingReveal | null> {
  if (typeof viewerId !== "string" || viewerId === "") return null;
  const [m] = await db.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId));
  if (!m || m.status !== "played") return null;
  const [mine] = await db
    .select({ name: users.name, position: users.position, noShow: matchParticipants.noShow, teamColor: teams.color, teamSlug: teams.slug })
    .from(matchParticipants)
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .innerJoin(teams, eq(teams.id, matchParticipants.teamId))
    .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, viewerId), isNotNull(matchParticipants.teamId)));
  if (!mine || mine.noShow) return null;
  const [h] = await db
    .select({ before: ratingHistory.eloBefore, after: ratingHistory.eloAfter })
    .from(ratingHistory)
    .where(and(eq(ratingHistory.kind, "user"), eq(ratingHistory.subjectId, viewerId), eq(ratingHistory.matchId, matchId)))
    .orderBy(desc(ratingHistory.at), desc(ratingHistory.id)) // deterministisch, falls je eine Dublette entstünde: die jüngste Zeile gilt
    .limit(1);
  if (!h) return null;
  const side = (elo: number): RevealSide => {
    const rating = ratingFromElo(elo);
    return { rating, tier: tierFromRating(rating) };
  };
  const card = playerCardFor({ kind: "member" }, { name: mine.name, elo: h.after, position: mine.position, teamColor: mine.teamColor, teamSlug: mine.teamSlug }, RATING);
  return { before: side(h.before), after: side(h.after), card };
}
