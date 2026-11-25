import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, users } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { createTournament, getTournament, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Spielplan 15 + 5 (Entscheid t2q 2026-11-27, Befund M2): Spielzeit (Standard 15) + Puffer (Standard 5) bestimmen den Slot; die Hallenzeit ist nur ein Fenster (Warnung). Vorher wurde der Slot aus der Hallenzeit
// gerechnet (87 statt 15 Minuten).
afterAll(cleanup);
const DAY = 86_400_000;
let seq = 0;

type Over = Partial<typeof tournaments.$inferInsert>;
/** Turnier mit 4 vollzähligen Teams (je 4 Spieler), das Bracket entsteht beim letzten "vollzählig". */
async function laufendes(over: Over = {}) {
  const org = await makeUser("sp-org");
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: `Spielplan ${++seq}`,
      city: "Essen",
      startsOn: new Date(Date.now() + 12 * DAY).toISOString().slice(0, 10),
      format: "knockout",
      maxTeams: 4,
      status: "registration",
      startsAt: new Date(Date.now() + 12 * DAY),
      registrationDeadline: new Date(Date.now() + 8 * DAY),
      durationMin: 120,
      matchMinutes: 15,
      isPrivate: false,
      totalCents: 0,
      hourlyCents: 0,
      ...over,
    } as typeof tournaments.$inferInsert)
    .returning();
  const caps: string[] = [];
  for (let i = 0; i < 4; i++) {
    const cap = await makeUser("sp-cap");
    const team = await makeTeam(cap.id, `SP ${seq}-${i}`);
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, captainId: cap.id });
    await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: cap.id });
    for (let p = 1; p < 4; p++) await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: (await makeUser("sp-pl")).id });
    caps.push(cap.id);
  }
  for (const c of caps) await setRosterComplete(c, t.id, true);
  return { org, t };
}
const base = { name: "Plan-Cup", city: "Essen", startsAt: new Date(Date.now() + 30 * DAY), registrationDeadline: new Date(Date.now() + 20 * DAY), maxTeams: 8, durationMin: 120, hourlyCents: 0 };

describe("createTournament: Puffer", () => {
  it("Standard 5, gültige Grenzen 0 und 30 werden gespeichert; 31, -1 und Bruchzahlen abgewiesen", async () => {
    const org = await makeUser("sp-neu");
    await db.update(users).set({ isOrganizer: true }).where(eq(users.id, org.id));
    const ok = async (extra: object) => (await db.select().from(tournaments).where(eq(tournaments.id, (await createTournament(org.id, { ...base, ...extra } as never)).id)))[0];
    expect((await ok({})).gapMinutes).toBe(5);
    expect((await ok({ gapMinutes: 0 })).gapMinutes).toBe(0);
    expect((await ok({ gapMinutes: 30 })).gapMinutes).toBe(30);
    for (const bad of [31, -1, 2.5, Number.NaN]) await expect(createTournament(org.id, { ...base, gapMinutes: bad } as never), String(bad)).rejects.toThrow(/Puffer/);
  });
});

describe("Spielzeilen und Anzeige folgen Spielzeit + Puffer", () => {
  it("120 Minuten Hallenzeit, 15 + 5: die Spiele dauern 15 Minuten, die Blöcke beginnen alle 20 Minuten, nicht alle 87", async () => {
    const { t } = await laufendes({ matchMinutes: 15, gapMinutes: 5, durationMin: 120 });
    const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
    const games = await db.select().from(matches).where(eq(matches.id, rows.find((r) => r.matchId)!.matchId!));
    expect(games[0].durationMin).toBe(15);
    const v = (await getTournament(t.id, null))!;
    expect(v.schedule!.slotMinutes).toBe(15);
    expect(v.schedule!.gapMinutes).toBe(5);
    expect(v.schedule!.totalMinutes).toBe(2 * 15 + 5); // 4 Teams: Halbfinale (ein Block), Finale (ein Block)
    expect(v.schedule!.overMinutes).toBe(0);
    const starts = v.schedule!.blocks.map((b) => new Date(b.startIso).getTime());
    expect(starts[1] - starts[0]).toBe(20 * 60_000);
  });

  it("andere Werte: 20 Minuten Spielzeit, 10 Minuten Puffer: Slot 30; die Hallenzeit ändert den Plan nicht", async () => {
    const { t } = await laufendes({ matchMinutes: 20, gapMinutes: 10, durationMin: 600 });
    const v = (await getTournament(t.id, null))!;
    expect(v.schedule!.slotMinutes).toBe(20);
    const starts = v.schedule!.blocks.map((b) => new Date(b.startIso).getTime());
    expect(starts[1] - starts[0]).toBe(30 * 60_000);
    const { t: t2 } = await laufendes({ matchMinutes: 20, gapMinutes: 10, durationMin: 60 });
    const v2 = (await getTournament(t2.id, null))!;
    expect(v2.schedule!.blocks.map((b) => new Date(b.endIso).getTime() - new Date(b.startIso).getTime())).toEqual([20 * 60_000, 20 * 60_000]); // gleiche Länge trotz kürzerer Hallenzeit
  });

  it("zu kurze Hallenzeit: nur eine Warnung (overMinutes), kein Abbruch, der Plan bleibt", async () => {
    const { t } = await laufendes({ matchMinutes: 15, gapMinutes: 5, durationMin: 30 });
    const v = (await getTournament(t.id, null))!;
    expect(v.schedule!.totalMinutes).toBe(35);
    expect(v.schedule!.overMinutes).toBe(5);
    expect(v.schedule!.blocks).toHaveLength(2);
  });

  it("Tafeluhr: beendete Spiele liefern playedIso, offene null; das Spaßspiel hat keins", async () => {
    const { t } = await laufendes({ matchMinutes: 15, gapMinutes: 5, durationMin: 120 });
    const vorher = (await getTournament(t.id, null))!;
    const erstesGame = (v: typeof vorher) => v.schedule!.blocks[0].games.filter((g) => !g.fun);
    expect(erstesGame(vorher).every((g) => g.playedIso === null)).toBe(true);
    const gespielt = new Date("2026-12-12T13:07:00.000Z");
    await db.update(tournamentMatches).set({ playedAt: gespielt }).where(eq(tournamentMatches.tournamentId, t.id));
    const nachher = (await getTournament(t.id, null))!;
    expect(erstesGame(nachher).every((g) => g.playedIso === gespielt.toISOString())).toBe(true);
    const spass = nachher.schedule!.blocks.flatMap((b) => b.games).filter((g) => g.fun);
    expect(spass.every((g) => g.playedIso === null)).toBe(true);
  });
});
