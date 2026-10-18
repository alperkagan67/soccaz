import { describe, expect, it } from "vitest";
import { countdownText, hasFreeSlot, isConfirmable, isSubstituteByRank } from "@/lib/lobby-rules";

describe("Lobby-Regeln", () => {
  it("bestätigt erst, wenn beide Teams mindestens 4 bereite Spieler haben", () => {
    expect(isConfirmable(4, 4)).toBe(true);
    expect(isConfirmable(5, 3)).toBe(false);
    expect(isConfirmable(0, 6)).toBe(false);
  });
  it("sechster Spieler und Fremde sind Ersatz", () => {
    expect(isSubstituteByRank(0, false)).toBe(false);
    expect(isSubstituteByRank(4, false)).toBe(false);
    expect(isSubstituteByRank(5, false)).toBe(true);
    expect(isSubstituteByRank(0, true)).toBe(true);
  });
  it("höchstens 6 Spieler pro Team", () => {
    expect(hasFreeSlot(5)).toBe(true);
    expect(hasFreeSlot(6)).toBe(false);
  });
  it("Countdown-Text", () => {
    expect(countdownText(-1)).toBe("Anstoß erreicht");
    expect(countdownText(20 * 60_000)).toBe("in 20 Min");
    expect(countdownText(150 * 60_000)).toBe("in 2 Std 30 Min");
    expect(countdownText(26 * 3_600_000)).toBe("in 1 Tag 2 Std");
    expect(countdownText(50 * 3_600_000)).toBe("in 2 Tagen 2 Std");
  });
});
