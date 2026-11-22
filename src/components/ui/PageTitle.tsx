import type { ReactNode } from "react";

/**
 * Die einzige `h1` einer Seite. `tabIndex={-1}` macht sie zum Sprungziel (z. B. nach dem Wechsel der Seite).
 * Kein `as`: es gibt genau eine h1, Zwischenüberschriften sind h2 oder tiefer.
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 id="seiten-titel" tabIndex={-1} className="font-heading text-2xl font-bold outline-none sm:text-3xl">
      {children}
    </h1>
  );
}
