import { expect, test, type Page } from "@playwright/test";

// M2-2c: StatusBadge und StateMessage auf der Showcase /dev/komponenten (hell und dunkel, 390 und 1280 px).

async function open(page: Page, scheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByTestId("badges")).toBeVisible({ timeout: 60_000 });
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`Status (${scheme})`, () => {
    test(`Status: jedes Badge hat Symbol und Wort, nutzt nie Orange (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const accent = await page.evaluate(() => {
        const p = document.createElement("i");
        p.style.color = "var(--accent)";
        document.body.appendChild(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      });
      const badges = page.getByTestId("badges").locator("[data-status]");
      expect(await badges.count()).toBe(6);
      for (let i = 0; i < 6; i++) {
        const b = badges.nth(i);
        const parts = await b.locator("> span").allTextContents();
        expect(parts[0].trim().length, "Symbol").toBeGreaterThan(0);
        expect(parts[1].trim().length, "Wort").toBeGreaterThan(1);
        const style = await b.evaluate((e) => ({ color: getComputedStyle(e).color, border: getComputedStyle(e).borderTopColor, size: parseFloat(getComputedStyle(e).fontSize) }));
        expect(style.color).not.toBe(accent);
        expect(style.border).not.toBe(accent);
        expect(style.size).toBeGreaterThanOrEqual(12);
      }
    });

    test(`Status: die Status-Farben kommen aus den Tokens (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      for (const s of ["ok", "warn", "danger", "info"]) {
        const expected = await page.evaluate((name) => {
          const p = document.createElement("i");
          p.style.color = `var(--${name})`;
          document.body.appendChild(p);
          const c = getComputedStyle(p).color;
          p.remove();
          return c;
        }, s);
        const color = await page.locator(`[data-testid=badges] [data-status=${s}]`).evaluate((e) => getComputedStyle(e).color);
        expect(color, s).toBe(expected);
      }
    });

    test(`Status: StateMessage hat Rollen, genau eine Handlung und 44 px (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const box = page.getByTestId("messages");
      await expect(box.getByRole("alert")).toHaveCount(1);
      await expect(box.getByRole("status")).toHaveCount(3);
      const sections = box.locator("[data-kind]");
      expect(await sections.count()).toBe(4);
      for (let i = 0; i < 4; i++) {
        const s = sections.nth(i);
        expect(await s.locator("a, button").count()).toBe(1);
        const b = (await s.locator("a, button").boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(43.5);
      }
    });
  });
}

test.describe("Handy", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Status: StateMessage ist eine Spalte, Aktion per Tastatur erreichbar, kein horizontales Scrollen", async ({ page }) => {
    await open(page, "dark");
    const sections = page.getByTestId("messages").locator("[data-kind]");
    const first = (await sections.nth(0).boundingBox())!;
    const second = (await sections.nth(1).boundingBox())!;
    expect(second.y).toBeGreaterThan(first.y + first.height - 1); // untereinander
    const link = sections.nth(0).getByRole("link");
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(sections.nth(1).getByRole("link")).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
