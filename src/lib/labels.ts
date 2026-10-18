export const STRENGTH_LABELS: Record<number, string> = {
  1: "Locker",
  2: "Freizeit mit Ehrgeiz",
  3: "Gut eingespielt",
  4: "Sehr stark",
  5: "Ex-Vereinsspieler",
};

export function strengthText(value: number): string {
  return `${value} von 5 (${STRENGTH_LABELS[value] ?? ""})`;
}
