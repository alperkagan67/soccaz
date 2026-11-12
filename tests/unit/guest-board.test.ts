import { describe, expect, it } from "vitest";
import type { BoardEntry, BoardMatch, BoardSearch } from "@/server/board";
import { guestBoardEntries } from "@/lib/guest-board";

const team = { id: "t1", name: "Team Eins", slug: "team-eins", elo: 1200, strength: 3, playedMatches: 4, members: 8, verified: false } as unknown as BoardMatch["home"];
const match = {
  kind: "match", number: 1, id: "m1", startsAt: new Date(), schedulingOpen: false, vetoRunning: false, durationMin: 60, venue: null, confirmed: false, challengePending: false,
  home: team, away: team, winChanceHome: 50, readyHome: 1, readyAway: 0, freeHome: 3, freeAway: 4, strangers: 0,
  homePlayers: [{ userId: "u-secret-1", name: "Max Muster", light: "orange", isSubstitute: false, isPro: true }],
  awayPlayers: [{ userId: "u-secret-2", name: "Erika Beispiel", light: "green", isSubstitute: true, isPro: false }],
} as unknown as BoardMatch;
const search = {
  kind: "search", sub: "request", number: 2, id: "s1", team, target: null,
  roster: [{ userId: "u-secret-3", name: "Hans Wurst", position: "Angriff", elo: 1500, isAdmin: true }],
} as unknown as BoardSearch;

describe("guestBoardEntries (Gäste sehen nur Zahlen und Initialen, keinen Status je Person)", () => {
  const out = guestBoardEntries([match, search] as BoardEntry[]);
  const text = JSON.stringify(out);
  it("kein Name, keine Spieler-ID, keine Position, kein Elo je Person", () => {
    expect(text).not.toMatch(/Max|Muster|Erika|Beispiel|Hans|Wurst|u-secret|Angriff|1500/);
  });
  it("Initialen bleiben, Anzahl bleibt, keine Ampel je Person", () => {
    const m = out[0] as BoardMatch;
    expect(m.homePlayers.map((p) => p.name)).toEqual(["MM"]);
    expect(m.awayPlayers.map((p) => p.name)).toEqual(["EB"]);
    expect([...m.homePlayers, ...m.awayPlayers].every((p) => p.light === null && !p.isPro && !p.isSubstitute)).toBe(true);
    expect(m.readyHome).toBe(1); // Zahlen bleiben
    expect((out[1] as BoardSearch).roster).toHaveLength(1);
  });
  it("verändert die Eingabe nicht", () => {
    expect(match.homePlayers[0].name).toBe("Max Muster");
  });
});
