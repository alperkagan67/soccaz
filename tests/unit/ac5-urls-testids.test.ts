import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// AC-5 (Vertrag 013): Keine URL und keine Test-ID wird geändert oder entfernt, alle bisherigen E2E bleiben grün. Dieser Wächter prüft die zwei Bindungen, die ein Umbau am leichtesten bricht, OHNE Browser:
//  1. Jede Test-ID, die ein E2E-Test per getByTestId("...") benutzt, steht noch im Quelltext von src (data-testid).
//  2. Jede Adresse, die ein E2E-Test per goto("...") öffnet, passt noch auf eine Seite oder Route unter src/app.
// Dynamische Teile (Vorlagen mit Platzhaltern, Variablen) werden nur bis zum ersten Platzhalter geprüft. Absichtlich fehlende Ziele (Test erwartet 404) und Verneinungen (toHaveCount(0)) stehen unten mit Grund.

/** Adressen, die es bewusst nicht mehr gibt: der Test prüft die Abwesenheit (404). */
const GONE_ON_PURPOSE: Record<string, string> = { "/admin/codes": "Rabattcodes entfallen (012 M6a), payments.spec erwartet 404" };
const root = join(__dirname, "..", "..");

function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });
}

const srcFiles = walk(join(root, "src"), /\.(tsx?|css)$/);
const e2eFiles = walk(join(root, "tests", "e2e"), /\.ts$/);
const srcText = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * Test-IDs, die src WIRKLICH als data-testid setzt (AC-5, Härtung Backlog 229 (1), R-T364). Nur diese Formen zählen, nicht jede Zeichenkette im Quelltext (ein aria-label oder eine Konstante mit demselben Text ist kein Beleg):
 *  - data-testid="id", data-testid='id', data-testid={"id"}, data-testid={`id`}
 *  - data-testid={bedingung ? "a" : "b"} (beide Werte)
 *  - testId="id" oder testId: "id" (Eigenschaft eines Bausteins, der sie als data-testid setzt, z. B. ShareLink)
 *  - dynamisch: data-testid={`vorn-${x}hinten`} gilt als Muster (jeder Platzhalter = beliebiger Text); data-testid={testId} ohne festen Teil gilt nicht.
 * Eine Auswahl per Selektor ([data-testid="id"] im Code) setzt nichts und zählt nicht.
 */
