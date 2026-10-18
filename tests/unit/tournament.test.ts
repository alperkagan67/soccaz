import { describe, expect, it } from "vitest";
import { bracketOrder, drawGroups, groupCount, groupFixtures, knockout, koFromGroups, koWinner, roundRobin, splitEntryFees, standings, validateTeamCount } from "@/lib/tournament";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const pairKey = (a: string, b: string) => [a, b].sort().join("-");

describe("Jeder gegen jeden", () => {
  it("4 Teams: 6 Spiele in 3 Runden, jedes Paar genau einmal, niemand zweimal pro Runde", () => {
    const f = roundRobin(ids(4));
    expect(f).toHaveLength(6);
    expect(new Set(f.map((x) => pairKey(x.a!, x.b!))).size).toBe(6);
    for (let r = 1; r <= 3; r++) {
      const inRound = f.filter((x) => x.round === r).flatMap((x) => [x.a, x.b]);
      expect(new Set(inRound).size).toBe(inRound.length);
      expect(inRound).toHaveLength(4);
    }
  });
  it("5 Teams: 10 Spiele, pro Runde setzt ein Team aus", () => {
    const f = roundRobin(ids(5));
    expect(f).toHaveLength(10);
    expect(new Set(f.map((x) => pairKey(x.a!, x.b!))).size).toBe(10);
    expect(Math.max(...f.map((x) => x.round))).toBe(5);
    for (let r = 1; r <= 5; r++) expect(f.filter((x) => x.round === r)).toHaveLength(2);
  });
  it("n Teams ergeben n(n-1)/2 Spiele", () => {
    for (const n of [2, 3, 6, 7, 8, 11]) expect(roundRobin(ids(n))).toHaveLength((n * (n - 1)) / 2);
  });
});

describe("K.-o.-Baum", () => {
  it("Setzreihenfolge: Favoriten treffen sich spät", () => {
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it("8 Teams: 4 + 2 + 1 Spiele, jede Runde verweist auf die nächste", () => {
    const f = knockout(ids(8));
    expect(f).toHaveLength(7);
    expect(f.filter((x) => x.stage === "ko:8")).toHaveLength(4);
    expect(f.filter((x) => x.stage === "ko:4")).toHaveLength(2);
    const final = f.find((x) => x.stage === "ko:2")!;
    expect(final.feeds).toBeUndefined();
    expect(f.filter((x) => x.feeds?.stage === "ko:2")).toHaveLength(2);
    // Setzplätze 1 und 2 landen in verschiedenen Hälften
    const first = f.filter((x) => x.stage === "ko:8");
    expect(first[0]).toMatchObject({ a: "t1", b: "t8" });
    expect(first[2]).toMatchObject({ a: "t2", b: "t7" });
    expect(first[0].feeds!.slot).toBe(0);
    expect(first[2].feeds!.slot).toBe(1);
  });
  it("jede Teamzahl ergibt n-1 Spiele, Freilose rücken ohne Spiel vor", () => {
    for (let n = 2; n <= 32; n++) {
      const f = knockout(ids(n));
      expect(f, `n=${n}`).toHaveLength(n - 1);
      // jedes Team steht höchstens einmal in der ersten gespielten Runde
      const firstStage = f.filter((x) => x.round === Math.min(...f.map((y) => y.round)));
      const teams = firstStage.flatMap((x) => [x.a, x.b]).filter(Boolean);
      expect(new Set(teams).size).toBe(teams.length);
    }
  });
  it("5 Teams: Setzplätze 1 bis 3 haben ein Freilos und stehen schon im Halbfinale", () => {
    const f = knockout(ids(5));
    const first = f.filter((x) => x.stage === "ko:8");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ a: "t4", b: "t5" });
    const semis = f.filter((x) => x.stage === "ko:4");
    const named = semis.flatMap((x) => [x.a, x.b]).filter(Boolean).sort();
    expect(named).toEqual(["t1", "t2", "t3"]);
  });
  it("Sieger: nach Toren, bei Gleichstand nach Siebenmeterschießen, sonst offen", () => {
    expect(koWinner({ a: "x", b: "y", scoreA: 3, scoreB: 1 })).toBe("x");
    expect(koWinner({ a: "x", b: "y", scoreA: 0, scoreB: 2 })).toBe("y");
    expect(koWinner({ a: "x", b: "y", scoreA: 2, scoreB: 2 })).toBeNull();
    expect(koWinner({ a: "x", b: "y", scoreA: 2, scoreB: 2, shootoutWinner: "y" })).toBe("y");
    expect(koWinner({ a: "x", b: "y", scoreA: 2, scoreB: 2, shootoutWinner: "z" })).toBeNull();
  });
});

