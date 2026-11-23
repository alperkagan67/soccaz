import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERF_LIMITS, PERF_MODE, evaluatePerf, fpsOf, perfPasses, perfReport, perfWarnings, type PerfInput } from "@/lib/perf-budget";

// Vertrag 013 v3, AC-21: Leistungsbudget als reiner Rechenkern; Modus "report" (Entscheid t2q: Leistungsmessungen auf CI-Runnern sind nie hart gating).
const good: PerfInput = { longTasksMs: [], cls: 0, fps: 60, interactionMs: 40, maxAnimations: 2 };
const checksOf = (over: Partial<PerfInput>) => evaluatePerf({ ...good, ...over });
const failing = (over: Partial<PerfInput>) => checksOf(over).filter((c) => !c.ok).map((c) => c.name);

describe("evaluatePerf: Grenzen aus AC-21 unverändert", () => {
  it("alles im Budget: keine Beanstandung", () => {
    expect(failing({})).toEqual([]);
    expect(PERF_LIMITS).toEqual({ longTaskMs: 50, cls: 0, fps: 55, interactionMs: 200, maxAnimations: 6 });
  });

  it("Long Tasks: bis 50 ms ok, ab 51 ms nicht", () => {
    expect(failing({ longTasksMs: [50] })).toEqual([]);
    expect(failing({ longTasksMs: [20, 51] })).toEqual(["Long Tasks im Fenster"]);
  });

  it("Layoutverschiebung: genau 0 ok, schon 0,000164 nicht (Vertragswert nicht abgeschwächt)", () => {
    expect(failing({ cls: 0 })).toEqual([]);
    expect(failing({ cls: 0.000164 })).toEqual(["Layoutverschiebung (CLS) im Fenster"]);
  });

  it("Bildrate: 55 ok, 54,9 nicht, nicht messbar (NaN) nicht", () => {
    expect(failing({ fps: 55 })).toEqual([]);
    expect(failing({ fps: 54.9 })).toEqual(["Bildrate im Mittel"]);
    expect(failing({ fps: Number.NaN })).toEqual(["Bildrate im Mittel"]);
  });

  it("Interaktion: unter 200 ms ok (auch ohne Messwert), ab 200 ms nicht", () => {
    expect(failing({ interactionMs: 199 })).toEqual([]);
    expect(failing({ interactionMs: null })).toEqual([]);
    expect(failing({ interactionMs: 200 })).toEqual(["Interaktion nach Tippen"]);
  });

  it("gleichzeitige Animationen: bis 6 ok, 7 nicht", () => {
    expect(failing({ maxAnimations: 6 })).toEqual([]);
    expect(failing({ maxAnimations: 7 })).toEqual(["Gleichzeitige Animationen"]);
  });
});

describe("Modus", () => {
  const bad = checksOf({ cls: 0.01, fps: 30, longTasksMs: [120] });

  it("PERF_MODE steht auf report (Entscheid t2q); das Umschalten auf enforce ist eine bewusste Änderung", () => {
    expect(PERF_MODE).toBe("report");
  });

  it("report: bleibt GRÜN trotz Verstößen; enforce: rot bei jedem Verstoß, grün ohne", () => {
    expect(perfPasses(bad, "report")).toBe(true);
    expect(perfPasses(bad, "enforce")).toBe(false);
    expect(perfPasses(checksOf({}), "enforce")).toBe(true);
    expect(perfPasses(bad)).toBe(PERF_MODE === "report" ? true : false); // Standard = PERF_MODE
  });

  it("Warnungen: eine einzeilige ::warning je Verstoß, keine bei bestandener Messung", () => {
    const w = perfWarnings(bad);
    expect(w).toHaveLength(3);
    for (const line of w) {
      expect(line.startsWith("::warning title=AC-21 Leistung::")).toBe(true);
      expect(line).not.toMatch(/[\r\n]/);
    }
    expect(perfWarnings(checksOf({}))).toEqual([]);
  });

  it("Bericht: Tabelle mit Messwert, Grenze und Ergebnis; Verstöße sind markiert; der Modus steht darin", () => {
    const r = perfReport(bad, "report");
    expect(r).toContain("Modus report");
    expect(r).toMatch(/Layoutverschiebung \(CLS\) im Fenster \| 0\.010000 \| 0 \| ÜBER DER GRENZE/);
    expect(r).toMatch(/Gleichzeitige Animationen \| 2 \| <= 6 \| ok/);
  });
});

describe("fpsOf", () => {
  it("60 Frames pro Sekunde, zu wenige Frames und ein Fenster ohne Dauer sind nicht messbar (NaN, nie ein Absturz)", () => {
    const frames = Array.from({ length: 61 }, (_, i) => 1000 + (i * 1000) / 60);
    expect(fpsOf(frames)).toBeCloseTo(60, 5);
    expect(fpsOf([5])).toBeNaN();
    expect(fpsOf([])).toBeNaN();
    expect(fpsOf([7, 7])).toBeNaN();
  });
});

describe("Spec nutzt den Modus (Quelltext)", () => {
  const spec = readFileSync(path.join(process.cwd(), "tests/e2e/performance-animation.spec.ts"), "utf8");

  it("die Grenzwerte stehen nicht mehr als harte Prüfungen in der Spec; sie läuft über evaluatePerf und perfPasses(PERF_MODE) und protokolliert ::warning und Anhänge", () => {
    for (const hart of ["toBeGreaterThanOrEqual(55)", "toBeLessThanOrEqual(6)", "slowTaps", "longInWindow"]) expect(spec, hart).not.toContain(hart);
    expect(spec).toContain("evaluatePerf(");
    expect(spec).toContain("perfPasses(checks, PERF_MODE)");
    expect(spec).toContain("perfWarnings(checks)");
    expect(spec).toContain("leistung-bericht.md");
    expect(spec).toContain("layout-shifts.json");
  });

  it("harte Voraussetzungen bleiben rot-fähig: Animationen gestartet, Messfenster gültig, Seite sichtbar", () => {
    expect(spec).toContain("es wurden Animationen gestartet");
    expect(spec).toContain("Messfenster gültig");
    expect(spec).toContain('getByTestId("reveal-motion")).toBeVisible()');
  });
});
