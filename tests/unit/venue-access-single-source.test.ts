import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 012 M5-7a (Plan 19.6): "Zugang" hat GENAU EINE Auslegung (venue-access-rules.ts, activeAccessWhere). Kein zweiter Weg, "aktiv, nicht gesperrt, kein Admin" auszudruecken, und
// die Attrappen/Aufrufer fuer Turniere benutzen die Funktion statt einer eigenen Bedingung.
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []));
const files = walk("src");

describe("Zugang je Halle: eine Quelle", () => {
  it("die Bedingung steht genau einmal in venue-access-rules.ts und wird von allen vier Funktionen benutzt", () => {
    const rules = readFileSync("src/server/venue-access-rules.ts", "utf8");
    expect(rules.match(/eq\(venueAccess\.status, "active"\)/g)).toHaveLength(1);
    expect(rules.match(/ne\(users\.role, "admin"\)/g)).toHaveLength(1);
    expect(rules.match(/activeAccessWhere\(\)/g)!.length).toBeGreaterThanOrEqual(4); // hasVenueAccess, venueIdsOf, accessHolders, venueHasActiveAccess
  });

  it("kein anderer Code unter src liest venue_access auf 'aktiv' mit eigener Bedingung (ausser venue-access-rules.ts)", () => {
    const hits = files.filter((f) => !f.endsWith("venue-access-rules.ts") && /venueAccess\.status, "active"|from venue_access[^;]{0,200}status = 'active'/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("tournament-venue.ts hat keine eigene Zugangsbedingung, sondern ruft venueHasActiveAccess", () => {
    const t = readFileSync("src/server/tournament-venue.ts", "utf8");
    expect(t).toContain("venueHasActiveAccess");
    expect(t).not.toMatch(/\bvenueAccess\b|venue_access/);
  });
});
