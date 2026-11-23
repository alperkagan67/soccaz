// Stufenfarben der Spielerkarte (DESIGN.md "Stufen der Spielerkarte", Richtung F). Die Tabelle in DESIGN.md ist die Vorlage;
// tests/unit/player-card-ui.test.ts gleicht diese Werte mit ihr ab und prüft den Kontrast (Schrift auf dem Chip, Chip auf der Fläche).
// Die Wertungsgrenzen selbst stehen NUR in rating.ts.
import type { Tier } from "./rating";

export const TIER_INK = "#0a0f1c";

/** Chipfarbe je Stufe; die Schrift darauf ist immer TIER_INK. Die Stufe steht zusätzlich immer als Wort da (nie nur Farbe). */
export const TIER_COLOR: Record<Tier, string> = {
  kreide: "#cfd6e4",
  rasen: "#4fd08a",
  flutlicht: "#ffe27a",
  pokal: "#f0b429",
  legende: "#b794ff",
};
