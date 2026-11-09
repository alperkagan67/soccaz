const MAX_LENGTH = 500;

/**
 * Prüft ein Rücksprungziel (z. B. `?next=`): Nur interne Pfade sind erlaubt, sonst gilt der Fallback.
 * Erlaubt ist, was mit "/" beginnt, aber nicht mit "//" (das wäre ein fremder Host), ohne Backslash (manche Browser
 * lesen "/\evil" wie "//evil") und ohne Steuerzeichen (Tab und Zeilenumbruch werden beim Auflösen von URLs entfernt,
 * "/<TAB>/evil" würde so zu "//evil"). Die Länge ist begrenzt. Query und Fragment bleiben erhalten.
 */
export function safeInternalPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return fallback;
  }
  return value;
}
