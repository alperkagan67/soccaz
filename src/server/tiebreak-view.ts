import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { tournamentMatches } from "@/db/schema-league";
import { tieOffen } from "@/lib/tiebreak-regeln";

/**
 * Offener Gleichstand für die Spielseite (PR 1b): zum Spiel (matches.id) das zugehörige K.-o.-Turnierspiel, falls es unentschieden und noch NICHT entschieden ist
 * (gleiche Regel wie der Server decideTie). Nur Anzeigedaten (Teamnamen, Stand), keine Personen. null = nichts zu entscheiden.
 */
export async function tieOffenFuerSpiel(matchId: string) {
  const ta = alias(teams, "tie_ta");
  const tb = alias(teams, "tie_tb");
  const [r] = await db
    .select({
      id: tournamentMatches.id,
      tournamentId: tournamentMatches.tournamentId,
      stage: tournamentMatches.stage,
      teamA: tournamentMatches.teamA,
      teamB: tournamentMatches.teamB,
      scoreA: tournamentMatches.scoreA,
      scoreB: tournamentMatches.scoreB,
      shootoutWinner: tournamentMatches.shootoutWinner,
      decidedBy: tournamentMatches.decidedBy,
      nameA: ta.name,
      nameB: tb.name,
    })
    .from(tournamentMatches)
    .innerJoin(ta, eq(ta.id, tournamentMatches.teamA))
    .innerJoin(tb, eq(tb.id, tournamentMatches.teamB))
    .where(and(eq(tournamentMatches.matchId, matchId)))
    .limit(1);
  if (!r || !r.stage.startsWith("ko:") || !r.teamA || !r.teamB || r.scoreA === null || !tieOffen(r)) return null;
  return { tournamentMatchId: r.id, tournamentId: r.tournamentId, teamA: r.teamA, teamB: r.teamB, nameA: r.nameA, nameB: r.nameB, score: r.scoreA };
}
