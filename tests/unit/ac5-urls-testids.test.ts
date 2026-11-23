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
    const missing = new Set<string>();
    for (const f of e2eFiles) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/getByTestId\(\s*"([^"$]+)"\s*\)(\)\.toHaveCount\(0\)|\)\.not\.|\.not\.)?/g)) {
        const id = m[1];
        if (m[2]) continue; // Verneinung: die Test-ID darf fehlen (zum Beispiel entferntes Guthaben)
        // dynamische Test-IDs (data-testid={`error-${name}`}): das feste Stück vor dem Platzhalter genügt
        // oder mit dynamischem Anfang (data-testid={`${testId}-whatsapp`}): das feste Ende nach dem Platzhalter
        if (id.split("-").some((_, i, parts) => i > 0 && (srcText.includes("`" + parts.slice(0, i).join("-") + "-${") || srcText.includes("}-" + parts.slice(i).join("-") + "`")))) continue;
        // data-testid="id", testid="id" oder als Zeichenkette in einer Konstante/Eigenschaft
        if (!srcText.includes(`"${id}"`) && !srcText.includes(`'${id}'`) && !srcText.includes(`\`${id}\``) && !new RegExp(`data-testid=\\{\`${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(srcText)) missing.add(`${id} (${relative(root, f).split("\\").join("/")})`);
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

  it("Gegenprobe: der Routen-Leser erkennt Muster und ein erfundener Pfad fällt durch", () => {
    const routes = routePatterns();
    expect(routes.length).toBeGreaterThan(30);
    expect(routes.some((r) => r.re.test("/lobby/x"))).toBe(true);
    expect(routes.some((r) => r.re.test("/gibt-es-nicht/x"))).toBe(false);
    expect(normalizeTarget("/lobby/${matchId}?x=1")).toBe("/lobby/x");
    expect(normalizeTarget("https://x.de/a")).toBeNull();
  });
});
