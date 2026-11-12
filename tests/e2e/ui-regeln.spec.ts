import { expect, test, type Page } from "@playwright/test";

// M2-2d: Gestaltungsregeln über die ganze Showcase /dev/komponenten (Vertrag 013 AC-3, AC-10):
// Zielgröße, Schriftgröße, kein horizontales Scrollen, Orange nur auf Hauptaktionen. Handy und Desktop, hell und dunkel.

const VIEWS = [
  { name: "Handy", width: 390, height: 844 },
  { name: "Desktop", width: 1280, height: 800 },
] as const;

async function open(page: Page, scheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByTestId("showcase")).toBeVisible({ timeout: 60_000 });
}

for (const view of VIEWS) {
  for (const scheme of ["dark", "light"] as const) {
    test.describe(`${view.name} ${view.width} px, ${scheme}`, () => {
      test.use({ viewport: { width: view.width, height: view.height } });

      test("Zielgrößen: jedes bedienbare Element ist mindestens 44 px hoch und breit", async ({ page }) => {
        await open(page, scheme);
        const small = await page.getByTestId("showcase").evaluate((root) => {
          const out: string[] = [];
          for (const e of root.querySelectorAll<HTMLElement>("a[href], button")) {
            const r = e.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) continue; // der Skip-Link ist bis zum Fokus unsichtbar (sr-only)
            if (r.height < 43.5 || r.width < 43.5) out.push(`${(e.textContent || e.getAttribute("aria-label") || "").trim()} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return out;
        });
        expect(small).toEqual([]);
      });

      test("Schrift: kein Text unter 12 px", async ({ page }) => {
        await open(page, scheme);
        const tiny = await page.getByTestId("showcase").evaluate((root) => {
          const out: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent?.trim() || !n.parentElement) continue;
            const size = parseFloat(getComputedStyle(n.parentElement).fontSize);
            if (size < 12) out.push(`${n.textContent.trim().slice(0, 30)} ${size}px`);
          }
          return out;
        });
        expect(tiny).toEqual([]);
      });

      test("StateMessage: Rahmen 2 px in der Statusfarbe (error: danger, forbidden: warn)", async ({ page }) => {
        await open(page, scheme);
        const tok = (name: string) => page.evaluate((n) => {
          const p = document.createElement("i");
          p.style.color = `var(--${n})`;
          document.body.appendChild(p);
          const c = getComputedStyle(p).color;
          p.remove();
          return c;
        }, name);
        for (const [kind, token] of [["error", "danger"], ["forbidden", "warn"]] as const) {
          const s = await page.locator(`[data-kind=${kind}]`).evaluate((e) => ({ w: getComputedStyle(e).borderTopWidth, c: getComputedStyle(e).borderTopColor }));
          expect(s.w, kind).toBe("2px");
          expect(s.c, kind).toBe(await tok(token));
        }
      });

      test("Höchstens eine primary-Aktion auf der Seite", async ({ page }) => {
        await open(page, scheme);
        const n = await page.getByTestId("showcase").evaluate((root) => [...root.querySelectorAll("a, button")].filter((e) => e.className.includes("bg-accent") && e.getClientRects().length > 0).length); // nur sichtbare (Knöpfe in geschlossenen Dialogen zählen nicht)
        // Seitenkopf-Aktion, die primary-Knöpfe der Varianten-Galerie (md, sm, Icon), der Zähler, Speichern im Formular (M2-3a) und der Auslöser „Preis bestätigen“ (M2-3b); nie die StateMessages
        const inMessages = await page.getByTestId("messages").evaluate((m) => [...m.querySelectorAll("a, button")].filter((e) => e.className.includes("bg-accent")).length);
        expect(inMessages).toBe(0);
        expect(n).toBeLessThanOrEqual(8);
      });

      test("Layout: kein horizontales Scrollen", async ({ page }) => {
        await open(page, scheme);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });

      test("Orange: nur Hauptaktionen (Link oder Knopf) haben die Akzentfläche", async ({ page }) => {
        await open(page, scheme);
        const wrong = await page.getByTestId("showcase").evaluate((root) => {
          const probe = document.createElement("i");
          probe.style.backgroundColor = "var(--accent)";
          document.body.appendChild(probe);
          const accent = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const out: string[] = [];
          for (const e of root.querySelectorAll<HTMLElement>("*")) {
            const c = getComputedStyle(e);
            const usesAccent = c.backgroundColor === accent || c.color === accent || c.borderTopColor === accent;
            if (usesAccent && !(e.matches("a, button") && c.backgroundColor === accent)) out.push(`${e.tagName} ${(e.textContent || "").trim().slice(0, 20)}`);
          }
          return out;
        });
        expect(wrong).toEqual([]);
      });
    });
  }
}

test.describe("Raster nach Platz", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("StateMessage-Karten sind auch neben der Seitenleiste mindestens 256 px breit", async ({ page }) => {
    await open(page, "dark");
    const widths = await page.locator("[data-kind]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(255);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// M2-3c: Formular- und Dialog-Bausteine (M2-3a/b) gegen dieselben Regeln, plus Kontrast für die Komponenten (AC-3).
// ---------------------------------------------------------------------------------------------------------------------

/** Läuft im Browser: liefert Textstellen unter dem geforderten Kontrast (WCAG 2.x, 4,5:1; große Schrift 3:1). Hintergründe werden
 *  Schicht für Schicht auf einer Leinwand übereinandergelegt (Alpha stimmt), Verläufe/Bilder werden nicht erfasst (gibt es in den Komponenten nicht). */
function contrastFindings(root: Element): string[] {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const px = (layers: string[]): [number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    for (const c of layers) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
    }
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent?.trim()) continue;
    if (!el.getClientRects().length) continue; // nicht sichtbar (geschlossener Dialog, sr-only mit 1 px zählt unten)
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    if (el.closest("[aria-disabled=true], :disabled")) continue; // gesperrte Elemente sind von der Kontrastpflicht ausgenommen (WCAG 1.4.3)
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
    const backdrop = getComputedStyle(document.documentElement).colorScheme.includes("dark") ? "#000" : "#fff";
    const layers = [backdrop, ...chain.map((e) => getComputedStyle(e).backgroundColor)];
    const bg = px(layers);
    const fg = px([...layers, cs.color]);
    const a = lum(bg);
    const b = lum(fg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push(`${n.textContent.trim().slice(0, 28)} ${ratio.toFixed(2)}:1 (nötig ${need})`);
  }
  return out;
}

const DIALOGS = [
  { opener: "Spieler entfernen", title: "Spieler entfernen?" },
  { opener: "Preis bestätigen", title: "Preis bestätigen?" },
  { opener: "Konto löschen", title: "Konto löschen?" },
  { opener: "Lobby verlassen", title: "Lobby verlassen?" },
  { opener: "Anteil übernehmen", title: "Anteil von Alex übernehmen?" }, // mit Zustimmungs-Kästchen (consent)
] as const;

for (const view of VIEWS) {
  for (const scheme of ["dark", "light"] as const) {
    test.describe(`Komponenten ${view.name} ${view.width} px, ${scheme}`, () => {
      test.use({ viewport: { width: view.width, height: view.height } });

      test("Kontrast: jeder sichtbare Text der Showcase hat mindestens 4,5:1 (große Schrift 3:1)", async ({ page }) => {
        await open(page, scheme);
        const bad = await page.getByTestId("showcase").evaluate(contrastFindings);
        expect(bad).toEqual([]);
      });

      for (const d of DIALOGS) {
        test(`Dialog „${d.opener}“: Zielgrößen ≥ 44 px, Schrift ≥ 12 px, Kontrast, kein seitliches Scrollen`, async ({ page }) => {
          await open(page, scheme);
          await page.getByTestId("confirm-demo").getByRole("button", { name: d.opener, exact: true }).first().click();
          const dlg = page.getByRole("dialog", { name: d.title });
          await expect(dlg).toBeVisible();
          const res = await dlg.evaluate(
            (el, fn) => {
              const small: string[] = [];
              for (const e of el.querySelectorAll<HTMLElement>("button, a[href], input")) {
                // das Kästchen selbst ist klein: sein Tippziel ist die ganze Beschriftungszeile (label), die geprüft wird
                const target = e instanceof HTMLInputElement && e.type === "checkbox" ? (e.closest("label") as HTMLElement) : e;
                const r = target.getBoundingClientRect();
                if (r.height < 43.5 || (e.tagName !== "INPUT" && r.width < 43.5)) small.push(`${(e.textContent || e.getAttribute("type") || "").trim()} ${Math.round(r.width)}x${Math.round(r.height)}`);
              }
              const tiny: string[] = [];
              const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.textContent?.trim() || !n.parentElement) continue;
                const size = parseFloat(getComputedStyle(n.parentElement).fontSize);
                if (size < 12) tiny.push(`${n.textContent.trim().slice(0, 30)} ${size}px`);
              }
              const contrast = (new Function(`return (${fn})`)() as (r: Element) => string[])(el);
              return { small, tiny, contrast, overflow: el.scrollWidth - el.clientWidth, docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
            },
            contrastFindings.toString(),
          );
          expect(res.small).toEqual([]);
          expect(res.tiny).toEqual([]);
          expect(res.contrast).toEqual([]);
          expect(res.overflow).toBeLessThanOrEqual(0);
          expect(res.docOverflow).toBeLessThanOrEqual(0);
        });
      }

      test("Felder und Formular: Felder ≥ 44 px hoch und ≥ 16 px Schrift, Speichern-Knopf ≥ 44 px", async ({ page }) => {
        await open(page, scheme);
        const demo = page.getByTestId("form-demo");
        const bad = await demo.evaluate((root) => {
          const out: string[] = [];
          for (const e of root.querySelectorAll<HTMLElement>("input, select, textarea")) {
            const r = e.getBoundingClientRect();
            const size = parseFloat(getComputedStyle(e).fontSize);
            if (r.height < 43.5 || size < 16) out.push(`${e.id} ${Math.round(r.height)}px hoch, ${size}px Schrift`);
          }
          const submit = root.querySelector<HTMLElement>("button[type=submit]");
          if (!submit || submit.getBoundingClientRect().height < 43.5) out.push("Speichern-Knopf zu klein");
          return out;
        });
        expect(bad).toEqual([]);
      });
    });
  }
}
