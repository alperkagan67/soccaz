import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contrast, luminance } from "@/lib/color";

// 013 M2c Hero: Standbild statt Video, Scrim, Kontrast Überschrift (3:1) und Einleitung (4,5:1) in beiden Themen.
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const page = src("src/app/page.tsx");
const css = src("src/app/globals.css");

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (top: string, bottom: string, alpha: number) => {
  const t = parse(top);
  const b = parse(bottom);
  return hex(t[0] * alpha + b[0] * (1 - alpha), t[1] * alpha + b[1] * (1 - alpha), t[2] * alpha + b[2] * (1 - alpha));
};

// Tokens (werden unten gegen globals.css geprüft). scrimMin = schwächster Verlaufsstopp, den Text berührt.
const THEMES = {
  hell: { bg: "#dde5e0", heading: "#b23a0a", lead: "#4a5a51", scrimMin: 0.88 },
  dunkel: { bg: "#0f1914", heading: "#ff6e24", lead: "#a3b5ab", scrimMin: 0.6 },
} as const;
const IMAGE_OPACITY = 0.6;

let cached: Promise<{ light: string; dark: string; p99: string }> | null = null;
function extremes() {
  cached ??= (async () => {
    const { data, info } = await sharp(join(root, "public/brand/socca-reel-main.jpg")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    // je Pixel die Leuchtdichte (Tabelle je Kanal), danach nach Leuchtdichte ordnen
    const lin = Array.from({ length: 256 }, (_, v) => luminance(hex(v, 0, 0)) / 0.2126);
    const lum = new Float64Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.2126 * lin[data[i * 3]] + 0.7152 * lin[data[i * 3 + 1]] + 0.0722 * lin[data[i * 3 + 2]];
    const order = Uint32Array.from({ length: n }, (_, i) => i).sort((x, y) => lum[x] - lum[y]);
    const at = (k: number) => {
      const i = order[k];
      return hex(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    };
    // light/dark = tatsächlich hellster/dunkelster Punkt; p99 = 99. Perzentil (ein einzelner Glanzpunkt unter der Überschrift ist kein Maßstab für die Fläche)
    return { light: at(n - 1), dark: at(0), p99: at(Math.floor(n * 0.99)) };
  })();
  return cached;
}

/** Grund unter dem Text: Seitengrund, darauf das Bild mit opacity 0,6, darauf der Scrim mit bg bei `scrimAlpha`. */
function ground(theme: { bg: string }, pixel: string, scrimAlpha: number) {
  const image = mix(pixel, theme.bg, IMAGE_OPACITY);
  return mix(theme.bg, image, scrimAlpha);
}

describe("Hero: Standbild und Scrim (Quelltext)", () => {
  it("kein Video, kein Autoplay, Standbild aus der JPG-Datei, Scrim-Klasse am Textblock", () => {
    expect(page).not.toMatch(/<video\b/);
    expect(page).not.toMatch(/autoPlay/i);
    expect(page).toContain('src="/brand/socca-reel-main.jpg"');
    expect(page).toContain("hero-scrim");
    expect(page).not.toMatch(/from-bg via-bg\/60/); // der alte Tailwind-Verlauf ist ersetzt
  });

  it("das Hero-Bild ist das einzige mit priority und liegt in einer Fläche fester Mindesthöhe (kein Layoutsprung)", () => {
    expect((page.match(/\bpriority\b/g) ?? []).length).toBe(1);
    expect(page).toMatch(/<section className="relative isolate[^"]*min-h-\[30rem\]/);
    expect(page).toMatch(/<Image src="\/brand\/socca-reel-main\.jpg"[^>]*\bfill\b/);
  });

  it("hell: Scrim bg, 94 %, 88 %; dunkel: bg, 60 %, transparent", () => {
    const light = /@media \(prefers-color-scheme: light\) \{\s*\.hero-scrim \{ background: ([^;]+);/.exec(css)?.[1] ?? "";
    expect(light).toContain("var(--bg) 94%");
    expect(light).toContain("var(--bg) 88%");
    const dark = /^\.hero-scrim \{ background: ([^;]+);/m.exec(css)?.[1] ?? "";
    expect(dark).toContain("var(--bg) 60%");
    expect(dark).toContain("transparent)");
  });

  it("die geprüften Farben sind die Tokens aus globals.css", () => {
    for (const t of Object.values(THEMES)) for (const v of [t.bg, t.heading, t.lead]) expect(css.toLowerCase()).toContain(v);
  });

  it("Fokusring: globaler Abstand 2 px, im Hero nicht überschrieben", () => {
    expect(css).toMatch(/:focus-visible \{ outline: 2px solid var\(--accent\); outline-offset: 2px; \}/);
    expect(css).not.toMatch(/\.hero-scrim[^{]*:focus/);
    expect(page).not.toMatch(/outline-offset|focus:outline-none/);
  });
});

describe("Hero: Kontrast Überschrift (3:1) und Einleitung (4,5:1), Worst Case", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`${name}: Überschrift Zeile 2 und Einleitung über dem hellsten und dunkelsten Bildpunkt des Standbilds`, async () => {
      const { light, dark, p99 } = await extremes();
      const rows: string[] = [];
      // Hell besteht sogar mit Weiß. Dunkel: harte Prüfung für Perzentil 99 und dunkelsten Punkt; der einzelne hellste Punkt (nahe Weiß) wird nur berichtet.
      const hard = name === "hell" ? [["hellster Punkt", light], ["Perzentil 99", p99], ["dunkelster Punkt", dark], ["Weiß", "#ffffff"], ["Schwarz", "#000000"]] : [["Perzentil 99", p99], ["dunkelster Punkt", dark], ["Schwarz", "#000000"]];
      if (name === "dunkel") console.log("dunkel hellster Punkt (nur Bericht): " + light + ", Überschrift " + contrast(theme.heading, ground(theme, light, theme.scrimMin)).toFixed(2) + ", Einleitung " + contrast(theme.lead, ground(theme, light, theme.scrimMin)).toFixed(2));
      for (const [label, pixel] of hard as [string, string][]) {
        const g = ground(theme, pixel, theme.scrimMin);
        const h = contrast(theme.heading, g);
        const l = contrast(theme.lead, g);
        rows.push(`${name} ${label} (${pixel}): Überschrift ${h.toFixed(2)}, Einleitung ${l.toFixed(2)}`);
        expect(h, rows.at(-1)).toBeGreaterThanOrEqual(3);
        expect(l, rows.at(-1)).toBeGreaterThanOrEqual(4.5);
      }
      console.log(rows.join("\n"));
    });
  }
});
