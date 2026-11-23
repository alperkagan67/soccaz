// Kontrastmessung AC-27 (Vertrag 013 v3): REINER Rechenkern des Messprotokolls. Der Browserteil (Playwright, folgt in PR 2) sammelt nur Rohdaten aus dem gerenderten Zustand
// (getComputedStyle, Pixel); gerechnet, bewertet und ausgegeben wird hier, damit alles ohne Browser testbar ist (tests/unit/contrast-audit.test.ts).
// Grenzen (WCAG 2.2): normaler Text 4,5:1; großer Text (>= 24 px oder >= 18,66 px und Gewicht >= 700) 3:1; Zeichen (Rand/Symbol von Bedienelementen) und Fokusring 3:1.
import { contrast } from "./color";

/** `report` meldet nur (Protokoll im Job-Log, Test grün); `enforce` lässt den Test bei einer Unterschreitung oder einem unlesbaren Punkt fehlschlagen. Seit dem main-Lauf zu 23b67ab (0 Verstöße bei 390 und 1280 px, nach M2c) gilt `enforce`. Der Umschalter ist diese eine Konstante. */
export type AuditMode = "report" | "enforce";
export const AUDIT_MODE: AuditMode = "enforce";

export const LIMITS = { text: 4.5, largeText: 3, nonText: 3, focus: 3 } as const;
export type MeasureKind = "text" | "non-text" | "focus";

