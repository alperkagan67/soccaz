import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Backlog 237 (AC-30 e): kein text-xs mehr in LiveIndicator und Hallenliste; höchstens vier Schriftgrößen je Seite (base als Fließtext zählt mit).
// LiveIndicator wirkt auf /suche, /spiele, Spiel, Lobby und Overlay (eine Quelle). Lobby-Zeilen kommen mit 5a/5b.
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const sizes = (f: string) => new Set([...src(f).matchAll(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g)].map((m) => m[1]));

describe("AC-30 e: keine text-xs-Schrift in LiveIndicator und Hallenliste", () => {
  it("LiveIndicator nutzt text-sm (Anzeige '● Live' bleibt lesbar)", () => {
    expect([...sizes("src/components/LiveIndicator.tsx")]).toEqual(["sm"]);
    expect(src("src/components/LiveIndicator.tsx")).toContain("● Live");
  });
  it("/hallen: 3xl Titel, sm Zusatztext, kein xs; höchstens vier Größen", () => {
    expect([...sizes("src/app/hallen/page.tsx")].sort()).toEqual(["3xl", "sm"]);
    expect(sizes("src/app/hallen/page.tsx").size + 1).toBeLessThanOrEqual(4);
  });
});
