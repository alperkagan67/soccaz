import { beforeEach, describe, expect, it } from "vitest";
import { cachedEvidenceReport, clearEvidenceReportCache } from "@/server/evidence";

// Zwischengespeicherter Bericht (Review R-T225a/R-T226): höchstens alle 60 s neu, gleichzeitige Abrufe teilen EINE Berechnung (kein Ansturm nach Ablauf). Ohne Datenbank: der Ausführer zählt nur.
function fakeExec() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    exec: {
      select: () => {
        throw new Error("nicht benutzt");
      },
      execute: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return { rows: [] };
      },
    } as never,
  };
}

beforeEach(() => clearEvidenceReportCache());

describe("cachedEvidenceReport", () => {
  it("gleichzeitige Abrufe teilen eine Berechnung; danach 60 s lang aus dem Zwischenspeicher; nach Ablauf neu", async () => {
    const f = fakeExec();
    const t0 = 1_000_000;
    const one = await cachedEvidenceReport(t0, f.exec);
    const perRun = f.calls;
    expect(perRun).toBeGreaterThan(0);
    clearEvidenceReportCache();
    const g = fakeExec();
    const results = await Promise.all(Array.from({ length: 8 }, () => cachedEvidenceReport(t0, g.exec)));
    expect(g.calls).toBe(perRun); // acht gleichzeitige Abrufe = EINE Berechnung
    expect(new Set(results).size).toBe(1);
    const again = await cachedEvidenceReport(t0 + 59_000, g.exec);
    expect(again).toBe(results[0]);
    expect(g.calls).toBe(perRun); // noch im Zwischenspeicher
    await cachedEvidenceReport(t0 + 61_000, g.exec);
    expect(g.calls).toBe(perRun * 2); // abgelaufen: neu berechnet
    expect(one.checkedAt.getTime()).toBe(t0);
  });
});