/** Farbe mit Kanälen 0 bis 255 und Deckkraft 0 bis 1. */
export type Rgba = { r: number; g: number; b: number; a: number };
export type Rgb = { r: number; g: number; b: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Liest die Farbschreibweisen, die `getComputedStyle` liefert: `rgb(r, g, b)`, `rgba(r, g, b, a)`, `rgb(r g b / a)` (auch mit Prozent), `color(srgb r g b / a)` (Werte 0 bis 1), `#rgb`, `#rrggbb`, `#rrggbbaa`
 * und `transparent`. Alles andere (zum Beispiel `oklch(...)`, `currentcolor`, Unsinn): null (der Aufrufer meldet es, es wird nichts erfunden).
 */
export function parseCssColor(input: string): Rgba | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^(rgba?|color)\(\s*(?:srgb\s+)?([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const isColor = fn[1] === "color";
  if (isColor && !/^color\(\s*srgb\s/.test(s)) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const value = (p: string, scale: number): number | null => {
    const pct = /^(-?[\d.]+)%$/.exec(p);
    if (pct) return (Number(pct[1]) / 100) * scale;
    const n = Number(p);
    return Number.isFinite(n) ? n : null;
  };
  const scale = isColor ? 1 : 255;
  const ch = parts.slice(0, 3).map((p) => value(p, scale));
  if (ch.some((c) => c === null)) return null;
  const alpha = parts[3] === undefined ? 1 : value(parts[3], 1);
  if (alpha === null) return null;
  const mul = isColor ? 255 : 1;
  return { r: clamp((ch[0] as number) * mul, 0, 255), g: clamp((ch[1] as number) * mul, 0, 255), b: clamp((ch[2] as number) * mul, 0, 255), a: clamp(alpha, 0, 1) };
}

/** Legt `top` (mit Deckkraft) über einen deckenden Grund. */
export function compositeOver(top: Rgba, base: Rgb): Rgb {
  return {
    r: top.r * top.a + base.r * (1 - top.a),
    g: top.g * top.a + base.g * (1 - top.a),
    b: top.b * top.a + base.b * (1 - top.a),
  };
}

/** Stapel von Hintergründen (unten zuerst, wie die Vorfahren von außen nach innen) über dem Grund der Seite; Ergebnis ist deckend. */
export function flattenLayers(layers: readonly Rgba[], base: Rgb = { r: 255, g: 255, b: 255 }): Rgb {
  return layers.reduce<Rgb>((acc, layer) => compositeOver(layer, acc), base);
}

const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
export const toHex = (c: Rgb): string => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

/** Kontrastverhältnis (1 bis 21) zweier deckender Farben; rechnet wie `src/lib/color.ts` (8-Bit-gerundet), damit Tests und Protokoll dieselben Zahlen liefern. */
export function ratio(a: Rgb, b: Rgb): number {
  return contrast(toHex(a), toHex(b));
}

/** Großer Text nach WCAG: mindestens 24 px, oder mindestens 18,66 px (14 pt) bei Gewicht 700 oder mehr. */
export function isLargeText(sizePx: number, weight: number): boolean {
  return sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
}

export function limitFor(kind: MeasureKind, sizePx = 16, weight = 400): number {
  if (kind === "focus") return LIMITS.focus;
  if (kind === "non-text") return LIMITS.nonText;
  return isLargeText(sizePx, weight) ? LIMITS.largeText : LIMITS.text;
}

/** p-Perzentil (0 bis 100) mit linearer Interpolation; leere Liste: NaN. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = Float64Array.from(values).sort(); // Kopie, numerisch sortiert (kein Spread in Funktionsaufrufe: bei sehr vielen Werten wirft Math.min(...x) einen RangeError)
  const pos = (clamp(p, 0, 100) / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Rohmessung aus dem Browser. `bg` ist entweder ein deckender Grund aus dem Hintergrundstapel oder Pixel (flach r,g,b,r,g,b ...) hinter dem Text. */
export type RawMeasurement = {
  page: string; // Seitenkennung aus der Seitenliste
  role: string; // gast, spieler, captain, betreiber, admin1, admin2
  scheme: "light" | "dark";
  viewport: number; // 390 oder 1280
  kind: MeasureKind;
  selector: string;
  sample: string; // Textauszug (gekürzt) oder Beschreibung
  fontSizePx?: number;
  fontWeight?: number;
  fg: string; // CSS-Farbe wie von getComputedStyle (mit Alpha)
  bg: { method: "stack"; layers: string[]; base?: string } | { method: "pixel"; pixels: number[] };
  disabled?: boolean;
};

export type Evaluated = {
  raw: RawMeasurement;
  limit: number;
  ratio: number; // bewertet: Stapel = ein Wert, Pixel = 5. Perzentil der Verhältnisse
  worst: number; // kleinstes Verhältnis (bei Stapel gleich ratio)
  fgHex: string;
  bgHex: string; // Stapel: Grund; Pixel: Median der Pixel (Anzeige)
  method: "stack" | "pixel";
  status: "ok" | "fail" | "ausgenommen" | "unlesbar";
  note?: string;
};

/** Kleinster Wert einer (beliebig langen) Liste; Schleife statt Math.min(...liste), das ab etwa 130.000 Werten einen RangeError wirft (Hero-Fläche 1280 x 400 = 512.000 Pixel). */
function minOf(values: readonly number[]): number {
  let m = Number.POSITIVE_INFINITY;
  for (const v of values) if (v < m) m = v;
  return m;
}

/** Verhältnis des Vordergrunds gegen jedes Pixel (der Vordergrund wird zuerst über das Pixel gelegt, falls er Deckkraft < 1 hat). */
function pixelRatios(fg: Rgba, pixels: readonly number[]): { ratios: number[]; medianBg: Rgb } {
  const ratios: number[] = [];
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const px: Rgb = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    rs.push(px.r);
    gs.push(px.g);
    bs.push(px.b);
    ratios.push(ratio(compositeOver(fg, px), px));
  }
  const med = (v: number[]) => percentile(v, 50);
  return { ratios, medianBg: { r: med(rs), g: med(gs), b: med(bs) } };
}

/** Bewertet EINE Rohmessung. Unlesbare Farben und leere Pixellisten werden als "unlesbar" gemeldet (nie stillschweigend bestanden). */
export function evaluate(m: RawMeasurement): Evaluated {
  const limit = limitFor(m.kind, m.fontSizePx, m.fontWeight);
  const fg = parseCssColor(m.fg);
  const base = (hexLike: string | undefined): Rgb | null => {
    if (!hexLike) return { r: 255, g: 255, b: 255 };
    const c = parseCssColor(hexLike);
    return c ? { r: c.r, g: c.g, b: c.b } : null;
  };
  const fail = (note: string): Evaluated => ({ raw: m, limit, ratio: Number.NaN, worst: Number.NaN, fgHex: "?", bgHex: "?", method: m.bg.method, status: "unlesbar", note });
  if (!fg) return fail(`Vordergrundfarbe nicht lesbar: ${m.fg}`);
  if (m.disabled) {
    return { raw: m, limit, ratio: Number.NaN, worst: Number.NaN, fgHex: toHex(fg), bgHex: "-", method: m.bg.method, status: "ausgenommen", note: "deaktiviertes Bedienelement (WCAG 1.4.3 nimmt es aus)" };
  }
  if (m.bg.method === "stack") {
    const b = base(m.bg.base);
    if (!b) return fail(`Grundfarbe nicht lesbar: ${m.bg.base}`);
    const layers: Rgba[] = [];
    for (const l of m.bg.layers) {
      const c = parseCssColor(l);
      if (!c) return fail(`Hintergrundschicht nicht lesbar: ${l}`);
      layers.push(c);
    }
    const bg = flattenLayers(layers, b);
    const r = ratio(compositeOver(fg, bg), bg);
    return { raw: m, limit, ratio: r, worst: r, fgHex: toHex(compositeOver(fg, bg)), bgHex: toHex(bg), method: "stack", status: r >= limit ? "ok" : "fail" };
  }
  if (m.bg.pixels.length < 3) return fail("keine Pixel gelesen");
  const { ratios, medianBg } = pixelRatios(fg, m.bg.pixels);
  const p5 = percentile(ratios, 5);
  return { raw: m, limit, ratio: p5, worst: minOf(ratios), fgHex: toHex(compositeOver(fg, medianBg)), bgHex: toHex(medianBg), method: "pixel", status: p5 >= limit ? "ok" : "fail", note: "Pixel: bewertet wird das 5. Perzentil" };
}

export type Group = { key: string; count: number; example: Evaluated; worst: number };

/** Fasst gleiche Kombinationen (Seite, Rolle, Modus, Viewport, Art, Vordergrund, Hintergrund, Grenze, Ergebnis) zusammen, damit das Protokoll lesbar bleibt; das schlechteste Verhältnis bleibt sichtbar. */
export function groupEvaluations(list: readonly Evaluated[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of list) {
    const r = e.raw;
    const key = [r.page, r.role, r.scheme, r.viewport, r.kind, e.fgHex, e.bgHex, e.limit, e.status, e.method].join("|");
    const g = map.get(key);
    if (g) {
      g.count += 1;
      if (e.worst < g.worst) g.worst = e.worst;
    } else map.set(key, { key, count: 1, example: e, worst: e.worst });
  }
  return [...map.values()];
}

export type Summary = { total: number; ok: number; fail: number; ausgenommen: number; unlesbar: number };
export function summarize(list: readonly Evaluated[]): Summary {
  const s: Summary = { total: list.length, ok: 0, fail: 0, ausgenommen: 0, unlesbar: 0 };
  for (const e of list) s[e.status] += 1;
  return s;
}

/** Besteht der Lauf? Im Modus "report" immer (Verstöße stehen im Protokoll), im Modus "enforce" nur ohne Verstoß und ohne unlesbare Messpunkte. */
export function auditPasses(list: readonly Evaluated[], mode: AuditMode = AUDIT_MODE): boolean {
  if (mode === "report") return true;
  const s = summarize(list);
  return s.fail === 0 && s.unlesbar === 0;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "-");
const cell = (t: string) => t.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

export type ProtocolMeta = { commit: string; date: string; mode: AuditMode };

/** Messprotokoll als Markdown (Job-Log und Anhang). Verstöße stehen zuerst, danach alles, zusammengefasst. */
export function renderProtocol(list: readonly Evaluated[], meta: ProtocolMeta): string {
  const s = summarize(list);
  const groups = groupEvaluations(list);
  const bad = groups.filter((g) => g.example.status === "fail" || g.example.status === "unlesbar");
  const line = (g: Group) => {
    const e = g.example;
    const r = e.raw;
    return `| ${cell(r.page)} | ${cell(r.role)} | ${r.scheme === "dark" ? "dunkel" : "hell"} | ${r.viewport} | ${r.kind} | ${cell(r.selector)} (${cell(r.sample).slice(0, 40)}) | ${e.fgHex} | ${e.bgHex} (${e.method}) | ${fmt(e.ratio)}${g.count > 1 ? ` (min ${fmt(g.worst)})` : ""} | ${fmt(e.limit)} | ${e.status}${e.note ? `: ${cell(e.note)}` : ""} | ${g.count} |`;
  };
  const head = "| Seite | Rolle | Modus | Breite | Art | Element | Vordergrund | Hintergrund | Verhältnis | Grenze | Ergebnis | Anzahl |\n|---|---|---|---|---|---|---|---|---|---|---|---|";
  const out: string[] = [
    "# Kontrast-Messprotokoll (AC-27)",
    "",
    `Commit ${meta.commit}, ${meta.date}, Modus **${meta.mode === "enforce" ? "verbindlich" : "Baseline (nur melden)"}**. Grenzen (WCAG 2.2): Text ${fmt(LIMITS.text)}:1, großer Text ${fmt(LIMITS.largeText)}:1, Zeichen und Fokusring ${fmt(LIMITS.nonText)}:1. Gemessen wird der gerenderte Zustand; bei Verlauf, Glow oder Bild gilt das 5. Perzentil der Pixel hinter dem Text.`,
    "",
    `**Ergebnis:** ${s.total} Messpunkte, ${s.ok} bestanden, ${s.fail} durchgefallen, ${s.unlesbar} unlesbar, ${s.ausgenommen} ausgenommen (deaktiviert).`,
    "",
  ];
  if (bad.length > 0) out.push("## Verstöße", "", head, ...bad.map(line), "");
  out.push("## Alle Messpunkte (zusammengefasst)", "", head, ...groups.map(line), "");
  return out.join("\n");
}

// ---- Messflächen (R-T348): Rechtecke des Textes, auf sichtbare Bereiche zugeschnitten, und das Pixelbudget je Messpunkt. Reine Funktionen (Rechnung in Node, der Browser sammelt nur).
export type Rect = { x: number; y: number; w: number; h: number };

/** Schnitt zweier Rechtecke; null, wenn sie sich nicht überlappen. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

/**
 * Schneidet Textrechtecke mit den Clip-Rechtecken der Vorfahren (overflow ungleich visible: `truncate`, `text-overflow: ellipsis`, `line-clamp`, Scrollbereiche): der abgeschnittene Teil des Textes
 * wird nie gezeichnet, die Pixel dort gehören dem Nachbarn (Chip, Rand). Reste kleiner als `minPx` in Breite oder Höhe werden verworfen (auch 1-px-Elemente wie sr-only).
 */
export function clipRects(rects: readonly Rect[], clips: readonly Rect[], minPx = 2): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    let cur: Rect | null = r;
    for (const c of clips) {
      cur = cur ? intersectRect(cur, c) : null;
      if (!cur) break;
    }
    if (cur && cur.w >= minPx && cur.h >= minPx) out.push(cur);
  }
  return out;
}

/**
 * Pixelbudget je Messpunkt: höchstens `max` Pixel insgesamt. Bei vielen Zeilen (mehr als max / minPerRect) werden gleichmäßig verteilte Zeilen ausgewählt (erste und letzte immer dabei),
 * sonst alle; jede ausgewählte Zeile bekommt gleich viele Pixel, mindestens `minPerRect`, und die Summe überschreitet `max` nie.
 */
export function planSamples(rects: readonly Rect[], max: number, minPerRect = 20): { rects: Rect[]; perRect: number } {
  if (rects.length === 0 || max < minPerRect) return { rects: [], perRect: 0 };
  const limit = Math.max(1, Math.floor(max / minPerRect));
  let chosen: Rect[] = [...rects];
  if (rects.length > limit) {
    chosen = [];
    for (let i = 0; i < limit; i++) chosen.push(rects[limit === 1 ? 0 : Math.round((i * (rects.length - 1)) / (limit - 1))]);
  }
  return { rects: chosen, perRect: Math.max(minPerRect, Math.floor(max / chosen.length)) };
}

/** Frühwarnung vor einem Flake: bestandene Messpunkte, deren Verhältnis nur knapp über der Grenze liegt (kleiner als Grenze x `factor`). Kein Fehler, nur Hinweis im Protokoll. */
export function nearLimit(list: readonly Evaluated[], factor = 1.05): Evaluated[] {
  return list.filter((e) => e.status === "ok" && Number.isFinite(e.ratio) && Number.isFinite(e.limit) && e.ratio < e.limit * factor);
}

/** Schutz gegen stilles Schrumpfen der Abdeckung (fail-open): erwartete Seite x Schema ohne jeden Messpunkt. Eine Seite, die nicht mehr lädt, steht sonst nur als Warnung unter den Messfehlern. */
export function missingCoverage(list: readonly Evaluated[], expected: readonly { page: string; scheme: string }[]): { page: string; scheme: string }[] {
  const seen = new Set(list.map((e) => `${e.raw.page}|${e.raw.scheme}`));
  return expected.filter((x) => !seen.has(`${x.page}|${x.scheme}`));
}
