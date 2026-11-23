// Reine Logik des Bausteins `Assistent` (Vertrag 013 Version 3, Abschnitt 4, AC-25/26): Schritt-für-Schritt-Abläufe auf derselben URL.
// Keine React-Abhängigkeit, damit sie ohne DOM testbar ist (tests/unit/assistent.test.ts). Der Entwurf bleibt nur in der Browser-Sitzung (sessionStorage), nie auf dem Server.

export type Werte = Readonly<Record<string, string>>;
/** Fehlertext je Feldname (Name = `name` des Eingabefeldes), wie `ActionState.fieldErrors`. */
export type Fehler = Readonly<Record<string, string>>;

/** Was die Logik von einem Schritt wissen muss (die Oberfläche steht in der Komponente). */
export type SchrittInfo = {
  id: string;
  /** Namen der Felder dieses Schritts: nur diese werden im Entwurf gespeichert und bei Serverfehlern dem Schritt zugeordnet. */
  felder: readonly string[];
  /** Felder, die NIE im Entwurf landen (z. B. Zustimmungen, die jede Sitzung neu gegeben werden). */
  nichtSpeichern?: readonly string[];
};

export type Zustand = { schritt: number; werte: Werte; fehler: Fehler };

export const ENTWURF_VERSION = 1;
/** Grenzen gegen kaputte oder manipulierte Entwürfe im Browser. */
export const MAX_WERT_LAENGE = 2000;
export const MAX_ENTWURF_ZEICHEN = 20_000;

export const startZustand = (werte: Werte = {}): Zustand => ({ schritt: 0, werte, fehler: {} });

/** Setzt einen Wert; der Fehler dieses Feldes verschwindet, sobald der Nutzer es ändert. */
export function setzeWert(z: Zustand, name: string, wert: string): Zustand {
  const { [name]: _entfernt, ...rest } = z.fehler;
  void _entfernt;
  return { ...z, werte: { ...z.werte, [name]: wert }, fehler: rest };
}

export const istLetzterSchritt = (z: Zustand, anzahl: number): boolean => z.schritt >= anzahl - 1;

/** Weiter: nur ohne Fehler im aktuellen Schritt. Mit Fehlern bleibt der Schritt stehen und die Fehler werden gezeigt. */
export function weiter(z: Zustand, anzahl: number, fehler: Fehler): Zustand {
  if (Object.keys(fehler).length > 0) return { ...z, fehler };
  return { ...z, schritt: Math.min(z.schritt + 1, Math.max(anzahl - 1, 0)), fehler: {} };
}

/** Zurück braucht keine Prüfung; die Eingaben bleiben erhalten. */
export function zurueck(z: Zustand): Zustand {
  return { ...z, schritt: Math.max(z.schritt - 1, 0), fehler: {} };
}

/**
 * Serverfehler am Ende (Feldfehler aus `ActionState`): springt zum ersten Schritt, der ein betroffenes Feld enthält, und zeigt dort die Fehler.
 * Gehört kein Fehler zu einem Schritt, bleibt der aktuelle Schritt (der allgemeine Fehlertext steht dann in der Oberfläche).
 */
export function springeZuFehler(z: Zustand, schritte: readonly SchrittInfo[], fehler: Fehler): Zustand {
  const namen = Object.keys(fehler);
  const index = schritte.findIndex((s) => s.felder.some((f) => namen.includes(f)));
  return { ...z, schritt: index >= 0 ? index : z.schritt, fehler };
}

/** Fortschritt für „Schritt 2 von 5“ (n zählt ab 1). */
export const fortschritt = (z: Zustand, anzahl: number): { n: number; m: number } => ({ n: Math.min(z.schritt + 1, anzahl), m: anzahl });

/** Schritt-Zustand je Eintrag der Fortschrittsliste. */
export type SchrittStatus = "erledigt" | "aktuell" | "offen";
export const schrittStatus = (z: Zustand, index: number): SchrittStatus => (index < z.schritt ? "erledigt" : index === z.schritt ? "aktuell" : "offen");

/** Schlüssel im sessionStorage; je Ablauf einer (`id`), z. B. „halle-onboarding“. */
export const entwurfSchluessel = (id: string): string => `assistent:${id}`;

/** Entwurf als Text: Version, Schritt, Werte der bekannten Felder ohne `nichtSpeichern`. Enthält nie Fehler. */
export function serialisiereEntwurf(z: Zustand, schritte: readonly SchrittInfo[]): string {
  const erlaubt = new Set(schritte.flatMap((s) => s.felder.filter((f) => !(s.nichtSpeichern ?? []).includes(f))));
  const werte: Record<string, string> = {};
  for (const [name, wert] of Object.entries(z.werte)) if (erlaubt.has(name) && typeof wert === "string" && wert.length <= MAX_WERT_LAENGE) werte[name] = wert;
  return JSON.stringify({ v: ENTWURF_VERSION, schritt: z.schritt, werte });
}

/** Liest einen Entwurf; fremde, kaputte, zu große oder falsch versionierte Entwürfe ergeben `null` (der Ablauf startet dann leer). */
export function leseEntwurf(roh: string | null | undefined, schritte: readonly SchrittInfo[]): { schritt: number; werte: Werte } | null {
  if (!roh || roh.length > MAX_ENTWURF_ZEICHEN) return null;
  let data: unknown;
  try {
    data = JSON.parse(roh);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const d = data as { v?: unknown; schritt?: unknown; werte?: unknown };
  if (d.v !== ENTWURF_VERSION || typeof d.werte !== "object" || d.werte === null || Array.isArray(d.werte)) return null;
  const erlaubt = new Set(schritte.flatMap((s) => s.felder.filter((f) => !(s.nichtSpeichern ?? []).includes(f))));
  const werte: Record<string, string> = {};
  for (const [name, wert] of Object.entries(d.werte as Record<string, unknown>)) {
    if (erlaubt.has(name) && typeof wert === "string" && wert.length <= MAX_WERT_LAENGE) werte[name] = wert;
  }
  const letzter = Math.max(schritte.length - 1, 0);
  const schritt = typeof d.schritt === "number" && Number.isInteger(d.schritt) ? Math.min(Math.max(d.schritt, 0), letzter) : 0;
  return { schritt, werte };
}
