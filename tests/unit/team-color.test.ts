import { describe, expect, it } from "vitest";
import { TEAM_COLORS } from "@/lib/color";
import { COLOR_KEYS, DISTANCE_MIN, colorByKey, deltaE00, defaultColorKey, displayAwayColor, isColorKey, labDistance } from "@/lib/team-color";

const hexOf = (key: string) => TEAM_COLORS.find((c) => c.key === key)!.hex;
const dist = (a: string, b: string) => deltaE00(hexOf(a), hexOf(b));

describe("deltaE00 (CIEDE2000, CIELAB D65)", () => {
  it("Sharma-Referenz: (50, 2,6772, -79,7751) gegen (50, 0, -82,7485) ergibt 2,0425", () => {
    expect(labDistance([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
  });

  it("weitere Sharma-Paare", () => {
    expect(labDistance([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(2.8615, 4);
    expect(labDistance([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4);
    expect(labDistance([50, 2.5, 0], [50, 0, -2.5])).toBeCloseTo(4.3065, 4);
  });

  it("gleiche Farbe 0, symmetrisch", () => {
    expect(dist("red", "red")).toBe(0);
    for (const a of TEAM_COLORS) for (const b of TEAM_COLORS) expect(deltaE00(a.hex, b.hex)).toBeCloseTo(deltaE00(b.hex, a.hex), 9);
  });

  it("genau vier der 66 Paare liegen unter 20, mit den Werten aus Vertrag 007", () => {
    const low: string[] = [];
    for (let i = 0; i < TEAM_COLORS.length; i++)
      for (let j = i + 1; j < TEAM_COLORS.length; j++) {
        const d = deltaE00(TEAM_COLORS[i].hex, TEAM_COLORS[j].hex);
        if (d < DISTANCE_MIN) low.push(`${TEAM_COLORS[i].key}/${TEAM_COLORS[j].key}`);
      }
    expect(low.map((p) => p.split("/").sort().join("/")).sort()).toEqual(["black/navy", "blue/violet", "burgundy/red", "green/teal"]);
    expect(low).toHaveLength(4);
    expect(dist("violet", "blue")).toBeCloseTo(11.8, 1);
    expect(dist("navy", "black")).toBeCloseTo(14.4, 1);
    expect(dist("red", "burgundy")).toBeCloseTo(19.1, 1);
    expect(dist("teal", "green")).toBeCloseTo(19.9, 1);
    expect(dist("navy", "blue")).toBeCloseTo(20.8, 1); // nächstes erlaubtes Paar
  });
});

describe("displayAwayColor (AC-9)", () => {
  it("ab 20 bleibt die Gastfarbe", () => {
    expect(displayAwayColor("red", "skyblue")).toBe("skyblue");
    expect(displayAwayColor("navy", "blue")).toBe("blue"); // 20,8 gilt
  });

  it("die vier gesperrten Paare werden ersetzt: Ergebnis in der Palette, Abstand zu Heim mindestens 20, deterministisch", () => {
    for (const [home, away] of [["violet", "blue"], ["blue", "violet"], ["navy", "black"], ["black", "navy"], ["red", "burgundy"], ["burgundy", "red"], ["teal", "green"], ["green", "teal"]]) {
      const r = displayAwayColor(home, away);
      expect(r).not.toBe(away);
      expect(isColorKey(r)).toBe(true);
      expect(dist(home, r)).toBeGreaterThanOrEqual(DISTANCE_MIN);
      expect(displayAwayColor(home, away)).toBe(r);
    }
  });

  it("ersetzt durch die nächstliegende Palettenfarbe zur Gastfarbe mit Abstand >= 20 zu Heim", () => {
    // Violett (Heim) gegen Blau (Gast): die Ersatzfarbe ist die der Gastfarbe nächste erlaubte
    const r = displayAwayColor("violet", "blue");
    const allowed = COLOR_KEYS.filter((k) => dist("violet", k) >= DISTANCE_MIN);
    const best = allowed.reduce((a, b) => (dist("blue", a) <= dist("blue", b) ? a : b));
    expect(r).toBe(best);
  });

  it("gleiche Farbe bei beiden Teams wird ebenfalls ersetzt", () => {
    const r = displayAwayColor("red", "red");
    expect(r).not.toBe("red");
    expect(dist("red", r)).toBeGreaterThanOrEqual(DISTANCE_MIN);
  });

  it("jede der 144 Kombinationen liefert eine Palettenfarbe mit Abstand >= 20 (oder die unveränderte Gastfarbe)", () => {
    for (const h of COLOR_KEYS)
      for (const a of COLOR_KEYS) {
        const r = displayAwayColor(h, a);
        expect(isColorKey(r)).toBe(true);
        expect(dist(h, r)).toBeGreaterThanOrEqual(DISTANCE_MIN);
        if (dist(h, a) >= DISTANCE_MIN) expect(r).toBe(a);
      }
  });
});

describe("Schlüssel und Standardfarbe (AC-12)", () => {
  it("isColorKey akzeptiert nur die 12 Schlüssel", () => {
    expect(COLOR_KEYS).toHaveLength(12);
    for (const k of COLOR_KEYS) expect(isColorKey(k)).toBe(true);
    for (const bad of ["orange", "#c8102e", "<script>alert(1)</script>", "", "RED", "red ", "__proto__", "constructor", null, undefined, 3]) expect(isColorKey(bad)).toBe(false);
  });

  it("colorByKey liefert Name und Hex, sonst null", () => {
    expect(colorByKey("red")?.hex).toBe("#c8102e");
    expect(colorByKey("orange")).toBeNull();
    expect(colorByKey(null)).toBeNull();
  });

  it("Standardfarbe aus dem Slug: stabil, immer aus der Palette, nie Orange", () => {
    for (const slug of ["fc-test", "die-loewen", "a", "", "team-123", "ä-ö-ü", "x".repeat(200)]) {
      const k = defaultColorKey(slug);
      expect(isColorKey(k)).toBe(true);
      expect(defaultColorKey(slug)).toBe(k);
    }
  });

  it("Standardfarbe verteilt sich auf die Palette (nicht konstant)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(defaultColorKey(`team-${i}`));
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it("verschiedene Slugs liefern nicht alle dieselbe Farbe", () => {
    expect(new Set(["a", "b", "c", "d", "e", "f"].map(defaultColorKey)).size).toBeGreaterThan(1);
  });
});
