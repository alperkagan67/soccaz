import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sichtung Turniertag (Handy): kleine Textfehler und Leerzustände. Quelltext-Pins (die Seiten selbst laufen in den E2E-Strecken).
const src = (p: string) => readFileSync(p, "utf8");

describe("Turnierseite", () => {
  const page = src("src/app/turniere/[id]/page.tsx");
  it("Gratis-Turnier: Hinweis ohne das alte 'Bereit' (der zweite Klick entfällt)", () => {
    expect(page).toContain("Der Spielplan erscheint, sobald alle Plätze belegt und alle Teams vollzählig sind. Sonst schließt der Veranstalter die Anmeldung und startet mit den bereiten Teams.");
    expect(page).not.toContain("noMoney ? \"Das Bracket erscheint, sobald alle Teams vollzählig sind und jeder Captain");
  });
  it("abgesagtes Turnier: Hinweis für alle, kein 'Anmelden und mitmachen' mehr für Gäste außerhalb der Anmeldung", () => {
    expect(page).toContain('data-testid="cancelled-note"');
    expect(page).toContain("Dieses Turnier wurde abgesagt.");
    expect(page).toMatch(/\{!user && \(inRegistration \|\| inPayment\) && !\(inRegistration && data\.deadlinePassed\) && \(/); // nach dem Anmeldeschluss: nicht mehr (N8)
  });
  it("Spielplan: deutsches Wort statt 'Just for fun'", () => {
    expect(page + src("src/app/turniere/[id]/BoardClock.tsx")).not.toContain("Just for fun");
    expect(page).toContain("Spaßspiel, ");
  });
});

describe("Spielseite: Spielverlauf", () => {
  it("ohne Minute steht kein einzelner Apostroph", () => {
    expect(src("src/app/spiele/[id]/page.tsx")).toContain("e.minute !== null && e.minute !== undefined");
  });
});
