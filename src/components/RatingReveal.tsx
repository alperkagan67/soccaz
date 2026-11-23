import { PlayerCard } from "@/components/PlayerCard";
import { revealText, tierChange } from "@/lib/rating-reveal";
import type { RatingReveal as RatingRevealData } from "@/server/rating-reveal";

// Karten-Aufdecken (Vertrag 013 v3, AC-20), Schritt 1: der Inhalt als Text und Karte, ohne Bewegung. Die Animation (C2) hängt später an diesem Markup; ohne sie (und ohne JavaScript) ist alles zu lesen.
// Bekommt NUR das fertige, auf den Betrachter selbst begrenzte Objekt aus getRatingReveal.
export function RatingReveal({ data }: { data: RatingRevealData }) {
  const change = tierChange(data.before.tier, data.after.tier);
  return (
    <section aria-labelledby="rating-reveal-title" data-testid="rating-reveal" data-tier-change={change} className="card space-y-3">
      <h2 id="rating-reveal-title" className="font-heading text-lg font-semibold">
        Deine Wertung nach diesem Spiel
      </h2>
      <PlayerCard data={data.card} className="mx-auto" />
      <p data-testid="rating-reveal-text" className="text-center text-sm">
        {revealText(data.before, data.after)}
      </p>
    </section>
  );
}
