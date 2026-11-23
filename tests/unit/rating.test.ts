import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ELO_START } from "@/lib/elo";
import {
  ELO_PER_POINT,
  RATING_TIERS,
  START_RATING,
  nextMaxTier,
  ratingFromElo,
  shouldCelebrate,
  tierFromElo,
  tierFromRating,
  tierRank,
  type Tier,
} from "@/lib/rating";

describe("ratingFromElo (AC-18)", () => {
  it.each([
    [0, 0],
    [500, 0],
    [600, 0],
    [1000, 50],
    [1039, 55],
    [1040, 55],
    [1160, 70],
    [1240, 80],
    [1320, 90],
    [1400, 99],
    [3000, 99],
  ])("Elo %i -> Wertung %i", (elo, rating) => {
    expect(ratingFromElo(elo)).toBe(rating);
  });

  it("Neuling (ELO_START) = Startwertung 50 und Stufe Kreide", () => {
    expect(START_RATING).toBe(50);
    expect(ratingFromElo(ELO_START)).toBe(START_RATING);
    expect(tierFromElo(ELO_START)).toBe("kreide");
  });

  it("Randfälle: negativ, NaN, Infinity, Dezimal", () => {
    expect(ratingFromElo(-100)).toBe(0);
    expect(ratingFromElo(Number.NaN)).toBe(0);
    expect(ratingFromElo(Infinity)).toBe(99);
    expect(ratingFromElo(-Infinity)).toBe(0);
    expect(ratingFromElo(1000.4)).toBe(50);
    expect(Number.isInteger(ratingFromElo(1033.7))).toBe(true);
  });

  it("Elo 0 bis 3000: ganzzahlig 0 bis 99, monoton, Stufe nie niedriger", () => {
    let prevRating = -1;
    let prevRank = -1;
    for (let elo = 0; elo <= 3000; elo++) {
      const r = ratingFromElo(elo);
      expect(Number.isInteger(r) && r >= 0 && r <= 99).toBe(true);
      expect(r).toBeGreaterThanOrEqual(prevRating);
      const rank = tierRank(tierFromElo(elo));
      expect(rank).toBeGreaterThanOrEqual(prevRank);
      prevRating = r;
      prevRank = rank;
    }
  });

  it("deterministisch; 1 Punkt je ELO_PER_POINT Elo", () => {
    expect(ratingFromElo(1234)).toBe(ratingFromElo(1234));
    expect(ratingFromElo(1000 + ELO_PER_POINT * 10)).toBe(60);
  });
});

describe("Stufen an den Schwellen", () => {
  it("Namen und Reihenfolge, Start bei 0, aufsteigend", () => {
    expect(RATING_TIERS[0].from).toBe(0);
    for (let i = 1; i < RATING_TIERS.length; i++) expect(RATING_TIERS[i].from).toBeGreaterThan(RATING_TIERS[i - 1].from);
    expect(RATING_TIERS.map((t) => t.tier)).toEqual(["kreide", "rasen", "flutlicht", "pokal", "legende"]);
  });

  it.each([
    [0, "kreide"],
    [54, "kreide"],
    [55, "rasen"],
    [69, "rasen"],
    [70, "flutlicht"],
    [79, "flutlicht"],
    [80, "pokal"],
    [89, "pokal"],
    [90, "legende"],
    [99, "legende"],
  ] as [number, Tier][])("Wertung %i -> %s", (rating, tier) => {
    expect(tierFromRating(rating)).toBe(tier);
  });

  it.each([
    [1035, "kreide"],
    [1040, "rasen"],
    [1155, "rasen"],
    [1160, "flutlicht"],
    [1235, "flutlicht"],
    [1240, "pokal"],
    [1315, "pokal"],
    [1320, "legende"],
  ] as [number, Tier][])("Elo %i -> %s (Grenzwerte)", (elo, tier) => {
    expect(tierFromElo(elo)).toBe(tier);
  });

  it("Neuling gegen Gleichstarke: nach 3 Siegen (+16, +15, +14) Rasen, nach 2 noch Kreide", () => {
    expect(tierFromElo(1000 + 16 + 15 + 14)).toBe("rasen");
    expect(tierFromElo(1000 + 16 + 15)).toBe("kreide");
  });
});

describe("shouldCelebrate / nextMaxTier (Feier nur bei neuem Höchststand)", () => {
  it("Aufstieg feiert, gleiche Stufe und Abstieg nicht", () => {
    expect(shouldCelebrate("kreide", "rasen")).toBe(true);
    expect(shouldCelebrate("rasen", "rasen")).toBe(false);
    expect(shouldCelebrate("pokal", "rasen")).toBe(false);
  });

  it("fehlender Merker = Start Kreide: keine Feier für Kreide, Feier ab Rasen", () => {
    expect(shouldCelebrate(null, "kreide")).toBe(false);
    expect(shouldCelebrate(undefined, "rasen")).toBe(true);
  });

  it("zwei Stufen auf einmal = eine Feier", () => {
    expect(shouldCelebrate("kreide", "flutlicht")).toBe(true);
  });

  it("Hin und Her an der Grenze löst nur einmal aus", () => {
    let max: Tier | null = "kreide";
    let feiern = 0;
    for (const elo of [1039, 1040, 1039, 1040, 1041, 1038, 1042]) {
      const t = tierFromElo(elo);
      if (shouldCelebrate(max, t)) feiern++;
      max = nextMaxTier(max, t);
    }
    expect(feiern).toBe(1);
    expect(max).toBe("rasen");
  });

  it("nextMaxTier behält den Höchststand bei Abstieg", () => {
    expect(nextMaxTier("pokal", "kreide")).toBe("pokal");
    expect(nextMaxTier(null, "rasen")).toBe("rasen");
    expect(nextMaxTier(undefined, "kreide")).toBe("kreide");
  });
});

describe("Strukturtest: Schwellen und Berechnung stehen nur in src/lib/rating.ts", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|css)$/.test(n) ? [p] : [];
    });
  }
  const andere = () => files("src").filter((f) => !f.replaceAll("\\", "/").endsWith("src/lib/rating.ts"));

  it("keine Elo-Grenze als Zahl und keine Stufen-Wertung (from: N) woanders im Quellcode", () => {
    const eloGrenzen = RATING_TIERS.slice(1).map((t) => String(1000 + (t.from - START_RATING) * ELO_PER_POINT));
    const fromWerte = RATING_TIERS.slice(1).map((t) => `from:\\s*${t.from}\\b`);
    const re = new RegExp(`(?<![\\d.])(?:${eloGrenzen.join("|")})(?![\\d])|${fromWerte.join("|")}`);
    // Zeilen mit Pixelbreiten (z. B. 1040 px Seitenbreite) sind keine Elo-Grenzen
    const istTreffer = (f: string) => readFileSync(f, "utf8").split(/\r?\n/).some((z) => re.test(z) && !/px|--w-/.test(z));
    expect(andere().filter(istTreffer)).toEqual([]);
  });

  it("ratingFromElo/tierFromElo werden nicht nachgebaut", () => {
    const re = /function\s+(ratingFromElo|tierFromElo|tierFromRating)\b|const\s+(ratingFromElo|tierFromElo)\s*=/;
    expect(andere().filter((f) => re.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