describe("Tabelle", () => {
  const results = [
    { a: "t1", b: "t2", scoreA: 2, scoreB: 0 },
    { a: "t1", b: "t3", scoreA: 1, scoreB: 1 },
    { a: "t2", b: "t3", scoreA: 3, scoreB: 3 },
  ];
  it("Punkte, Tordifferenz, Tore", () => {
    const t = standings(["t1", "t2", "t3"], results);
    expect(t.map((r) => r.teamId)).toEqual(["t1", "t3", "t2"]);
    expect(t[0]).toMatchObject({ played: 2, wins: 1, draws: 1, points: 4, gf: 3, ga: 1, gd: 2 });
    expect(t[1]).toMatchObject({ points: 2, gd: 0, gf: 4 });
  });
  it("Gleichstand: Tordifferenz, dann Tore, dann Anmeldereihenfolge", () => {
    const t = standings(["a", "b", "c"], [
      { a: "a", b: "b", scoreA: 1, scoreB: 0 },
      { a: "c", b: "b", scoreA: 4, scoreB: 3 },
    ]);
    // a: 3 Punkte, +1 | c: 3 Punkte, +1, mehr Tore -> c vor a
    expect(t.map((r) => r.teamId)).toEqual(["c", "a", "b"]);
  });
  it("Teams ohne Spiel stehen mit Nullen in der Tabelle", () => {
    expect(standings(["x", "y"], [])).toHaveLength(2);
  });
});

describe("Gruppen mit K.-o.-Runde", () => {
  it("Gruppenzahl und Verteilung in Schlangenlinie", () => {
    expect([6, 8, 11].map(groupCount)).toEqual([2, 2, 2]);
    expect([12, 16, 24].map(groupCount)).toEqual([4, 4, 4]);
    expect(groupCount(32)).toBe(8);
    const groups = drawGroups(ids(8));
    expect(groups).toEqual([["t1", "t4", "t5", "t8"], ["t2", "t3", "t6", "t7"]]);
    expect(drawGroups(ids(7)).map((g) => g.length).sort()).toEqual([3, 4]);
  });
  it("jede Gruppe spielt jeder gegen jeden", () => {
    const { groups, fixtures } = groupFixtures(ids(8));
    expect(groups).toHaveLength(2);
    expect(fixtures).toHaveLength(12);
    expect(fixtures.filter((f) => f.stage === "group:A")).toHaveLength(6);
  });
  it("K.-o.-Runde: Gruppensieger gegen Zweiten der Nachbargruppe, keine Wiederholung innerhalb der Gruppe", () => {
    const ko = koFromGroups([["A1", "A2", "A3"], ["B1", "B2", "B3"]]);
    const semis = ko.filter((f) => f.stage === "ko:4");
    expect(semis.map((f) => [f.a, f.b])).toEqual([["A1", "B2"], ["B1", "A2"]]);
    expect(ko).toHaveLength(3);
    const four = koFromGroups([["A1", "A2"], ["B1", "B2"], ["C1", "C2"], ["D1", "D2"]]);
    expect(four.filter((f) => f.stage === "ko:8").map((f) => [f.a, f.b])).toEqual([["A1", "B2"], ["C1", "D2"], ["B1", "A2"], ["D1", "C2"]]);
    expect(four).toHaveLength(7);
  });
});

describe("Regeln und Geld", () => {
  it("Teamzahl je Format", () => {
    expect(validateTeamCount("knockout", 1)).toMatch(/mindestens 2/);
    expect(validateTeamCount("knockout", 33)).toMatch(/Höchstens 32/);
    expect(validateTeamCount("groups_ko", 5)).toMatch(/mindestens 6/);
    expect(validateTeamCount("groups_ko", 6)).toBeNull();
    expect(validateTeamCount("round_robin", 2)).toBeNull();
  });
  it("Startgelder: Provision wird abgerundet, Summe bleibt erhalten", () => {
    expect(splitEntryFees(10_000, 10)).toEqual({ commission: 1000, payout: 9000 });
    expect(splitEntryFees(999, 10)).toEqual({ commission: 99, payout: 900 });
    expect(splitEntryFees(0, 10)).toEqual({ commission: 0, payout: 0 });
    for (const total of [1, 7, 333, 12_345]) {
      const s = splitEntryFees(total, 12.5);
      expect(s.commission + s.payout).toBe(total);
    }
    expect(splitEntryFees(1000, 150)).toEqual({ commission: 1000, payout: 0 });
    expect(splitEntryFees(1000, -5)).toEqual({ commission: 0, payout: 1000 });
  });
});
