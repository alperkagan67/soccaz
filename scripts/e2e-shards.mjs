// CI-Hilfe: Aufteilung der Browser-Tests (tests/e2e/*.spec.ts) auf Shards nach Laufzeit (Datei .github/e2e-shards.json).
// Keine Fremd-Action, keine Abhaengigkeiten. Aufruf:
//   node scripts/e2e-shards.mjs list <N>   gibt die Playwright-Dateifilter des Shards N aus (durch Leerzeichen getrennt, je Datei ein verankerter Ausdruck)
//   node scripts/e2e-shards.mjs check      Exit 1, wenn eine Spec-Datei in keinem oder in mehreren Shards steht, eine eingetragene Datei fehlt oder ein Shard leer ist
// Tests: tests/unit/e2e-shards.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SHARDS_FILE = ".github/e2e-shards.json";
export const SPEC_DIR = "tests/e2e";
const SPEC_NAME = /^[a-z0-9][a-z0-9.-]*\.spec\.ts$/;

/** @param {string} text */
export function parseShards(text) {
  const data = JSON.parse(text);
  const shards = data && typeof data === "object" ? data.shards : null;
  if (!shards || typeof shards !== "object" || Array.isArray(shards)) throw new Error("e2e-shards.json: Schluessel 'shards' fehlt");
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [k, v] of Object.entries(shards)) {
    if (!/^[1-9][0-9]?$/.test(k)) throw new Error(`e2e-shards.json: ungueltige Shard-Nummer '${k}'`);
    if (!Array.isArray(v) || v.some((f) => typeof f !== "string")) throw new Error(`e2e-shards.json: Shard ${k} ist keine Liste von Dateinamen`);
    out[k] = v;
  }
  return out;
}

/**
 * Prueft die Zuordnung gegen die vorhandenen Spec-Dateien.
 * @param {readonly string[]} specs Dateinamen (ohne Verzeichnis) der vorhandenen Specs
 * @param {Record<string, string[]>} shards
 * @returns {string[]} Fehlermeldungen (leer = in Ordnung)
 */
export function checkShards(specs, shards) {
  const problems = [];
  const seen = new Map();
  const nums = Object.keys(shards).sort((a, b) => Number(a) - Number(b));
  nums.forEach((n, i) => {
    if (Number(n) !== i + 1) problems.push(`Shard-Nummern muessen 1 bis ${nums.length} ohne Luecke sein (gefunden: ${nums.join(", ")})`);
  });
  for (const n of nums) {
    if (shards[n].length === 0) problems.push(`Shard ${n} ist leer`);
    for (const f of shards[n]) {
      if (!SPEC_NAME.test(f)) problems.push(`Shard ${n}: ungueltiger Dateiname '${f}'`);
      seen.set(f, [...(seen.get(f) ?? []), n]);
    }
  }
  for (const [f, where] of seen) {
    if (where.length > 1) problems.push(`'${f}' steht in mehreren Shards (${where.join(", ")})`);
    if (!specs.includes(f)) problems.push(`'${f}' (Shard ${where.join(", ")}) gibt es unter ${SPEC_DIR}/ nicht`);
  }
  for (const f of specs) if (!seen.has(f)) problems.push(`'${f}' steht in keinem Shard: in ${SHARDS_FILE} eintragen`);
  return problems;
}

/** Verankerter Dateifilter fuer Playwright (Ausdruck gegen den Pfad): Punkte maskiert, Ende verankert. @param {string} file */
export function filterFor(file) {
  return `${SPEC_DIR}/${file.replace(/\./g, "\\.")}$`;
}

/** @param {string} mode @param {string[]} args @param {{ readText?: (p: string) => string, listSpecs?: () => string[] }} io */
export function main(mode, args, io = {}) {
  const readText = io.readText ?? ((p) => readFileSync(p, "utf8"));
  const listSpecs = io.listSpecs ?? (() => readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.ts")));
  const shards = parseShards(readText(SHARDS_FILE));
  if (mode === "check") {
    const problems = checkShards(listSpecs(), shards);
    if (problems.length) {
      for (const p of problems) console.error(`e2e-shards: ${p}`);
      return 1;
    }
    console.log(`e2e-shards: ${Object.keys(shards).length} Shards, ${listSpecs().length} Spec-Dateien, jede genau einmal`);
    return 0;
  }
  if (mode === "list") {
    const n = args[0];
    if (!n || !shards[n]) {
      console.error(`e2e-shards: Shard '${n ?? ""}' gibt es nicht`);
      return 2;
    }
    console.log(shards[n].map(filterFor).join(" "));
    return 0;
  }
  console.error("Aufruf: node scripts/e2e-shards.mjs list <N> | check");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv[2], process.argv.slice(3)));
}
