import { expect, test } from "@playwright/test";
import { closeContexts, futureLocal, newUser, run } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";
import { PRIVATSPIEL_KOSTENLOS } from "@/lib/privatspiel-kostenlos";
import { zahlungsWorte } from "@/lib/zahlungen-aus";

// Zahlungen AUS (Go-live, Entscheid t2q): Privatspiele sind NUR kostenlos. Die Oberfläche blendet die Mietwahl aus, der Server erzwingt die Miete 0 (auch bei manipuliertem Formular).
// Gegenprobe Zahlungen AN: Mietwahl und Betrag wie bisher.
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function anlegen(page: import("@playwright/test").Page, halle: string) {
  await page.goto("/app/privatspiel/neu");
  await page.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "19:00"));
  await page.getByLabel("Halle und Adresse").fill(halle);
}

test("AUS: keine Mietwahl, Satz 'kostenlos', Wortscan; Spiel entsteht mit Miete 0", async ({ browser }) => {
  await setPlatformSetting("payments_enabled", false);
  const org = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await newUser(org, "pkaus");
  await anlegen(org, `E2E Gratis-AUS ${run}, Hauptstr. 1`);
  await expect(org.getByTestId("private-free")).toContainText(PRIVATSPIEL_KOSTENLOS);
  await expect(org.getByLabel("Miete als Betrag")).toHaveCount(0);
  await expect(org.getByLabel("Hallenmiete in Euro")).toHaveCount(0);
  const main = (await org.locator("main").textContent()) ?? "";
  expect(zahlungsWorte(main), "Wortscan Privatspiel-Formular").toEqual([]);
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = org.url().split("/").pop()!;
  const [m] = await query<{ price_cents: number; cost_cents: number }>("select price_cents, cost_cents from matches where id = $1", [id]);
  expect(m).toEqual({ price_cents: 0, cost_cents: 0 });
});

test("AUS: manipuliertes Formular (Betrag 120 €) wird serverseitig auf 0 gesetzt", async ({ browser }) => {
  await setPlatformSetting("payments_enabled", false);
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pkman");
  await anlegen(org, `E2E Manipuliert ${run}, Hauptstr. 2`);
  // das Formular wird im Browser verfälscht: Mietwahl "Betrag" und 120 Euro (so, als hätte jemand die Seite verändert oder die Anfrage nachgebaut)
  await org.evaluate(() => {
    const form = document.querySelector("form[data-testid], form") as HTMLFormElement;
    const mode = form.querySelector('input[name="rentMode"]') as HTMLInputElement;
    mode.value = "amount";
    const rent = document.createElement("input");
    rent.type = "hidden";
    rent.name = "rent";
    rent.value = "120";
    form.appendChild(rent);
  });
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = org.url().split("/").pop()!;
  const [m] = await query<{ price_cents: number; cost_cents: number }>("select price_cents, cost_cents from matches where id = $1", [id]);
  expect(m, "Miete trotz Betrag im Formular 0").toEqual({ price_cents: 0, cost_cents: 0 });
});

test("AN (Gegenprobe): Mietwahl und Betrag wie bisher, Miete 120 € wird gespeichert", async ({ browser }) => {
  await setPlatformSetting("payments_enabled", true);
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pkan");
  await anlegen(org, `E2E Mit-Miete ${run}, Hauptstr. 3`);
  await expect(org.getByLabel("Miete als Betrag")).toBeVisible();
  await expect(org.getByTestId("private-free")).toHaveCount(0);
  await org.getByLabel("Miete als Betrag").check();
  await org.getByLabel("Hallenmiete in Euro").fill("120");
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = org.url().split("/").pop()!;
  const [m] = await query<{ price_cents: number }>("select price_cents from matches where id = $1", [id]);
  expect(m.price_cents).toBe(12000);
});
