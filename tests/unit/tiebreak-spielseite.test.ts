import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Verdrahtung der Spielseite (PR 1b, R-T459/R-T460): Formular nur mit canDecide, Marke für alle, Abfrage erst bei beendetem Spiel.
describe("Spielseite Tie-Break", () => {
  const page = readFileSync("src/app/spiele/[id]/page.tsx", "utf8");
  const view = readFileSync("src/server/tiebreak-view.ts", "utf8");
  it("Formular nur für Berechtigte (canDecide), Kennung tiebreak-spielseite", () => {
    expect(page).toContain("const tieOffen = tie && v?.canDecide ? tie.offen : null;");
    expect(page).toContain('data-testid="tiebreak-spielseite"');
  });
  it("Marke 'n. GG' / 'n. 9m' auf der Ergebnisanzeige für alle Betrachter (tiebreak-marke-spiel)", () => {
    expect(page).toContain('data-testid="tiebreak-marke-spiel"');
    expect(page).toContain("tie?.marke");
  });
  it("Abfrage nur bei Turnierspielen und früher Ausstieg, solange das Spiel nicht 'played' ist", () => {
    expect(page).toContain('match.kind === "tournament" ? await tieStandFuerSpiel(match.id, match.status)');
    expect(view).toContain('if (status !== "played") return null;');
    expect(view.indexOf('if (status !== "played") return null;')).toBeLessThan(view.indexOf("db\n"));
  });
});
