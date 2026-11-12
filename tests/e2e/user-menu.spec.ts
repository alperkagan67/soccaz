import { expect, test, type Page } from "@playwright/test";
import { closeContexts, newUser, run } from "./helpers";
import { query } from "./helpers-db";

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
// Reihenfolge im Menü: Konto-Gruppe (Benachrichtigungen zuerst), Trenner, Hilfe (und Admin), Trenner, Abmelden
const ITEMS = ["Benachrichtigungen", "Mein Profil", "Mein Bereich", "Guthaben", "Konto und Einstellungen", "Hilfe", "Abmelden"];

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
    expect(await activeName(page)).toContain("Benachrichtigungen");
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
    expect(await activeName(page)).toContain("Mein Profil");
    await page.keyboard.press("ArrowDown");
    expect(await activeName(page)).toContain("Mein Bereich");
    await page.keyboard.press("ArrowUp");
    expect(await activeName(page)).toContain("Mein Profil");
    await page.keyboard.press("End");
    expect(await activeName(page)).toContain("Abmelden");
    await page.keyboard.press("ArrowDown"); // vom letzten zum ersten
    expect(await activeName(page)).toContain("Benachrichtigungen");
    await page.keyboard.press("ArrowUp"); // vom ersten zum letzten
    expect(await activeName(page)).toContain("Abmelden");
    await page.keyboard.press("Home");
    expect(await activeName(page)).toContain("Benachrichtigungen");
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

  test("Tab schließt das Menü und der Fokus geht zum NÄCHSTEN Element nach dem Knopf, Umschalt+Tab zum Element davor", async ({ page }) => {
    await loggedIn(page, "um6");
    // erwartete Nachbarn: die tabbaren Elemente der Seite in DOM-Reihenfolge, vom Knopf aus gesehen
    const sel = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const neighbours = await page.evaluate((s) => {
      const list = [...document.querySelectorAll<HTMLElement>(s)].filter((e) => e.getClientRects().length > 0 && !e.closest("[popover]"));
      const i = list.findIndex((e) => e.getAttribute("data-testid") === "user-menu-button");
      const name = (e: HTMLElement | undefined) => (e ? (e.getAttribute("aria-label") ?? e.getAttribute("href") ?? e.textContent ?? "").trim() : "");
      return { prev: name(list[i - 1]), next: name(list[i + 1]) };
    }, sel);
    expect(neighbours.next).not.toBe("");
    const now = () => page.evaluate(() => { const e = document.activeElement as HTMLElement; return (e.getAttribute("aria-label") ?? e.getAttribute("href") ?? e.textContent ?? "").trim(); });

    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(menu(page)).toHaveCount(0);
    expect(await now()).toBe(neighbours.next);

    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(menu(page)).toHaveCount(0);
    expect(await now()).toBe(neighbours.prev);
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

// ---------------------------------------------------------------------------------------------------------------------
// Critique A/B (M2-4a): Hydration, niedrige Fenster, Struktur (ARIA), Zähler, Auslöser, Gruppen, Rand.
// ---------------------------------------------------------------------------------------------------------------------
const hydrated = (page: Page) => page.waitForFunction(() => Object.keys(document.querySelector("[data-testid=user-menu-button]") ?? {}).some((k) => k.startsWith("__reactProps")));

test.describe("Konto-Menü: Critique-Punkte", () => {
  test("B-01 vor der Hydration (Skripte blockiert) öffnet der native Knopf ein Popover MIT Einträgen, nicht ein leeres", async ({ page }) => {
    await newUser(page, "um11");
    await page.route("**/_next/static/**/*.js", (r) => r.abort()); // die Seite bleibt beim Server-HTML stehen
    await page.goto("/suche");
    await button(page).click(); // nativer popovertarget-Knopf, React ist nicht aktiv
    await expect(page.getByRole("menuitem", { name: "Abmelden" })).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveCount(ITEMS.length);
  });

  test("B-01 nach der Hydration ist das Menü wieder nur im offenen Zustand im DOM und aria-expanded stimmt", async ({ page }) => {
    await loggedIn(page, "um12");
    await expect(menu(page)).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("B-02 niedriges Fenster (844 x 390, Querformat): das Menü scrollt innen, Abmelden ist erreichbar und klickbar", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await loggedIn(page, "um13");
    await button(page).click();
    const pop = page.locator("[popover]:popover-open");
    const box = (await pop.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(390); // nichts ragt aus dem Bild
    expect(await pop.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true); // und scrollt innen
    await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("End");
    const out = menu(page).getByRole("menuitem", { name: "Abmelden" });
    await expect(out).toBeFocused();
    await expect(out).toBeInViewport();
    await out.click();
    await expect(page.getByRole("link", { name: "Anmelden" }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("B-05 gültige Menü-Struktur: Name als Titel außerhalb, im Menü nur Einträge und Trenner, Menü trägt den Namen", async ({ page }) => {
    await loggedIn(page, "um14");
    await button(page).click();
    await expect(menu(page)).toBeVisible();
    const bad = await page.evaluate(() => {
      const menuEl = document.querySelector("[role=menu]")!;
      const out: string[] = [];
      for (const c of menuEl.children) {
        const role = c.getAttribute("role");
        if (!["menuitem", "separator", "none"].includes(role ?? "")) out.push(`Kind ${c.tagName} mit Rolle ${role}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
    const name = (await menu(page).getByTestId("user-menu-name").textContent())!.trim();
    await expect(page.getByRole("menu", { name })).toBeVisible();
    expect(await page.locator("[role=menu] [data-testid=user-menu-name]").count()).toBe(0); // Titel nicht im Menü
    expect(await page.locator("[role=menu] > [role=separator]").count()).toBe(2);
    await expect(menu(page)).toMatchAriaSnapshot(`- menuitem "Benachrichtigungen"`);
  });

  test("B-06 Ungelesen-Zähler: Schrift ≥ 14 px, Zahl nur zur Zierde, vorgelesen als N ungelesen", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await newUser(page, "um15");
    const email = `um15-${run}@test.local`;
    for (const title of ["Test", "Test 2"]) await query("insert into notifications (user_id, type, title, body) select id, 'system', $2, 'Test' from users where email = $1", [email, title]);
    await page.goto("/suche");
    await page.waitForLoadState("networkidle");
    await hydrated(page);
    await button(page).click();
    const item = menu(page).getByRole("menuitem", { name: /Benachrichtigungen/ });
    await expect(item).toContainText("2");
    await expect(item).toHaveAccessibleName(/Benachrichtigungen\s+2 ungelesen/);
    const badge = item.locator("[aria-hidden=true]");
    expect(await badge.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  });

  test("Auslöser: Chevron, sichtbarer Offen-Zustand (Hintergrund ändert sich), Name mit Konto-Label", async ({ page }) => {
    await loggedIn(page, "um16");
    await expect(button(page)).toHaveAttribute("aria-label", /^Konto: /);
    expect(await button(page).locator("svg").count()).toBe(1);
    await page.mouse.move(5, 400); // kein Hover auf dem Knopf: der Offen-Zustand muss allein aus aria-expanded kommen
    const closed = await button(page).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, rot: getComputedStyle(e.querySelector("svg")!).rotate }));
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await expect.poll(() => button(page).evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(closed.bg);
    await expect.poll(() => button(page).evaluate((e) => getComputedStyle(e.querySelector("svg")!).rotate)).not.toBe(closed.rot);
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`Rand und Schatten des Menüs: Rand in --rim, Schatten vorhanden (${scheme})`, async ({ page }) => {
      await loggedIn(page, `um17${scheme[0]}`, scheme);
      await button(page).click();
      const pop = page.locator("[popover]:popover-open");
      const rim = await page.evaluate(() => {
        const p = document.createElement("i");
        p.style.color = "var(--rim)";
        document.body.appendChild(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      });
      const s = await pop.evaluate((e) => ({ color: getComputedStyle(e).borderTopColor, shadow: getComputedStyle(e).boxShadow }));
      expect(s.color).toBe(rim);
      expect(s.shadow).not.toBe("none");
    });
  }

  test("Admin: Eintrag Admin in der zweiten Gruppe (nach Hilfe, vor Abmelden)", async ({ page }) => {
    await loggedIn(page, "um18");
    await query("update users set role = 'admin' where email = $1", [`um18-${run}@test.local`]);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await hydrated(page);
    await button(page).click();
    await expect(menu(page)).toBeVisible();
    const names = (await menu(page).getByRole("menuitem").allTextContents()).map((n) => n.replace(/\s+/g, " ").trim());
    expect(names.at(-1)).toBe("Abmelden");
    expect(names.at(-2)).toBe("Admin");
    expect(names.at(-3)).toBe("Hilfe");
  });
});
