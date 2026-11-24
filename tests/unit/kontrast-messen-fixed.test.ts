import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// AC-27 Messung (tests/e2e/kontrast/messen.ts): Elemente mit position fixed (untere Leiste BottomNav) werden aus einem BILDSCHIRM-Bild bei Scrollstand 0 gemessen, nicht aus dem Ganzseiten-Bild.
// Anlass (CI #290, spieler-suche 390): Im Ganzseiten-Bild wird der Bildschirm auf die Seitenhöhe vergrößert, die untere Leiste liegt dann am Seitenende; an der Stelle ihres Textes (y 805) stand Seiteninhalt (Tönung/Karte): 1,27:1 statt 6,69:1 (Orange). Befund war ein Messartefakt, kein Fehler der Leiste.
const src = readFileSync(join(__dirname, "..", "e2e", "kontrast", "messen.ts"), "utf8");

describe("Messung fester Leisten aus dem Bildschirm-Bild", () => {
  it("fixed-Elemente tragen fixedPos und werden aus einem Bild mit fullPage: false gemessen", () => {
    expect(src).toMatch(/fixedPos\?: boolean/);
    expect(src).toMatch(/function inFixedPos\(el: Element\): boolean/);
    expect(src).toMatch(/pngView = needIdx\.some\(\(i\) => items\[i\]\.fixedPos\) \? await page\.screenshot\(\{ fullPage: false/);
  });
  it("drei Quellen: fixed aus dem Bildschirm-Bild, nur sticky aus dem Ganzseiten-Bild mit Leisten, alles andere aus dem Bild ohne Leisten", () => {
    expect(src).toMatch(/fixedPos \? "view" : items\[needIdx\[k\]\]\.inFixed \? "bar" : "free"/);
    expect(src).toMatch(/pngBar = needIdx\.some\(\(i\) => items\[i\]\.inFixed && !items\[i\]\.fixedPos\) \? await page\.screenshot\(\{ fullPage: true/);
  });
  it("die Pixelprobe des Bildschirm-Bilds läuft über dieselbe Probe wie die anderen Quellen", () => {
    expect(src).toMatch(/\[\["view", pngView\], \["bar", pngBar\], \["free", pngFree\]\]/);
  });
});
