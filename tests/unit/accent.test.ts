import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, THEMES } from "@/lib/color";

// AC-14 (Vertrag 007): Orange ist die einzige Akzentfarbe, die alten Neon-Tokens sind aus der Oberfläche entfernt.
const ROOT = path.resolve(import.meta.dirname, "../../src");
const OLD = "green|green-dark|green-soft|lime|cyan|sky|violet|pink|coral|yellow|red";
const OLD_CLASS = new RegExp(`\b(?:text|bg|border|ring|outline|accent|from|via|to|fill|stroke|decoration|shadow|divide|placeholder)-(?:${OLD})(?![\w-])`);
const OLD_VAR = new RegExp(`var\(--(?:${OLD})\)`);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

describe("Orange als einzige Akzentfarbe (AC-14)", () => {
  // src/server ist nicht Teil der Oberfläche (OG-Bilder und Karten folgen später).
  const ui = files(ROOT).filter((f) => !f.includes(`${path.sep}server${path.sep}`));

  it("kein Stil nutzt die alten Farbtokens", () => {
    const hits: string[] = [];
    for (const f of ui) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (OLD_CLASS.test(line) || OLD_VAR.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("globals.css definiert genau einen Akzent und keine alten Neon-Variablen", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    for (const name of OLD.split("|")) expect(css, `--${name}`).not.toMatch(new RegExp(`--${name}\s*:`));
    expect(css).toContain("--accent: #ff6a1f");
    expect(css).toContain("--accent: #c2410c");
    expect(css).toContain("color-scheme: light dark");
    expect(css).toContain("prefers-color-scheme: light");
  });

  it("die Werte in globals.css stimmen mit den gemessenen Tokens überein", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    for (const theme of ["dark", "light"] as const) {
      const t = THEMES[theme];
      for (const v of [t.bg, t.fl, t.fl2, t.ink, t.muted, t.rim, t.line, t.o, t.oi]) expect(css.toLowerCase(), `${theme} ${v}`).toContain(v);
    }
  });

  it("Orange als Schrift (accent-fg) hat auf Grund und Fläche mindestens 4,5:1, auf dem Feldgrund 3:1", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    const light = /--accent-fg:\s*(#[0-9a-f]{6})/gi;
    const values = [...css.matchAll(light)].map((m) => m[1].toLowerCase());
    expect(values).toContain("#b23a0a");
    for (const [theme, fg] of [["dark", THEMES.dark.o], ["light", "#b23a0a"]] as const) {
      const t = THEMES[theme];
      for (const ground of [t.bg, t.fl]) expect(contrast(fg, ground), `${theme} ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, t.fl2), `${theme} Feldgrund`).toBeGreaterThanOrEqual(3); // Feldgrund trägt keinen Fließtext
    }
  });
});
