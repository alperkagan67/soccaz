import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 012 M5-7b (F7): Es gibt heute KEINEN Weg, Termin, Dauer oder Hallenmiete eines angelegten Turniers zu aendern. Dieser Strukturtest haelt das fest: schreibt kuenftig eine UPDATE-Anweisung auf
// tournaments eine dieser Spalten, muss die Datei resetVenueConfirmationIfTermsChanged benutzen (sonst bliebe eine Zusage fuer veraenderte Bedingungen stehen).
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []));
const files = walk("src").filter((f) => !f.endsWith("tournament-venue.ts"));

describe("Zusage der Halle: Rueckset bei geaenderten Bedingungen", () => {
  it("keine UPDATE-Anweisung auf tournaments setzt startsAt, durationMin, totalCents oder hourlyCents (ausser mit dem Helfer)", () => {
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      const writes = /update\(tournaments\)\s*\.set\(\{[^}]*\b(startsAt|durationMin|totalCents|hourlyCents)\b/.test(text);
      return writes && !text.includes("resetVenueConfirmationIfTermsChanged");
    });
    expect(offenders).toEqual([]);
  });

  it("setTournamentVenue (Hallenwechsel) setzt die Zusage zurueck", () => {
    const t = readFileSync("src/server/tournament-venue.ts", "utf8");
    expect(t).toContain("venueConfirmedAt: null"); // der DB-Reset-Trigger der Nachlieferung (16f.9) leert venue_confirmed_by ohnehin
  });
});
