import { expect, test, type Locator, type Page } from "@playwright/test";

// M2-3b: ConfirmDialog auf der Showcase /dev/komponenten (keine Datenbank, kein Login): Tastatur, Fokus, Fehler im Dialog, Handy-Breite.

async function open(page: Page, scheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByTestId("confirm-demo")).toBeVisible({ timeout: 60_000 });
}

const demo = (page: Page) => page.getByTestId("confirm-demo");
// der öffnende Knopf steht im DOM vor dem Dialog, der denselben Namen tragen kann
const trigger = (page: Page, name: string) => demo(page).getByRole("button", { name, exact: true }).first();
const dialogOf = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const insideDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
const activeText = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? "");

test.describe("ConfirmDialog: Tastatur und Fokus", () => {
  test("Enter öffnet, Fokus liegt auf Abbrechen (danger), Tab und Umschalt+Tab bleiben im Dialog (Fokus-Falle)", async ({ page }) => {
    await open(page);
    await trigger(page, "Spieler entfernen").focus();
    await page.keyboard.press("Enter");
    const dlg = dialogOf(page, "Spieler entfernen?");
    await expect(dlg).toBeVisible();
    expect(await activeText(page)).toBe("Abbrechen");
    // :modal = showModal() (Hintergrund inert), kein Pseudo-Dialog
    expect(await dlg.evaluate((el) => el.matches(":modal"))).toBe(true);

    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await insideDialog(page)).toBe(true);
      seen.add(await activeText(page));
    }
    expect([...seen].sort()).toEqual(["Abbrechen", "Spieler entfernen"]);
    // Umschalt+Tab vom ersten Element springt ans Ende
    await dlg.getByRole("button", { name: "Abbrechen" }).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await activeText(page)).toBe("Spieler entfernen");
    await page.keyboard.press("Tab");
    expect(await activeText(page)).toBe("Abbrechen");
  });

  test("Escape schließt, der Fokus kehrt zum öffnenden Knopf zurück, nichts wurde bestätigt", async ({ page }) => {
    await open(page);
    const btn = trigger(page, "Spieler entfernen");
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(dialogOf(page, "Spieler entfernen?")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogOf(page, "Spieler entfernen?")).toBeHidden();
    await expect(btn).toBeFocused();
    await expect(page.getByTestId("confirm-result")).toContainText("noch nichts bestätigt");
  });

  test("Escape während die Aktion läuft schließt den Dialog nicht; danach schließt er mit dem Ergebnis", async ({ page }) => {
    await open(page);
    await trigger(page, "Preis bestätigen").click();
    const dlg = dialogOf(page, "Preis bestätigen?");
    expect(await activeText(page)).toBe("Preis bestätigen"); // ohne danger startet der Fokus auf der Bestätigung
    await page.keyboard.press("Enter");
    await expect(dlg.getByRole("button", { name: "Bitte warten…" })).toHaveAttribute("aria-busy", "true"); // Aktion läuft (200 ms)
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(1); // Escape wird während der Aktion geschluckt
    await expect(page.getByTestId("confirm-result")).toContainText("noch nichts bestätigt");
    await expect(dlg).toBeHidden({ timeout: 15_000 }); // fertig: schließt von selbst
    await expect(page.getByTestId("confirm-result")).toContainText("Preis steht fest");
  });

  test("Abbrechen per Klick schließt ebenfalls und gibt den Fokus zurück", async ({ page }) => {
    await open(page);
    await trigger(page, "Spieler entfernen").click();
    await dialogOf(page, "Spieler entfernen?").getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialogOf(page, "Spieler entfernen?")).toBeHidden();
    await expect(trigger(page, "Spieler entfernen")).toBeFocused();
  });

  test("ohne danger startet der Fokus auf der Bestätigung", async ({ page }) => {
    await open(page);
    await trigger(page, "Preis bestätigen").click();
    expect(await activeText(page)).toBe("Preis bestätigen");
  });
});

