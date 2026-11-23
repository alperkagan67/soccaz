import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Ein describe-Block ohne it/test faellt in der CI mit "No test found in suite" durch (lokal pro Datei gruen, #220). Wird beim Loeschen von Tests leicht uebersehen.
// Quelltext-Pruefung: jedes describe(...) in tests/**.test.ts/.spec.ts enthaelt mindestens einen it(/test(-Aufruf (auch it.each/it.skip ...).

/** Ende des Aufrufs, der bei `start` beginnt: Klammern zaehlen, Strings und Kommentare ueberspringen. null = nicht auswertbar (z. B. Regex-Literale mit Anfuehrungszeichen). */
export function callEnd(text: string, start: number): number | null {
  let depth = 0;
  for (let i = text.indexOf("(", start); i >= 0 && i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") { i = text.indexOf("\n", i); if (i < 0) return null; continue; }
    if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i); if (e < 0) return null; i = e + 1; continue; }
    if (c === '"' || c === "'") { for (i++; i < text.length && text[i] !== c && text[i] !== "\n"; i++) if (text[i] === "\\") i++; if (text[i] !== c) return null; continue; }
    if (c === "`") { for (i++; i < text.length && text[i] !== "`"; i++) if (text[i] === "\\") i++; if (text[i] !== "`") return null; continue; }
    if (c === "(") depth++;
    if (c === ")") { depth--; if (depth === 0) return i + 1; }
  }
  return null;
}

/** Titel aller describe-Bloecke ohne Testaufruf; `unparsable` zaehlt Bloecke, die nicht ausgewertet werden konnten. */
export function emptyDescribes(text: string): { empty: string[]; unparsable: number } {
  const empty: string[] = [];
  let unparsable = 0;
  const re = /^[ \t]*describe(?:\.\w+)?\(\s*["'`]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = callEnd(text, m.index);
    if (end === null) { unparsable++; continue; }
    const body = text.slice(m.index, end);
    const arrow = body.indexOf("=>");
    if (arrow < 0 || !/(^|[^\w.])(it|test)(\.\w+)*\(/.test(body.slice(arrow))) empty.push(body.split("\n")[0].trim().slice(0, 120));
  }
  return { empty, unparsable };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]));
}

describe("keine leeren describe-Bloecke in den Tests", () => {
  it("emptyDescribes erkennt einen leeren Block und laesst gefuellte, verschachtelte und it.each-Bloecke zu", () => {
    expect(emptyDescribes('describe("leer", () => {\n  const x = 1;\n});\n').empty).toEqual(['describe("leer", () => {']);
    expect(emptyDescribes('describe("voll", () => {\n  it("a", () => {});\n});\n').empty).toEqual([]);
    expect(emptyDescribes('describe("aussen", () => {\n  describe("innen", () => {\n    test.each([1])("x", () => {});\n  });\n});\n').empty).toEqual([]);
    expect(emptyDescribes('describe("aussen", () => {\n  describe("innen leer", () => {\n  });\n  it("a", () => {});\n});\n').empty).toEqual(['describe("innen leer", () => {']);
  });

  it("alle Testdateien (tests/**): kein describe ohne it/test", () => {
    const root = join(process.cwd(), "tests");
    const offenders: string[] = [];
    for (const f of walk(root).filter((x) => /\.(test|spec)\.ts$/.test(x))) {
      for (const title of emptyDescribes(readFileSync(f, "utf8")).empty) offenders.push(`${relative(root, f)}: ${title}`);
    }
    expect(offenders).toEqual([]);
  });
});
