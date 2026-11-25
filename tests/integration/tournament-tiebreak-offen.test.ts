import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { endMatch, submitResult } from "@/server/results";
import { decideTie, getTournament, maybeGenerateBracket } from "@/server/tournaments";
import { TIEBREAK_OFFEN_GAST } from "@/lib/tiebreak-regeln";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Regressionstest (Demo 27.11.): Der Veranstalter trägt ein K.-o.-Spiel als Endergebnis 0:0 ein (Ergebnis melden/Endergebnis eintragen oder Abpfiff ohne Tore). Das Spiel bleibt OFFEN: kein Sieger,
// das Folgespiel bekommt KEIN Team, das Turnier läuft weiter, die Seite zeigt "Entscheidung offen" (pendingShootout); erst decideTie (Golden Goal oder Neunmeter) lässt den Sieger weiterrücken.
afterAll(cleanup);
const DAY = 86_400_000;

async function turnier(n = 4) {
  const org = await makeUser("to-org");
  const [t] = await db
    .insert(tournaments)
    .values({ organizerId: org.id, name: `Offen-Cup ${Date.now()}`, city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: n, status: "payment", startsAt: new Date(Date.now() + 6 * DAY), durationMin: 120, matchMinutes: 15, isPrivate: false, finalShareCents: 0, totalCents: 0, hourlyCents: 0 } as typeof tournaments.$inferInsert)
    .returning();
  for (let i = 0; i < n; i++) {
    const cap = await makeUser("to-cap");
    const team = await makeTeam(cap.id, `TO ${i}`);
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, captainId: cap.id, readyAt: new Date(), paidReadyAt: new Date() });
    await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: cap.id });
  }
  await db.transaction((tx) => maybeGenerateBracket(tx, t));
  return { t, org };
}
const rows = (tid: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tid)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
const spiel = async (tid: string, index: number) => (await rows(tid)).filter((r) => r.matchId && r.stage === "ko:4")[index];
const ansicht = async (tid: string, viewer: { id: string; role: string } | null) => {
  const v = (await getTournament(tid, viewer))!;
  return v.stages.flatMap((s) => s.matches);
};

describe.each([
  ["Ergebnis eintragen 0:0 (Veranstalter, Endergebnis)", (orgId: string, matchId: string) => submitResult(orgId, matchId, 0, 0)],
  ["Abpfiff ohne Tore (0:0)", (orgId: string, matchId: string) => endMatch(orgId, matchId)],
])("0:0 vom Veranstalter: %s", (_name, eintragen) => {
  it("bleibt OFFEN: kein Sieger, Folgespiel ohne Team, Turnier läuft, Ansicht 'Entscheidung offen'; nach decideTie rückt der Sieger weiter", async () => {
    const { t, org } = await turnier();
    const m = await spiel(t.id, 0);
    await eintragen(org.id, m.matchId!);

    const nach = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([nach.scoreA, nach.scoreB, nach.shootoutWinner, nach.decidedBy]).toEqual([0, 0, null, null]); // eingetragen, aber nicht entschieden
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).toBe("played"); // das Spiel selbst ist beendet
    const final = (await rows(t.id)).find((r) => r.id === m.feedsMatchId)!;
    expect([final.teamA, final.teamB].filter(Boolean)).toHaveLength(0); // KEIN Team rückt weiter
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe("running"); // Turnier nicht beendet

    // Ansicht: Veranstalter sieht die Entscheidung offen (pendingShootout), Gast ebenso (nur Hinweis, kein Sieger)
    const org1 = (await ansicht(t.id, { id: org.id, role: "player" })).find((x) => x.id === m.id)!;
    const gast = (await ansicht(t.id, null)).find((x) => x.id === m.id)!;
    for (const v of [org1, gast]) {
      expect(v.pendingShootout).toBe(true);
      expect(v.decidedBy).toBeNull();
    }
    expect(TIEBREAK_OFFEN_GAST).toContain("Unentschieden");

    // zweites Eintragen/Abpfiff ändert nichts und entscheidet nichts
    await expect(eintragen(org.id, m.matchId!)).rejects.toThrow();
    expect((await rows(t.id)).find((r) => r.id === m.feedsMatchId)!.teamA).toBeNull();

    // erst die Entscheidung lässt den Sieger weiterrücken
    await decideTie(org.id, t.id, m.id, "gg", m.teamB!);
    const entschieden = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([entschieden.scoreA, entschieden.scoreB, entschieden.decidedBy]).toEqual([0, 1, "gg"]);
    const weiter = (await rows(t.id)).find((r) => r.id === m.feedsMatchId)!;
    expect([weiter.teamA, weiter.teamB]).toContain(m.teamB);
    const danach = (await ansicht(t.id, { id: org.id, role: "player" })).find((x) => x.id === m.id)!;
    expect(danach.pendingShootout).toBe(false);
  });
});
