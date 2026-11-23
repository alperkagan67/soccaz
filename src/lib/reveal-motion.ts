// Bewegung beim Karten-Aufdecken (Vertrag 013 v3, AC-20 bis AC-23): die Entscheidung "feiern oder nicht" als reine Funktion, damit sie ohne Browser prüfbar ist.
// Der Merker (höchste bisher gezeigte Stufe) liegt NUR im Browser (localStorage), enthält nur einen Stufennamen, keinen Personenbezug und keinen Serverzustand.
import { RATING_TIERS, nextMaxTier, shouldCelebrate, type Tier } from "./rating";

export const REVEAL_STORAGE_KEY = "soccaz.maxTier";

/** Das Stück von `Storage`, das gebraucht wird (Tests reichen eine Attrappe, der Browser localStorage). */
export type TierStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type MotionDecision = { celebrate: boolean };

const KNOWN: ReadonlySet<string> = new Set(RATING_TIERS.map((t) => t.tier));

/** Liest den Merker; fehlt der Speicher, wirft er oder steht Müll darin: null (wie "noch nie gezeigt"). */
function readMax(storage: TierStorage | null | undefined): Tier | null {
  try {
    const v = storage?.getItem(REVEAL_STORAGE_KEY);
    return typeof v === "string" && KNOWN.has(v) ? (v as Tier) : null;
  } catch {
    return null;
  }
}

/**
 * Soll die Aufstiegs-Feier laufen? Nur bei einem Stufen-Aufstieg UND wenn die neue Stufe über dem bisher gezeigten Höchststand liegt. Danach wird der Merker erhöht.
 * Abstieg oder gleiche Stufe: keine Feier, der Merker bleibt unverändert (Entscheid TM). Ohne nutzbaren Speicher: nie feiern (kein Dauerfeuer), nichts speichern, nie ein Fehler.
 */
export function decideMotion(storage: TierStorage | null | undefined, afterTier: Tier, direction: "up" | "same" | "down"): MotionDecision {
  if (direction !== "up" || !storage) return { celebrate: false };
  let usable = true;
  try {
    storage.getItem(REVEAL_STORAGE_KEY);
  } catch {
    usable = false;
  }
  if (!usable) return { celebrate: false };
  const prev = readMax(storage);
  if (!shouldCelebrate(prev, afterTier)) return { celebrate: false };
  try {
    storage.setItem(REVEAL_STORAGE_KEY, nextMaxTier(prev, afterTier));
  } catch {
    return { celebrate: false }; // Speichern nicht möglich: lieber nicht feiern als bei jedem Besuch erneut
  }
  return { celebrate: true };
}
