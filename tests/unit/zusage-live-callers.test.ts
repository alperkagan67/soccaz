import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 012 M5-7b (R-T251): jeder Aufrufer von hallZusageOkLive und zusageRequired liefert die Abbuchungsfrist (chargeDueAt); ohne Frist wuerde die Live-Pflicht falsch (nie) greifen.
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []));

describe("hallZusageOkLive und zusageRequired: Aufrufer", () => {
  it("jeder Aufruf (ausser der Definition) uebergibt chargeDueAt", () => {
    const calls: string[] = [];
    for (const f of walk("src")) {
      if (f.endsWith("tournament-venue.ts")) continue;
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (/\b(hallZusageOkLive|zusageRequired)\(/.test(line) && !/^\s*(import|export|\/\/|\*)/.test(line)) calls.push(`${f}: ${line.trim()}`);
      }
    }
    expect(calls.length).toBeGreaterThanOrEqual(3); // eligibility, chargeUnderway, confirm (Variable `due` aus chargeDueAt)
    for (const c of calls) expect(c, c).toMatch(/chargeDueAt|\bdue\b/);
  });
});
