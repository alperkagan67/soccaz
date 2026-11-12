import { describe, expect, it } from "vitest";
import { bonusNumber, bonusProgress, commissionCents, parseCommissionPercent, percentFromDb } from "@/lib/commission";

// Vertrag 009 M2: Provision Cent-genau (abgerundet, nie mehr als vereinbart), Wertebereich 0..100 mit höchstens zwei Nachkommastellen, 10er-Zähler.
describe("parseCommissionPercent", () => {
  it("nimmt 0 bis 100 mit höchstens zwei Nachkommastellen, Komma oder Punkt", () => {
    expect(parseCommissionPercent("10")).toBe(10);
    expect(parseCommissionPercent("12,5")).toBe(12.5);
    expect(parseCommissionPercent(" 0.25 ")).toBe(0.25);
    expect(parseCommissionPercent(0)).toBe(0);
    expect(parseCommissionPercent(100)).toBe(100);
    expect(parseCommissionPercent("100.00")).toBe(100);
  });
  it("lehnt negativ, über 100, zu viele Nachkommastellen und Unsinn ab", () => {
    for (const bad of ["-1", "100.01", "101", "10.123", "abc", "", "1e2", "10%", null, undefined, NaN, {}]) expect(parseCommissionPercent(bad as never), String(bad)).toBeNull();
  });
});

describe("commissionCents", () => {
  it("rundet ab, nie mehr als vereinbart", () => {
    expect(commissionCents(8000, 10)).toBe(800);
    expect(commissionCents(1001, 10.5)).toBe(105); // 105,105
    expect(commissionCents(999, 10)).toBe(99); // 99,9
    expect(commissionCents(1, 99.99)).toBe(0);
    expect(commissionCents(8000, 0)).toBe(0);
    expect(commissionCents(8000, 100)).toBe(8000);
  });
  it("rechnet ganzzahlig: keine Gleitkommafehler bei 0,29 % und 33,33 %", () => {
    expect(commissionCents(10_000, 0.29)).toBe(29);
    expect(commissionCents(10_000, 33.33)).toBe(3333);
    expect(commissionCents(30_000, 0.1)).toBe(30);
  });
  it("lehnt eine ungültige Bemessungsgrundlage ab", () => {
    expect(() => commissionCents(-1, 10)).toThrow();
    expect(() => commissionCents(1.5, 10)).toThrow();
  });
});

describe("10er-Zähler", () => {
  it("bonusNumber: nur jedes 10. gezählte Spiel löst einen Bonus aus", () => {
    expect([0, 1, 9, 10, 11, 19, 20, 30].map(bonusNumber)).toEqual([0, 0, 0, 1, 0, 0, 2, 3]);
  });
  it("bonusProgress zeigt den Fortschritt", () => {
    expect(bonusProgress(0)).toEqual({ counted: 0, completedBonuses: 0, untilNext: 10 });
    expect(bonusProgress(9)).toEqual({ counted: 9, completedBonuses: 0, untilNext: 1 });
    expect(bonusProgress(10)).toEqual({ counted: 10, completedBonuses: 1, untilNext: 10 });
    expect(bonusProgress(23)).toEqual({ counted: 23, completedBonuses: 2, untilNext: 7 });
  });
});

describe("percentFromDb", () => {
  it("liest numeric als Text", () => {
    expect(percentFromDb("10.00")).toBe(10);
    expect(percentFromDb(7.5)).toBe(7.5);
  });
});
