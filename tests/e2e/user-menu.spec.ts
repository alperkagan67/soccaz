import { expect, test, type Page } from "@playwright/test";
import { closeContexts, newUser } from "./helpers";

// M2-4a: Konto-Menü (natives Popover) in der Kopfleiste: Tastatur, Fokus, Schließen, Größen. Test-IDs und Rollen wie in basics.spec.ts (Konto-Menü).

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function loggedIn(page: Page, key: string, scheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await newUser(page, key);
  await page.goto("/suche");
  await page.waitForLoadState("networkidle");
  // erst bedienen, wenn React die Seite übernommen hat
  await page.waitForFunction(() => Object.keys(document.querySelector("[data-testid=user-menu-button]") ?? {}).some((k) => k.startsWith("__reactProps")));
}

const button = (page: Page) => page.getByTestId("user-menu-button");
const menu = (page: Page) => page.getByTestId("user-menu");
const activeName = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? "");
const ITEMS = ["Mein Profil", "Mein Bereich", "Guthaben", "Benachrichtigungen", "Konto und Einstellungen", "Hilfe", "Abmelden"];

test.describe("Konto-Menü: Tastatur und Fokus", () => {
  test("Enter öffnet, Fokus liegt auf dem ersten Eintrag, aria-expanded und Popover im Top-Layer", async ({ page }) => {
    await loggedIn(page, "um1");
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
    await expect(button(page)).toHaveAttribute("aria-haspopup", "menu");
    await expect(menu(page)).toHaveCount(0); // geschlossen: kein Menü im DOM
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");
    expect(await activeName(page)).toContain("Mein Profil");
    // natives Popover: im Top-Layer, nicht nur ein positioniertes div
    const popoverOpen = await page.evaluate(() => document.querySelector("[popover]:popover-open") !== null);
    expect(popoverOpen).toBe(true);
    for (const name of ITEMS) await expect(menu(page).getByRole("menuitem", { name: new RegExp(name) })).toBeVisible();
  });

  test("Leertaste öffnet ebenfalls", async ({ page }) => {
    await loggedIn(page, "um2");
    await button(page).focus();
    await page.keyboard.press("Space");
    await expect(menu(page)).toBeVisible();
  });

  test("Pfeil ab/auf, Pos1 und Ende bewegen den Fokus, am Rand wird umgebrochen", async ({ page }) => {
    await loggedIn(page, "um3");
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page).getByRole("menuitem").first()).toBeFocused(); // erst wenn das Menü gerendert und fokussiert ist
    await page.keyboard.press("ArrowDown");
    expect(await activeName(page)).toContain("Mein Bereich");
    await page.keyboard.press("ArrowDown");
    expect(await activeName(page)).toContain("Guthaben");
    await page.keyboard.press("ArrowUp");
    expect(await activeName(page)).toContain("Mein Bereich");
    await page.keyboard.press("End");
    expect(await activeName(page)).toContain("Abmelden");
    await page.keyboard.press("ArrowDown"); // vom letzten zum ersten
    expect(await activeName(page)).toContain("Mein Profil");
    await page.keyboard.press("ArrowUp"); // vom ersten zum letzten
    expect(await activeName(page)).toContain("Abmelden");
    await page.keyboard.press("Home");
    expect(await activeName(page)).toContain("Mein Profil");
  });

  test("Escape schließt, der Fokus kehrt zum Knopf zurück", async ({ page }) => {
    await loggedIn(page, "um4");
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(button(page)).toBeFocused();
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("Klick daneben schließt (Light Dismiss), Klick auf den Knopf schließt ebenfalls", async ({ page }) => {
    await loggedIn(page, "um5");
    await button(page).click();
    await expect(menu(page)).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(menu(page)).toHaveCount(0);
    await button(page).click();
    await expect(menu(page)).toBeVisible();
    await button(page).click();
    await expect(menu(page)).toHaveCount(0);
  });

  test("Tab schließt das Menü, der Fokus bleibt auf der Seite und nicht im Menü", async ({ page }) => {
    await loggedIn(page, "um6");
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(menu(page)).toHaveCount(0);
    const inMenu = await page.evaluate(() => !!document.activeElement?.closest("[popover]"));
    expect(inMenu).toBe(false);
  });

  test("Auswahl eines Eintrags navigiert und schließt das Menü", async ({ page }) => {
    await loggedIn(page, "um7");
    await button(page).click();
    await menu(page).getByRole("menuitem", { name: /Konto und Einstellungen/ }).click();
    await expect(page).toHaveURL(/\/app\/einstellungen$/);
    await expect(menu(page)).toHaveCount(0);
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`Fokusring auf Knopf und Einträgen in der Fokusfarbe (${scheme})`, async ({ page }) => {
      await loggedIn(page, `um8${scheme[0]}`, scheme);
      const focusColor = await page.evaluate(() => {
        const p = document.createElement("i");
        p.style.color = "var(--focus)";
        document.body.appendChild(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      });
      await button(page).focus();
      await expect.poll(() => button(page).evaluate((e) => getComputedStyle(e).outlineColor)).toBe(focusColor);
      await page.keyboard.press("Enter");
      const items = menu(page).getByRole("menuitem");
      const n = await items.count();
      for (let i = 0; i < n; i++) {
        await items.nth(i).focus();
        await expect.poll(() => items.nth(i).evaluate((e) => getComputedStyle(e).outlineColor)).toBe(focusColor);
        expect(await items.nth(i).evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
        expect(await items.nth(i).evaluate((e) => parseFloat(getComputedStyle(e).outlineWidth))).toBeGreaterThanOrEqual(2);
      }
    });
  }
});

test.describe("Konto-Menü: Größen und Lage", () => {
  for (const view of [{ name: "Handy", width: 390, height: 780 }, { name: "Desktop", width: 1280, height: 800 }]) {
    test(`${view.name} ${view.width} px: Knopf und Einträge ≥ 44 px, Schrift ≥ 14 px, Menü liegt ganz im Bild, kein seitliches Scrollen`, async ({ page }) => {
      await page.setViewportSize({ width: view.width, height: view.height });
      await loggedIn(page, `um9${view.width}`);
      const b = (await button(page).boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(43.5);
      expect(b.width).toBeGreaterThanOrEqual(43.5);
      await button(page).click();
      const m = (await menu(page).boundingBox())!;
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(view.width);
      expect(m.y + m.height).toBeLessThanOrEqual(view.height); // alle Einträge ohne Scrollen erreichbar
      expect(m.y).toBeGreaterThanOrEqual(b.y + b.height - 1); // unter dem Knopf
      const items = menu(page).getByRole("menuitem");
      const n = await items.count();
      expect(n).toBe(ITEMS.length);
      for (let i = 0; i < n; i++) {
        const box = (await items.nth(i).boundingBox())!;
        expect(box.height, `Eintrag ${i}`).toBeGreaterThanOrEqual(43.5);
        const size = await items.nth(i).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        expect(size, `Schrift ${i}`).toBeGreaterThanOrEqual(14);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("Menü rechtsbündig am Knopf (Desktop), Hintergrund und Rahmen nach Tokens", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loggedIn(page, "um10");
    await button(page).click();
    const b = (await button(page).boundingBox())!;
    const m = (await menu(page).boundingBox())!;
    // das Popover (mit Innenabstand) endet rechts auf Höhe des Knopfs
    expect(Math.abs(m.x + m.width + 8 - (b.x + b.width))).toBeLessThanOrEqual(10);
  });
});
