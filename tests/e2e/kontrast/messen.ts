import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { clipRects, evaluate, planSamples, type Evaluated, type RawMeasurement, type Rect } from "../../../src/lib/contrast-audit";

// AC-27 (Vertrag 013 v3): Browserschicht der Kontrastmessung. Sie sammelt NUR Rohdaten aus dem gerenderten Zustand (getComputedStyle, Pixel); gerechnet und bewertet wird im
// reinen Kern src/lib/contrast-audit.ts. Regeln aus Review R-T343 (B bis E):
//  B) Der Hintergrundstapel hat IMMER eine Grundfarbe (die Systemfarbe `Canvas` der Seite, nicht Weiß geraten).
//  C) CSS-`opacity` (Element und alle Vorfahren) wird in die Deckkraft von Vordergrund und Hintergrundschichten eingerechnet.
//  D) Farben, die getComputedStyle nicht als rgb liefert (oklch, oklab, color-mix, lab), werden über ein 1x1-Canvas nach sRGB umgerechnet.
//  E) Bei Verlauf, Bild oder überlappenden Elementen hinter dem Text wird gemessen, was wirklich gezeichnet wird (Pixel, ohne den Text); je Messpunkt höchstens MAX_PIXELS Pixel.
// Lokal wurde nichts gelaufen (nur CI); Fehler bei einem Messpunkt oder einer Seite werden als Messfehler gemeldet, sie brechen den Lauf nicht ab.

export const MAX_PIXELS = 2500;

export type PageMeta = { page: string; role: string; scheme: "light" | "dark"; viewport: number };

type Item = {
  kind: RawMeasurement["kind"];
  selector: string;
  sample: string;
  fontSizePx: number;
  fontWeight: number;
  fg: string;
  layers: string[];
  base: string;
  needPixel: boolean;
  /** Das Element liegt in einem Vorfahren mit position fixed oder sticky (Kopfzeile, untere Leiste): sein Grund ist die Leiste selbst und wird mit ihr gemessen. */
  inFixed?: boolean;
  /** Bei Text: die Zeilenrechtecke des TEXTES (Range über die Textknoten), nie das Rechteck des ganzen Elements; sonst das Elementrechteck. */
  rects: Rect[];
  /** Clip-Rechtecke (Innenfläche) der Vorfahren mit overflow ungleich visible: der Text wird in Node darauf zugeschnitten (truncate, ellipsis, line-clamp, Scrollbereiche). */
  clips: Rect[];
  disabled: boolean;
  note?: string;
};

