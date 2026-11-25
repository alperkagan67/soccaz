import { describe, expect, it } from "vitest";
import { GAP_MAX_MINUTEN, GAP_MIN_MINUTEN, GAP_STANDARD_MINUTEN, GOLDEN_GOAL_MINUTEN, tieBreakHinweis } from "@/lib/turnier-grenzen";
import { zahlungsWorte } from "@/lib/zahlungen-aus";

// Puffergrenzen (Migration 0062) und der Tie-Break-Hinweis (R-T451): Golden Goal läuft im Puffer, also nur bei Puffer >= 2 Minuten.
describe("turnier-grenzen", () => {
  it("Grenzen und Standard", () => {
    expect([GAP_MIN_MINUTEN, GAP_STANDARD_MINUTEN, GAP_MAX_MINUTEN, GOLDEN_GOAL_MINUTEN]).toEqual([0, 5, 30, 2]);
    expect(GOLDEN_GOAL_MINUTEN).toBeLessThanOrEqual(GAP_STANDARD_MINUTEN); // der Standardpuffer trägt das Golden Goal
  });
  it("Hinweis: ab 2 Minuten Puffer Golden Goal dann Neunmeter, darunter gleich Neunmeter", () => {
    for (const gap of [2, 5, 30]) expect(tieBreakHinweis(gap), String(gap)).toBe("Bei Gleichstand im K.-o. läuft im Puffer das Golden Goal (2 Minuten), danach Neunmeter.");
    for (const gap of [0, 1]) expect(tieBreakHinweis(gap), String(gap)).toBe("Mit weniger als 2 Minuten Puffer gibt es kein Golden Goal: bei Gleichstand geht es gleich in die Neunmeter.");
  });
  it("kein Zahlungswort in den Hinweisen (Wortscan Zahlungen AUS)", () => {
    for (const gap of [0, 5]) expect(zahlungsWorte(tieBreakHinweis(gap))).toEqual([]);
  });
});
