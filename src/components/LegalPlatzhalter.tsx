import type { ReactNode } from "react";

/** Ein klar sichtbarer Platzhalter in Rechtstexten (Akzentfläche mit gestricheltem Rahmen und Klammern im Text, nicht nur Farbe). Verschwindet, sobald der Betreiber den Wert einträgt. */
export function Platzhalter({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded border border-dashed border-line bg-accent/15 px-1 !text-ink" data-testid="platzhalter">
      {children}
    </mark>
  );
}

/** Zeigt den Wert oder den markierten Platzhalter. */
export function Feld({ text, platzhalter }: { text: string; platzhalter: boolean }) {
  return platzhalter ? <Platzhalter>{text}</Platzhalter> : <>{text}</>;
}
