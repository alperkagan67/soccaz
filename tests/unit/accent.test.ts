import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, THEMES } from "@/lib/color";

// AC-14 (Vertrag 007): Orange ist die einzige Akzentfarbe, die alten Neon-Tokens sind aus der Oberfläche entfernt.
// Ausnahmen (DESIGN.md, Abschnitt "Ausnahmen von AC-14"): --accent-fg, --pc-* (Profilfarben), --card-yellow/--card-red, Status-Töne --ok/--warn/--danger/--info (M2-1, Zustand mit Symbol und Wort).
// src/server (OG-Bilder, Karten) ist vom Test ausgenommen und steht im Backlog.
const ROOT = path.resolve(import.meta.dirname, "../../src");
const OLD = ["green", "green-dark", "green-soft", "lime", "cyan", "sky", "violet", "pink", "coral", "yellow", "red"];
const ALT = OLD.join("|");
// String.raw: Rückstriche (\b, \w, \() bleiben für RegExp erhalten.
const OLD_CLASS = new RegExp(String.raw`\b(?:text|bg|border|ring|outline|accent|from|via|to|fill|stroke|decoration|shadow|divide|placeholder)-(?:${ALT})(?![\w-])`);
const OLD_VAR = new RegExp(String.raw`var\(--(?:${ALT})\)`);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** Inhalt des ersten Blocks `selector { ... }` ab `from` (ohne verschachtelte Klammern). */
function block(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`Block fehlt: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}
function vars(b: string): Record<string, string> {
  return Object.fromEntries([...b.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s*\/\*.*$/, "")]));
}

describe("Orange als einzige Akzentfarbe (AC-14)", () => {
  const ui = files(ROOT).filter((f) => !f.includes(`${path.sep}server${path.sep}`));

  it("die Prüf-Regexe erkennen alte Tokens (Selbsttest)", () => {
    expect(OLD_CLASS.test('<p className="text-green">')).toBe(true);
    expect(OLD_CLASS.test('className="border-yellow/60 bg-red"')).toBe(true);
    expect(OLD_CLASS.test('className="text-accent-fg bg-accent-soft text-ink"')).toBe(false);
    expect(OLD_CLASS.test('className="text-greenish"')).toBe(false);
    expect(OLD_VAR.test("stroke: var(--green)")).toBe(true);
    expect(OLD_VAR.test("stroke: var(--accent-fg)")).toBe(false);
    expect(OLD_VAR.test("css: var(--pc-green)")).toBe(false);
  });

  it("kein Stil nutzt die alten Farbtokens", () => {
    const hits: string[] = [];
    for (const f of ui) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (OLD_CLASS.test(line) || OLD_VAR.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("globals.css definiert keine alten Neon-Variablen", () => {
    for (const name of OLD) expect(css, `--${name}`).not.toMatch(new RegExp(String.raw`--${name}\s*:`));
  });

  const light = block("@media (prefers-color-scheme: light)");
  const blocks = { dark: vars(block(":root {")), light: vars(light), forceDark: vars(block(".force-dark")) };

  it("Werte pro Block stimmen mit den gemessenen Tokens überein (dunkel, hell, .force-dark)", () => {
    const keys = ["bg", "panel", "panel-2", "line", "ink", "muted", "rim", "accent", "accent-ink"] as const;
    const map = { bg: "bg", panel: "fl", "panel-2": "fl2", line: "line", ink: "ink", muted: "muted", rim: "rim", accent: "o", "accent-ink": "oi" } as const;
    for (const [name, theme] of [["dark", THEMES.dark], ["light", THEMES.light], ["forceDark", THEMES.dark]] as const) {
      for (const k of keys) expect(blocks[name][k]?.toLowerCase(), `${name} --${k}`).toBe(theme[map[k]]);
    }
    expect(blocks.dark["accent-fg"]).toBe(THEMES.dark.o);
    expect(blocks.light["accent-fg"]).toBe("#b23a0a");
    expect(blocks.forceDark["accent-fg"]).toBe(THEMES.dark.o);
    expect(css).toContain("color-scheme: light dark");
  });

  it("Orange als Schrift (accent-fg) hat auf Grund und Fläche mindestens 4,5:1, auf dem Feldgrund 3:1", () => {
    for (const [theme, t] of [["dark", THEMES.dark], ["light", THEMES.light]] as const) {
      const fg = blocks[theme]["accent-fg"];
      for (const ground of [t.bg, t.fl]) expect(contrast(fg, ground), `${theme} ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, t.fl2), `${theme} Feldgrund`).toBeGreaterThanOrEqual(3); // Feldgrund trägt keinen Fließtext
    }
  });
});
