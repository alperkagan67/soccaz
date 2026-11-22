import { expect, test, type Page } from "@playwright/test";

// M2-3a: Tastatur, Fokus, Fehler am Feld und Breite von Form/Field/DateTimeField auf der Showcase /dev/komponenten (keine Datenbank, kein Login).

async function open(page: Page, scheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/dev/komponenten", { timeout: 90_000 });
  await expect(page.getByTestId("form-demo")).toBeVisible({ timeout: 60_000 });
}

const demo = (page: Page) => page.getByTestId("form-demo");
const activeId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.id ?? "");

test.describe("Form, Field, DateTimeField: Tastatur und Fehler", () => {
  test("Tab-Reihenfolge entspricht der Reihenfolge der Felder, der Fokusring ist sichtbar (--focus)", async ({ page }) => {
    await open(page);
    await demo(page).getByLabel("Teamname").focus();
    const order: string[] = [await activeId(page)];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      order.push(await activeId(page));
    }
    expect(order).toEqual(["field-teamname", "field-stadt", "field-hinweis", "field-anstoss"]);
    // datetime-local ist nativ in Abschnitte (Tag, Monat, Jahr, Stunde, Minute) geteilt: weitere Tab-Schritte bleiben im Feld, danach kommt der Speichern-Knopf
    for (let i = 0; i < 8 && (await activeId(page)) === "field-anstoss"; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => { const el = document.activeElement as HTMLButtonElement; return el.tagName.toLowerCase() + ":" + el.type; })).toBe("button:submit");

    // Fokusring des Speichern-Knopfs: sichtbar und in der Farbe --focus (nicht Orange)
    // (Tailwind-Klasse transition-colors blendet outline-color 150 ms lang ein: erst nach dem Übergang messen)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const probe = document.createElement("span");
          probe.style.color = "var(--focus)";
          document.body.appendChild(probe);
          const focusColor = getComputedStyle(probe).color;
          probe.remove();
          const cs = getComputedStyle(el);
          return cs.outlineStyle === "solid" && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor === focusColor;
        }),
      )
      .toBe(true);
  });

  test("Pflichtfeld leer: die Speichern-Handlung schickt nichts ab, der Fokus liegt auf dem Pflichtfeld", async ({ page }) => {
    await open(page);
    await demo(page).getByLabel("Teamname").fill("");
    await demo(page).getByRole("button", { name: "Speichern" }).click();
    await expect.poll(() => activeId(page)).toBe("field-teamname");
    await expect(demo(page).getByRole("status")).toHaveCount(0);
    await expect(demo(page).getByText("Pflichtfeld").first()).toBeVisible(); // Pflichtmarke mit Wort
  });

  test("Fehler am Feld: Text unter dem Feld, aria-invalid, aria-describedby, Fokus auf dem Feld, Eingaben bleiben erhalten", async ({ page }) => {
    await open(page);
    await demo(page).getByLabel("Teamname").fill("vergeben");
    await demo(page).getByLabel("Hinweis").fill("bleibt stehen");
    await demo(page).getByRole("button", { name: "Speichern" }).click(); // Fokus liegt auf dem Knopf: er muss zum Feld springen

    const err = demo(page).getByTestId("error-teamname");
    await expect(err).toBeVisible({ timeout: 15_000 });
    await expect(err).toContainText("Dieser Teamname ist schon vergeben.");
    await expect(err).toHaveAttribute("role", "alert");

    const name = demo(page).getByLabel("Teamname");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const describedBy = (await name.getAttribute("aria-describedby")) ?? "";
    expect(describedBy.split(" ")).toContain("field-teamname-error");
    expect(describedBy.split(" ")).toContain("field-teamname-hint");
    await expect.poll(() => activeId(page)).toBe("field-teamname"); // Fehlerfokus auf das erste fehlerhafte Feld
    await expect(name).toHaveValue("vergeben"); // Eingaben bleiben
    await expect(demo(page).getByLabel("Hinweis")).toHaveValue("bleibt stehen");
    await expect(demo(page).getByText("Bitte prüfe die markierten Felder.")).toBeVisible();

    // Fehler steht UNTER dem Feld
    const boxField = (await name.boundingBox())!;
    const boxError = (await err.boundingBox())!;
    expect(boxError.y).toBeGreaterThan(boxField.y + boxField.height - 1);
  });

  test("Erfolg: Statusmeldung, Formular wird geleert, Fehler weg", async ({ page }) => {
    await open(page);
    await demo(page).getByLabel("Teamname").fill("Rote Teufel");
    await demo(page).getByLabel("Teamname").press("Enter");
    await expect(demo(page).getByRole("status")).toContainText("Gespeichert.", { timeout: 15_000 });
    await expect(demo(page).getByLabel("Teamname")).toHaveValue("");
    await expect(demo(page).getByTestId("error-teamname")).toHaveCount(0);
  });

  test("DateTimeField: unter dem Mindestwert schickt der Browser nichts ab, der Fokus liegt auf dem Feld", async ({ page }) => {
    await open(page);
    await demo(page).getByLabel("Teamname").fill("Rote Teufel");
    await demo(page).getByLabel("Anstoß").fill("2026-10-01T09:00");
    await demo(page).getByRole("button", { name: "Speichern" }).click();
    await expect.poll(() => activeId(page)).toBe("field-anstoss");
    await expect(demo(page).getByRole("status")).toHaveCount(0);
    await expect(demo(page).getByTestId("error-anstoss")).toHaveCount(0);
  });

  test("DateTimeField: Fehler vom Server steht am Feld, der Fokus liegt dort", async ({ page }) => {
    await open(page);
    await demo(page).getByLabel("Teamname").fill("Rote Teufel");
    await demo(page).getByLabel("Anstoß").fill("2026-11-23T15:07");
    await demo(page).getByLabel("Teamname").press("Enter");
    const err = demo(page).getByTestId("error-anstoss");
    await expect(err).toContainText("Bitte eine volle Viertelstunde wählen.", { timeout: 15_000 });
    await expect.poll(() => activeId(page)).toBe("field-anstoss");
    await expect(demo(page).getByLabel("Anstoß")).toHaveAttribute("aria-invalid", "true");
    // Hinweis nennt Zeitzone und Grenzen in Worten
    await expect(demo(page).getByText("Uhrzeit in deutscher Zeit")).toBeVisible();
    await expect(demo(page).getByText(/Frühestens So\., 01\.11\., 10:00 Uhr/)).toBeVisible();
  });
});

test.describe("Breite und Zielgrößen auf 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const scheme of ["dark", "light"] as const) {
    test(`Felder füllen die Breite, sind mindestens 44 px hoch, 16 px Schrift, kein horizontales Scrollen (${scheme})`, async ({ page }) => {
      await open(page, scheme);
      const form = demo(page).locator("form");
      const formBox = (await form.boundingBox())!;
      for (const label of ["Teamname", "Stadt", "Hinweis", "Anstoß"]) {
        const control = demo(page).getByLabel(label);
        const box = (await control.boundingBox())!;
        expect(box.width, `${label} Breite`).toBeGreaterThanOrEqual(formBox.width - 2 * 14); // innerhalb der Fieldset-Polsterung
        expect(box.x + box.width, `${label} rechter Rand`).toBeLessThanOrEqual(390);
        expect(box.height, `${label} Höhe`).toBeGreaterThanOrEqual(43.5);
        const size = await control.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(size, `${label} Schriftgröße`).toBeGreaterThanOrEqual(16);
      }
      const submit = (await demo(page).getByRole("button", { name: "Speichern" }).boundingBox())!;
      expect(submit.height).toBeGreaterThanOrEqual(43.5);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
