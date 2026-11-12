import { describe, expect, it } from "vitest";
import type { CardStatus } from "@/db/schema";
import { CARD_LEGEND, cardView } from "@/lib/card-view";

// Record<CardStatus, ...> zwingt dazu, jeden neuen Status hier zu ergänzen (sonst bricht der Typecheck)
const expected: Record<CardStatus, { tone: string; label: string; hasCard: boolean; filled: boolean }> = {
  none: { tone: "red", label: "Keine Karte", hasCard: false, filled: false },
  card_ready: { tone: "green", label: "Karte hinterlegt", hasCard: true, filled: true },
  charge_pending: { tone: "neutral", label: "Abbuchung läuft", hasCard: true, filled: false },
  charged: { tone: "green", label: "Karte hinterlegt", hasCard: true, filled: true },
  failed: { tone: "red", label: "Abbuchung fehlgeschlagen", hasCard: false, filled: false },
};

describe("cardView: Anzeige je Kartenstatus (Vertrag 012, AC-12)", () => {
  for (const [status, want] of Object.entries(expected) as [CardStatus, (typeof expected)[CardStatus]][]) {
    it(`${status}: ${want.label}`, () => {
      const v = cardView(status);
      expect(v.tone).toBe(want.tone);
      expect(v.label).toBe(want.label);
      expect(v.hasCard).toBe(want.hasCard);
      expect(v.filled).toBe(want.filled);
      expect(v.glyph.length).toBeGreaterThan(0); // Form, nicht nur Farbe
    });
  }
  it("grün und rot unterscheiden sich auch in Form und Wort, nicht nur in der Farbe", () => {
    const g = cardView("card_ready");
    for (const s of ["none", "failed", "charge_pending", "open"] as const) {
      const o = cardView(s);
      expect(o.glyph).not.toBe(g.glyph);
      expect(o.label).not.toBe(g.label);
    }
  });
  it("die Legende zeigt fünf verschiedene Zustände (mit Gedeckt) und nie das Wort fehlgeschlagen", () => {
    expect(CARD_LEGEND.map((s) => cardView(s).label).join(" ")).not.toMatch(/fehlgeschlagen/i);
    expect(new Set(CARD_LEGEND.map((s) => cardView(s).label)).size).toBe(5);
    expect(CARD_LEGEND).toContain("covered");
  });
  it("Gedeckt (Anteil übernommen, Entscheid t9 b): grün, Wort Gedeckt, anderer Form als Karte hinterlegt (Ring statt gefüllt), nennt keinen Namen und keinen Grund", () => {
    const c = cardView("covered");
    const g = cardView("card_ready");
    expect(c.tone).toBe("green");
    expect(c.label).toBe("Gedeckt");
    expect(c.filled).toBe(false);
    expect(g.filled).toBe(true); // Unterschied in der Form, nicht nur im Wort
    expect(c.label).not.toBe(g.label);
    expect(c.label).not.toMatch(/übernomm|fehlgeschlagen|Karte/i);
    expect(c.hasCard).toBe(true);
  });
});
