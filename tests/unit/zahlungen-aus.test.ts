import { describe, expect, it } from "vitest";
import { ZAHLUNGEN_AUS_HINWEIS, ZAHLUNGSWORTE, zahlungsWorte } from "@/lib/zahlungen-aus";

// Modus "Zahlungen AUS" (Go-live-Paket): zentraler Hinweissatz und Wortliste für die Zustand-Matrix-Tests. Der Schalter selbst: tests/integration/zahlungen-aus.test.ts.
describe("Hinweissatz", () => {
  it("lautet genau so (ENTWURF) und enthält selbst kein verbotenes Zahlungswort", () => {
    expect(ZAHLUNGEN_AUS_HINWEIS).toBe("Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.");
    expect(zahlungsWorte(ZAHLUNGEN_AUS_HINWEIS)).toEqual([]);
    for (const re of ZAHLUNGSWORTE) expect(re.test(ZAHLUNGEN_AUS_HINWEIS), re.source).toBe(false);
  });
});

describe("zahlungsWorte: verbotene Wörter im Modus Zahlungen AUS", () => {
  const VERBOTEN = [
    "Die Ampel wird grün",
    "So läuft es ab",
    "Preis pro Spieler: 10,00 €",
    "Hallenkosten 160,00 €, geteilt durch alle Spieler",
    "Jeder Spieler hinterlegt eine Karte",
    "Karten unvollständig",
    "Zur Frist wird der Anteil abgebucht",
    "Die Abbuchung hat begonnen",
    "Jeder Spieler bezahlt genau diesen Betrag",
    "Ja, mein Team ist komplett: zahlungspflichtig zusagen",
    "Das Geld liegt auf dem Treuhandkonto",
    "Anteil übernehmen",
    "Der Preis steht fest",
    "Zahlung läuft",
    "Zahlungen sind gerade pausiert",
    "Dein Anteil beträgt 12,50 €",
    "Eintritt 8 EUR",
  ];
  const ERLAUBT = [
    "Alle Teams füllen ihren Kader. Der Captain meldet: „Team ist vollzählig“.",
    "Das Bracket erscheint, sobald alle Teams bereit sind.",
    "Teams angemeldet: 12 · Läuft",
    "Anmelden und mitmachen",
    `Hier steht der Hinweis: ${ZAHLUNGEN_AUS_HINWEIS}`,
    "Der Veranstalter wählt eine andere Halle oder sagt das Turnier ab.",
    "Das Spiel endete 3:1, Platz 2 für uns",
    "Ein Team-Admin erfasst Tore und Karten direkt am Spielfeldrand", // Fußball-Karten
    "Gelbe Karte für Spieler 7, Rote Karte für Spieler 3",
  ];
  for (const text of VERBOTEN) it(`trifft: ${text}`, () => expect(zahlungsWorte(text).length).toBeGreaterThan(0));
  for (const text of ERLAUBT) it(`trifft NICHT: ${text}`, () => expect(zahlungsWorte(text)).toEqual([]));
  it("der Hinweissatz wird herausgerechnet, ein verbotenes Wort daneben trifft weiterhin", () => {
    expect(zahlungsWorte(`${ZAHLUNGEN_AUS_HINWEIS} Die Ampel wird grün.`)).toEqual([ZAHLUNGSWORTE[0].source]);
  });
});
