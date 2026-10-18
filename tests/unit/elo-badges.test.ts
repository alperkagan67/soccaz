import { describe, expect, it } from "vitest";
import { actualScore, average, eloDelta, expectedScore, initialTeamElo, marginMultiplier, playerDelta } from "@/lib/elo";
import { BADGES, earnedBadges, reliabilityPercent, type PlayerSnapshot } from "@/lib/badges";

describe("Elo", () => {
  it("Startwerte aus der Selbsteinschätzung", () => {
    expect([1, 2, 3, 4, 5].map(initialTeamElo)).toEqual([800, 900, 1000, 1100, 1200]);
    expect(initialTeamElo(0)).toBe(800);
    expect(initialTeamElo(9)).toBe(1200);
  });
  it("erwarteter Wert: gleich stark gleich 0,5, 400 Punkte mehr gleich rund 0,91", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 2);
    expect(expectedScore(1000, 1400) + expectedScore(1400, 1000)).toBeCloseTo(1, 5);
  });
  it("Ergebnispunkte", () => {
    expect(actualScore(3, 1)).toBe(1);
    expect(actualScore(2, 2)).toBe(0.5);
    expect(actualScore(0, 4)).toBe(0);
  });
  it("Torunterschied-Faktor ist gedeckelt", () => {
    expect(marginMultiplier(0)).toBe(1);
    expect(marginMultiplier(1)).toBe(1);
    expect(marginMultiplier(3)).toBeCloseTo(2.099, 2);
    expect(marginMultiplier(-3)).toBeCloseTo(2.099, 2);
    expect(marginMultiplier(50)).toBe(2.5);
  });
  it("Sieg gegen gleich Starken bringt 16 Punkte, Remis 0", () => {
    expect(eloDelta(1000, 1000, 1, 0)).toBe(16);
    expect(eloDelta(1000, 1000, 2, 2)).toBe(0);
    expect(eloDelta(1000, 1000, 0, 1)).toBe(-16);
  });
  it("Favoriten gewinnen wenig, Außenseiter viel", () => {
    expect(eloDelta(1400, 1000, 1, 0)).toBeLessThan(5);
    expect(eloDelta(1000, 1400, 1, 0)).toBeGreaterThan(28);
    expect(eloDelta(1400, 1000, 0, 1)).toBeLessThan(-27); // Favorit verliert: hoher Verlust
  });
  it("Team-Elo ist nullsummig", () => {
    for (const [a, b, ga, gb] of [[1000, 1200, 3, 0], [900, 900, 1, 1], [1300, 800, 0, 2]] as const) {
      expect(eloDelta(a, b, ga, gb) + -eloDelta(a, b, ga, gb)).toBe(0);
      // Gegenperspektive ergibt (bis auf Rundung) das Gegenteil
      expect(Math.abs(eloDelta(a, b, ga, gb) + eloDelta(b, a, gb, ga))).toBeLessThanOrEqual(1);
    }
  });
  it("Spieler-Elo und Durchschnitt", () => {
    expect(playerDelta(1000, 1000, 2, 1)).toBe(16);
    expect(average([1000, 1100, 1200])).toBe(1100);
    expect(average([])).toBe(1000);
  });
});

const base: PlayerSnapshot = { matches: 0, wins: 0, goals: 0, cleanStreak: 0, winStreak: 0, mvps: 0, goalsInThisMatch: 0 };

describe("Abzeichen", () => {
  it("nichts ohne Spiele", () => expect(earnedBadges(base)).toEqual([]));
  it("Debüt und erstes Tor", () => expect(earnedBadges({ ...base, matches: 1, goals: 1 })).toEqual(["debut", "first_goal"]));
  it("Hattrick nur mit drei Toren im Spiel", () => {
    expect(earnedBadges({ ...base, matches: 1, goals: 2, goalsInThisMatch: 2 })).not.toContain("hattrick");
    expect(earnedBadges({ ...base, matches: 1, goals: 3, goalsInThisMatch: 3 })).toContain("hattrick");
  });
  it("Schwellen für Spiele, Tore, Siege, Serien, MVP", () => {
    const all = earnedBadges({ matches: 50, wins: 5, goals: 25, cleanStreak: 10, winStreak: 3, mvps: 5, goalsInThisMatch: 0 });
    expect(all).toEqual(expect.arrayContaining(["matches_10", "matches_25", "matches_50", "goals_10", "goals_25", "fairplay_10", "wins_5", "win_streak_3", "mvp_1", "mvp_5"]));
    const few = earnedBadges({ matches: 9, wins: 4, goals: 9, cleanStreak: 9, winStreak: 2, mvps: 0, goalsInThisMatch: 0 });
    for (const code of ["matches_10", "goals_10", "fairplay_10", "wins_5", "win_streak_3", "mvp_1"]) expect(few).not.toContain(code);
  });
  it("jedes Abzeichen hat Namen und Beschreibung", () => {
    for (const [code, b] of Object.entries(BADGES)) {
      expect(b.name.length, code).toBeGreaterThan(2);
      expect(b.description.length, code).toBeGreaterThan(5);
    }
  });
  it("Zuverlässigkeit erst ab 3 Spielen", () => {
    expect(reliabilityPercent({ attended: 2, noShows: 0, lateCancels: 0 })).toBeNull();
    expect(reliabilityPercent({ attended: 9, noShows: 1, lateCancels: 0 })).toBe(90);
    expect(reliabilityPercent({ attended: 3, noShows: 1, lateCancels: 1 })).toBe(60);
  });
});
