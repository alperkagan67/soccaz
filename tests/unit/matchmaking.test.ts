import { describe, expect, it } from "vitest";
import { agreedOption, combineOptions, eloRange, findPairs, optionStillValid, overlap, strengthOk, suggestSlots, usableWindows, type QueueEntry, type Window } from "@/lib/matchmaking";

const now = new Date("2026-11-01T10:00:00Z");
const at = (iso: string) => new Date(iso);
const win = (from: string, to: string): Window => ({ from: at(from), to: at(to) });
const H = 3_600_000;

let n = 0;
const entry = (over: Partial<QueueEntry> & { windows?: Window[] } = {}): QueueEntry => ({
  id: `e${++n}`,
  teamId: `t${n}`,
  city: "Essen",
  durationMin: 60,
  elo: 1000,
  createdAt: new Date(now.getTime() - 60_000),
  windows: [win("2026-11-05T17:00:00Z", "2026-11-05T21:00:00Z")],
  ...over,
});

describe("Elo-Bereich", () => {
  it("startet eng und wächst mit der Wartezeit bis zur Grenze", () => {
    expect(eloRange(0)).toBe(100);
    expect(eloRange(4 * 60_000)).toBe(100);
    expect(eloRange(5 * 60_000)).toBe(150);
    expect(eloRange(30 * 60_000)).toBe(400);
    expect(eloRange(10 * H)).toBe(600);
    expect(eloRange(-5)).toBe(100);
  });
});

describe("Zeitfenster", () => {
  it("zu kurze, zu nahe und überlappende Fenster werden bereinigt", () => {
    const w = usableWindows(
      [win("2026-11-01T11:00:00Z", "2026-11-01T20:00:00Z"), win("2026-11-03T17:00:00Z", "2026-11-03T17:30:00Z"), win("2026-11-04T10:00:00Z", "2026-11-04T12:00:00Z"), win("2026-11-04T11:30:00Z", "2026-11-04T14:00:00Z")],
      60,
      now,
    );
    // Fenster 1 liegt vor dem Vorlauf (24 h), Fenster 2 ist zu kurz, 3 und 4 werden zusammengeführt
    expect(w).toEqual([win("2026-11-04T10:00:00Z", "2026-11-04T14:00:00Z")]);
  });
  it("Fenster, das teilweise im Vorlauf liegt, wird gekürzt", () => {
    const w = usableWindows([win("2026-11-01T20:00:00Z", "2026-11-02T20:00:00Z")], 60, now);
    expect(w).toEqual([win("2026-11-02T10:00:00Z", "2026-11-02T20:00:00Z")]);
  });
  it("Überschneidung zweier Teams, mindestens so lang wie das Spiel", () => {
    const a = [win("2026-11-05T17:00:00Z", "2026-11-05T21:00:00Z")];
    const b = [win("2026-11-05T20:30:00Z", "2026-11-05T23:00:00Z")];
    expect(overlap(a, b, 60)).toEqual([]); // nur 30 Minuten
    expect(overlap(a, b, 30)).toEqual([win("2026-11-05T20:30:00Z", "2026-11-05T21:00:00Z")]);
    expect(overlap(a, [win("2026-11-05T18:00:00Z", "2026-11-05T22:00:00Z")], 90)).toEqual([win("2026-11-05T18:00:00Z", "2026-11-05T21:00:00Z")]);
  });
  it("Vorschläge: Viertelstunden-Raster, erst ein Termin pro Tag", () => {
    const common = [win("2026-11-05T17:05:00Z", "2026-11-05T21:00:00Z"), win("2026-11-06T18:00:00Z", "2026-11-06T20:00:00Z")];
    const slots = suggestSlots(common, 60, 3);
    expect(slots.map((d) => d.toISOString())).toEqual(["2026-11-05T17:15:00.000Z", "2026-11-05T18:15:00.000Z", "2026-11-06T18:00:00.000Z"].sort());
    expect(suggestSlots(common, 60, 1)).toHaveLength(1);
    expect(suggestSlots([win("2026-11-05T17:00:00Z", "2026-11-05T17:45:00Z")], 60)).toEqual([]);
  });
});

