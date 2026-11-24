// EINE Quelle fuer die Frage "ist die letzte Bestaetigung der Captains eine Zahlungszusage?" (Backlog 233, R-T365d). Seite (Knopf, Ueberschrift, Hinweis) UND Server (finalConfirm) nutzen genau diese Funktion.
// Kartenmodell: Preis unbekannt (null) = "offen" (keine Zusage, auch keine kostenlose: der Preis kann noch kommen), 0 = kostenlos, > 0 = zahlungspflichtig. Ausserhalb des Kartenmodells (Gratis, Pause, Altspiel) loest dieser Knopf keine Kartenzahlung aus.
export type PreisZustand = "offen" | "kostenlos" | "zusage";

export function preisZustand(cardOn: boolean, priceCents: number | null): PreisZustand {
  if (!cardOn) return "kostenlos";
  if (priceCents === null) return "offen";
  return priceCents > 0 ? "zusage" : "kostenlos";
}

export const istZahlungspflichtig = (cardOn: boolean, priceCents: number | null) => preisZustand(cardOn, priceCents) === "zusage";
