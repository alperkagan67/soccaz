import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scorerLine } from "@/lib/match-card-text";

// AC-17 (Entscheid t2q 2026-11-24, R-T382): Die Spielbericht-Karte (Bild unter /api/karte/<id> und og:image der Spielseite, öffentlich, ohne Betrachter) trägt Torschützen nur als Initialen.
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("scorerLine: Torschützen auf der Karte", () => {
  const goals = [
    { name: "Zorro Vollname", minute: 9 },
    { name: "Anna Beispiel", minute: 5 },
    { name: null, minute: 7 },
  ];
  it("nur Initialen und Minute, nach Minute sortiert; Tore ohne Spieler entfallen (Vakuum-Schutz: das Ergebnis ist nicht leer)", () => {
    const line = scorerLine(goals);
    expect(line).toBe("AB 5'  ·  ZV 9'");
    expect(line).not.toContain("Zorro");
    expect(line).not.toContain("Vollname");
    expect(line).not.toContain("Anna");
  });
  it("höchstens sechs Einträge", () => {
    const viele = Array.from({ length: 9 }, (_, i) => ({ name: `Spieler Nr${i}`, minute: i }));
    expect(scorerLine(viele).split("  ·  ")).toHaveLength(6);
  });
  it("leere Liste: leere Zeile", () => {
    expect(scorerLine([])).toBe("");
  });
});

describe("Quelltext-Pin: beide Bildwege laufen über matchCard, und matchCard nennt nie g.name", () => {
  it("cards.tsx nutzt scorerLine, kein Klarname im Torschützen-Zweig", () => {
    const src = read("src/server/cards.tsx");
    expect(src).toContain("scorerLine(goals)");
    expect(src).not.toMatch(/\$\{g\.name\}/);
    expect(src).not.toMatch(/\.map\(\(g\) => `\$\{g\.name/);
  });
  it("/api/karte/[id] und der og:image der Spielseite verwenden matchCard (eine Quelle)", () => {
    expect(read("src/app/api/karte/[id]/route.ts")).toContain("matchCard(");
    expect(read("src/app/spiele/[id]/opengraph-image.tsx")).toContain("matchCard(");
  });
  it("match-card-text.ts nutzt initialsOf (die Gast-Regel), nicht den Namen", () => {
    const src = read("src/lib/match-card-text.ts");
    expect(src).toContain("initialsOf(g.name)");
  });
});
