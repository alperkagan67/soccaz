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
export type CardViewStatus = CardStatus | "open" | "covered";

export function cardView(status: CardViewStatus): CardView {
  switch (status) {
    case "card_ready":
    case "charged":
      return { tone: "green", glyph: "✓", filled: true, label: "Karte hinterlegt", hasCard: true };
    case "charge_pending":
      return { tone: "neutral", glyph: "…", filled: false, label: "Abbuchung läuft", hasCard: true };
    case "failed":
      // nur für den Betroffenen und den Captain/Veranstalter (siehe card-visibility.ts)
      return { tone: "red", glyph: "!", filled: false, label: "Abbuchung fehlgeschlagen", hasCard: false };
    case "covered":
      // Anteil von einem Mitspieler übernommen (012 M3c-3b, Entscheid t9: Variante b): Ring mit Haken (nicht gefüllt wie "Karte hinterlegt"), Wort "Gedeckt", ohne Namen
      return { tone: "green", glyph: "✓", filled: false, label: "Gedeckt", hasCard: true };
    case "open":
      // neutrale Anzeige für Dritte: keine Karte ODER Abbuchung offen, nie ein Grund
      return { tone: "red", glyph: "!", filled: false, label: "Zahlung ausstehend", hasCard: false };
    case "none":
      return { tone: "red", glyph: "✕", filled: false, label: "Keine Karte", hasCard: false };
    default:
      return status satisfies never;
  }
}

/** Alle Status in Anzeigereihenfolge der Legende. */
export const CARD_LEGEND: CardViewStatus[] = ["card_ready", "covered", "none", "charge_pending", "open"]; // "failed" steht nie in der Legende: das Wort sehen nur Betroffene und Captain an ihrer Zeile
