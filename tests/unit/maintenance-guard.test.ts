import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Die Wartungsausnahme der Datenbank-Trigger (socaz.ledger_maintenance) ist ein freier Sitzungswert (bekannte Grenze, docs/BETRIEB.md, GO-LIVE-AUDIT "DB-Rollenmodell").
// Damit der App-Code sie nie setzt, prüft dieser Test den Quelltext: im App-Code (src/) und in den Skripten (scripts/) darf der Wert nirgends GESETZT werden
// (set_config(...) oder SET [LOCAL]). Erlaubt: tests/, drizzle/ (Migrationen) und ausdrücklich benannte Wartungsskripte (Allowlist unten, derzeit leer).
const ROOT = process.cwd();
const ALLOW_SCRIPTS: string[] = []; // z. B. "scripts/wartung-xyz.mjs": bewusst benannte Wartungsskripte
const SETS = /(set_config\s*\(\s*['"`]socaz\.ledger_maintenance|\bset\s+(local\s+|session\s+)?socaz\.ledger_maintenance)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(name)) out.push(p);
  }
  return out;
}

describe("Wartungsausnahme der Trigger (socaz.ledger_maintenance)", () => {
  it("wird im App-Code (src/) und in den Skripten (scripts/) nirgends gesetzt; Ausnahmen nur über die benannte Allowlist", () => {
    const offenders = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))]
      .map((p) => relative(ROOT, p).replace(/\\/g, "/"))
      .filter((rel) => !ALLOW_SCRIPTS.includes(rel))
      .filter((rel) => SETS.test(readFileSync(join(ROOT, rel), "utf8")));
    expect(offenders, `Wartungswert gesetzt in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("der Suchausdruck erkennt die Schreibweisen (Selbsttest)", () => {
    expect(SETS.test("await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`)")).toBe(true);
    expect(SETS.test("set local socaz.ledger_maintenance = 'on'")).toBe(true);
    expect(SETS.test("SET socaz.ledger_maintenance TO 'on'")).toBe(true);
    expect(SETS.test("// Ausnahme: socaz.ledger_maintenance (nur Kommentar)")).toBe(false);
    expect(SETS.test("current_setting('socaz.ledger_maintenance', true) = 'on'")).toBe(false);
  });
});
