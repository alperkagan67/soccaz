// Hallen-Onboarding (Vertrag 013 Version 3, M2d, AC-25 und AC-31): die EINE Quelle der Schritte, Feldnamen und Prüfungen. Reine Funktionen ohne React und ohne Datenbank:
// die Oberfläche (Assistent) und die Server-Aktion benutzen dieselben Funktionen, der Server prüft also nie nur, was der Client schon geprüft hat, und die Fehlertexte sind gleich.
// Alle Werte kommen als Text (Formular); `parseOnboarding` macht daraus das geprüfte Eingabeobjekt für `requestVenue`.
import { CITIES } from "./validation";
import { parseEuro } from "./money";
import type { Fehler, SchrittInfo, Werte } from "./assistent";

export const ONBOARDING_ID = "halle-onboarding";

/** Bedingungstext: bis zur Anwaltsprüfung ein gekennzeichneter ENTWURF (Rechtsliste, FEHLT-NOCH). Schlüssel und Version gehen in das Protokoll (Muster der Übernahme-Einwilligung). */
export const TERMS_KEY = "hallen.onboarding.terms.entwurf";
export const TERMS_VERSION = 1;

export type OnboardingStepId = "halle" | "plaetze" | "preise" | "zusammenfassung" | "abschluss";

/**
 * Schritte und ihre Felder. `nichtSpeichern`: Kontakt (personenbezogen) und Zustimmung kommen NIE in den Entwurf im Browser (sessionStorage, Klartext).
 * Die Namen der Felder sind zugleich die Namen im FormData der Server-Aktion und die Schlüssel der Feldfehler.
 */
export const ONBOARDING_STEPS: readonly (SchrittInfo & { id: OnboardingStepId })[] = [
  { id: "halle", felder: ["name", "city", "address", "contact"], nichtSpeichern: ["contact"] },
  { id: "plaetze", felder: ["courts", "surface", "hasShowers", "hasParking"] },
  { id: "preise", felder: ["price60", "price90"] },
  { id: "zusammenfassung", felder: [] },
  { id: "abschluss", felder: ["terms"], nichtSpeichern: ["terms"] },
];

export const LIMITS = {
  name: { min: 2, max: 80 },
  address: { min: 3, max: 120 },
  contact: { min: 5, max: 120 },
  surface: { max: 60 },
  courts: { min: 1, max: 20 },
  /** Hallenmiete je Termin in Cent: wie `addPriceRule` (0,01 bis 1.000,00 Euro), hier mindestens 1,00 Euro. */
  priceCents: { min: 100, max: 100_000 },
} as const;

export type VenueOnboardingInput = {
  name: string;
  city: (typeof CITIES)[number];
  address: string;
  contact: string;
  courts: number;
  surface: string | null;
  hasShowers: boolean;
  hasParking: boolean;
  /** Hallenmiete je Termin (60 und 90 Minuten) in Cent; gilt einheitlich für alle Plätze. */
  price60Cents: number;
  price90Cents: number;
  termsKey: string;
  termsVersion: number;
};

const text = (w: Werte, k: string) => (w[k] ?? "").trim();
const checked = (w: Werte, k: string) => ["on", "true", "1", "ja"].includes(text(w, k).toLowerCase());
const lengthError = (label: string, min: number, max: number) => `${label}: bitte ${min} bis ${max} Zeichen angeben.`;

function euroField(w: Werte, k: string, label: string, out: Record<string, string>): number | null {
  const cents = parseEuro(text(w, k));
  if (cents === null || cents < LIMITS.priceCents.min || cents > LIMITS.priceCents.max) {
    out[k] = `${label}: bitte einen Betrag zwischen 1,00 und 1.000,00 Euro angeben (Beispiel 40,00).`;
    return null;
  }
  return cents;
}

/** Prüfung EINES Schritts (Weiter). Gibt Fehlertexte je Feldname zurück, leer = in Ordnung. */
export function validateStep(step: OnboardingStepId, w: Werte): Fehler {
  const e: Record<string, string> = {};
  if (step === "halle") {
    const name = text(w, "name");
    if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) e.name = lengthError("Name der Halle", LIMITS.name.min, LIMITS.name.max);
    if (!(CITIES as readonly string[]).includes(text(w, "city"))) e.city = "Bitte wähle eine Stadt.";
    const address = text(w, "address");
    if (address.length < LIMITS.address.min || address.length > LIMITS.address.max) e.address = lengthError("Adresse", LIMITS.address.min, LIMITS.address.max);
    const contact = text(w, "contact");
    const phoneDigits = contact.replace(/\D/g, "").length;
    if (contact.length < LIMITS.contact.min || contact.length > LIMITS.contact.max) e.contact = lengthError("Kontakt", LIMITS.contact.min, LIMITS.contact.max);
    else if (!(contact.includes("@") || phoneDigits >= 6)) e.contact = "Bitte eine E-Mail-Adresse oder eine Telefonnummer angeben, damit wir dich erreichen.";
  }
  if (step === "plaetze") {
    const courts = text(w, "courts");
    const n = /^\d{1,3}$/.test(courts) ? Number(courts) : NaN;
    if (!Number.isInteger(n) || n < LIMITS.courts.min || n > LIMITS.courts.max) e.courts = `Anzahl der Plätze: bitte eine ganze Zahl von ${LIMITS.courts.min} bis ${LIMITS.courts.max} angeben.`;
    if (text(w, "surface").length > LIMITS.surface.max) e.surface = `Boden: höchstens ${LIMITS.surface.max} Zeichen.`;
  }
  if (step === "preise") {
    euroField(w, "price60", "Hallenmiete je Termin (60 Minuten)", e);
    euroField(w, "price90", "Hallenmiete je Termin (90 Minuten)", e);
  }
  if (step === "abschluss" && !checked(w, "terms")) e.terms = "Bitte bestätige die Bedingungen, um die Anfrage zu senden.";
  return e;
}

/** Prüfung ALLER Schritte (Abschluss und Server): zusammengeführte Fehler je Feldname. */
export function validateAll(w: Werte): Fehler {
  const e: Record<string, string> = {};
  for (const s of ONBOARDING_STEPS) Object.assign(e, validateStep(s.id, w));
  return e;
}

/** Prüft alles und liefert das Eingabeobjekt für `requestVenue` (Text getrimmt, Zahlen als ganze Cent). Der Server ruft NUR diese Funktion auf. */
export function parseOnboarding(w: Werte): { ok: true; input: VenueOnboardingInput } | { ok: false; errors: Fehler } {
  const errors = validateAll(w);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const price60Cents = parseEuro(text(w, "price60")) as number;
  const price90Cents = parseEuro(text(w, "price90")) as number;
  const surface = text(w, "surface");
  return {
    ok: true,
    input: {
      name: text(w, "name"),
      city: text(w, "city") as VenueOnboardingInput["city"],
      address: text(w, "address"),
      contact: text(w, "contact"),
      courts: Number(text(w, "courts")),
      surface: surface === "" ? null : surface,
      hasShowers: checked(w, "hasShowers"),
      hasParking: checked(w, "hasParking"),
      price60Cents,
      price90Cents,
      termsKey: TERMS_KEY,
      termsVersion: TERMS_VERSION,
    },
  };
}

/** Wert eines Feldes aus `FormData` (Server-Aktion): Text, nie etwas anderes (Dateien und fehlende Felder werden zu leerem Text). */
export function werteAusFormData(fd: FormData): Werte {
  const out: Record<string, string> = {};
  for (const s of ONBOARDING_STEPS) for (const k of s.felder) {
    const v = fd.get(k);
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}
