const MAX_LENGTH = 500;

/**
 * Prüft ein Rücksprungziel (z. B. `?next=`): Nur interne Pfade sind erlaubt, sonst gilt der Fallback.
 * Erlaubt ist, was mit "/" beginnt, aber nicht mit "//" (das wäre ein fremder Host), ohne Backslash (manche Browser
 * lesen "/\evil" wie "//evil") und ohne Steuerzeichen (Tab und Zeilenumbruch werden beim Auflösen von URLs entfernt,
 * "/<TAB>/evil" würde so zu "//evil"). Die Länge ist begrenzt. Als Fallback ist auch `null` möglich. Query und Fragment bleiben erhalten.
 */
export function safeInternalPath(value: unknown): string;
export function safeInternalPath(value: unknown, fallback: string): string;
export function safeInternalPath(value: unknown, fallback: null): string | null;
export function safeInternalPath(value: unknown, fallback: string | null = "/app"): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return fallback;
  }
  return value;
}

/**
 * Das erste gültige Rücksprungziel aus mehreren Kandidaten (in dieser Reihenfolge), sonst `null`. Ein ungültiger oder fehlender Kandidat
 * überspringt nur sich selbst: ein beschädigter Altwert vorn in der Liste verdeckt kein gültiges Ziel dahinter.
 */
export function firstSafePath(...values: unknown[]): string | null {
  for (const v of values) {
    const p = safeInternalPath(v, null);
    if (p !== null) return p;
  }
  return null;
}
