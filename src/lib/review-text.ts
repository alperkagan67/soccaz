// Hallenbewertung (Vertrag 010 M1): Text der Bewertung. Entscheid t2q 2026-11-24: 3 bis 500 Zeichen, nie Pflicht, SERVERSEITIG kein Link, keine E-Mail-Adresse, keine Telefonnummer (ABWEISEN, nicht schwaerzen);
// Namen werden bewusst NICHT erkannt (Hinweistext und Melden/Moderation). Die Pruefung ist eine Huerde, kein Beweis: ausgeschriebene Ziffern oder "Punkt de" gehen durch und fallen der Moderation auf.
// EINE Funktion (findContact) mit Tabellentest (tests/unit/review-text.test.ts, positiv und negativ). Reine Funktionen, keine Datenbank.

export const REVIEW_TEXT_MIN = 3;
export const REVIEW_TEXT_MAX = 500;
/** Hinweis am Feld (ENTWURF, keine Rechtsaussage). */
export const REVIEW_TEXT_HINT = "Bitte keine Namen oder Kontaktdaten.";
/** Neutrale Meldung am Feld; der eingegebene Text bleibt in der Oberflaeche erhalten. */
export const REVIEW_CONTACT_MESSAGE = "Bitte keine Links, E-Mail-Adressen oder Telefonnummern angeben.";
export const REVIEW_LENGTH_MESSAGE = `Der Text braucht ${REVIEW_TEXT_MIN} bis ${REVIEW_TEXT_MAX} Zeichen oder bleibt leer.`;

export type ContactKind = "link" | "email" | "phone";

const LINK_PROTOCOL = /(?:https?:\/\/|www\.)/i;
// Domain mit Endung aus einer Liste: "z. B." oder "Halle Nr. 3." treffen nie; die Endung darf nicht von weiteren Buchstaben oder Ziffern gefolgt sein ("gut.Mehr" trifft nicht)
const LINK_DOMAIN = /[\p{L}\d-]+\.(?:de|com|net|org|eu|info|io|app|me|ly|at|ch)(?![\p{L}\d])/iu;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
// Datum (24.11.2026, 24.11.26) wird vor der Telefonpruefung entfernt: 8 Ziffern, aber keine Telefonnummer
const DATE = /\b\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\b/g;
// Kandidat: Ziffern mit den ueblichen Trennern (Leerzeichen, Punkt, Strich, Schraegstrich, Klammern); Doppelpunkt zaehlt nicht (Ergebnisse 3:1, Uhrzeiten 8:30)
const PHONE_CANDIDATE = /(?<!\d)\+?\d[\d\s().\/-]{5,}\d(?!\d)/g;

const digitsOf = (s: string) => s.replace(/\D/g, "");
const longestRun = (s: string) => Math.max(0, ...(s.match(/\d+/g) ?? []).map((r) => r.length));

/** Enthaelt der Text einen Link, eine E-Mail-Adresse oder eine Telefonnummer? Gibt die erste gefundene Art zurueck (null = nichts). */
export function findContact(text: string): ContactKind | null {
  if (EMAIL.test(text)) return "email";
  if (LINK_PROTOCOL.test(text) || LINK_DOMAIN.test(text)) return "link";
  const ohneDatum = text.replace(DATE, " ");
  for (const m of ohneDatum.matchAll(PHONE_CANDIDATE)) {
    const c = m[0].trim();
    const ziffern = digitsOf(c);
    const nurZiffern = /^\+?\d+$/.test(c);
    // Vorwahl (+ oder 0) und mindestens 8 Ziffern und eine Ziffernfolge von mindestens 3 (Ergebnislisten wie "0-0 1-0 3-2 0-1" sind keine Nummer); ohne Vorwahl nur eine zusammenhaengende Folge von mindestens 10 Ziffern
    if (/^[+0]/.test(c) && ziffern.length >= 8 && longestRun(c) >= 3) return "phone";
    if (nurZiffern && ziffern.length >= 10) return "phone";
  }
  return null;
}

/** Steuerzeichen raus, Leerraum zusammenfassen, trimmen. */
export function tidyReviewText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ReviewTextCheck = { ok: true; text: string | null } | { ok: false; error: string };

/** Pruefung des Texts (serverseitig massgeblich, die Oberflaeche nutzt dieselbe Funktion nur als Hilfe): leer = kein Text, sonst 3 bis 500 Zeichen ohne Kontaktdaten. */
export function checkReviewText(input: string | null | undefined): ReviewTextCheck {
  const text = tidyReviewText(input ?? "");
  if (text === "") return { ok: true, text: null };
  const length = Array.from(text).length;
  if (length < REVIEW_TEXT_MIN || length > REVIEW_TEXT_MAX) return { ok: false, error: REVIEW_LENGTH_MESSAGE };
  if (findContact(text)) return { ok: false, error: REVIEW_CONTACT_MESSAGE };
  return { ok: true, text };
}
