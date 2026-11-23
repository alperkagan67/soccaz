// Text der Wertungsänderung nach einem bestätigten Ergebnis (Vertrag 013 v3, AC-20). Reine Funktionen: der Text ist der Inhalt, die Animation (C2) ist nur Beiwerk.
import { TIER_LABELS, tierRank, type Tier } from "./rating";

export type RevealSide = { rating: number; tier: Tier };

/** Richtung der Stufe: Aufstieg, Abstieg oder gleich. */
export function tierChange(before: Tier, after: Tier): "up" | "down" | "same" {
  const d = tierRank(after) - tierRank(before);
  return d > 0 ? "up" : d < 0 ? "down" : "same";
}

export function ratingDelta(before: RevealSide, after: RevealSide): number {
  return after.rating - before.rating;
}

/** "Wertung 52 -> 55 (+3), Stufe Rasen"; Aufstieg: dazu ". Aufstieg: Kreide -> Rasen"; Stufe gesunken (ruhiger Wortlaut): "Wertung 55 -> 54 (-1), Stufe jetzt: Kreide (vorher Rasen)". Nie nur Farbe, nie nur Animation. */
export function revealText(before: RevealSide, after: RevealSide): string {
  const d = ratingDelta(before, after);
  const sign = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0";
  const head = `Wertung ${before.rating} → ${after.rating} (${sign})`;
  const change = tierChange(before.tier, after.tier);
  if (change === "up") return `${head}, Stufe ${TIER_LABELS[after.tier]}. Aufstieg: ${TIER_LABELS[before.tier]} → ${TIER_LABELS[after.tier]}`;
  if (change === "down") return `${head}, Stufe jetzt: ${TIER_LABELS[after.tier]} (vorher ${TIER_LABELS[before.tier]})`;
  return `${head}, Stufe ${TIER_LABELS[after.tier]}`;
}

