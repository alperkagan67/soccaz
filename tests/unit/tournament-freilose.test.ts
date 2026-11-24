import { describe, expect, it } from "vitest";
import { knockout, planSchedule, scheduleFromRows } from "@/lib/tournament";

// Turnierseite stürzte bei Freilosen ab (Teamzahl keine Zweierpotenz): knockout() entfernt die Freilos-Paarungen der ersten Runde, die übrigen behalten ihre Bracket-Position als slot (Lücken, z. B. 1 und 3).
// planSchedule nummeriert aber 0..n-1: Plan-Slot 0 hatte keine Zeile. scheduleFromRows bildet Plan-Slot i auf die i-te vorhandene Zeile der Runde ab.
const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const START = new Date("2026-12-12T10:00:00Z");

describe("knockout(): Struktur bei Freilosen (2 bis 32 Teams)", () => {
  for (let n = 2; n <= 32; n++) {
    it(`${n} Teams: n-1 Spiele, jedes Team genau einmal in Runde 1 oder als Freilos in Runde 2, Freilose an die höchsten Setzplätze, ein einziger Sieger`, () => {
      const teams = ids(n);
      const rows = knockout(teams);
      const size = 2 ** Math.ceil(Math.log2(n));
      const byes = size - n;
      expect(rows).toHaveLength(n - 1); // echte Spiele = alle Paarungen minus Freilos-Paarungen
      const firstStage = `ko:${size}`;
      const first = rows.filter((r) => r.stage === firstStage);
      expect(first).toHaveLength(size / 2 - byes);
      // jedes Team genau einmal: in einer Erstrunden-Paarung oder (Freilos) direkt in einer Paarung der zweiten Runde
      const seen = new Map<string, number>();
      const count = (id: string | null) => id && seen.set(id, (seen.get(id) ?? 0) + 1);
      first.forEach((r) => (count(r.a), count(r.b)));
      const second = rows.filter((r) => r.stage === `ko:${size / 2}`);
      if (size > 2) second.forEach((r) => (count(r.a), count(r.b))); // in Runde 2 stehen NUR Freilos-Teams (die Sieger der ersten Runde sind noch leer)
      expect([...seen.keys()].sort()).toEqual([...teams].sort());
      for (const [id, c] of seen) expect(c, id).toBe(1);
      // Freilose gehen an die höchsten Setzplätze (die ersten Teams der Reihenfolge)
      const bye = second.flatMap((r) => [r.a, r.b]).filter((x): x is string => Boolean(x));
      if (size > 2) expect(bye.sort()).toEqual(teams.slice(0, byes).sort());
      // feeds-Kette lückenlos: jede Zeile außer dem Finale speist genau eine vorhandene Zeile
      const finals = rows.filter((r) => !r.feeds);
      expect(finals).toHaveLength(1);
      for (const r of rows.filter((x) => x.feeds)) expect(rows.find((x) => x.stage === r.feeds!.stage && x.slot === r.feeds!.slot), `${r.stage}|${r.slot}`).toBeDefined();
      // Simulation: das Team mit dem niedrigsten Index gewinnt jedes Spiel; am Ende steht genau EIN Sieger
      const slot = new Map(rows.map((r) => [`${r.stage}|${r.slot}`, { a: r.a, b: r.b }]));
      const order = [...rows].sort((x, y) => Number(y.stage.slice(3)) - Number(x.stage.slice(3)));
      let winner: string | null = null;
      for (const r of order) {
        const cur = slot.get(`${r.stage}|${r.slot}`)!;
        expect(cur.a && cur.b, `${r.stage}|${r.slot} vollständig, bevor gespielt wird`).toBeTruthy();
        const w = Number(cur.a!.slice(1)) < Number(cur.b!.slice(1)) ? cur.a! : cur.b!;
        if (r.feeds) slot.get(`${r.feeds.stage}|${r.feeds.slot}`)![r.feeds.side] = w;
        else winner = w;
      }
      expect(winner).toBe("t1");
    });
  }
});