/** Läuft IM Browser. Gibt rohe Messpunkte zurück (Text, Zeichen, Fokus). */
function collectInPage(maxFocus: number): { items: Item[]; errors: string[] } {
  const errors: string[] = [];
  // ---- D) Farbumrechnung über ein 1x1-Canvas
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map<string, string | null>();
  function toRgba(css: string): string | null {
    if (cache.has(css)) return cache.get(css) ?? null;
    let out: string | null = null;
    if (/^rgba?\(/.test(css)) out = css; // schon sRGB: exakt übernehmen
    else if (g) {
      g.fillStyle = "#010203";
      g.fillStyle = css;
      const a = g.fillStyle;
      g.fillStyle = "#fdfcfb";
      g.fillStyle = css;
      const b = g.fillStyle;
      if (a === b) {
        g.globalCompositeOperation = "copy";
        g.fillStyle = css;
        g.fillRect(0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        out = `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${Math.round((d[3] / 255) * 1000) / 1000})`;
      }
    }
    cache.set(css, out);
    return out;
  }
  const alphaOf = (rgba: string): number => {
    const m = /rgba?\(([^)]*)\)/.exec(rgba);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return 1;
    const v = parts[3].endsWith("%") ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
    return Number.isFinite(v) ? v : 1;
  };
  const withAlpha = (rgba: string, factor: number): string => {
    const m = /rgba?\(([^)]*)\)/.exec(rgba);
    if (!m) return rgba;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const a = alphaOf(rgba) * factor;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.round(a * 1000) / 1000})`;
  };
  // ---- B) Grundfarbe der Seite (Systemfarbe Canvas im aktuellen Farbschema)
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-99px;top:-99px;width:1px;height:1px;background-color:Canvas";
  document.body.appendChild(probe);
  const base = toRgba(getComputedStyle(probe).backgroundColor) ?? "";
  probe.remove();
  // ---- C) wirksame Deckkraft: Produkt der opacity von Element und Vorfahren
  const effOpacity = (el: Element | null): number => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return Number.isFinite(o) ? o : 1;
  };
  const describe = (el: Element): string => {
    const id = el.id ? `#${el.id}` : "";
    const tid = el.getAttribute("data-testid");
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${id}${tid ? `[${tid}]` : ""}${cls ? `.${cls}` : ""}`.slice(0, 80);
  };
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false; // sr-only und leere Boxen
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || cs.display === "none") return false;
    if (typeof (el as HTMLElement).checkVisibility === "function" && !(el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return true;
  };
  const pageRect = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  };
  /** Rechtecke des Textes selbst (eigene Textknoten des Elements), je Zeile eines: nur dort liegen Glyphen (R-T345/Auswertung AC-27: das Elementrechteck zog fremde Flächen ins Perzentil). */
  const textRects = (el: Element): Rect[] => {
    const out: Rect[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE || !(node.nodeValue ?? "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1) continue;
        out.push({ x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height });
      }
    }
    return out;
  };
  /** Innenflächen aller Vorfahren (und des Elements selbst), die ihren Inhalt abschneiden (overflow ungleich visible); Inline-Elemente und body/html bleiben außen vor. */
  const clipsOf = (el: Element): Rect[] => {
    const out: Rect[] = [];
    for (let e: Element | null = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if ((cs.overflowX === "visible" && cs.overflowY === "visible") || cs.display === "inline") continue;
      const r = e.getBoundingClientRect();
      const h = e as HTMLElement;
      out.push({ x: r.left + h.clientLeft + window.scrollX, y: r.top + h.clientTop + window.scrollY, w: h.clientWidth, h: h.clientHeight });
    }
    return out;
  };
  /** Hintergrundschichten (unten zuerst) und ob ein Bild/Verlauf oder ein überlappendes Element dahinter liegt. */
  function inFixedBar(el: Element): boolean {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  }
  function backdrop(el: Element, startAtParent: boolean): { layers: string[]; needPixel: boolean } {
    const layers: string[] = [];
    let needPixel = false;
    let stop = false;
    for (let e: Element | null = startAtParent ? el.parentElement : el; e && !stop; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const o = effOpacity(e);
      const bg = toRgba(cs.backgroundColor);
      if (cs.backgroundImage !== "none") needPixel = true;
      if (bg === null) errors.push(`Hintergrundfarbe nicht lesbar: ${cs.backgroundColor} bei ${describe(e)}`);
      else if (alphaOf(bg) > 0) {
        layers.push(withAlpha(bg, o));
        if (alphaOf(bg) >= 1 && cs.backgroundImage === "none" && o >= 1) stop = true; // darunter ist nichts mehr sichtbar
      }
    }
    return { layers: layers.reverse(), needPixel };
  }
  /** Liegt hinter dem Text ein fremdes, gezeichnetes Element (Bild, Video, Canvas, SVG oder Fläche eines Nicht-Vorfahren)? */
  function overlapped(el: Element, r: Rect): boolean {
    const cx = r.x + r.w / 2 - window.scrollX;
    const cy = r.y + r.h / 2 - window.scrollY;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return false; // unterhalb des Fensters: nicht prüfbar, Stapel gilt
    for (const o of document.elementsFromPoint(cx, cy)) {
      if (o === el || el.contains(o) || o.contains(el)) continue;
      if (/^(IMG|VIDEO|CANVAS|SVG|PICTURE)$/i.test(o.tagName)) return true;
      const cs = getComputedStyle(o);
      if (cs.backgroundImage !== "none") return true;
      const bg = toRgba(cs.backgroundColor);
      if (bg && alphaOf(bg) > 0 && !o.contains(el)) return true;
    }
    return false;
  }
  const items: Item[] = [];
  // ---- Text: je Element mit eigenem Text einmal
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !(n.nodeValue ?? "").trim()) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/i.test(el.tagName) || !visible(el)) continue;
    seen.add(el);
    try {
      const cs = getComputedStyle(el);
      const fg = toRgba(cs.color);
      const rects = textRects(el);
      if (rects.length === 0) continue; // kein sichtbarer Text im Element selbst
      const b = backdrop(el, false);
      items.push({
        kind: "text",
        selector: describe(el),
        sample: (n.nodeValue ?? "").trim().slice(0, 40),
        fontSizePx: parseFloat(cs.fontSize),
        fontWeight: Number(cs.fontWeight) || 400,
        fg: fg ? withAlpha(fg, effOpacity(el)) : cs.color,
        layers: b.layers,
        base,
        needPixel: b.needPixel || rects.some((rc) => overlapped(el, rc)),
        inFixed: inFixedBar(el),
        rects,
        clips: clipsOf(el),
        disabled: el.closest("[disabled], [aria-disabled='true']") !== null,
        note: cs.textShadow !== "none" ? "Textschatten vorhanden (nicht eingerechnet)" : undefined,
      });
    } catch (e) {
      errors.push(`Text ${describe(el)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // ---- Eingabefelder: Text in Feldern (Wert, Auswahl, Platzhalter) ist kein Textknoten, wird hier eigens gemessen
  const fields = Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, select")).filter(visible) as HTMLInputElement[];
  for (const el of fields) {
    try {
      const cs = getComputedStyle(el);
      const b = backdrop(el, false);
      const fgValue = toRgba(cs.color);
      const r = pageRect(el);
      const common = { kind: "text" as const, selector: describe(el), fontSizePx: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || 400, layers: b.layers, base, needPixel: b.needPixel, rects: [r], clips: [] as Rect[], disabled: el.matches("[disabled]") };
      if (fgValue) items.push({ ...common, sample: "Eingabetext", fg: withAlpha(fgValue, effOpacity(el)) });
      const ph = el.getAttribute("placeholder");
      if (ph && ph.trim()) {
        const phColor = toRgba(getComputedStyle(el, "::placeholder").color);
        if (phColor) items.push({ ...common, sample: `Platzhalter: ${ph.trim().slice(0, 25)}`, fg: withAlpha(phColor, effOpacity(el)) });
        else errors.push(`Platzhalterfarbe nicht lesbar bei ${describe(el)}`);
      }
    } catch (e) {
      errors.push(`Feld ${describe(el)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // ---- Zeichen: Rand oder Fläche bedienbarer Elemente gegen den Grund
  const controls = Array.from(document.querySelectorAll("button, a[class*='btn'], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button]")).filter(visible);
  for (const el of controls) {
    try {
      const cs = getComputedStyle(el);
      const ground = backdrop(el, true);
      const o = effOpacity(el);
      const borderW = parseFloat(cs.borderTopWidth);
      const border = toRgba(cs.borderTopColor);
      const fill = toRgba(cs.backgroundColor);
      let color: string | null = null;
      let what = "";
      if (borderW >= 1 && cs.borderTopStyle !== "none" && border && alphaOf(border) > 0) {
        color = withAlpha(border, o);
        what = "Rand";
      } else if (fill && alphaOf(fill) > 0.05) {
        color = withAlpha(fill, o);
        what = "Fläche";
      }
      if (!color) continue; // reiner Text ohne Rand und Fläche: der Text wird als Text gemessen
      items.push({
        kind: "non-text",
        selector: describe(el),
        sample: what,
        fontSizePx: 16,
        fontWeight: 400,
        fg: color,
        layers: ground.layers,
        base,
        needPixel: false,
        rects: [pageRect(el)],
        clips: [],
        disabled: el.matches("[disabled], [aria-disabled='true']"),
        note: ground.needPixel ? "Grund hat Bild/Verlauf: Stapel nur angenähert" : undefined,
      });
    } catch (e) {
      errors.push(`Zeichen ${describe(el)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // ---- Fokusring (höchstens maxFocus bedienbare Elemente)
  const focusable = Array.from(document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
    .filter(visible)
    .slice(0, maxFocus) as HTMLElement[];
  for (const el of focusable) {
    try {
      el.focus({ preventScroll: true });
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.outlineWidth);
      const ring = cs.outlineStyle !== "none" && w > 0 ? toRgba(cs.outlineColor) : null;
      const ground = backdrop(el, true);
      items.push({
        kind: "focus",
        selector: describe(el),
        sample: ring ? `Ring ${w}px` : "kein Fokusring (outline)",
        fontSizePx: 16,
        fontWeight: 400,
        fg: ring ?? "transparent",
        layers: ground.layers,
        base,
        needPixel: false,
        rects: [pageRect(el)],
        clips: [],
        disabled: false,
        note: ring ? (w < 2 ? "Ring unter 2 px" : undefined) : "Fokus über box-shadow o. Ä. wird hier nicht erkannt",
      });
      el.blur();
    } catch (e) {
      errors.push(`Fokus ${describe(el)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { items, errors };
}

/** Läuft IM Browser: liest aus einem Screenshot (PNG als Base64) je Rechteck ein Raster von höchstens `max` Pixeln. */
async function samplePixels(args: { b64: string; rects: Rect[][]; per: number[] }): Promise<number[][]> {
  const img = new Image();
  img.src = `data:image/png;base64,${args.b64}`;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) return args.rects.map(() => []);
  g.drawImage(img, 0, 0);
  // je Messpunkt und Zeilenrechteck höchstens `per[k]` Pixel (das Budget plant planSamples in Node: Summe nie über dem Höchstwert)
  return args.rects.map((list, k) => {
    const out: number[] = [];
    const budget = Math.max(1, args.per[k] ?? 1);
    for (const r of list) {
      const x0 = Math.max(0, Math.floor(r.x));
      const y0 = Math.max(0, Math.floor(r.y));
      const w = Math.min(cv.width - x0, Math.ceil(r.w));
      const h = Math.min(cv.height - y0, Math.ceil(r.h));
      if (w < 1 || h < 1) continue;
      const data = g.getImageData(x0, y0, w, h).data;
      const total = w * h;
      const step = Math.max(1, Math.ceil(total / budget));
      for (let i = 0; i < total; i += step) out.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    }
    return out;
  });
}

export type PageResult = { evaluated: Evaluated[]; errors: string[]; counts: { text: number; nonText: number; focus: number; pixel: number } };

/**
 * Debug-Ablage der Pixelprobe (nur mit KONTRAST_DEBUG_DIR): je durchgefallenem Pixel-Messpunkt ein Ausschnitt des Bildschirms MIT Text (Rand 12 px) und eine JSON-Datei mit Selektor, Rechtecken, Vordergrund und den
 * Pixelwerten der Probe (hellstes und dunkelstes Pixel, Zahl). So lässt sich entscheiden, ob ein Verstoß echt ist oder ein Artefakt der Probe.
 */
async function dumpDebug(page: Page, meta: PageMeta, list: { it: Item; e: Evaluated; pixels: number[] | undefined }[]): Promise<void> {
  const dir = process.env.KONTRAST_DEBUG_DIR;
  if (!dir || list.length === 0) return;
  try {
    mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const { it, e, pixels } of list) {
      n++;
      const name = `${meta.page}-${meta.scheme}-${meta.viewport}-${n}`;
      const xs = it.rects.map((r) => r.x), ys = it.rects.map((r) => r.y);
      const x0 = Math.max(0, Math.min(...xs) - 12), y0 = Math.max(0, Math.min(...ys) - 12);
      const x1 = Math.max(...it.rects.map((r) => r.x + r.w)) + 12, y1 = Math.max(...it.rects.map((r) => r.y + r.h)) + 12;
      await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true, clip: { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) } }).catch(() => {});
      const px: number[][] = [];
      for (let i = 0; pixels && i + 2 < pixels.length; i += 3) px.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
      const lum = (p: number[]) => p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
      const sorted = [...px].sort((a, b) => lum(a) - lum(b));
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ selector: it.selector, sample: it.sample, fg: it.fg, ratio: e.ratio, fgHex: e.fgHex, bgHex: e.bgHex, rects: it.rects, clips: it.clips, layers: it.layers, base: it.base, pixelCount: px.length, darkest: sorted.slice(0, 5), lightest: sorted.slice(-5), median: sorted[Math.floor(sorted.length / 2)] }, null, 1));
    }
  } catch {
    /* Debug darf nie messen oder scheitern */
  }
}

/** Misst die aktuell geladene Seite (Farbschema und Breite sind schon eingestellt). Wirft nie: Fehler stehen in `errors`. */
export async function measurePage(page: Page, meta: PageMeta, maxFocus = 30): Promise<PageResult> {
  const errors: string[] = [];
  const evaluated: Evaluated[] = [];
  try {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const a of document.getAnimations()) {
        try {
          a.finish();
        } catch {
          /* unendliche Animation */
        }
      }
    });
    const collected = await page.evaluate(collectInPage, maxFocus);
    errors.push(...collected.errors);
    // Text auf die sichtbaren Bereiche zuschneiden (abgeschnittene Teile von truncate/ellipsis/line-clamp gehören dem Nachbarn); ohne Rest gibt es nichts zu messen
    const items = collected.items
      .map((it) => (it.kind === "text" ? { ...it, rects: clipRects(it.rects, it.clips) } : it))
      .filter((it) => it.rects.length > 0);
    const needIdx = items.map((it, i) => (it.needPixel ? i : -1)).filter((i) => i >= 0);
    let pixelsByIdx = new Map<number, number[]>();
    if (needIdx.length > 0) {
      try {
        // Text unsichtbar schalten, damit nur der Grund gemessen wird. Feste und klebende Leisten (untere Leiste, Kopfzeile) und die Dev-Anzeige von Next liegen im Ganzseiten-Bild an der Stelle des ERSTEN Bildschirms
        // und decken dort Text darunter ab (Artefakt, kein Befund: beim Scrollen ist der Text frei). Darum zwei Bilder: A ohne diese Leisten für Text außerhalb der Leisten, B mit Leisten für Text in den Leisten.
        const style = await page.addStyleTag({ content: "*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}" });
        const pngBar = needIdx.some((i) => items[i].inFixed) ? await page.screenshot({ fullPage: true, animations: "disabled" }) : null;
        const hidden = await page.evaluate(() => {
          const out: HTMLElement[] = [];
          for (const el of Array.from(document.body.querySelectorAll("*")) as HTMLElement[]) {
            const p = getComputedStyle(el).position;
            if (p === "fixed" || p === "sticky") {
              el.setAttribute("data-kt-fixed", el.style.visibility || "-");
              el.style.setProperty("visibility", "hidden", "important");
              out.push(el);
            }
          }
          return out.length;
        });
        const pngFree = hidden > 0 || !pngBar ? await page.screenshot({ fullPage: true, animations: "disabled" }) : pngBar;
        await page.evaluate(() => {
          for (const el of Array.from(document.querySelectorAll("[data-kt-fixed]")) as HTMLElement[]) {
            const v = el.getAttribute("data-kt-fixed");
            if (v === "-") el.style.removeProperty("visibility");
            else el.style.setProperty("visibility", v ?? "");
            el.removeAttribute("data-kt-fixed");
          }
        });
        await style.evaluate((n) => (n as HTMLElement).remove());
        const plans = needIdx.map((i) => planSamples(items[i].rects, MAX_PIXELS));
        const sampled: number[][] = new Array(needIdx.length);
        for (const [bar, shot] of [[true, pngBar], [false, pngFree]] as const) {
          const ks = needIdx.map((_, k) => k).filter((k) => Boolean(items[needIdx[k]].inFixed) === bar);
          if (ks.length === 0 || !shot) continue;
          const part = await page.evaluate(samplePixels, { b64: shot.toString("base64"), rects: ks.map((k) => plans[k].rects), per: ks.map((k) => plans[k].perRect) });
          ks.forEach((k, j) => (sampled[k] = part[j]));
        }
        pixelsByIdx = new Map(needIdx.map((i, k) => [i, sampled[k] ?? []]));
      } catch (e) {
        errors.push(`Pixelmessung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const debug: { it: Item; e: Evaluated; pixels: number[] | undefined }[] = [];
    items.forEach((it, i) => {
      const pixels = pixelsByIdx.get(i);
      const raw: RawMeasurement = {
        ...meta,
        kind: it.kind,
        selector: it.selector,
        sample: it.sample,
        fontSizePx: it.fontSizePx,
        fontWeight: it.fontWeight,
        fg: it.fg,
        bg: it.needPixel && pixels && pixels.length >= 3 ? { method: "pixel", pixels } : { method: "stack", layers: it.layers, base: it.base || undefined },
        disabled: it.disabled,
      };
      if (!it.base && !(it.needPixel && pixels && pixels.length >= 3)) {
        errors.push(`Grundfarbe der Seite nicht lesbar (${it.selector}): Messpunkt unlesbar`);
        evaluated.push({ raw, limit: Number.NaN, ratio: Number.NaN, worst: Number.NaN, fgHex: "?", bgHex: "?", method: "stack", status: "unlesbar", note: "keine Grundfarbe" });
        return;
      }
      const e = evaluate(raw);
      if (e.status === "fail" && it.needPixel) debug.push({ it, e, pixels });
      evaluated.push(it.note ? { ...e, note: [e.note, it.note].filter(Boolean).join("; ") } : e);
    });
    await dumpDebug(page, meta, debug); // nur mit KONTRAST_DEBUG_DIR (lokal oder als CI-Artefakt), nie im Repo
    return {
      evaluated,
      errors,
      counts: { text: items.filter((i) => i.kind === "text").length, nonText: items.filter((i) => i.kind === "non-text").length, focus: items.filter((i) => i.kind === "focus").length, pixel: needIdx.length },
    };
  } catch (e) {
    errors.push(`Messung abgebrochen (${meta.page}): ${e instanceof Error ? e.message : String(e)}`);
    return { evaluated, errors, counts: { text: 0, nonText: 0, focus: 0, pixel: 0 } };
  }
}
