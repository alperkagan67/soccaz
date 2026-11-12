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
    // Nur sichtbare Elemente (geschlossene Dialoge haben Knöpfe, die nicht erreichbar sind). Ein datetime-local-Feld hat nativ mehrere Tab-Stopps
    // (Tag, Monat, Jahr, Stunde, Minute): aufeinanderfolgende Stopps im selben Element zählen als ein Schritt.
    const SHOW = "[data-testid=showcase]";
    const indexOfActive = (sel: string) =>
      page.evaluate(
        ([root, s]) => {
          const list = [...document.querySelector(root)!.querySelectorAll<HTMLElement>(s)].filter((x) => x.getClientRects().length > 0);
          return { index: list.indexOf(document.activeElement as HTMLElement), total: list.length, first: (list[0].getAttribute("href") ?? "").trim() };
        },
        [SHOW, sel],
      );
    const start = await indexOfActive(FOCUSABLE);
    expect(start.total).toBeGreaterThan(25);
    expect(start.first).toBe("#inhalt"); // Skip-Link zuerst
    await page.getByRole("link", { name: "Zum Inhalt springen" }).focus();
    const seen: number[] = [0];
    for (let i = 0; i < start.total * 8 && seen[seen.length - 1] < start.total - 1; i++) {
      await page.keyboard.press("Tab");
      const { index } = await indexOfActive(FOCUSABLE);
      expect(index, "Tab landet auf einem Element der Liste").toBeGreaterThanOrEqual(0);
      if (index !== seen[seen.length - 1]) seen.push(index);
    }
    expect(seen).toEqual(Array.from({ length: start.total }, (_, i) => i)); // jedes Element genau einmal, in DOM-Reihenfolge
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
    const count = await page.getByTestId("showcase").locator(FOCUSABLE).filter({ visible: true }).count();
    for (let i = 0; i < count; i++) {
      const el = page.getByTestId("showcase").locator(FOCUSABLE).filter({ visible: true }).nth(i);
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

// ---------------------------------------------------------------------------------------------------------------------
// M2-3c: Formular, DateTimeField und ConfirmDialog (M2-3a/b) auf der Showcase. Die Einzelheiten stehen in ui-form.spec.ts und
// ui-confirm.spec.ts; hier gelten dieselben Regeln wie für die übrigen Komponenten: Fokusring überall, Tastatur genügt.
// ---------------------------------------------------------------------------------------------------------------------

const insideDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));

const focusColorOf = (page: Page) =>
  page.evaluate(() => {
    const p = document.createElement("i");
    p.style.color = "var(--focus)";
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return c;
  });

for (const scheme of ["dark", "light"] as const) {
  test(`ConfirmDialog: jedes bedienbare Element im geöffneten Dialog zeigt den Fokusring (${scheme})`, async ({ page }) => {
    await open(page, scheme);
    const focusColor = await focusColorOf(page);
    await page.getByTestId("confirm-demo").getByRole("button", { name: "Konto löschen", exact: true }).first().focus();
    await page.keyboard.press("Enter");
    const dlg = page.getByRole("dialog", { name: "Konto löschen?" });
    await expect(dlg).toBeVisible();
    const items = dlg.locator("button:not([disabled]), input");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2); // Abbrechen und Wort-Feld (die gesperrte Bestätigung ist nicht fokussierbar)
    for (let i = 0; i < count; i++) {
      const el = items.nth(i);
      await el.focus();
      await expect.poll(() => el.evaluate((e) => getComputedStyle(e).outlineColor), { message: `Ring-Farbe Element ${i}` }).toBe(focusColor);
      const ring = await el.evaluate((e) => ({ style: getComputedStyle(e).outlineStyle, w: parseFloat(getComputedStyle(e).outlineWidth) }));
      expect(ring.style).toBe("solid");
      expect(ring.w).toBeGreaterThanOrEqual(2);
    }
  });
}

