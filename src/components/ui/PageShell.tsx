import type { ReactNode } from "react";

export type PageWidth = "narrow" | "std" | "full";

// Breiten aus den Tokens --w-narrow (720), --w-std (1040), --w-full (1280)
const WIDTH: Record<PageWidth, string> = {
  narrow: "max-w-[var(--w-narrow)]",
  std: "max-w-[var(--w-std)]",
  full: "max-w-[var(--w-full)]",
};

/**
 * Rahmen einer Seite: Breite nach Token, optional eine Seitenleiste (ab 1024 px zweispaltig, darunter darunter).
 * Rendert kein `<main>`: das liegt im Layout (`<main id="inhalt">`).
 */
export function PageShell({ width = "std", aside, children }: { width?: PageWidth; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={`mx-auto w-full min-w-0 ${WIDTH[width]} max-sm:has-[[data-page-action]]:pb-24 ${aside ? "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6" : ""}`}>
      <div className="min-w-0 space-y-4">{children}</div>
      {aside ? <aside className="mt-4 min-w-0 space-y-4 lg:mt-0">{aside}</aside> : null}
    </div>
  );
}
