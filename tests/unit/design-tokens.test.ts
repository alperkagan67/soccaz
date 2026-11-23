import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "@/lib/color";

// Vertrag 013 Version 3, AC-16/AC-18/AC-22/AC-23/AC-27 (Teil): der ENTWURF der Richtung F in DESIGN.md (Frontmatter) wird gemessen und auf Vollständigkeit geprüft, bevor M2c ihn in globals.css umsetzt.
// Die Stufengrenzen stehen NUR in src/lib/rating.ts; hier werden sie gespiegelt geprüft (Reihenfolge, Lückenlosigkeit, Abgleich mit rating.ts, sobald die Datei im Repo liegt).
const raw = readFileSync(path.join(process.cwd(), "DESIGN.md"), "utf8").replace(/\r\n/g, "\n");
const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
if (!m) throw new Error("DESIGN.md: Frontmatter fehlt");
const body = raw.slice(m[0].length);
/** Nur der Entwurf F (der Bestand E darunter nennt z. B. Seitenbreiten wie 1040 px). */
const fBody = body.slice(0, body.indexOf("## Bestand bis M2c"));

type Scalar = string | number;
/** Minimaler Leser für die flachen Abschnitte des Frontmatters (Abschnitt: Schlüssel: Wert); tiefere Ebenen (typography, components) werden übersprungen. */
function parseFront(text: string): Record<string, Record<string, Scalar>> {
  const out: Record<string, Record<string, Scalar>> = {};
  let section: string | null = null;
  for (const line of text.split("\n")) {
    const top = /^([a-z][\w-]*):\s*(.*)$/.exec(line);
    if (top) {
      if (top[2] === "") {
        section = top[1];
        out[section] = {};
      } else {
        section = null;
        out._top ??= {};
        out._top[top[1]] = top[2].replace(/^"|"$/g, "");
      }
      continue;
    }
    const sub = /^ {2}([a-z][\w-]*):\s*(.+)$/.exec(line);
    if (sub && section) {
      const v = sub[2].trim();
      out[section][sub[1]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v.replace(/^"|"$/g, "");
    }
  }
  return out;
}
const f = parseFront(m[1]);
const dark = f.colors as Record<string, string>;
const light = f["colors-light"] as Record<string, string>;
const tiers = f.tiers as Record<string, number>;
const glow = f.glow as Record<string, Scalar>;
const motion = f.motion as Record<string, Scalar>;

const HEX = /^#[0-9a-f]{6}$/i;
const TIER_NAMES = ["kreide", "rasen", "flutlicht", "pokal", "legende"];

describe("DESIGN.md Richtung F: Pflicht-Tokens", () => {
  it("der Entwurf ist als Entwurf gekennzeichnet und nennt M2c", () => {
    expect(f._top.status).toBe("entwurf");
    expect(String(f._top.description)).toContain("M2c");
    expect(String(f._top.description)).toContain("Spielerkarte");
  });

  it("Dunkel und Hell haben dieselben Farb-Tokens, alle als #rrggbb", () => {
    const pflicht = ["bg", "panel", "panel-2", "line", "ink", "muted", "rim", "accent", "accent-ink", "accent-fg", "focus", "ok", "warn", "danger", "info"];
    for (const k of pflicht) {
      expect(dark[k], `dunkel ${k}`).toMatch(HEX);
      expect(light[k], `hell ${k}`).toMatch(HEX);
    }
  });

  it("Stufenfarben und Schrift darauf sind vorhanden und verschieden", () => {
    for (const t of TIER_NAMES) expect(dark[`tier-${t}`], t).toMatch(HEX);
    expect(dark["tier-ink"]).toMatch(HEX);
    expect(new Set(TIER_NAMES.map((t) => dark[`tier-${t}`])).size).toBe(TIER_NAMES.length);
  });

  it("es gibt EINE Leuchtfarbe: der Glow zeigt auf accent, Hell hat keinen Glow", () => {
    expect(glow.color).toBe("accent");
    expect(dark[String(glow.color)]).toMatch(HEX);
    expect(glow.light).toBe("none");
    expect(Object.keys(light).filter((k) => /glow/.test(k))).toEqual([]);
    const low = Number(glow["alpha-low"]);
    const high = Number(glow["alpha-high"]);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(0.35); // Text auf Glow bleibt lesbar (AC-27)
  });
});

describe("DESIGN.md Richtung F: Kontrast (WCAG 2.x, AC-27 Teil)", () => {
  const texte: [string, string][] = [["ink", "bg"], ["ink", "panel"], ["ink", "panel-2"], ["muted", "bg"], ["muted", "panel"], ["muted", "panel-2"], ["accent-fg", "bg"], ["accent-fg", "panel"], ["accent-fg", "panel-2"], ["ok", "panel"], ["warn", "panel"], ["danger", "panel"], ["info", "panel"], ["ok", "panel-2"], ["warn", "panel-2"], ["danger", "panel-2"], ["info", "panel-2"]];
  const symbole: [string, string][] = [["rim", "panel"], ["rim", "panel-2"], ["focus", "bg"], ["focus", "panel"], ["focus", "panel-2"], ["accent", "panel"]];

  it("Dunkel: Text mindestens 4,5:1 auf den Flächen", () => {
    for (const [a, b] of texte) expect(contrast(dark[a], dark[b]), `${a} auf ${b}`).toBeGreaterThanOrEqual(4.5);
  });
  it("Dunkel: Zeichen, Rahmen und Fokusring mindestens 3:1", () => {
    for (const [a, b] of symbole) expect(contrast(dark[a], dark[b]), `${a} gegen ${b}`).toBeGreaterThanOrEqual(3);
  });
  it("Dunkel: Schrift auf der Leuchtfarbe und auf jeder Stufenfarbe mindestens 4,5:1; jede Stufenfarbe gegen die Fläche mindestens 3:1", () => {
    expect(contrast(dark["accent-ink"], dark.accent)).toBeGreaterThanOrEqual(4.5);
    for (const t of TIER_NAMES) {
      expect(contrast(dark["tier-ink"], dark[`tier-${t}`]), `Schrift auf ${t}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark[`tier-${t}`], dark.panel), `${t} gegen panel`).toBeGreaterThanOrEqual(3);
    }
  });

  it("Hell: Text mindestens 4,5:1 auf Grund und Flächen", () => {
    const hell: [string, string][] = [["ink", "bg"], ["ink", "panel"], ["ink", "panel-2"], ["muted", "bg"], ["muted", "panel"], ["muted", "panel-2"], ["accent-fg", "bg"], ["accent-fg", "panel"], ["accent-fg", "panel-2"], ["ok", "bg"], ["warn", "bg"], ["danger", "bg"], ["info", "bg"], ["ok", "panel"], ["warn", "panel"], ["danger", "panel"], ["info", "panel"]];
    for (const [a, b] of hell) expect(contrast(light[a], light[b]), `hell ${a} auf ${b}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["accent-ink"], light.accent)).toBeGreaterThanOrEqual(4.5);
  });
  it("Hell: Rahmen und Fokusring mindestens 3:1", () => {
    for (const [a, b] of [["rim", "panel"], ["rim", "panel-2"], ["focus", "bg"], ["focus", "panel"], ["focus", "panel-2"], ["accent", "panel"]] as [string, string][]) {
      expect(contrast(light[a], light[b]), `hell ${a} gegen ${b}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("DESIGN.md Richtung F: Stufen (Wertungsgrenzen aus src/lib/rating.ts)", () => {
  it("fünf Stufen in fester Reihenfolge, Start bei 0, streng aufsteigend, höchstens 99, ganzzahlig", () => {
    expect(Object.keys(tiers)).toEqual(TIER_NAMES);
    const from = Object.values(tiers);
    expect(from[0]).toBe(0);
    for (let i = 1; i < from.length; i++) expect(from[i]).toBeGreaterThan(from[i - 1]);
    expect(from.every((v) => Number.isInteger(v) && v >= 0 && v <= 99)).toBe(true);
  });

  it("die Tabelle im Text nennt dieselben Wertungsgrenzen wie der Frontmatter", () => {
    const rows = [...body.matchAll(/^\| (Kreide|Rasen|Flutlicht|Pokal|Legende) \| (\d+) \|/gm)].map((r) => [r[1].toLowerCase(), Number(r[2])]);
    expect(rows).toEqual(Object.entries(tiers));
  });

  it("Hinweis: die einzige Quelle ist rating.ts, der Text nennt keine Elo-Grenzen als Zahl", () => {
    expect(fBody).toContain("src/lib/rating.ts");
    expect(fBody).not.toMatch(/\b(1036|1040|1156|1160|1236|1240|1316|1320)\b/);
  });

  // Solange rating.ts nicht im Repo liegt (eigener PR), entfällt der Abgleich; danach läuft er und hält DESIGN.md und Code zusammen.
  it.runIf(existsSync(path.join(process.cwd(), "src/lib/rating.ts")))("die Grenzen entsprechen RATING_TIERS in src/lib/rating.ts", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/rating.ts"), "utf8");
    const code = [...src.matchAll(/\{\s*tier:\s*"(\w+)"\s*,\s*label:\s*"[^"]*"\s*,\s*from:\s*(\d+)\s*\}/g)].map((r) => [r[1], Number(r[2])]);
    expect(code).toEqual(Object.entries(tiers));
  });
});

describe("DESIGN.md Richtung F: Bewegung (AC-22, AC-23)", () => {
  it("Dauern sind Millisekunden-Zahlen, aufsteigend; Reduced Motion unter 150 ms", () => {
    const d = ["dur-fast", "dur-base", "dur-reveal"].map((k) => Number(motion[k]));
    expect(d.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    expect(d[0]).toBeLessThanOrEqual(d[1]);
    expect(d[1]).toBeLessThanOrEqual(d[2]);
    expect(Number(motion["dur-reduced"])).toBeLessThan(150);
  });
  it("eine Easing-Kurve als cubic-bezier", () => {
    expect(String(motion["ease-out"])).toMatch(/^cubic-bezier\(-?[\d.]+, -?[\d.]+, -?[\d.]+, -?[\d.]+\)$/);
  });
  it("der Text legt fest: nur transform und opacity, will-change nur während der Animation, keine Bibliothek ohne ADR 0003", () => {
    expect(body).toMatch(/Animiert werden nur `transform` und `opacity`/);
    expect(body).toContain("`will-change` nur während der Animation");
    expect(body).toContain("ADR 0003");
  });
});

describe("DESIGN.md Richtung F: Eigenständigkeit und Lizenz (AC-29)", () => {
  it("Schriften mit Lizenznachweis (SIL OFL 1.1)", () => {
    expect(body).toContain("SIL Open Font License 1.1");
  });
  it("keine Namen der Vorbilder in DESIGN.md", () => {
    expect(raw).not.toMatch(/\b(EA FC|FIFA|FUT|Ultimate Team|Vero)\b/);
  });
});
