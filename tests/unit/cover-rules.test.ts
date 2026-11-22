import { describe, expect, it } from "vitest";
import { coverRoleOf, coverTargets, type CoverRuleInput, type CoverRuleSeat } from "@/lib/cover-rules";

// 012 M3c-3b: Wer sieht den Knopf "Anteil übernehmen"? (Plan Abschnitt 3.) Der Server prüft dieselben Regeln beim Eintragen noch einmal (takeOverShare).
const seat = (userId: string, teamId: string | null, cardStatus: string): CoverRuleSeat => ({ userId, teamId, cardStatus });
const base = (o: Partial<CoverRuleInput> = {}): CoverRuleInput => ({
  viewerId: "b",
  seats: [seat("a", "t1", "none"), seat("b", "t1", "card_ready"), seat("c", "t1", "card_ready"), seat("x", "t2", "none"), seat("y", "t2", "card_ready")],
  validCovers: new Map(),
  teamGame: true,
  open: true,
  ...o,
});

describe("coverTargets (M3c-3b)", () => {
  it("B mit Karte sieht den Knopf nur bei roten Plätzen des eigenen Teams", () => {
    expect(coverTargets(base())).toEqual(["a"]); // x ist rot, aber im anderen Team
  });

  it("Privatspiel: jeder Eingeteilte, auch aus der anderen Mannschaft", () => {
    expect(coverTargets(base({ teamGame: false })).sort()).toEqual(["a", "x"]);
  });

  it("ohne eigene Karte kein Knopf (B ist selbst rot)", () => {
    expect(coverTargets(base({ viewerId: "a" }))).toEqual([]);
    const seats = [seat("a", "t1", "none"), seat("b", "t1", "failed")];
    expect(coverTargets(base({ seats, viewerId: "b" }))).toEqual([]);
  });

  it("nicht eingeteilt (teamId null) oder kein Teilnehmer: kein Knopf, und nicht eingeteilte Plätze sind kein Ziel", () => {
    expect(coverTargets(base({ viewerId: "nobody" }))).toEqual([]);
    expect(coverTargets(base({ viewerId: null }))).toEqual([]);
    const seats = [seat("a", null, "none"), seat("b", "t1", "card_ready")];
    expect(coverTargets(base({ seats }))).toEqual([]);
    expect(coverTargets(base({ seats: [seat("a", "t1", "none"), seat("b", null, "card_ready")] }))).toEqual([]);
  });

  it("ein Platz mit Karte oder laufender/erfolgter Abbuchung ist kein Ziel", () => {
    for (const status of ["card_ready", "charge_pending", "charged"]) {
      expect(coverTargets(base({ seats: [seat("a", "t1", status), seat("b", "t1", "card_ready")] })), status).toEqual([]);
    }
  });

  it("ein roter Platz (none oder failed) ist ein Ziel; für den Knopf kein Unterschied zwischen beiden", () => {
    for (const status of ["none", "failed"]) {
      expect(coverTargets(base({ seats: [seat("a", "t1", status), seat("b", "t1", "card_ready")] })), status).toEqual(["a"]);
    }
  });

  it("schon übernommene Plätze haben keinen zweiten Knopf (einmal je Platz)", () => {
    expect(coverTargets(base({ viewerId: "c", validCovers: new Map([["a", "b"]]) }))).toEqual([]);
  });

  it("wer schon einen Platz übernimmt, bekommt keinen weiteren Knopf (ein Platz je Übernehmer)", () => {
    const seats = [seat("a", "t1", "none"), seat("a2", "t1", "none"), seat("b", "t1", "card_ready")];
    expect(coverTargets(base({ seats, validCovers: new Map([["a", "b"]]) }))).toEqual([]);
  });

  it("keine Kette: ein übernommener Platz bekommt keinen Knopf", () => {
    const seats = [seat("a", "t1", "none"), seat("b", "t1", "card_ready")];
    expect(coverTargets(base({ seats, viewerId: "a", validCovers: new Map([["a", "b"]]) }))).toEqual([]);
  });

  it("nicht mehr offen (Zeilen angelegt, Frist erreicht, Spiel geschlossen): spielweit nirgends ein Knopf", () => {
    expect(coverTargets(base({ open: false }))).toEqual([]);
  });

  it("nie der eigene Platz", () => {
    expect(coverTargets(base()).includes("b")).toBe(false);
  });
});

describe("coverRoleOf (M3c-3b)", () => {
  const valid = new Map([["a", "b"]]);
  it("B übernimmt den Platz von A", () => {
    expect(coverRoleOf("b", valid)).toEqual({ covering: "a", covered: false });
  });
  it("A ist übernommen", () => {
    expect(coverRoleOf("a", valid)).toEqual({ covering: null, covered: true });
  });
  it("Dritte und nicht angemeldete Betrachter: nichts", () => {
    expect(coverRoleOf("c", valid)).toEqual({ covering: null, covered: false });
    expect(coverRoleOf(null, valid)).toEqual({ covering: null, covered: false });
  });
});
