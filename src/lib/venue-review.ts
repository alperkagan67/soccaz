// Hallenbewertung (Vertrag 010 M1): reine Regeln ohne Datenbank (Kategorien, Punkte, Sicht auf den Autor). Die Berechtigung und die Speicherung stehen in src/server/venue-reviews.ts.
import { initialsOf } from "./player-card";
import type { LobbySicht } from "./lobby-namen";

/** Bewertungsfrist: 7 Tage ab Spielende (Vertrag 010, Entscheid des Nutzers). */
export const REVIEW_WINDOW_DAYS = 7;

export const REVIEW_CATEGORIES = ["floor", "changingRooms", "cleanliness", "showers", "parking"] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];
export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  floor: "Boden",
  changingRooms: "Umkleiden",
  cleanliness: "Sauberkeit",
  showers: "Duschen",
  parking: "Parken",
};
export type ReviewScores = Record<ReviewCategory, number>;

export const REVIEW_SCORE_MESSAGE = "Bitte wähle 1 bis 5 Punkte.";

/** Jede Kategorie ist eine ganze Zahl von 1 bis 5 (Pflicht). Gibt die geprüften Zahlen oder je Kategorie eine Fehlermeldung zurück. */
export function validateScores(input: Partial<Record<ReviewCategory, unknown>>): { ok: true; scores: ReviewScores } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const scores = {} as ReviewScores;
  for (const c of REVIEW_CATEGORIES) {
    const raw = input[c];
    const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 5) fieldErrors[c] = REVIEW_SCORE_MESSAGE;
    else scores[c] = n;
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, scores };
}

/**
 * Autor einer Bewertung (013 AC-17, Entscheid t2q 2026-11-24): Angemeldete sehen den Namen wie in der Matrix, Gäste nur die Initialen, der Hallenbetreiber sieht Bewertungen NAMENFREI (weder Name noch
 * Initialen: Vergeltungsrisiko). Die Hallen-Antwort (011 M5) nennt den Autor nie.
 */
export function reviewAutor(name: string, sicht: LobbySicht): string {
  if (sicht === "member") return name;
  if (sicht === "guest") return initialsOf(name);
  return "Ein Spieler";
}
