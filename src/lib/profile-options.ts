export const ACCENTS = {
  green: { label: "Grün", css: "var(--green)" },
  cyan: { label: "Türkis", css: "var(--cyan)" },
  sky: { label: "Blau", css: "var(--sky)" },
  violet: { label: "Violett", css: "var(--violet)" },
  pink: { label: "Pink", css: "var(--pink)" },
  coral: { label: "Koralle", css: "var(--coral)" },
  yellow: { label: "Gelb", css: "var(--yellow)" },
} as const;
export type AccentKey = keyof typeof ACCENTS;
export const accentCss = (key: string | null | undefined) => (key && key in ACCENTS ? ACCENTS[key as AccentKey].css : ACCENTS.green.css);
export const FEET = ["links", "rechts", "beidfüßig"] as const;
