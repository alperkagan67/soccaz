import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { tournamentMatches, tournamentTeams, tournaments } from "@/db/schema-league";
import { getTournament, maybeGenerateBracket } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Turnierseite bei Freilosen (Teamzahl keine Zweierpotenz): kein Absturz, Plan und Zeilen passen zusammen, jede Paarung mit beiden Teams hat ein Spiel mit Startzeit aus dem Plan.
// Durch den Server-Pfad: maybeGenerateBracket (knockout, insertFixtures, createGames) und getTournament (Gast und Veranstalter).
afterAll(cleanup);
const DAY = 86_400_000;

async function bracketWith(n: number) {
  const org = await makeUser("fl-org");
  const [t] = await db
    .insert(tournaments)
    .values({ organizerId: org.id, name: `Freilos-Cup ${n}`, city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: n, status: "payment", startsAt: new Date(Date.now() + 6 * DAY), durationMin: 120, matchMinutes: 20, isPrivate: false, finalShareCents: 0 } as typeof tournaments.$inferInsert)
    .returning();
  for (let i = 0; i < n; i++) {
    const cap = await makeUser("fl-cap");
    const team = await makeTeam(cap.id, `Freilos ${n}-${i}`);
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, captainId: cap.id, readyAt: new Date(), paidReadyAt: new Date() });
  }
  await db.transaction((tx) => maybeGenerateBracket(tx, t));
  return { org, t };
}

describe("Turnierseite mit Freilosen", () => {
  for (const n of [4, 5, 6, 7, 10, 12, 16]) {
    it(`${n} Teams: Seite lädt für Gast und Veranstalter, Plan ohne Lücke, jede vollständige Paarung hat ein Spiel mit Startzeit aus dem Plan`, async () => {
      const { org, t } = await bracketWith(n);
      const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
      expect(rows).toHaveLength(n - 1);
      for (const viewer of [null, { id: org.id, role: "player" as const }]) {
        const view = await getTournament(t.id, viewer);
        expect(view, "Turnier lesbar").not.toBeNull();
        const schedule = view!.schedule!;
        expect(schedule).not.toBeNull();
        const planned = schedule.blocks.flatMap((b) => b.games.filter((g) => !g.fun));
        expect(planned).toHaveLength(n - 1); // jede Zeile genau eine Paarung im Plan, keine ausgelassen
        expect(view!.stages.flatMap((s) => s.matches)).toHaveLength(n - 1);
        // jede Zeile hat Platz und Zeit
        for (const s of view!.stages) for (const m of s.matches) {
          expect(m.court, `${s.stage}|${m.slot} Platz`).not.toBeNull();
          expect(m.startIso, `${s.stage}|${m.slot} Zeit`).not.toBeNull();
        }
      }
      // jede Paarung mit beiden Teams ist ein echtes Spiel mit der Startzeit des Plan-Blocks
      const view = (await getTournament(t.id, null))!;
      const blockStarts = new Set(view.schedule!.blocks.map((b) => b.startIso));
      const ready = rows.filter((r) => r.teamA && r.teamB);
      expect(ready.length).toBeGreaterThan(0);
      for (const r of ready) {
        expect(r.matchId, `${r.stage}|${r.slot} Spiel`).not.toBeNull();
        const [game] = await db.select().from(matches).where(eq(matches.id, r.matchId!));
        expect(blockStarts.has(game.startsAt.toISOString()), `${r.stage}|${r.slot} Startzeit aus dem Plan`).toBe(true);
      }
    });
  }
});
