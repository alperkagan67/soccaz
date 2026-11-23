import { describe, expect, it } from "vitest";
import {
  AUDIT_MODE,
  LIMITS,
  auditPasses,
  compositeOver,
  evaluate,
  flattenLayers,
  groupEvaluations,
  isLargeText,
  limitFor,
  parseCssColor,
  percentile,
  ratio,
  renderProtocol,
  summarize,
  type RawMeasurement,
} from "@/lib/contrast-audit";

// AC-27 (Vertrag 013 v3): der reine Rechenkern des Messprotokolls. Der Browserteil (Specs) folgt in einem eigenen PR.
const base: Omit<RawMeasurement, "fg" | "bg"> = { page: "start", role: "gast", scheme: "dark", viewport: 390, kind: "text", selector: "h1", sample: "Titel", fontSizePx: 16, fontWeight: 400 };
const stack = (fg: string, ...layers: string[]): RawMeasurement => ({ ...base, fg, bg: { method: "stack", layers } });

describe("parseCssColor", () => {
  it("liest die Schreibweisen von getComputedStyle", () => {
    expect(parseCssColor("rgb(255, 106, 31)")).toEqual({ r: 255, g: 106, b: 31, a: 1 });
    expect(parseCssColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor("rgb(0 0 0 / 50%)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor("color(srgb 1 0.5 0 / 0.25)")).toEqual({ r: 255, g: 127.5, b: 0, a: 0.25 });
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#0b111880")?.a).toBeCloseTo(0.502, 2);
    expect(parseCssColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
  it("Unlesbares gibt null, nichts wird erfunden", () => {
    for (const v of ["oklch(0.7 0.1 30)", "currentcolor", "rot", "", "rgb(1,2)", "color(display-p3 1 0 0)", "rgb(a, b, c)"]) expect(parseCssColor(v), v).toBeNull();
    expect(parseCssColor(undefined as never)).toBeNull();
  });
});

describe("Mischung und Verhältnis", () => {
  it("Alpha über Grund und Stapel", () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 })).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(flattenLayers([{ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 0.5 }])).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(flattenLayers([])).toEqual({ r: 255, g: 255, b: 255 });
  });
  it("Referenzwerte: Schwarz/Weiß 21:1, #767676 auf Weiß knapp über 4,5:1, gleiche Farbe 1:1", () => {
    expect(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
    expect(ratio({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 })).toBeGreaterThan(4.5);
    expect(ratio({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 })).toBeLessThan(4.6);
    expect(ratio({ r: 9, g: 9, b: 9 }, { r: 9, g: 9, b: 9 })).toBe(1);
  });
});

describe("Grenzen", () => {
  it("großer Text ab 24 px oder ab 18,66 px und Gewicht 700", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(18.6, 700)).toBe(false);
  });
  it("Grenzwert je Art: Text 4,5, großer Text 3, Zeichen 3, Fokus 3", () => {
    expect(limitFor("text", 16, 400)).toBe(4.5);
    expect(limitFor("text", 32, 400)).toBe(3);
    expect(limitFor("non-text")).toBe(3);
    expect(limitFor("focus")).toBe(3);
    expect(LIMITS).toEqual({ text: 4.5, largeText: 3, nonText: 3, focus: 3 });
  });
});

describe("percentile", () => {
  it("Randfälle und Interpolation", () => {
    expect(percentile([], 5)).toBeNaN();
    expect(percentile([7], 5)).toBe(7);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 25)).toBe(2);
    expect(percentile([0, 10], 50)).toBe(5);
  });
});

describe("evaluate: Hintergrundstapel", () => {
  it("weißer Text auf dunkler Fläche besteht, grauer auf grauer fällt durch (mit Zahl)", () => {
    const ok = evaluate(stack("rgb(238, 244, 240)", "rgb(15, 25, 20)"));
    expect(ok.status).toBe("ok");
    expect(ok.ratio).toBeGreaterThan(15);
    const bad = evaluate(stack("rgb(140, 140, 140)", "rgb(160, 160, 160)"));
    expect(bad.status).toBe("fail");
    expect(bad.ratio).toBeLessThan(4.5);
  });
  it("halbtransparenter Text und halbtransparente Fläche werden zuerst gemischt", () => {
    // Schwarz mit 50 % auf Weiß = Grau 128 -> etwa 3,9:1: für normalen Text zu wenig, für großen genug
    const small = evaluate(stack("rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"));
    expect(small.ratio).toBeCloseTo(3.95, 1);
    expect(small.status).toBe("fail");
    const large = evaluate({ ...stack("rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"), fontSizePx: 28 });
    expect(large.limit).toBe(3);
    expect(large.status).toBe("ok");
    // Scrim 75 % schwarz über Weiß, darauf weißer Text: besteht
    expect(evaluate(stack("rgb(255, 255, 255)", "rgb(255, 255, 255)", "rgba(0, 0, 0, 0.75)")).status).toBe("ok");
  });
  it("Zeichen und Fokusring: 3:1", () => {
    const ring = evaluate({ ...stack("rgb(158, 203, 255)", "rgb(27, 42, 35)"), kind: "focus" });
    expect(ring.limit).toBe(3);
    expect(ring.status).toBe("ok");
    const weak = evaluate({ ...stack("rgb(58, 80, 67)", "rgb(27, 42, 35)"), kind: "non-text" });
    expect(weak.status).toBe("fail");
  });
  it("unlesbar und ausgenommen werden benannt, nie als bestanden gezählt", () => {
    expect(evaluate(stack("oklch(0.7 0.1 30)", "rgb(0, 0, 0)")).status).toBe("unlesbar");
    expect(evaluate(stack("rgb(0, 0, 0)", "banane")).status).toBe("unlesbar");
    const disabled = evaluate({ ...stack("rgb(120, 120, 120)", "rgb(130, 130, 130)"), disabled: true });
    expect(disabled.status).toBe("ausgenommen");
  });
});

