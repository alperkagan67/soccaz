// Modus "Zahlungen AUS" (Go-live, Turnier 12.12.; Entscheid t2q 2026-11-24): In Produktion läuft der Schalter payments_enabled AUS, das Geld regelt der Veranstalter AUSSERHALB von Soccaz. Dann zeigt keine Seite
// Bezahlen, Zahlungs-Ampel, Preis pro Spieler, Karte, Abbuchung oder den Kasten "So läuft es ab"; stattdessen steht EIN Hinweissatz. Diese Datei ist die zentrale Quelle für den Satz und für die Wortliste,
// gegen die die Zustand-Matrix-Tests (Zahlungen AUS/AN × Preis 0/>0) die gerenderten Seiten und Textquellen prüfen. Reine Konstanten und Funktionen ohne Datenbank; der Schalter selbst: src/server/zahlungen-aus.ts.

/** Hinweis statt jeder Zahlungsinformation (ENTWURF, keine Rechtsaussage; Wortlaut nach Rechtsprüfung). */
export const ZAHLUNGEN_AUS_HINWEIS = "Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.";

/**
 * Wörter, die im Modus "Zahlungen AUS" in sichtbaren Texten der Turnier-Nutzer NICHT vorkommen dürfen (Wortscan der Matrix-Tests). Bewusst Wortstämme, groß-/kleinschreibungsunabhängig.
 * "Teilnahmegebühr" (der Hinweissatz) ist erlaubt, "Hallenkosten", "Preis", "Karte", "Ampel", "bezahl", "abgebucht", "Abbuchung" und "So läuft es ab" nicht.
 */
export const ZAHLUNGSWORTE: readonly RegExp[] = [
  /\bampel\b/i,
  /\bso läuft es ab\b/i,
  /preis pro spieler/i,
  /hallenkosten/i,
  /\bkarten?\b/i, // Zahlungskarte; wo die Spielbericht-Karte gemeint ist (Seiten der Spiele), prüft der Test die Seite gezielt
  /abbuchung|abgebucht|abbuch/i,
  /bezahl/i,
  /zahlungspflicht/i,
  /\bpreis\b/i,
  /zahlung(?!en aus)/i,
  /\d\s*(€|eur)/i,
  /treuhand/i,
  /\banteil übernehmen\b/i,
];

// Fußball-Karten sind keine Zahlungskarten (Hilfe: "Tore und Karten erfassen", Spielbericht: "Gelbe Karte"): vor dem Scan herausgenommen
const FUSSBALL_KARTEN = /\b(?:gelbe[nr]?|rote[nr]?)\s+karten?\b|\btore und karten\b/gi;

/** Welche verbotenen Zahlungswörter stehen im Text? (Leere Liste = sauber; der Hinweissatz und Fußball-Karten zählen nicht.) */
export function zahlungsWorte(text: string): string[] {
  const ohneHinweis = text.split(ZAHLUNGEN_AUS_HINWEIS).join(" ").replace(FUSSBALL_KARTEN, " ");
  return ZAHLUNGSWORTE.filter((re) => re.test(ohneHinweis)).map((re) => re.source);
}