for (const scheme of ["dark", "light"] as const) {
  test(`ConfirmDialog mit Zustimmung: Kästchen und Knöpfe zeigen den Fokusring, Tab bleibt im Dialog (${scheme})`, async ({ page }) => {
    await open(page, scheme);
    const focusColor = await focusColorOf(page);
    await page.getByTestId("confirm-demo").getByRole("button", { name: "Anteil übernehmen", exact: true }).first().focus();
    await page.keyboard.press("Enter");
    const dlg = page.getByRole("dialog", { name: "Anteil von Alex übernehmen?" });
    await expect(dlg).toBeVisible();
    const box = dlg.getByRole("checkbox");
    await expect(box).toBeFocused(); // Startfokus auf dem Kästchen
    await page.keyboard.press("Space"); // anhaken, damit die Bestätigung bedienbar wird
    const items = dlg.locator("button:not([disabled]), input");
    expect(await items.count()).toBe(3); // Kästchen, Abbrechen, Bestätigung
    for (let i = 0; i < 3; i++) {
      const el = items.nth(i);
      await el.focus();
      await expect.poll(() => el.evaluate((e) => getComputedStyle(e).outlineColor), { message: `Ring-Farbe Element ${i}` }).toBe(focusColor);
      const ring = await el.evaluate((e) => ({ style: getComputedStyle(e).outlineStyle, w: parseFloat(getComputedStyle(e).outlineWidth) }));
      expect(ring.style).toBe("solid");
      expect(ring.w).toBeGreaterThanOrEqual(2);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await insideDialog(page)).toBe(true); // Fokus-Falle schließt das Kästchen ein
    }
  });
}

test("ConfirmDialog: nur per Tastatur bedienbar (Fokus auf den Auslöser, Enter öffnet, Tab zur Bestätigung, Enter bestätigt, Dialog schließt)", async ({ page }) => {
  await open(page);
  await page.getByTestId("confirm-demo").getByRole("button", { name: "Spieler entfernen", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog", { name: "Spieler entfernen?" });
  await expect(dlg).toBeVisible();
  await page.keyboard.press("Tab"); // von Abbrechen (Startfokus bei danger) zur Bestätigung
  await page.keyboard.press("Enter");
  await expect(dlg).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("confirm-result")).toContainText("Spieler entfernt");
});

test("Formular: Enter in einem Feld sendet das Formular genau einmal; der Fehler steht am Feld, der Fokus liegt dort", async ({ page }) => {
  await open(page);
  const demo = page.getByTestId("form-demo");
  const field = demo.getByLabel("Teamname");
  await field.fill("vergeben");
  await field.press("Enter");
  await expect(demo.getByTestId("error-teamname")).toBeVisible({ timeout: 15_000 });
  await expect(demo.getByTestId("error-teamname")).toHaveAttribute("role", "alert");
  await expect(field).toBeFocused();
  expect(await demo.locator("button[type=submit]").count()).toBe(1); // genau eine Speichern-Handlung
});

test("DateTimeField: per Tastatur ausfüllbar (Abschnitte tippen, ohne Maus)", async ({ page }) => {
  await open(page);
  const demo = page.getByTestId("form-demo");
  const field = demo.getByLabel("Anstoß");
  // erst tippen, wenn React die Seite übernommen hat (sonst gehen Eingaben beim Hydratisieren verloren)
  await page.waitForFunction(() => Object.keys(document.querySelector("[data-testid=form-demo] button") ?? {}).some((k) => k.startsWith("__reactProps")));
  await field.focus();
  // Die Reihenfolge der Abschnitte (Tag/Monat oder Monat/Tag, 12/24 Stunden) richtet sich nach der Sprache des Browsers, nicht der Seite.
  // Darum Werte, die in jeder Reihenfolge gelten: 11.11.2026, 03:00 und ein P für PM (in 24-Stunden-Feldern ohne Wirkung).
  await page.keyboard.type("11112026" + "0300" + "p");
  await expect(field).toHaveValue(/^2026-11-11T(03|15):00$/);
});
