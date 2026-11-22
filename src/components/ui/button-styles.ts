// Gemeinsame Klassen für Button, LinkButton und IconButton (Vertrag 013 M2-2a).
// Die Komponenten nehmen kein className an: Höhe und Fokus lassen sich so nicht von außen unter 44 px drücken.
export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "md" | "sm";

const BASE =
  "ui-focus relative inline-flex min-h-[var(--tap)] select-none items-center justify-center gap-2 rounded-[10px] border font-semibold no-underline transition-[color,background-color,border-color]";

const VARIANT: Record<ButtonVariant, string> = {
  // Orange nur für die eine Hauptaktion
  primary: "border-transparent bg-accent text-accent-ink hover:brightness-95",
  secondary: "border-rim bg-transparent text-ink hover:bg-panel2",
  // Rahmen (2 px) und Wort, nicht nur Farbe
  danger: "border-2 border-danger bg-transparent text-danger hover:bg-danger-soft",
};

const SIZE: Record<ButtonSize, string> = {
  md: "px-4 text-base",
  // kleiner im Schriftbild, aber gleiche Höhe: das Tippziel bleibt 44 px
  sm: "px-3 text-sm",
};

// Gesperrt: gestrichelter Rahmen und gedämpfte Schrift, nicht nur blasser
const DISABLED =
  "aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-line aria-disabled:bg-transparent aria-disabled:text-muted aria-disabled:hover:brightness-100 aria-disabled:hover:bg-transparent";

export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", disabled = false): string {
  return [BASE, VARIANT[variant], SIZE[size], disabled ? DISABLED : "cursor-pointer"].join(" ");
}

export function iconButtonClasses(variant: ButtonVariant = "secondary", disabled = false): string {
  return [BASE, VARIANT[variant], "min-w-[var(--tap)] px-0 text-base", disabled ? DISABLED : "cursor-pointer"].join(" ");
}
