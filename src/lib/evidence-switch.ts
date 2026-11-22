// 011 M2a: Admin 1 stellt die Uhrenquelle auf die Datenbank und schaltet danach die Beweispflicht ein (Plan 011 M2, 12.5). Reine Prüfung, ohne Datenbank.
// Die Datenbankfunktion evidence_set_setting prüft dieselben Bedingungen noch einmal (Akteur Pflicht, „on“ nur bei Uhrenquelle db); hier steht, was die Oberfläche anbietet.

export const SWITCH_STEPS = ["clock_db", "enforcement_on"] as const;
export type SwitchStep = (typeof SWITCH_STEPS)[number];

export const SWITCH_REASON_MIN = 3;
export const SWITCH_REASON_MAX = 200;

export const SWITCH_TEXTS = {
  reason: `Bitte nenne den Grund in ${SWITCH_REASON_MIN} bis ${SWITCH_REASON_MAX} Zeichen.`,
  needClock: "Zuerst die Uhrenquelle auf die Datenbank stellen. Erst dann kann die Beweispflicht eingeschaltet werden.",
  alreadyDb: "Die Uhrenquelle steht schon auf Datenbank.",
  alreadyOn: "Die Beweispflicht ist schon eingeschaltet.",
  unknown: "Diese Einstellung gibt es nicht.",
  technical: "Das hat nicht geklappt. Bitte versuche es noch einmal.",
} as const;

export function isSwitchStep(value: unknown): value is SwitchStep {
  return typeof value === "string" && (SWITCH_STEPS as readonly string[]).includes(value);
}

/** Zustand lesen: nur genau „off“ gilt als aus (fail-closed wie die Datenbank), als Uhrenquelle Datenbank nur genau „db“. */
export function normalizeState(raw: { enforcement?: unknown; clockSource?: unknown }): { enforcementOn: boolean; clockDb: boolean } {
  return { enforcementOn: String(raw.enforcement ?? "on").toLowerCase() !== "off", clockDb: raw.clockSource === "db" };
}

/** Steuer-, Bidi- und Zero-Width-Zeichen entfernen, Leerraum zusammenfassen (wie die Bereinigung der Ablehnungsgründe). */
export function cleanSwitchReason(text: string | null | undefined): string {
  return (text ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

export type SwitchPlan =
  | { kind: "invalid"; error: string }
  | { kind: "go"; key: "evidence_clock_source" | "evidence_enforcement"; value: "db" | "on"; reason: string };

/** Was passiert bei diesem Schritt? Ausschalten gibt es nicht über die Oberfläche (Wartungsfall). */
export function planSwitch(step: unknown, raw: { enforcement?: unknown; clockSource?: unknown }, reasonInput: string | null | undefined): SwitchPlan {
  if (!isSwitchStep(step)) return { kind: "invalid", error: SWITCH_TEXTS.unknown };
  const state = normalizeState(raw);
  const reason = cleanSwitchReason(reasonInput);
  const len = Array.from(reason).length;
  if (len < SWITCH_REASON_MIN || len > SWITCH_REASON_MAX) return { kind: "invalid", error: SWITCH_TEXTS.reason };
  if (step === "clock_db") {
    if (state.clockDb) return { kind: "invalid", error: SWITCH_TEXTS.alreadyDb };
    return { kind: "go", key: "evidence_clock_source", value: "db", reason };
  }
  if (state.enforcementOn) return { kind: "invalid", error: SWITCH_TEXTS.alreadyOn };
  if (!state.clockDb) return { kind: "invalid", error: SWITCH_TEXTS.needClock };
  return { kind: "go", key: "evidence_enforcement", value: "on", reason };
}
