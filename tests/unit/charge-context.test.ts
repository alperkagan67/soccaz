import { describe, expect, it } from "vitest";
import { matchIdOf, scopeOf } from "@/server/payments/charge-context";

// 012 M5-2b: Kontext einer Abbuchungszeile (Spiel ODER Turnier).
describe("charge-context", () => {
  it("scopeOf: Spiel-Zeile", () => {
    expect(scopeOf({ matchId: "m1", tournamentId: null })).toEqual({ kind: "match", matchId: "m1" });
  });
  it("scopeOf: Turnier-Zeile", () => {
    expect(scopeOf({ matchId: null, tournamentId: "t1" })).toEqual({ kind: "tournament", tournamentId: "t1" });
  });
  it("scopeOf: beide oder keines gesetzt wirft", () => {
    expect(() => scopeOf({ matchId: "m1", tournamentId: "t1" })).toThrow("charge_scope_invalid");
    expect(() => scopeOf({ matchId: null, tournamentId: null })).toThrow("charge_scope_invalid");
  });
  it("matchIdOf liefert die Spiel-ID; eine Turnier-Zeile wirft statt still im Spiel-Pfad zu laufen", () => {
    expect(matchIdOf({ matchId: "m1" })).toBe("m1");
    expect(() => matchIdOf({ matchId: null })).toThrow("charge_not_match_scoped");
  });
});
