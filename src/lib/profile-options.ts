export const ACCENTS = {
  green: { label: "Grün", css: "var(--pc-green)" },
  cyan: { label: "Türkis", css: "var(--pc-cyan)" },
  sky: { label: "Blau", css: "var(--pc-sky)" },
  violet: { label: "Violett", css: "var(--pc-violet)" },
  pink: { label: "Pink", css: "var(--pc-pink)" },
  coral: { label: "Koralle", css: "var(--pc-coral)" },
  yellow: { label: "Gelb", css: "var(--pc-yellow)" },
} as const;
export type AccentKey = keyof typeof ACCENTS;
export const accentCss = (key: string | null | undefined) => (key && key in ACCENTS ? ACCENTS[key as AccentKey].css : ACCENTS.green.css);
export const FEET = ["links", "rechts", "beidfüßig"] as const;
