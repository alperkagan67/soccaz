import { describe, expect, it } from "vitest";
import { REVIEW_CONTACT_MESSAGE, REVIEW_LENGTH_MESSAGE, checkReviewText, findContact, tidyReviewText } from "@/lib/review-text";

// Tabellentest der EINEN Funktion findContact (Entscheid t2q 2026-11-24): treffende UND nicht treffende Beispiele, auch typischer Fussball-Text. Eine Mutation (Pruefung weglassen oder Muster zu weit) muss hier rot werden.
const POSITIV: [string, "link" | "email" | "phone"][] = [
  ["Schreib mir an max.muster@example.de", "email"],
  ["me@x.io bitte melden", "email"],
  ["www.halle-essen.de ist die Seite", "link"],
  ["Mehr unter https://example.org/halle", "link"],
  ["Infos auf halle-essen.de", "link"],
  ["folge uns auf insta.ly", "link"],
  ["Ruf an: 0201 123456", "phone"],
  ["Tel. 0201-123456", "phone"],
  ["+49 201 1234567", "phone"],
  ["0176/12345678", "phone"],
  ["(0201) 12 34 56", "phone"],
  ["01761234567", "phone"],
  ["1234567890", "phone"],
  ["Kontakt 00 49 201 123456", "phone"],
];
const NEGATIV: string[] = [
  "Das Spiel endete 3:1 für uns",
  "5-0 gewonnen, tolle Halle",
  "2. Liga Niveau, gute Bälle",
  "Halle 3, Feld 2, Boden super",
  "Der Eintritt kostet 20 Euro",
  "Das waren 160,00 € für die Halle",
  "Wir waren um 8:30 Uhr da",
  "Beginn 18.30 Uhr",
  "Am 24.11.2026 gespielt",
  "Am 24.11.26 gespielt",
  "Rund 1.500 Zuschauer",
  "Im Jahr 2026 war es sauber",
  "Ergebnisse: 3-1 5-0 2-1 4-4",
  "0-0 0-0 1-0 3-2 gespielt",
  "2025 2026 2027 jeweils gut",
  "Bahn 1-4 war frei",
  "ca. 12 Min. Fußweg",
  "z. B. die Duschen: heiß und sauber.",
  "Der Boden ist super.Danke",
  "Es gab gut.Mehr davon",
  "10 Minuten Fahrt, 5 Parkplätze",
  "Umkleide Nr. 2.",
];

describe("findContact: Link, E-Mail, Telefonnummer", () => {
  for (const [text, art] of POSITIV) it(`trifft (${art}): ${text}`, () => expect(findContact(text)).toBe(art));
  for (const text of NEGATIV) it(`trifft NICHT: ${text}`, () => expect(findContact(text)).toBeNull());
});

describe("checkReviewText", () => {
  it("leer und nur Leerraum = kein Text (nie Pflicht)", () => {
    expect(checkReviewText(undefined)).toEqual({ ok: true, text: null });
    expect(checkReviewText("   \n ")).toEqual({ ok: true, text: null });
  });
  it("Länge 3 bis 500 Zeichen (nach dem Aufräumen), sonst die neutrale Längenmeldung", () => {
    expect(checkReviewText("ok")).toEqual({ ok: false, error: REVIEW_LENGTH_MESSAGE });
    expect(checkReviewText("abc")).toEqual({ ok: true, text: "abc" });
    expect(checkReviewText("a".repeat(500)).ok).toBe(true);
    expect(checkReviewText("a".repeat(501))).toEqual({ ok: false, error: REVIEW_LENGTH_MESSAGE });
  });
  it("Kontaktdaten werden ABGEWIESEN mit der neutralen Meldung, der Text wird nie verändert oder geschwärzt", () => {
    expect(checkReviewText("Meine Nummer: 0201 123456")).toEqual({ ok: false, error: REVIEW_CONTACT_MESSAGE });
    expect(REVIEW_CONTACT_MESSAGE).toBe("Bitte keine Links, E-Mail-Adressen oder Telefonnummern angeben.");
  });
  it("Fußballtext mit Ergebnis, Datum, Uhrzeit und Preis wird angenommen und nur aufgeräumt", () => {
    const r = checkReviewText("  Heute 3:1  gewonnen,\u0007 um 8:30 Uhr am 24.11.2026,   20 Euro.  ");
    expect(r).toEqual({ ok: true, text: "Heute 3:1 gewonnen, um 8:30 Uhr am 24.11.2026, 20 Euro." });
  });
  it("tidyReviewText: Steuerzeichen raus, Zeilenumbrüche vereinheitlicht, höchstens eine Leerzeile", () => {
    expect(tidyReviewText("a\r\n\r\n\r\n\r\nb\u0000")).toBe("a\n\nb");
  });
});
