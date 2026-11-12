// Farbpalette und Kontrastrechnung der Oberfläche (Vertrag 007, Richtung E „Trikot“).
// Reine Funktionen ohne Abhängigkeiten: WCAG 2.x, relative Leuchtdichte nach sRGB.

export type TeamColor = { key: string; name: string; hex: string };

/** Die feste 12er-Palette der Teamfarben (Reihenfolge wie in DESIGN.md). Orange ist bewusst nicht dabei. */
export const TEAM_COLORS: readonly TeamColor[] = [
  { key: "red", name: "Rot", hex: "#c8102e" },
  { key: "burgundy", name: "Bordeaux", hex: "#7a1f3d" },
  { key: "pink", name: "Pink", hex: "#e9498c" },
  { key: "violet", name: "Violett", hex: "#6a3fb5" },
  { key: "navy", name: "Marine", hex: "#14284b" },
  { key: "blue", name: "Blau", hex: "#1f4fd1" },
  { key: "skyblue", name: "Himmelblau", hex: "#4fb3e8" },
  { key: "teal", name: "Türkis", hex: "#0fb5a6" },
  { key: "green", name: "Grün", hex: "#1e9e4a" },
  { key: "yellow", name: "Gelb", hex: "#f2c200" },
  { key: "white", name: "Weiß", hex: "#f4f4f2" },
  { key: "black", name: "Schwarz", hex: "#15181c" },
];

export const TEXT_LIGHT = "#ffffff";
export const TEXT_DARK = "#0b1118";

/** Neutrale Töne und Orange je Thema (DESIGN.md, Abschnitt Richtung E). */
export const THEMES = {
  dark: { bg: "#0f1914", fl: "#1b2a23", fl2: "#24362d", ink: "#eef4f0", muted: "#a3b5ab", rim: "#cfe0d6", line: "#3a5043", o: "#ff6a1f", oi: "#1d0a00" },
  light: { bg: "#dde5e0", fl: "#f1f5f2", fl2: "#e3eae5", ink: "#12201a", muted: "#4a5a51", rim: "#12201a", line: "#b3c2b9", o: "#c2410c", oi: "#ffffff" },
} as const;

/** Status-Töne je Thema (M2-1): fg = Schrift/Strich auf Grund und Fläche, ink = Schrift auf voller Fläche, soft = Tönung (Deckkraft 0,10). Muss mit globals.css übereinstimmen (Test). */
export const STATUS = {
  dark: { ink: "#0b1118", focus: "#9ecbff", fg: { ok: "#4ade80", warn: "#facc15", danger: "#ff8a8a", info: "#6cb2ff" } },
  light: { ink: "#ffffff", focus: "#1a44bd", fg: { ok: "#0f5f2c", warn: "#704800", danger: "#a51d12", info: "#1a44bd" } },
} as const;
export const STATUS_SOFT_ALPHA = 0.1;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative Leuchtdichte (WCAG 2.x) eines Hex-Werts `#rrggbb`. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Ungültige Farbe: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Kontrastverhältnis (1 bis 21) zweier Farben. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Textfarbe auf einer Teamfarbe: Weiß oder Fast-Schwarz, je nach größerem Verhältnis. */
export function textOn(hex: string): string {
  return contrast(hex, TEXT_LIGHT) >= contrast(hex, TEXT_DARK) ? TEXT_LIGHT : TEXT_DARK;
}
