import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { tournamentMatches } from "@/db/schema-league";
import { tieMarke, tieOffen } from "@/lib/tiebreak-regeln";

/**
 * Tie-Break-Stand für die Spielseite (PR 1b): zum Spiel (matches.id) das zugehörige K.-o.-Turnierspiel.
 * `marke` = "n. GG" / "n. 9m (a:b)" nach der Entscheidung (für alle Betrachter); `offen` = die Daten für das Entscheidungs-Formular, solange das Spiel unentschieden und NICHT entschieden ist
 * (gleiche Regel wie der Server decideTie). Nur Anzeigedaten (Teamnamen, Stand), keine Personen.
 * Früher Ausstieg ohne Abfrage: ein Tie-Break kann es erst geben, wenn das Spiel beendet ist (status "played"); vorher spart das die Abfrage bei jedem Aufruf der Spielseite.
 */
export async function tieStandFuerSpiel(matchId: string, status: string) {
  if (status !== "played") return null;
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
      shootoutA: tournamentMatches.shootoutA,
      shootoutB: tournamentMatches.shootoutB,
      decidedBy: tournamentMatches.decidedBy,
      nameA: ta.name,
      nameB: tb.name,
    })
    .from(tournamentMatches)
    .innerJoin(ta, eq(ta.id, tournamentMatches.teamA))
    .innerJoin(tb, eq(tb.id, tournamentMatches.teamB))
    .where(eq(tournamentMatches.matchId, matchId))
    .limit(1);
  if (!r || !r.stage.startsWith("ko:")) return null;
  const offen =
    r.teamA && r.teamB && r.scoreA !== null && tieOffen(r)
      ? { tournamentMatchId: r.id, tournamentId: r.tournamentId, teamA: r.teamA, teamB: r.teamB, nameA: r.nameA, nameB: r.nameB, score: r.scoreA }
      : null;
  return { marke: tieMarke(r), offen };
}