export function definedTestIds(text: string): { ids: Set<string>; patterns: RegExp[] } {
  const ids = new Set<string>();
  const patterns: RegExp[] = [];
  for (const m of text.matchAll(/(?<!\[)data-testid=(?:"([^"]+)"|'([^']+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/g)) ids.add((m[1] ?? m[2] ?? m[3] ?? m[4]) as string);
  for (const m of text.matchAll(/(?<!\[)data-testid=\{\s*`([^`]*)`\s*\}/g)) {
    if (!m[1].includes("${")) ids.add(m[1]);
    else patterns.push(new RegExp("^" + m[1].split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+") + "$"));
  }
  for (const m of text.matchAll(/(?<!\[)data-testid=\{[^{}`"']*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\}/g)) {
    ids.add(m[1]);
    ids.add(m[2]);
  }
  for (const m of text.matchAll(/\btestId\s*[=:]\s*(?:"([^"]+)"|'([^']+)')/g)) ids.add((m[1] ?? m[2]) as string);
  return { ids, patterns };
}
export const testIdDefined = (id: string, d: ReturnType<typeof definedTestIds>) => d.ids.has(id) || d.patterns.some((re) => re.test(id));

/** Routen aus dem App-Verzeichnis als Muster: [id] = ein Segment, [...x] = beliebig viele, (gruppe) zählt nicht, @slot und _privat entfallen. */
export function routePatterns(): { path: string; re: RegExp }[] {
  const appDir = join(root, "src", "app");
  const out: { path: string; re: RegExp }[] = [];
  for (const f of walk(appDir, /^(page|route)\.tsx?$/)) {
    const rel = relative(appDir, f).split("\\").join("/").replace(/\/?(page|route)\.tsx?$/, "");
    const segs = rel.split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
    if (segs.some((s) => s.startsWith("_"))) continue;
    const re = segs.map((s) => (/^\[\[?\.\.\./.test(s) ? "(?:/.+)?" : /^\[.*\]$/.test(s) ? "/[^/]+" : "/" + s.replace(/[.*+?^${}()|\\]/g, "\\$&"))).join("");
    out.push({ path: "/" + segs.join("/"), re: new RegExp(`^${re || "/"}$`) });
  }
  return out;
}

/** Adresse eines goto-Aufrufs ohne Query und Anker; Vorlagenteile (${...}) werden zu einem Segment-Platzhalter. */
export function normalizeTarget(raw: string): string | null {
  if (!raw.startsWith("/")) return null; // vollständige Adressen oder Variablen: nicht prüfbar
  const cut = raw.indexOf("${");
  const base = (cut >= 0 ? raw.slice(0, cut) + "x" : raw).split(/[?#]/)[0]; // ab dem ersten Platzhalter zählt nur noch ein Segment
  return base.length > 1 ? base.replace(/\/+$/, "") : base;
}

describe("AC-5: Bindungen der E2E-Tests an Test-IDs und Adressen", () => {
  it("jede per getByTestId(\"...\") benutzte Test-ID steht noch in src", () => {
    const defined = definedTestIds(srcText);
    const missing = new Set<string>();
    for (const f of e2eFiles) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/getByTestId\(\s*"([^"$]+)"\s*\)(\)\.toHaveCount\(0\)|\)\.not\.|\.not\.)?/g)) {
        const id = m[1];
        if (m[2]) continue; // Verneinung: die Test-ID darf fehlen (zum Beispiel entferntes Guthaben)
        // nur echte data-testid-Definitionen zählen (feste, bedingte, Eigenschaft testId, dynamische Muster), siehe definedTestIds
        if (!testIdDefined(id, defined)) missing.add(`${id} (${relative(root, f).split("\\").join("/")})`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("jede per goto(\"/...\") geöffnete Adresse passt auf eine Seite oder Route unter src/app", () => {
    const routes = routePatterns();
    const unknown = new Set<string>();
    for (const f of e2eFiles) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/\.goto\(\s*[`"'](\/[^`"']*)[`"']/g)) {
        const target = normalizeTarget(m[1]);
        if (!target || GONE_ON_PURPOSE[target]) continue;
        if (!routes.some((r) => r.re.test(target))) unknown.add(`${m[1]} (${relative(root, f).split("\\").join("/")})`);
      }
    }
    expect([...unknown].sort()).toEqual([]);
  });

  it("Gegenprobe Test-IDs: nur echte data-testid-Definitionen zählen (aria-label, Konstante, Selektor und leerer Platzhalter nicht)", () => {
    const d = definedTestIds(
      [
        '<p data-testid="fest-a">x</p>',
        "<p data-testid='fest-b'>x</p>",
        '<p data-testid={"fest-c"}>x</p>',
        "<p data-testid={`fest-d`}>x</p>",
        '<p data-testid={ok ? "bed-ja" : "bed-nein"}>x</p>',
        '<Baustein testId="eigenschaft-e" />',
        "<p data-testid={`zeile-${id}`}>x</p>",
        "<p data-testid={`${prefix}-ende`}>x</p>",
        "<p data-testid={testId}>x</p>",
        '<p aria-label="nur-label">x</p>',
        'const KONSTANTE = "nur-konstante";',
        'document.querySelector(\'[data-testid="nur-selektor"]\');',
      ].join("\n"),
    );
    for (const id of ["fest-a", "fest-b", "fest-c", "fest-d", "bed-ja", "bed-nein", "eigenschaft-e", "zeile-42", "etwas-ende"]) expect(testIdDefined(id, d), id).toBe(true);
    for (const id of ["nur-label", "nur-konstante", "nur-selektor", "zeile", "zeile-", "unbekannt"]) expect(testIdDefined(id, d), id).toBe(false);
  });

  it("Gegenprobe: der Routen-Leser erkennt Muster und ein erfundener Pfad fällt durch", () => {
    const routes = routePatterns();
    expect(routes.length).toBeGreaterThan(30);
    expect(routes.some((r) => r.re.test("/lobby/x"))).toBe(true);
    expect(routes.some((r) => r.re.test("/gibt-es-nicht/x"))).toBe(false);
    expect(normalizeTarget("/lobby/${matchId}?x=1")).toBe("/lobby/x");
    expect(normalizeTarget("https://x.de/a")).toBeNull();
  });
});
