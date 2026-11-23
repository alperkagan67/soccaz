import { describe, expect, it } from "vitest";
import { evaluate, missingCoverage, nearLimit, type RawMeasurement } from "@/lib/contrast-audit";

// AC-27 unter `enforce` (R-T357): Schutz gegen stilles Schrumpfen der Abdeckung (fail-open) und Frühwarnung vor Flakes (knappe Werte).
const base: Omit<RawMeasurement, "fg" | "bg"> = { page: "start", role: "gast", scheme: "dark", viewport: 390, kind: "text", selector: "p", sample: "Text", fontSizePx: 16, fontWeight: 400 };
const m = (fg: string, bg: string, over: Partial<RawMeasurement> = {}) => evaluate({ ...base, ...over, fg, bg: { method: "stack", layers: [bg] } });

describe("nearLimit: bestanden, aber knapp (Grenze x 1,05)", () => {
  it("meldet #767676 auf Weiß (4,54:1 bei Grenze 4,5), nicht aber 16:1 und nicht Durchgefallenes", () => {
    const knapp = m("rgb(118, 118, 118)", "rgb(255, 255, 255)");
    const sicher = m("rgb(238, 244, 240)", "rgb(15, 25, 20)");
    const fail = m("rgb(140, 140, 140)", "rgb(160, 160, 160)");
    expect(knapp.status).toBe("ok");
    expect(knapp.ratio).toBeGreaterThan(4.5);
    expect(nearLimit([knapp, sicher, fail])).toEqual([knapp]);
  });
  it("der Faktor ist einstellbar (1,0: nichts knapp)", () => {
    expect(nearLimit([m("rgb(118, 118, 118)", "rgb(255, 255, 255)")], 1)).toEqual([]);
  });
});

describe("missingCoverage: jede erwartete Seite x Schema braucht mindestens einen Messpunkt", () => {
  const list = [m("rgb(238, 244, 240)", "rgb(15, 25, 20)", { page: "gast-start", scheme: "dark" }), m("rgb(18, 32, 26)", "rgb(255, 255, 255)", { page: "gast-start", scheme: "light" })];
  it("vollständig: nichts fehlt", () => {
    expect(missingCoverage(list, [{ page: "gast-start", scheme: "dark" }, { page: "gast-start", scheme: "light" }])).toEqual([]);
  });
  it("eine Seite, die nicht mehr geladen wurde, wird genannt (statt still wegzufallen)", () => {
    expect(missingCoverage(list, [{ page: "gast-start", scheme: "dark" }, { page: "spieler-app", scheme: "dark" }, { page: "gast-start", scheme: "light" }, { page: "spieler-app", scheme: "light" }])).toEqual([
      { page: "spieler-app", scheme: "dark" },
      { page: "spieler-app", scheme: "light" },
    ]);
  });
  it("ein Schema fehlt: genau dieses wird genannt", () => {
    expect(missingCoverage([list[0]], [{ page: "gast-start", scheme: "dark" }, { page: "gast-start", scheme: "light" }])).toEqual([{ page: "gast-start", scheme: "light" }]);
  });
});
