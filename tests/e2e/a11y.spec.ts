import { expect, test, type Page } from "@playwright/test";

// M2-2d: Tastatur und Bedienhilfen auf der Showcase /dev/komponenten (Vertrag 013 AC-4):
// Tab-Reihenfolge, sichtbarer Fokus überall, genau eine h1, Überschriftenebenen, Namen für Knöpfe und Links.
// Ein Dialog-Test (Fokus im Dialog) kommt mit ConfirmDialog (M2-3b).

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

async function open(page: Page, scheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByTestId("showcase")).toBeVisible({ timeout: 60_000 });
}

for (const scheme of ["dark", "light"] as const) {
  test(`Fokus: Tab durchläuft alle bedienbaren Elemente der Seite in DOM-Reihenfolge (${scheme})`, async ({ page }) => {
    await open(page, scheme);
    const expected = await page.getByTestId("showcase").evaluate((root, sel) => {
      return [...root.querySelectorAll<HTMLElement>(sel)].map((e) => (e.getAttribute("aria-label") ?? e.getAttribute("href") ?? e.textContent ?? "").trim());
    }, FOCUSABLE);
    expect(expected.length).toBeGreaterThan(20);
    expect(expected[0]).toBe("#inhalt"); // Skip-Link zuerst
    await page.getByRole("link", { name: "Zum Inhalt springen" }).focus();
    const seen: string[] = [expected[0]];
    for (let i = 1; i < expected.length; i++) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          return (e.getAttribute("aria-label") ?? e.getAttribute("href") ?? e.textContent ?? "").trim();
        }),
      );
    }
    expect(seen).toEqual(expected);
  });

  test(`Fokus: jedes bedienbare Element zeigt beim Fokus einen Ring von mindestens 2 px in der Fokus-Farbe (${scheme})`, async ({ page }) => {
    await open(page, scheme);
    const focusColor = await page.evaluate(() => {
      const p = document.createElement("i");
      p.style.color = "var(--focus)";
      document.body.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    });
    const count = await page.getByTestId("showcase").locator(FOCUSABLE).count();
    for (let i = 0; i < count; i++) {
      const el = page.getByTestId("showcase").locator(FOCUSABLE).nth(i);
      await el.focus();
      const name = (await el.textContent())?.trim() || (await el.getAttribute("aria-label")) || (await el.getAttribute("href"));
      await expect
        .poll(async () => el.evaluate((e) => getComputedStyle(e).outlineColor), { message: `Ring-Farbe ${name}` })
        .toBe(focusColor);
      const ring = await el.evaluate((e) => ({ style: getComputedStyle(e).outlineStyle, w: parseFloat(getComputedStyle(e).outlineWidth) }));
      expect(ring.style, String(name)).toBe("solid");
      expect(ring.w, String(name)).toBeGreaterThanOrEqual(2);
    }
  });
}

test("h1: genau eine, Überschriftenebenen ohne Sprung", async ({ page }) => {
  await open(page);
  await expect(page.locator("h1")).toHaveCount(1);
  const levels = await page.locator("main h1, main h2, main h3, main h4, [data-testid=showcase] :is(h1,h2,h3,h4,h5,h6)").evaluateAll((els) => els.map((e) => Number(e.tagName.slice(1))));
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `Ebene ${i}`).toBeLessThanOrEqual(1);
});

test("Namen: jeder Knopf und Link hat einen zugänglichen Namen", async ({ page }) => {
  await open(page);
  const unnamed = await page.getByTestId("showcase").evaluate((root) => {
    const out: string[] = [];
    for (const e of root.querySelectorAll<HTMLElement>("a[href], button")) {
      const name = (e.getAttribute("aria-label") ?? e.textContent ?? "").trim();
      if (!name) out.push(e.outerHTML.slice(0, 80));
    }
    return out;
  });
  expect(unnamed).toEqual([]);
});

test("Zustand ist nie nur Farbe: gesperrte Knöpfe haben gestrichelten Rahmen, pending ein Wort", async ({ page }) => {
  await open(page);
  const blocked = page.getByTestId("showcase").locator("[aria-disabled=true]");
  const n = await blocked.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i++) {
    const style = await blocked.nth(i).evaluate((e) => getComputedStyle(e).borderTopStyle);
    expect(style).toBe("dashed");
  }
  await expect(page.getByTestId("showcase").locator("[aria-busy=true]").first()).toContainText("Bitte warten");
});
