// Teamfarbe (Vertrag 007, AC-9, AC-11, AC-12): Schlüssel der 12er-Palette, Farbabstand CIEDE2000, Standardfarbe aus dem Slug,
// Ersatzfarbe für die Anzeige. Reine Funktionen ohne Abhängigkeiten, auch im Browser nutzbar.
import { TEAM_COLORS, type TeamColor } from "./color";

/** Die zwölf erlaubten Schlüssel, in Palettenreihenfolge. Gleiche Liste steht im Check-Constraint `teams_color_check`. */
export const COLOR_KEYS: readonly string[] = TEAM_COLORS.map((c) => c.key);

/** Mindestabstand ΔE00 zweier Teamfarben im selben Spiel (Vertrag 007). */
export const DISTANCE_MIN = 20;

const KEY_SET: ReadonlySet<string> = new Set(COLOR_KEYS);

/** Ist der Wert genau einer der zwölf Schlüssel? (Kein Hex, kein Text, kein Orange.) */
export function isColorKey(value: unknown): value is string {
  return typeof value === "string" && KEY_SET.has(value);
}

export function colorByKey(key: string | null | undefined): TeamColor | null {
  return isColorKey(key) ? (TEAM_COLORS.find((c) => c.key === key) ?? null) : null;
}

export type Lab = readonly [number, number, number];

// sRGB (D65) -> CIELAB (Referenzweiß D65)
function toLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToLab(hex: string): Lab {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Ungültige Farbe: ${hex}`);
  const n = parseInt(m[1], 16);
  const r = toLinear((n >> 16) & 255);
  const g = toLinear((n >> 8) & 255);
  const b = toLinear(n & 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** CIEDE2000 (Sharma, Wu, Dalal 2005) zweier CIELAB-Werte, kL = kC = kH = 1. */
export function labDistance(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (y: number, x: number) => (x === 0 && y === 0 ? 0 : (deg(Math.atan2(y, x)) + 360) % 360);
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Farbabstand ΔE00 zweier Hex-Farben (`#rrggbb`) in CIELAB D65. */
export function deltaE00(hexA: string, hexB: string): number {
  return labDistance(hexToLab(hexA), hexToLab(hexB));
}

const hexOf = (key: string) => TEAM_COLORS.find((c) => c.key === key)!.hex;

/**
 * Gastfarbe für die Anzeige (AC-9): Liegt der Abstand zu Heim bei mindestens 20, bleibt sie. Sonst die der Gastfarbe nächstliegende
 * Palettenfarbe mit Abstand >= 20 zu Heim (bei Gleichstand die frühere in der Palette). Gespeichert wird die Ersatzfarbe nie.
 */
export function displayAwayColor(homeKey: string, awayKey: string): string {
  if (!isColorKey(homeKey) || !isColorKey(awayKey)) return awayKey;
  if (deltaE00(hexOf(homeKey), hexOf(awayKey)) >= DISTANCE_MIN) return awayKey;
  let best: string | null = null;
  let bestD = Infinity;
  for (const k of COLOR_KEYS) {
    if (deltaE00(hexOf(homeKey), hexOf(k)) < DISTANCE_MIN) continue;
    const d = deltaE00(hexOf(awayKey), hexOf(k));
    if (d < bestD) {
      best = k;
      bestD = d;
    }
  }
  return best ?? awayKey;
}

/** Standardfarbe eines Teams ohne gewählte Farbe: stabiler Hash (FNV-1a) des Slugs auf die Palette (AC-12). */
export function defaultColorKey(slug: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return COLOR_KEYS[h % COLOR_KEYS.length];
}

/** Wirksamer Schlüssel: die gewählte Farbe, sonst die Standardfarbe aus dem Slug. */
export function effectiveColorKey(color: string | null | undefined, slug: string): string {
  return isColorKey(color) ? color : defaultColorKey(slug);
}
