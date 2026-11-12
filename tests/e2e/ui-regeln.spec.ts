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
        const n = await page.getByTestId("showcase").evaluate((root) => [...root.querySelectorAll("a, button")].filter((e) => e.className.includes("bg-accent")).length);
        // Seitenkopf-Aktion, ein primary-Button und ein primary-Icon-Knopf der Varianten-Galerie; nie die StateMessages
        const inMessages = await page.getByTestId("messages").evaluate((m) => [...m.querySelectorAll("a, button")].filter((e) => e.className.includes("bg-accent")).length);
        expect(inMessages).toBe(0);
        expect(n).toBeLessThanOrEqual(7);
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
