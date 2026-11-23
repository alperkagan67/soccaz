import { TIER_LABELS, type Tier } from "@/lib/rating";
import { TIER_COLOR, TIER_INK } from "@/lib/tier-style";

// Stufen-Chip (Vertrag 013 v3, AC-30): die EINZIGE Stelle neben tier-style.ts, an der die Stufenfarbe vorkommt. Wort + rim-Rahmen, die Farbe ist nur der Hintergrund des Chips (nie Fläche,
// Text oder Seitenhintergrund); im Hellmodus tragen Wort und Rahmen die Erkennbarkeit. Pro Karte und pro Zeile genau ein Chip. Stilregel-Test: tests/unit/player-card-ui.test.ts.
export function TierChip({ tier, className = "" }: { tier: Tier; className?: string }) {
  return (
    <span
      data-testid="player-card-tier"
      data-tier={tier}
      className={`inline-flex w-fit items-center rounded-full border border-rim px-2.5 py-0.5 text-sm font-semibold ${className}`}
      style={{ backgroundColor: TIER_COLOR[tier], color: TIER_INK }}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}
