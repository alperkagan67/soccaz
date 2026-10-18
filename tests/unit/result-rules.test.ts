import { describe, expect, it } from "vitest";
import { confirmDeadline, isValidScore, minuteAt, phaseOf, scoreFromGoals } from "@/lib/result-rules";

describe("Ergebnis-Regeln", () => {
  it("zählt Tore je Team", () => {
    const goals = [{ teamId: "h" }, { teamId: "h" }, { teamId: "a" }];
    expect(scoreFromGoals(goals, "h", "a")).toEqual({ home: 2, away: 1 });
    expect(scoreFromGoals([], "h", "a")).toEqual({ home: 0, away: 0 });
  });
  it("Spielminute ist nie kleiner 1 und begrenzt", () => {
    const start = new Date("2026-11-01T19:00:00Z");
    expect(minuteAt(start, new Date("2026-11-01T18:50:00Z"), 60)).toBe(1);
    expect(minuteAt(start, new Date("2026-11-01T19:00:30Z"), 60)).toBe(1);
    expect(minuteAt(start, new Date("2026-11-01T19:12:00Z"), 60)).toBe(13);
    expect(minuteAt(start, new Date("2026-11-01T23:00:00Z"), 60)).toBe(90);
  });
  it("prüft Spielstände", () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(99)).toBe(true);
    expect(isValidScore(100)).toBe(false);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(2.5)).toBe(false);
  });
  it("Bestätigungsfrist beträgt 48 Stunden", () => {
    const from = new Date("2026-11-01T20:00:00Z");
    expect(confirmDeadline(from).toISOString()).toBe("2026-11-03T20:00:00.000Z");
  });
  it("Phasen", () => {
    const now = new Date("2026-11-01T20:00:00Z");
    const future = new Date("2026-11-02T20:00:00Z");
    const past = new Date("2026-11-01T19:00:00Z");
    expect(phaseOf({ status: "confirmed", startsAt: future, hasPendingResult: false, now })).toBe("upcoming");
    expect(phaseOf({ status: "confirmed", startsAt: past, hasPendingResult: false, now })).toBe("live");
    expect(phaseOf({ status: "confirmed", startsAt: past, hasPendingResult: true, now })).toBe("pending");
    expect(phaseOf({ status: "played", startsAt: past, hasPendingResult: true, now })).toBe("finished");
    expect(phaseOf({ status: "disputed", startsAt: past, hasPendingResult: true, now })).toBe("disputed");
    expect(phaseOf({ status: "cancelled", startsAt: past, hasPendingResult: false, now })).toBe("cancelled");
  });
});