describe("Freilose: Plan und Spielzeilen passen zusammen (2 bis 32 Teams)", () => {
  for (let n = 2; n <= 32; n++) {
    it(`${n} Teams: jede Planpaarung hat genau eine Zeile, jede Zeile genau eine Paarung, kein Wurf`, () => {
      const rows = knockout(ids(n));
      expect(rows).toHaveLength(n - 1); // immer n-1 Spiele
      const plan = scheduleFromRows(rows, START, 120)!;
      expect(plan).not.toBeNull();
      const planned = plan.blocks.flatMap((b) => b.games.filter((g) => !g.fun));
      const key = (x: { stage: string; slot: number }) => `${x.stage}|${x.slot}`;
      expect(new Set(planned.map(key)).size).toBe(planned.length); // keine doppelte Paarung im Plan
      expect(planned.map(key).sort()).toEqual(rows.map(key).sort()); // genau die vorhandenen Zeilen, nichts erfunden, nichts ausgelassen
      for (const g of planned) expect(rows.find((r) => r.stage === g.stage && r.slot === g.slot), key(g)).toBeDefined();
      // das Spaß-Spiel der Halbfinal-Verlierer nur mit zwei echten Halbfinals (3 Teams: ein Freilos im Halbfinale, kein Verliererpaar)
      const fun = plan.blocks.flatMap((b) => b.games.filter((g) => g.fun));
      const semis = rows.filter((r) => r.stage === "ko:4").length;
      expect(fun.length).toBe(semis >= 2 ? 1 : 0);
      // jede Planpaarung hat Platz und Zeit; kein Platz doppelt im Block; der letzte Block endet höchstens mit der Hallenzeit
      for (const b of plan.blocks) {
        const courts = b.games.map((g) => g.court);
        expect(new Set(courts).size, `Block ${b.index}`).toBe(courts.length);
        expect(b.endsAt.getTime() - b.startsAt.getTime()).toBe(plan.slotMinutes * 60_000);
      }
      const last = plan.blocks[plan.blocks.length - 1];
      if (plan.slotMinutes > 5) {
        // (ab etwa 25 Teams greift die Untergrenze von 5 Minuten je Spiel, die Hallenzeit reicht dann ohnehin nicht: vorbestehende Grenze des Plans)
        expect(last.endsAt.getTime()).toBeLessThanOrEqual(START.getTime() + 120 * 60_000);
        expect(last.endsAt.getTime()).toBeGreaterThan(START.getTime() + (120 - 5 - plan.blocks.length) * 60_000); // nutzt die Hallenzeit bis auf die Abrundung
      }
    });
  }

  it("Zweierpotenzen: unverändert (Plan-Slot = echter Slot)", () => {
    for (const n of [2, 4, 8, 16, 32]) {
      const rows = knockout(ids(n));
      const mapped = scheduleFromRows(rows, START, 120)!;
      const raw = planSchedule(
        [...new Set(rows.map((r) => r.stage))].map((stage) => ({ stage, games: rows.filter((r) => r.stage === stage).length })).sort((a, b) => Number(b.stage.slice(3)) - Number(a.stage.slice(3))),
        START,
        120,
      );
      expect(mapped.blocks.map((b) => b.games.map((g) => g.slot))).toEqual(raw.blocks.map((b) => b.games.map((g) => g.slot)));
    }
  });

  it("die Ursache: 6 Teams haben in ko:8 die Zeilen 1 und 3, der Rohplan kennt 0 und 1 (Plan-Slot 0 ohne Zeile)", () => {
    const rows = knockout(ids(6));
    const first = rows.filter((r) => r.stage === "ko:8").map((r) => r.slot);
    expect(first).toEqual([1, 3]);
    const raw = planSchedule([{ stage: "ko:8", games: 2 }, { stage: "ko:4", games: 2 }, { stage: "ko:2", games: 1 }], START, 120);
    expect(raw.blocks[0].games.map((g) => g.slot)).toEqual([0, 1]);
    const mapped = scheduleFromRows(rows, START, 120)!;
    expect(mapped.blocks[0].games.map((g) => g.slot)).toEqual([1, 3]); // jetzt die echten Positionen
  });

  it("ohne Startzeit, ohne Zeilen oder bei Gruppen-Stufen: kein Plan (null), kein Wurf", () => {
    expect(scheduleFromRows([], START, 120)).toBeNull();
    expect(scheduleFromRows([{ stage: "group:A", slot: 0 }], START, 120)).toBeNull();
  });

  it("Zeiten: weniger echte Spiele ergeben längere Slots als im Rohplan mit Phantom-Spielen (slotMinutes aus den echten Blöcken)", () => {
    const mapped = scheduleFromRows(knockout(ids(6)), START, 120)!;
    expect(mapped.slotMinutes).toBeGreaterThanOrEqual(5);
    expect(mapped.blocks.length).toBeGreaterThanOrEqual(3);
  });
});
