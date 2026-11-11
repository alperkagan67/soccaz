import type { CardStatus } from "@/db/schema";

/**
 * Anzeige des Kartenstatus je Platz (Vertrag 012, AC-12): Farbe, Form UND Wort, nie nur Farbe (DESIGN.md Richtung E).
 * Der Typ CardStatus kommt aus dem Schema; der Switch ist abgesichert (`satisfies never`): ein neuer Status bricht den Build, bis er hier behandelt ist.
 */
export type CardTone = "green" | "red" | "neutral";
export type CardView = {
  tone: CardTone;
  /** Zeichen in der Form (Haken, Kreuz, Pünktchen, Ausrufezeichen); die Form ist gefüllt oder ein Ring */
  glyph: string;
  filled: boolean;
  label: string;
  /** Ist eine Karte für diesen Platz hinterlegt bzw. in Benutzung (Formular "Karte hinterlegen" entfällt)? */
  hasCard: boolean;
};

/** "open" = neutrale Anzeige für Dritte (keine Karte ODER Abbuchung offen), siehe card-visibility.ts: nie ein Grund, nie das Wort "fehlgeschlagen". */
export type CardViewStatus = CardStatus | "open";

export function cardView(status: CardViewStatus): CardView {
  switch (status) {
    case "card_ready":
    case "charged":
      return { tone: "green", glyph: "✓", filled: true, label: "Karte hinterlegt", hasCard: true };
    case "charge_pending":
      return { tone: "neutral", glyph: "…", filled: false, label: "Abbuchung läuft", hasCard: true };
    case "failed":
    case "open":
      return { tone: "red", glyph: "!", filled: false, label: "Zahlung ausstehend", hasCard: false };
    case "none":
      return { tone: "red", glyph: "✕", filled: false, label: "Keine Karte", hasCard: false };
    default:
      return status satisfies never;
  }
}

/** Alle Status in Anzeigereihenfolge der Legende. */
export const CARD_LEGEND: CardStatus[] = ["card_ready", "none", "charge_pending", "failed"];
