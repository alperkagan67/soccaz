import { expect, test, type Page } from "@playwright/test";

// 013 M3, AC-3: Gestaltungsregeln auf den umgebauten SEITEN (nicht nur auf der Showcase wie ui-regeln.spec): genau eine h1, kein horizontales Scrollen, keine Schrift unter 12 px. Handy 390 und Desktop 1280, hell und dunkel.
// Jeder M3-PR trägt seine Seiten hier ein (Gast-Seiten ohne Anmeldung). Seiten mit Anmeldung folgen mit eigenen Specs.
const UMGEBAUTE_SEITEN: { name: string; path: string }[] = [
  { name: "Start", path: "/" },
  { name: "Spiel suchen", path: "/suche" },
  { name: "Turniere", path: "/turniere" },
];

const VIEWS = [
  { name: "Handy", width: 390, height: 844 },
  { name: "Desktop", width: 1280, height: 800 },
] as const;

async function pruefeSeite(page: Page, label: string) {
  expect(await page.locator("h1").count(), `${label}: genau eine h1`).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label}: kein horizontales Scrollen`).toBe(true);
  const tiny = await page.locator("main").evaluate((root) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent?.trim() || !el || el.closest("script, style, noscript")) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) out.push(`${n.textContent.trim().slice(0, 30)} ${size}px`);
    }
    return out;
  });
  expect(tiny, `${label}: keine Schrift unter 12 px`).toEqual([]);
  // Lauf 3 (P2-2), AC-30 b und AC-3: höchstens EINE Hauptaktion je Seite, jeder Knopf mindestens 44 px hoch
  expect(await page.locator("main .btn-primary:visible").count(), `${label}: höchstens eine Hauptaktion`).toBeLessThanOrEqual(1);
  const kleine = await page.locator("main .btn:visible").evaluateAll((els) => els.map((e) => ({ text: (e as HTMLElement).innerText.trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
  expect(kleine, `${label}: Knöpfe mindestens 44 px hoch`).toEqual([]);
  // Pilot-P2 (PR A): auch die Knöpfe der Fußzeile (Sprachumschalter) mindestens 44 px hoch und breit
  const kleineFuss = await page.locator("footer button:visible").evaluateAll((els) => els.map((e) => ({ text: (e as HTMLElement).innerText.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })).filter((x) => x.h < 44 || x.w < 44));
  expect(kleineFuss, `${label}: Knöpfe der Fußzeile mindestens 44 px`).toEqual([]);
}

for (const view of VIEWS) {
  for (const scheme of ["dark", "light"] as const) {
    test.describe(`${view.name} ${view.width} px, ${scheme}`, () => {
      test.use({ viewport: { width: view.width, height: view.height }, colorScheme: scheme });
      for (const seite of UMGEBAUTE_SEITEN) {
        test(`${seite.name}: eine h1, kein horizontales Scrollen, Schrift mindestens 12 px`, async ({ page }) => {
          await page.goto(seite.path, { timeout: 90_000 });
          await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
          await pruefeSeite(page, `${seite.name} ${view.width} ${scheme}`);
        });
      }
    });
  }
}
