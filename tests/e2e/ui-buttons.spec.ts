import { expect, test, type Page } from "@playwright/test";

// M2-2a: Zielgrößen, Fokus und Tastatur der Knöpfe auf der Showcase /dev/komponenten (keine Datenbank, kein Login).

async function open(page: Page, scheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Komponenten (Entwicklung)" })).toBeVisible({ timeout: 60_000 });
}

test.describe("Zielgrößen", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const scheme of ["dark", "light"] as const) {
    test(`Zielgrößen: alle Knöpfe mindestens 44 px auf 390 px Breite (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const targets = page.locator('main button, main a[href="/dev/komponenten"]');
      const n = await targets.count();
      expect(n).toBeGreaterThan(10);
      for (let i = 0; i < n; i++) {
        const box = await targets.nth(i).boundingBox();
        const name = (await targets.nth(i).textContent())?.trim() || (await targets.nth(i).getAttribute("aria-label"));
        expect(box, String(name)).not.toBeNull();
        expect(box!.height, `${name} Höhe`).toBeGreaterThanOrEqual(43.5);
        expect(box!.width, `${name} Breite`).toBeGreaterThanOrEqual(43.5);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("Zielgrößen: Schrift der Knöpfe mindestens 14 px", async ({ page }) => {
    await open(page, "dark");
    const sizes = await page.locator("main button, main a[href='/dev/komponenten']").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(14);
  });
});

test.describe("Fokus", () => {
  for (const scheme of ["dark", "light"] as const) {
    test(`Fokus: Tab erreicht den Knopf, der Ring ist sichtbar und blau statt orange (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const btn = page.getByTestId("counter-button");
      await btn.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(btn).toBeFocused();
      const ringOf = () =>
        btn.evaluate((e) => {
          const c = getComputedStyle(e);
          return { w: parseFloat(c.outlineWidth), style: c.outlineStyle, color: c.outlineColor };
        });
      const focus = await page.evaluate(() => {
        const probe = document.createElement("i");
        probe.style.color = "var(--focus)";
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      // Die Farbe läuft über eine kurze Überblendung (transition-colors): warten, bis sie steht
      await expect.poll(async () => (await ringOf()).color).toBe(focus);
      const ring = await ringOf();
      expect(ring.style).toBe("solid");
      expect(ring.w).toBeGreaterThanOrEqual(2);
    });
  }

  test("Fokus: der Ring steht sofort in --focus, ohne Überblendung aus der Textfarbe", async ({ page }) => {
    await open(page, "dark");
    const btn = page.getByTestId("counter-button");
    const focus = await page.evaluate(() => {
      const p = document.createElement("i");
      p.style.color = "var(--focus)";
      document.body.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    });
    // fokussieren und im selben Frame lesen: kein Warten auf eine Transition
    const sofort = await btn.evaluate((el) => {
      (el as HTMLElement).focus();
      return getComputedStyle(el).outlineColor;
    });
    expect(sofort).toBe(focus);
    const props = await btn.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(props).not.toContain("outline");
    expect(props).not.toBe("all");
  });

  test("Fokus: Enter und Leertaste lösen aus, auch beim Icon-Knopf", async ({ page }) => {
    await open(page, "dark");
    const value = page.getByTestId("counter-value");
    await page.getByTestId("counter-button").focus();
    await page.keyboard.press("Enter");
    await expect(value).toHaveText("Ausgelöst: 1");
    await page.keyboard.press("Space");
    await expect(value).toHaveText("Ausgelöst: 2");
    await page.getByTestId("counter-reset").focus();
    await page.keyboard.press("Enter");
    await expect(value).toHaveText("Ausgelöst: 0");
  });

  test("Fokus: pending zeigt das Wort, bleibt fokussiert und löst nicht erneut aus", async ({ page }) => {
    await open(page, "dark");
    const b = page.getByTestId("counter-pending");
    await b.focus();
    await page.keyboard.press("Enter");
    await expect(b).toHaveText("Bitte warten…");
    await expect(b).toHaveAttribute("aria-busy", "true");
    await expect(b).toBeFocused();
  });

  test("Fokus: gesperrte Knöpfe sind nicht aktivierbar", async ({ page }) => {
    await open(page, "dark");
    await expect(page.getByRole("button", { name: "gesperrt" }).first()).toBeDisabled();
  });
});
