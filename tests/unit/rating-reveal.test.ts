import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingReveal } from "@/components/RatingReveal";
import { RATING, playerCardFor } from "@/lib/player-card";
import { RATING_TIERS, ratingFromElo, tierFromRating } from "@/lib/rating";
import { ratingDelta, revealText, tierChange, type RevealSide } from "@/lib/rating-reveal";

// Vertrag 013 v3, AC-20 (Text ohne Animation) und AC-17 (nur der Betrachter selbst).
const side = (elo: number): RevealSide => ({ rating: ratingFromElo(elo), tier: tierFromRating(ratingFromElo(elo)) });

describe("revealText", () => {
  it("gleiche Stufe: Wertung vorher -> nachher, Änderung mit Vorzeichen, Stufe; kein Auf-/Abstiegstext", () => {
    expect(revealText(side(1000), side(1024))).toBe("Wertung 50 → 53 (+3), Stufe Kreide");
    expect(revealText(side(1024), side(1000))).toBe("Wertung 53 → 50 (−3), Stufe Kreide");
    expect(revealText(side(1000), side(1000))).toBe("Wertung 50 → 50 (±0), Stufe Kreide");
  });

  it("Aufstieg steht als Wort im Text, eine gesunkene Stufe ruhig als \"Stufe jetzt: X (vorher Y)\" ohne das Wort Abstieg", () => {
    expect(revealText(side(1032), side(1040))).toBe("Wertung 54 → 55 (+1), Stufe Rasen. Aufstieg: Kreide → Rasen");
    expect(revealText(side(1040), side(1032))).toBe("Wertung 55 → 54 (−1), Stufe jetzt: Kreide (vorher Rasen)");
    expect(revealText(side(1040), side(1032))).not.toMatch(/Abstieg/);
  });

  it("an jeder Stufenschwelle (55/70/80/90): eine Wertung darunter = Kreide/Rasen/Flutlicht/Pokal, ab der Schwelle die höhere Stufe", () => {
    const names = ["Kreide", "Rasen", "Flutlicht", "Pokal", "Legende"];
    RATING_TIERS.slice(1).forEach((t, i) => {
      const below: RevealSide = { rating: t.from - 1, tier: tierFromRating(t.from - 1) };
      const at: RevealSide = { rating: t.from, tier: tierFromRating(t.from) };
      expect(tierChange(below.tier, at.tier)).toBe("up");
      expect(revealText(below, at)).toContain(`Aufstieg: ${names[i]} → ${names[i + 1]}`);
      expect(ratingDelta(below, at)).toBe(1);
    });
  });
});

describe("RatingReveal (Markup)", () => {
  const person = { name: "Zorro Quasimodo", elo: 1090, position: "Angriff", teamColor: "blue", teamSlug: "die-wilden-kerle" };
  const data = { before: side(1000), after: side(1090), card: playerCardFor({ kind: "member" }, person, RATING) };
  const html = renderToStaticMarkup(createElement(RatingReveal, { data }));

  it("zeigt Überschrift, die Karte und den Text mit alter und neuer Wertung ohne jede Animation und ohne Script", () => {
    expect(html).toContain("Deine Wertung nach diesem Spiel");
    expect(html).toContain('data-testid="player-card"');
    expect(html).toContain("Wertung 50 → 61 (+11), Stufe Rasen. Aufstieg: Kreide → Rasen");
    expect(html).toContain('data-tier-change="up"');
    expect(html).not.toMatch(/<script|animation|keyframes/i);
  });
});

describe("Einbau in /spiele/[id] (Quelltext)", () => {
  it("der Reveal wird nur mit der Kennung des angemeldeten Betrachters geholt (nie einer anderen Person)", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/spiele/[id]/page.tsx"), "utf8");
    const calls = page.match(/getRatingReveal\([^)]*\)/g) ?? [];
    expect(calls).toEqual(["getRatingReveal(match.id, user.id)"]);
    expect(page).toMatch(/user \? await getRatingReveal/); // ohne Anmeldung gar kein Aufruf
  });

  it("Layoutverschiebung (AC-21): der Live-Indikator steht in einem Kasten fester Breite; der Wechsel von 'Verbinde' auf 'Live' ändert die Kopfzeile nicht", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/spiele/[id]/page.tsx"), "utf8");
    expect(page).toMatch(/<span className="inline-block w-24 text-left">\s*<LiveIndicator eventsUrl=/);
  });
});
