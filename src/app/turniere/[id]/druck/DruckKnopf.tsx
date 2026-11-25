"use client";

/** Drucken-Knopf (braucht JavaScript). Die Seite selbst druckt auch ohne: Browser-Menü „Drucken“. */
export function DruckKnopf() {
  return (
    <button type="button" className="btn btn-primary !min-h-11" onClick={() => window.print()} data-testid="druck-knopf">
      Jetzt drucken
    </button>
  );
}