test.describe("ConfirmDialog: Inhalt, Bestätigen, Fehler", () => {
  test("Betrag/Folge ist im Dialog sichtbar, mit dem Wort „Folge“", async ({ page }) => {
    await open(page);
    await trigger(page, "Preis bestätigen").click();
    const dlg = dialogOf(page, "Preis bestätigen?");
    await expect(dlg.getByTestId("confirm-consequence")).toContainText("Folge: 12,00 € pro Spieler werden abgebucht.");
    await expect(dlg).toHaveAccessibleDescription("Danach steht der Anteil je Spieler fest.");
  });

  test("Bestätigen führt die Aktion aus, schließt den Dialog und gibt den Fokus zurück", async ({ page }) => {
    await open(page);
    await trigger(page, "Spieler entfernen").click();
    await dialogOf(page, "Spieler entfernen?").getByRole("button", { name: "Spieler entfernen" }).click();
    await expect(dialogOf(page, "Spieler entfernen?")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId("confirm-result")).toContainText("Spieler entfernt");
    await expect(trigger(page, "Spieler entfernen")).toBeFocused();
  });

  test("Bestätigungswort: gesperrt bis „LÖSCHEN“ getippt ist, Startfokus auf Abbrechen (danger)", async ({ page }) => {
    await open(page);
    await trigger(page, "Konto löschen").click();
    const dlg = dialogOf(page, "Konto löschen?");
    const confirm = dlg.getByRole("button", { name: "Konto löschen" });
    expect(await activeText(page)).toBe("Abbrechen");
    await expect(confirm).toBeDisabled();
    const word = dlg.getByLabel("Zur Sicherheit: Tippe „LÖSCHEN“ ein.");
    await word.fill("loeschen");
    await expect(confirm).toBeDisabled();
    await word.fill("LÖSCHEN");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dlg).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId("confirm-result")).toContainText("Konto gelöscht");
    // beim nächsten Öffnen ist das Wort wieder leer
    await trigger(page, "Konto löschen").click();
    await expect(dlg.getByLabel("Zur Sicherheit: Tippe „LÖSCHEN“ ein.")).toHaveValue("");
    await expect(confirm).toBeDisabled();
  });

  test("Fehler der Aktion erscheint im Dialog (role=alert), der Dialog bleibt offen, der Knopf ist wieder bedienbar", async ({ page }) => {
    await open(page);
    await trigger(page, "Lobby verlassen").click();
    const dlg = dialogOf(page, "Lobby verlassen?");
    await dlg.getByRole("button", { name: "Lobby verlassen" }).click();
    const alert = dlg.getByRole("alert");
    await expect(alert).toContainText("Verlassen ist jetzt nicht mehr möglich", { timeout: 15_000 });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Lobby verlassen" })).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("confirm-result")).toContainText("noch nichts bestätigt");
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
    // ein erneutes Öffnen zeigt den alten Fehler nicht mehr
    await trigger(page, "Lobby verlassen").click();
    await expect(dlg.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("ConfirmDialog: Darstellung", () => {
  for (const scheme of ["dark", "light"] as const) {
    test(`danger: Rahmen 2 px in --danger, Hintergrund abgedunkelt (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      await trigger(page, "Spieler entfernen").click();
      const dlg = dialogOf(page, "Spieler entfernen?");
      const { width, color, expected, backdrop } = await dlg.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--danger)";
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        const cs = getComputedStyle(el);
        return { width: parseFloat(cs.borderTopWidth), color: cs.borderTopColor, expected, backdrop: getComputedStyle(el, "::backdrop").backgroundColor };
      });
      expect(width).toBe(2);
      expect(color).toBe(expected);
      // schwarz mit 70 % Deckkraft (Tailwind gibt es je nach Browser als rgba oder oklab aus)
      expect(backdrop).toMatch(/^(rgba\(0, 0, 0, 0\.7|oklab\(0 0 0 \/ 0\.7)/);
      await expect(dlg.getByRole("button", { name: "Spieler entfernen" })).toHaveCSS("border-top-width", "2px"); // Bestätigung: Rahmen, nicht nur Farbe
    });
  }
});

test.describe("ConfirmDialog: Handy 390 px", () => {
  test.use({ viewport: { width: 390, height: 780 } });

  const boxOf = async (l: Locator) => (await l.boundingBox())!;

  for (const [opener, title, confirmName] of [
    ["Spieler entfernen", "Spieler entfernen?", "Spieler entfernen"],
    ["Preis bestätigen", "Preis bestätigen?", "Preis bestätigen"],
    ["Konto löschen", "Konto löschen?", "Konto löschen"],
  ] as const) {
    test(`${opener}: Knöpfe sichtbar, ≥ 44 px, nichts abgeschnitten, kein seitliches Scrollen`, async ({ page }) => {
      await open(page);
      await trigger(page, opener).click();
      const dlg = dialogOf(page, title);
      const cancel = dlg.getByRole("button", { name: "Abbrechen" });
      const confirm = dlg.getByRole("button", { name: confirmName });
      await expect(cancel).toBeInViewport();
      await expect(confirm).toBeInViewport();
      for (const b of [await boxOf(cancel), await boxOf(confirm)]) {
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(390);
      }
      const d = await boxOf(dlg);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x + d.width).toBeLessThanOrEqual(390);
      expect(await dlg.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
});
