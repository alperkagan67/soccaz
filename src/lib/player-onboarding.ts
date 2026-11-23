// Spieler-Onboarding "Willkommen" (Vertrag 013 Version 3, Abschnitt 4 Punkt 2, AC-26): die EINE Quelle der Schritte, Feldnamen und Prüfungen. Reine Funktionen ohne React und ohne Datenbank:
// die Oberfläche (Assistent, PR 2) und die Server-Aktion `completeOnboardingAction` benutzen dieselben Funktionen, der Server prüft also nie nur, was der Client schon geprüft hat, und die
// Fehlertexte sind gleich. Texte und Listen kommen aus `onboardingSchema` (src/lib/validation.ts), dort bleibt die Quelle der Feldregeln. Alle Werte kommen als Text (Formular).
import { safeInternalPath } from "./safe-path";
import { CITIES, POSITIONS, onboardingSchema } from "./validation";
import type { Fehler, SchrittInfo, Werte } from "./assistent";

export const PLAYER_ONBOARDING_ID = "spieler-onboarding";

export type PlayerStepId = "spieler" | "position" | "alter" | "zusammenfassung" | "abschluss";

/**
 * Schritte und ihre Felder. `nichtSpeichern`: das Geburtsdatum (personenbezogen, wird nie gespeichert), die Zustimmung (wird jedes Mal neu gegeben) und das Rücksprungziel `next`
 * (kommt aus der URL; ein alter Entwurfswert dürfte die aktuelle URL nicht überschreiben) kommen NIE in den Entwurf im Browser (sessionStorage, Klartext). Die Namen der Felder sind
 * zugleich die Namen im FormData der Server-Aktion und die Schlüssel der Feldfehler.
 */
export const PLAYER_ONBOARDING_STEPS: readonly (SchrittInfo & { id: PlayerStepId })[] = [
  { id: "spieler", felder: ["name", "city"] },
  { id: "position", felder: ["position"] },
  { id: "alter", felder: ["birthDate"], nichtSpeichern: ["birthDate"] },
  { id: "zusammenfassung", felder: [] },
  { id: "abschluss", felder: ["terms", "next"], nichtSpeichern: ["terms", "next"] },
];

export const MIN_BIRTH_YEAR = 1900;
export const BIRTH_DATE_MISSING = "Bitte gib dein Geburtsdatum an.";
export const BIRTH_DATE_INVALID = "Bitte gib ein gültiges Geburtsdatum an (nicht in der Zukunft).";

/**
 * Geburtsdatum "JJJJ-MM-TT": ein echtes Kalenderdatum, ab 1900, nicht in der Zukunft (UTC-Tag von heute, GENAU wie die Altersprüfung `isOldEnough`; eine Toleranz für Zeitzonen würde morgen als gültig durchlassen und dann das Konto löschen). Vorher nahm das Schema jedes parsbare Datum,
 * auch eines in der Zukunft; das ergab ein Alter unter 16 und LÖSCHTE das Konto. Ein Tippfehler soll kein Konto löschen: er wird als Feldfehler gemeldet.
 */
export function birthDateError(value: string, today: Date = new Date()): string | undefined {
  const text = value.trim();
  if (text === "") return BIRTH_DATE_MISSING;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return BIRTH_DATE_INVALID;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return BIRTH_DATE_INVALID; // 31.02. und ähnliches
  if (y < MIN_BIRTH_YEAR) return BIRTH_DATE_INVALID;
  const limit = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() > limit) return BIRTH_DATE_INVALID;
  return undefined;
}

const text = (w: Werte, k: string) => (w[k] ?? "").trim();

/** Alle Fehler je Feldname (Schema des Bestands plus Prüfung des Geburtsdatums). */
function allErrors(w: Werte, today: Date): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed = onboardingSchema.safeParse({ name: w.name ?? "", city: w.city ?? "", position: w.position ?? "", birthDate: w.birthDate ?? "", terms: w.terms ?? "" });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  const birth = birthDateError(w.birthDate ?? "", today);
  if (birth) errors.birthDate = birth; // die strengere Prüfung gilt (Schema erkennt nur "nicht parsbar")
  return errors;
}

/** Prüfung EINES Schritts (Weiter): nur die Felder dieses Schritts. Leer = in Ordnung. */
export function validatePlayerStep(step: PlayerStepId, w: Werte, today: Date = new Date()): Fehler {
  const felder = PLAYER_ONBOARDING_STEPS.find((s) => s.id === step)?.felder ?? [];
  const all = allErrors(w, today);
  return Object.fromEntries(Object.entries(all).filter(([k]) => felder.includes(k)));
}

/** Prüfung ALLER Schritte (Abschluss und Server). */
export function validatePlayerAll(w: Werte, today: Date = new Date()): Fehler {
  return allErrors(w, today);
}

export type PlayerOnboardingInput = {
  name: string;
  city: (typeof CITIES)[number];
  position: (typeof POSITIONS)[number];
  /** "JJJJ-MM-TT", nur zur Altersprüfung; wird NIE gespeichert. */
  birthDate: string;
  /** Interner Rücksprungpfad (`safeInternalPath`), sonst "/app". */
  next: string;
};

/** Prüft alles und liefert das Eingabeobjekt. Der Server ruft NUR diese Funktion auf (keine eigene Feldprüfung in der Aktion). */
export function parsePlayerOnboarding(w: Werte, today: Date = new Date()): { ok: true; input: PlayerOnboardingInput } | { ok: false; errors: Fehler } {
  const errors = allErrors(w, today);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name: text(w, "name"),
      city: text(w, "city") as PlayerOnboardingInput["city"],
      position: text(w, "position") as PlayerOnboardingInput["position"],
      birthDate: text(w, "birthDate"),
      next: safeInternalPath(w.next),
    },
  };
}

/** Wert der bekannten Felder aus `FormData` (Server-Aktion): Text, nie etwas anderes (Dateien, fehlende und fremde Felder fallen weg). */
export function playerWerteAusFormData(fd: FormData): Werte {
  const out: Record<string, string> = {};
  for (const s of PLAYER_ONBOARDING_STEPS) {
    for (const k of s.felder) {
      const v = fd.get(k);
      out[k] = typeof v === "string" ? v : "";
    }
  }
  return out;
}
