import { expect, test, type Page } from "@playwright/test";

// M2-2b: Skip-Link, h1, Tab-Reihenfolge, Aktionsleiste und Seitenleiste auf der Showcase /dev/komponenten.
// Das Layout (Header, BottomNav) bekommt den Skip-Link erst im Einbau-Schritt; hier gilt die Reihenfolge innerhalb der Seite.

async function open(page: Page, scheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByTestId("showcase")).toBeVisible({ timeout: 60_000 });
}

test.describe("Skip-Link und Überschrift", () => {
  test("h1: genau eine, mit Sprungziel", async ({ page }) => {
    await open(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveAttribute("id", "seiten-titel");
    await expect(page.locator("h1")).toHaveAttribute("tabindex", "-1");
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`Skip-Link: erst unsichtbar, bei Fokus sichtbar im Bild, Enter springt auf den Inhalt (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const link = page.getByRole("link", { name: "Zum Inhalt springen" });
      const before = await link.boundingBox();
      expect(before!.width).toBeLessThanOrEqual(1);
      await link.focus();
      const box = await link.boundingBox();
      const vp = page.viewportSize()!;
      expect(box!.width).toBeGreaterThan(80);
      expect(box!.height).toBeGreaterThanOrEqual(36);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("inhalt");
      expect(new URL(page.url()).hash).toBe("#inhalt");
    });
  }

  test("Tab-Reihenfolge: Skip-Link ist das erste Ziel der Seite, danach die Hauptaktion", async ({ page }) => {
    await open(page);
    const order = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="showcase"]')!;
      const sel = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return [...root.querySelectorAll(sel)].slice(0, 3).map((e) => (e.getAttribute("href") ?? e.getAttribute("aria-label") ?? e.textContent ?? "").trim());
    });
    expect(order[0]).toBe("#inhalt");
    expect(order[1]).toBe("/suche");
    // und per echter Tastatur: vom Skip-Link ein Tab weiter
    await page.getByRole("link", { name: "Zum Inhalt springen" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("page-action").getByRole("link")).toBeFocused();
  });
});

test.describe("Handy 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Aktionsleiste: fest unten im Bild, kein horizontales Scrollen, Inhalt bleibt frei", async ({ page }) => {
    await open(page);
    const bar = page.getByTestId("page-action");
    await expect(bar).toBeVisible();
    expect(await bar.evaluate((e) => getComputedStyle(e).position)).toBe("fixed");
    const box = (await bar.boundingBox())!;
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.width).toBeGreaterThanOrEqual(389);
    const link = (await bar.getByRole("link").boundingBox())!;
    expect(link.height).toBeGreaterThanOrEqual(43.5);
    // auch nach dem Scrollen bleibt sie im Bild
    await page.mouse.wheel(0, 2000);
    const after = (await bar.boundingBox())!;
    expect(after.y + after.height).toBeLessThanOrEqual(844);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("Seitenleiste steht unter dem Inhalt", async ({ page }) => {
    await open(page);
    const aside = (await page.getByTestId("showcase-aside").boundingBox())!;
    const header = (await page.locator("h1").boundingBox())!;
    expect(aside.y).toBeGreaterThan(header.y);
  });
});

test.describe("Desktop 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Aktion steht rechts im Kopf, nicht fest", async ({ page }) => {
    await open(page);
    const bar = page.getByTestId("page-action");
    expect(await bar.evaluate((e) => getComputedStyle(e).position)).not.toBe("fixed");
    const b = (await bar.boundingBox())!;
    const h1 = (await page.locator("h1").boundingBox())!;
    expect(b.x).toBeGreaterThan(h1.x + h1.width - 1);
    expect(Math.abs(b.y - h1.y)).toBeLessThan(40);
  });

  test("Seitenleiste neben dem Inhalt, Breite höchstens 1040 px", async ({ page }) => {
    await open(page);
    const aside = (await page.getByTestId("showcase-aside").boundingBox())!;
    const h1 = (await page.locator("h1").boundingBox())!;
    expect(aside.x).toBeGreaterThan(h1.x + 200);
    const shellWidth = await page.locator("[data-testid=showcase] #inhalt > div").first().evaluate((e) => e.getBoundingClientRect().width);
    expect(shellWidth).toBeLessThanOrEqual(1040.5);
  });
});
