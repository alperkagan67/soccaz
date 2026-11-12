// CI-Hilfe: Doku-PRs überspringen die Browser-Tests (Shards, Integration); der Sammelcheck "Browser-Tests" bleibt trotzdem aussagekräftig.
// Keine Fremd-Action, keine Abhängigkeiten. Werte kommen nur über Umgebungsvariablen (nie GitHub-Ausdrücke im Skript).
//   node scripts/ci-gate.mjs changes     Umgebung: BASE_SHA, HEAD_SHA, GITHUB_OUTPUT -> schreibt docs_only=true|false
//   node scripts/ci-gate.mjs aggregate   Umgebung: CHANGES_RESULT, DOCS_ONLY, SHARD_RESULT, INTEGRATION_RESULT -> Exit 0 (grün) oder 1 (rot)
// Tests: tests/unit/ci-gate.test.ts
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Bäume, in denen auch .md-Dateien Code-Bestandteil sein können (werden gelesen oder ausgeliefert): nie Doku. */
const NEVER_DOC_PREFIXES = [".github/", ".claude/", "src/", "tests/", "scripts/", "public/", "drizzle/", "node_modules/"];
/** package.json und Lockfiles zählen nie als Doku, auch nicht unter docs/. */
const NEVER_DOC_BASENAMES = /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/;

/**
 * Ist diese geänderte Datei reine Doku? Doku = liegt unter docs/ ODER endet auf .md (Wurzel, z. B. README.md), aber nie in den Code-Bäumen
 * und nie .github/, package.json oder Lockfile. Unklare Pfade (absolut, mit .., mit Backslash, leer) sind nie Doku.
 * @param {string} path
 */
export function isDocFile(path) {
  if (typeof path !== "string" || path === "" || path.includes("\\") || path.startsWith("/") || path.includes("\0")) return false;
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  if (NEVER_DOC_BASENAMES.test(parts[parts.length - 1])) return false;
  if (NEVER_DOC_PREFIXES.some((p) => path.startsWith(p))) return false;
  return path.startsWith("docs/") || path.toLowerCase().endsWith(".md");
}

/**
 * docs_only gilt nur, wenn mindestens eine Datei geändert wurde und ALLE Dateien Doku sind.
 * @param {readonly string[]} files
 */
export function isDocsOnly(files) {
  return Array.isArray(files) && files.length > 0 && files.every(isDocFile);
}

const SHA = /^[0-9a-f]{40}$/;
const ZERO = /^0{40}$/;

/**
 * Berechnet docs_only aus dem git-Unterschied zwischen Basis und Kopf. Sicherer Default false bei jedem Zweifel:
 * keine/ungültige/Null-Basis (neuer Branch, Push ohne before), unbekannte Basis (Force-Push), Fehler von git, leere Liste.
 * @param {{ base?: string, head?: string, run?: (base: string, head: string) => string[] }} input
 */
export function computeDocsOnly({ base, head, run = gitChangedFiles }) {
  try {
    if (!base || !head || !SHA.test(base) || !SHA.test(head) || ZERO.test(base)) return false;
    return isDocsOnly(run(base, head));
  } catch {
    return false;
  }
}

/** @param {string} base @param {string} head */
function gitChangedFiles(base, head) {
  const out = execFileSync("git", ["diff", "--name-only", "-z", "--no-renames", base, head, "--"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter((f) => f !== "");
}

/**
 * Entscheidungstabelle des Sammelchecks "Browser-Tests". Grün NUR wenn
 *  - alle Vorgänger success sind (changes, e2e-shard, integration), ODER
 *  - changes success ist, docs_only "true" ist UND e2e-shard und integration beide skipped sind.
 * Rot bei failure, cancelled und bei skipped OHNE docs_only (auch wenn changes selbst fehlschlug).
 * @param {{ changes?: string, docsOnly?: string, shard?: string, integration?: string }} r
 */
export function aggregate({ changes, docsOnly, shard, integration }) {
  if (changes !== "success") return { ok: false, reason: `changes: ${changes ?? "(fehlt)"}` };
  if (shard === "success" && integration === "success") return { ok: true, reason: "alle Teile erfolgreich" };
  if (docsOnly === "true" && shard === "skipped" && integration === "skipped") return { ok: true, reason: "nur Doku geändert, Browser-Tests übersprungen" };
  return { ok: false, reason: `e2e-shard: ${shard ?? "(fehlt)"}, integration: ${integration ?? "(fehlt)"}, docs_only: ${docsOnly || "(leer)"}` };
}

function main(mode, env) {
  if (mode === "changes") {
    const docsOnly = computeDocsOnly({ base: env.BASE_SHA, head: env.HEAD_SHA });
    console.log(`docs_only=${docsOnly}`);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
    return 0;
  }
  if (mode === "aggregate") {
    const r = aggregate({ changes: env.CHANGES_RESULT, docsOnly: env.DOCS_ONLY, shard: env.SHARD_RESULT, integration: env.INTEGRATION_RESULT });
    console.log(r.ok ? `Browser-Tests: grün (${r.reason})` : `Browser-Tests: ROT (${r.reason})`);
    return r.ok ? 0 : 1;
  }
  console.error("Aufruf: node scripts/ci-gate.mjs changes|aggregate");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv[2], process.env));
}