describe("evaluate: Pixel (Verlauf, Glow, Bild)", () => {
  // je Pixel r,g,b: 19 dunkle Pixel und 1 heller Ausreißer
  const dark = Array.from({ length: 19 }, () => [20, 30, 25]).flat();
  it("bewertet wird das 5. Perzentil, das Minimum steht daneben; ein einzelner heller Pixel kippt nicht alles", () => {
    const one: RawMeasurement = { ...base, fg: "rgb(255, 255, 255)", bg: { method: "pixel", pixels: [...dark, 250, 250, 250] } };
    const r = evaluate(one);
    expect(r.method).toBe("pixel");
    expect(r.worst).toBeLessThan(1.1); // der helle Pixel: Weiß auf Weiß
    expect(r.ratio).toBeGreaterThan(4.5); // 5. Perzentil: die dunkle Mehrheit
    expect(r.status).toBe("ok");
  });
  it("breite helle Stelle (ein Viertel der Pixel) lässt die Messung durchfallen", () => {
    const light = Array.from({ length: 5 }, () => [240, 240, 240]).flat();
    const r = evaluate({ ...base, fg: "rgb(255, 255, 255)", bg: { method: "pixel", pixels: [...dark, ...light] } });
    expect(r.status).toBe("fail");
    expect(r.ratio).toBeLessThan(4.5);
  });
  it("keine Pixel: unlesbar, nicht bestanden", () => {
    expect(evaluate({ ...base, fg: "rgb(0, 0, 0)", bg: { method: "pixel", pixels: [] } }).status).toBe("unlesbar");
  });
});

describe("Gruppierung, Zusammenfassung, Modus, Protokoll", () => {
  const list = [
    evaluate(stack("rgb(238, 244, 240)", "rgb(15, 25, 20)")),
    evaluate(stack("rgb(238, 244, 240)", "rgb(15, 25, 20)")),
    evaluate(stack("rgb(140, 140, 140)", "rgb(160, 160, 160)")),
    evaluate({ ...stack("rgb(1, 1, 1)", "rgb(2, 2, 2)"), disabled: true }),
  ];
  it("gleiche Kombinationen werden zusammengefasst und gezählt", () => {
    const groups = groupEvaluations(list);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.count === 2)?.example.status).toBe("ok");
  });
  it("Zusammenfassung zählt je Ergebnis", () => {
    expect(summarize(list)).toEqual({ total: 4, ok: 2, fail: 1, ausgenommen: 1, unlesbar: 0 });
  });
  it("Baseline meldet nur (Test grün), verbindlich schlägt jede Unterschreitung und jeder unlesbare Punkt an", () => {
    expect(AUDIT_MODE).toBe("report"); // Phase 1; das Umschalten auf "enforce" ist eine bewusste Änderung (nach M2c)
    expect(auditPasses(list, "report")).toBe(true);
    expect(auditPasses(list, "enforce")).toBe(false);
    expect(auditPasses([list[0], list[1]], "enforce")).toBe(true);
    expect(auditPasses([evaluate(stack("oklch(1 0 0)", "rgb(0, 0, 0)"))], "enforce")).toBe(false);
    expect(auditPasses([], "enforce")).toBe(true);
  });
  it("Protokoll: Kopf, Ergebnis, Verstöße zuerst, deutsche Zahlen, Anzahl; keine senkrechten Striche im Text", () => {
    const md = renderProtocol(list, { commit: "abc1234", date: "2026-11-23", mode: "report" });
    expect(md).toContain("# Kontrast-Messprotokoll (AC-27)");
    expect(md).toContain("Commit abc1234");
    expect(md).toContain("Baseline (nur melden)");
    expect(md).toContain("**Ergebnis:** 4 Messpunkte, 2 bestanden, 1 durchgefallen, 0 unlesbar, 1 ausgenommen");
    expect(md.indexOf("## Verstöße")).toBeLessThan(md.indexOf("## Alle Messpunkte"));
    expect(md).toMatch(/\| 2 \|\n/); // die zusammengefasste Gruppe mit Zähler 2
    expect(md).toMatch(/\d,\d\d/); // Komma als Dezimaltrenner
    const withPipe = renderProtocol([evaluate({ ...stack("rgb(0, 0, 0)", "rgb(255, 255, 255)"), selector: "a|b", sample: "x|y" })], { commit: "c", date: "d", mode: "enforce" });
    expect(withPipe).toContain("verbindlich");
    expect(withPipe).not.toContain("a|b");
    expect(withPipe).not.toContain("## Verstöße"); // nichts durchgefallen: kein Abschnitt
  });
});
