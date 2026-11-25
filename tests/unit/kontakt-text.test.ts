import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sichtung N7 (Backlog 266): der Satz nennt den Anruf nur, wenn es einen Anruf-Knopf mit Nummer gibt.
const seite = readFileSync("src/app/app/turniere/neu/page.tsx", "utf8");

describe("Turnier anlegen ohne Veranstalter-Recht: Kontakt-Satz", () => {
  it("'Ruf den Socaz-Admin an' steht nur bei gesetzter Nummer (phone), sonst 'Schreib uns eine E-Mail'", () => {
    expect(seite).toContain('{phone ? "Ruf den Socaz-Admin an oder schreib uns eine E-Mail" : "Schreib uns eine E-Mail"}');
    expect(seite.split("Ruf den Socaz-Admin an").length - 1).toBe(1); // nur dieser bedingte Text
  });
  it("Anruf-Knopf und E-Mail-Knopf bleiben", () => {
    expect(seite).toContain("{phone && <a href={`tel:");
    expect(seite).toContain("E-Mail an den Admin (Kontaktseite)");
  });
});
