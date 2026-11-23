import { PlayerCard } from "@/components/PlayerCard";
import { RevealMotion } from "@/components/RevealMotion";
import { revealText, tierChange } from "@/lib/rating-reveal";
import type { RatingReveal as RatingRevealData } from "@/server/rating-reveal";

// Karten-Aufdecken (Vertrag 013 v3, AC-20): der Inhalt als Text und Karte; die Bewegung (RevealMotion, nur CSS-Klassen) hängt an diesem Markup. Ohne sie (und ohne JavaScript) ist alles zu lesen.
// Bekommt NUR das fertige, auf den Betrachter selbst begrenzte Objekt aus getRatingReveal.
export function RatingReveal({ data }: { data: RatingRevealData }) {
  const change = tierChange(data.before.tier, data.after.tier);
  return (
    <section aria-labelledby="rating-reveal-title" data-testid="rating-reveal" data-tier-change={change} className="card space-y-3">
      <h2 id="rating-reveal-title" className="font-heading text-lg font-semibold">
        Deine Wertung nach diesem Spiel
      </h2>
      <RevealMotion afterTier={data.after.tier} direction={change}>
        <PlayerCard data={data.card} className="reveal-card mx-auto" />
        <p data-testid="rating-reveal-text" className="mt-3 text-center text-sm">
          {revealText(data.before, data.after)}
        </p>
      </RevealMotion>
    </section>
  );
}