describe("Paarung", () => {
  it("passende Teams werden gepaart und bekommen Terminvorschläge", () => {
    const a = entry({ elo: 1000 });
    const b = entry({ elo: 1060 });
    const pairs = findPairs([a, b], now);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].eloDiff).toBe(60);
    expect(pairs[0].slots.length).toBeGreaterThan(0);
  });
  it("Elo-Abstand außerhalb des Bereichs wartet, wird mit der Zeit erlaubt", () => {
    const a = entry({ elo: 1000, createdAt: new Date(now.getTime() - 60_000) });
    const b = entry({ elo: 1300, createdAt: new Date(now.getTime() - 60_000) });
    expect(findPairs([a, b], now)).toHaveLength(0);
    const waitedA = { ...a, createdAt: new Date(now.getTime() - 25 * 60_000) }; // Bereich 350
    expect(findPairs([waitedA, b], now)).toHaveLength(1);
  });
  it("andere Stadt, andere Dauer, gleiches Team, keine gemeinsame Zeit: keine Paarung", () => {
    const base = entry();
    expect(findPairs([base, entry({ city: "Bochum" })], now)).toHaveLength(0);
    expect(findPairs([base, entry({ durationMin: 90 })], now)).toHaveLength(0);
    expect(findPairs([base, entry({ teamId: base.teamId })], now)).toHaveLength(0);
    expect(findPairs([base, entry({ windows: [win("2026-11-09T17:00:00Z", "2026-11-09T21:00:00Z")] })], now)).toHaveLength(0);
  });
  it("bester Gegner: kleinster Elo-Abstand; jedes Team nur einmal", () => {
    const a = entry({ elo: 1000, createdAt: new Date(now.getTime() - 10 * 60_000) });
    const far = entry({ elo: 1090 });
    const near = entry({ elo: 1010 });
    const other = entry({ elo: 1500 });
    const pairs = findPairs([a, far, near, other], now);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe(a.id);
    expect(pairs[0].b.id).toBe(near.id);
  });
  it("vier Teams ergeben zwei Paare", () => {
    const pairs = findPairs([entry({ elo: 1000 }), entry({ elo: 1020 }), entry({ elo: 1400 }), entry({ elo: 1380 })], now);
    expect(pairs).toHaveLength(2);
    expect(new Set(pairs.flatMap((p) => [p.a.id, p.b.id])).size).toBe(4);
  });
  it("Fenster nur im Vorlauf: keine Paarung", () => {
    const soon = [win("2026-11-01T12:00:00Z", "2026-11-01T20:00:00Z")];
    expect(findPairs([entry({ windows: soon }), entry({ windows: soon })], now)).toHaveLength(0);
  });
});

describe("Vorschläge und Einigung", () => {
  it("Zeiten mit Hallen kombinieren, höchstens 6", () => {
    const slots = [at("2026-11-05T17:00:00Z"), at("2026-11-06T17:00:00Z"), at("2026-11-07T17:00:00Z")];
    expect(combineOptions(slots, [], 6)).toHaveLength(3);
    const two = combineOptions(slots, ["A", "B"], 6);
    expect(two).toHaveLength(6);
    expect(two[0]).toMatchObject({ venue: "A" });
    expect(combineOptions(slots, ["A", "B", "C"], 4)).toHaveLength(4);
  });
  it("gültig nur mit 24 Stunden Vorlauf", () => {
    expect(optionStillValid(new Date(now.getTime() + 24 * H), now)).toBe(true);
    expect(optionStillValid(new Date(now.getTime() + 24 * H - 1), now)).toBe(false);
  });
  it("Einigung nur, wenn beide Teams dieselbe Option gewählt haben", () => {
    expect(agreedOption([{ teamId: "h", optionId: "o1" }], "h", "g")).toBeNull();
    expect(agreedOption([{ teamId: "h", optionId: "o1" }, { teamId: "g", optionId: "o2" }], "h", "g")).toBeNull();
    expect(agreedOption([{ teamId: "h", optionId: "o1" }, { teamId: "g", optionId: "o1" }], "h", "g")).toBe("o1");
    expect(agreedOption([{ teamId: "x", optionId: "o1" }, { teamId: "y", optionId: "o1" }], "h", "g")).toBeNull();
  });
});

describe("Gesuchte Spielstärke", () => {
  it("Wunsch von/bis wirkt in beide Richtungen", () => {
    expect(strengthOk({}, 3)).toBe(true);
    expect(strengthOk({ wantMin: 3 }, 2)).toBe(false);
    expect(strengthOk({ wantMin: 3 }, 5)).toBe(true);
    expect(strengthOk({ wantMax: 3 }, 4)).toBe(false);
    expect(strengthOk({ wantMin: 2, wantMax: 4 }, 3)).toBe(true);
    expect(strengthOk({ wantMin: 2, wantMax: 4 }, undefined)).toBe(true);

    const picky = entry({ strength: 3, wantMin: 4 });
    expect(findPairs([picky, entry({ strength: 3 })], now)).toHaveLength(0); // der andere ist zu schwach
    expect(findPairs([picky, entry({ strength: 4 })], now)).toHaveLength(1);
    // der andere wünscht sich Teams bis Stufe 2, wir sind Stufe 3
    expect(findPairs([entry({ strength: 3 }), entry({ strength: 2, wantMax: 2 })], now)).toHaveLength(0);
    expect(findPairs([entry({ strength: 2 }), entry({ strength: 2, wantMax: 2 })], now)).toHaveLength(1);
  });
});
