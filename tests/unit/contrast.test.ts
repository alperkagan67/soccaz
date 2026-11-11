import { describe, expect, it } from "vitest";
import { TEAM_COLORS, TEXT_DARK, TEXT_LIGHT, THEMES, contrast, textOn } from "@/lib/color";

// Erwartete Werte: Tabelle in docs/design/README.md (Abschnitt „Teamfarben und Lesbarkeit“).
const EXPECTED: Record<string, { text: string; onColor: number; onDark: number; onLight: number }> = {
  red: { text: TEXT_LIGHT, onColor: 5.88, onDark: 2.55, onLight: 5.35 },
  burgundy: { text: TEXT_LIGHT, onColor: 10.04, onDark: 1.49, onLight: 9.13 },
  pink: { text: TEXT_DARK, onColor: 5.23, onDark: 4.13, onLight: 3.29 },
  violet: { text: TEXT_LIGHT, onColor: 7.02, onDark: 2.13, onLight: 6.38 },
  navy: { text: TEXT_LIGHT, onColor: 14.64, onDark: 1.02, onLight: 13.3 },
  blue: { text: TEXT_LIGHT, onColor: 6.78, onDark: 2.21, onLight: 6.16 },
  skyblue: { text: TEXT_DARK, onColor: 8.08, onDark: 6.38, onLight: 2.13 },
  teal: { text: TEXT_DARK, onColor: 7.39, onDark: 5.83, onLight: 2.33 },
  green: { text: TEXT_DARK, onColor: 5.46, onDark: 4.31, onLight: 3.16 },
  yellow: { text: TEXT_DARK, onColor: 11.28, onDark: 8.91, onLight: 1.53 },
  white: { text: TEXT_DARK, onColor: 17.22, onDark: 13.6, onLight: 1.0 },
  black: { text: TEXT_LIGHT, onColor: 17.81, onDark: 1.19, onLight: 16.18 },
};

describe("Kontrast (AC-7)", () => {
  it("Referenzwerte der Rechenfunktion", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2); // bekannter WCAG-Grenzwert
    expect(contrast("#123456", "#abcdef")).toBeCloseTo(contrast("#abcdef", "#123456"), 10);
  });

  it("die Palette hat genau 12 verschiedene Farben ohne Orange", () => {
    expect(TEAM_COLORS).toHaveLength(12);
    expect(new Set(TEAM_COLORS.map((c) => c.key)).size).toBe(12);
    expect(new Set(TEAM_COLORS.map((c) => c.hex)).size).toBe(12);
    for (const c of TEAM_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(TEAM_COLORS.map((c) => c.hex)).not.toContain(THEMES.dark.o);
    expect(TEAM_COLORS.map((c) => c.hex)).not.toContain(THEMES.light.o);
  });

  for (const c of TEAM_COLORS) {
    it(`Teamfarbe ${c.name}: Textfarbe automatisch, mindestens 4,5:1, Werte wie in der Tabelle`, () => {
      const e = EXPECTED[c.key];
      const text = textOn(c.hex);
      expect(text).toBe(e.text);
      const ratio = contrast(c.hex, text);
      expect(ratio).toBeGreaterThanOrEqual(4.5); // Text und Spielerzeichen
      expect(ratio).toBeCloseTo(e.onColor, 1);
      expect(contrast(c.hex, THEMES.dark.fl)).toBeCloseTo(e.onDark, 1);
      expect(contrast(c.hex, THEMES.light.fl)).toBeCloseTo(e.onLight, 1);
      // Die gewählte Textfarbe ist die bessere der beiden.
      expect(ratio).toBeGreaterThanOrEqual(Math.max(contrast(c.hex, TEXT_LIGHT), contrast(c.hex, TEXT_DARK)) - 1e-9);
    });
  }

  for (const theme of ["dark", "light"] as const) {
    const t = THEMES[theme];
    describe(`Neutrale Töne und Orange (${theme})`, () => {
      it("Text auf Grund, Fläche und Feldgrund mindestens 4,5:1", () => {
        for (const ground of [t.bg, t.fl, t.fl2]) {
          expect(contrast(t.ink, ground), `ink auf ${ground}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(t.muted, ground), `muted auf ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      });
      it("Feldlinie gegen Fläche mindestens 3:1", () => {
        for (const ground of [t.bg, t.fl, t.fl2]) expect(contrast(t.rim, ground), `rim auf ${ground}`).toBeGreaterThanOrEqual(3);
      });
      it("Orange gegen Fläche mindestens 3:1, Schrift auf Orange mindestens 4,5:1", () => {
        expect(contrast(t.o, t.fl)).toBeGreaterThanOrEqual(3);
        expect(contrast(t.o, t.bg)).toBeGreaterThanOrEqual(3);
        expect(contrast(t.oi, t.o)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it("dokumentierte Werte von Tinte, Gedämpft und Orange", () => {
    expect(contrast(THEMES.dark.ink, THEMES.dark.fl)).toBeCloseTo(13.43, 1);
    expect(contrast(THEMES.light.ink, THEMES.light.fl)).toBeCloseTo(15.3, 1);
    expect(contrast(THEMES.dark.muted, THEMES.dark.fl)).toBeCloseTo(6.96, 1);
    expect(contrast(THEMES.light.muted, THEMES.light.fl)).toBeCloseTo(6.64, 1);
    expect(contrast(THEMES.dark.oi, THEMES.dark.o)).toBeCloseTo(6.69, 1);
    expect(contrast(THEMES.light.oi, THEMES.light.o)).toBeCloseTo(5.18, 1);
    expect(contrast(THEMES.dark.o, THEMES.dark.fl)).toBeCloseTo(5.23, 1);
    expect(contrast(THEMES.light.o, THEMES.light.fl)).toBeCloseTo(4.71, 1);
  });
});
