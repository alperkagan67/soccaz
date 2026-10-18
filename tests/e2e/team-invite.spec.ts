import { expect, test } from "@playwright/test";
import { devLogin, onboard, run, closeContexts } from "./helpers";

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Team gründen, Link erzeugen, zweiter Spieler tritt bei", async ({ browser }) => {
  // Spieler A
  const a = await (await browser.newContext()).newPage();
  await devLogin(a, `a-${run}@test.local`, "Spieler Anna");
  await onboard(a, "1995-05-05");
  await expect(a).toHaveURL(/\/app$/);

  await a.getByRole("link", { name: "Team gründen" }).first().click();
  await a.getByLabel("Teamname").fill(`FC Test ${run}`);
  await a.getByRole("button", { name: "Team gründen" }).click();
  await expect(a).toHaveURL(/\/teams\/fc-test-/);
  await expect(a.getByRole("heading", { name: `FC Test ${run}` })).toBeVisible();

  // Klick wiederholen, bis die Seite hydriert ist
  await expect(async () => {
    await a.getByRole("button", { name: "Einladungslink erstellen" }).click();
    await expect(a.getByLabel("Einladungslink")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  const link = await a.getByLabel("Einladungslink").inputValue();
  expect(link).toMatch(/\/einladung\/[\w-]{20,}$/);

  // Spieler B über den Link, ohne Login
  const b = await (await browser.newContext()).newPage();
  await b.goto(link);
  await expect(b.getByRole("heading", { name: `FC Test ${run}` })).toBeVisible();
  await b.getByRole("link", { name: "Anmelden und beitreten" }).click();
  await b.getByLabel("E-Mail").fill(`b-${run}@test.local`);
  await b.getByLabel("Name").fill("Spieler Ben");
  await b.getByRole("button", { name: "Als Dev-Nutzer anmelden" }).click();
  await onboard(b, "1998-01-01");
  // nach dem Onboarding zurück zum Einladungslink
  await expect(b).toHaveURL(/\/einladung\//);
  await b.getByRole("button", { name: "Team beitreten" }).click();
  await expect(b).toHaveURL(/\/teams\/fc-test-/);
  await expect(b.getByText("Spieler Ben")).toBeVisible();
  await expect(b.getByText("Kader (2)")).toBeVisible();

  // Nicht-Admin sieht keinen Einladungsbereich
  await expect(b.getByRole("button", { name: "Einladungslink erstellen" })).toHaveCount(0);

  // Doppelter Teamname wird abgelehnt
  await a.goto("/app/teams/neu");
  await a.getByLabel("Teamname").fill(`fc test ${run}`);
  await a.getByRole("button", { name: "Team gründen" }).click();
  await expect(a.getByText("bereits vergeben")).toBeVisible();
});

test("unter 16: Konto wird gelöscht", async ({ page }) => {
  const year = new Date().getFullYear() - 12;
  await devLogin(page, `kid-${run}@test.local`, "Kind");
  await onboard(page, `${year}-06-01`);
  await expect(page).toHaveURL(/\/unter-16/);
  // Anmeldung danach: Konto existiert nicht mehr, Onboarding beginnt von vorn
  await devLogin(page, `kid-${run}@test.local`, "Kind");
  await expect(page).toHaveURL(/\/willkommen/);
});

test("ohne Login keine geschützten Seiten", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/anmelden/);
  await page.goto("/app/teams/neu");
  await expect(page).toHaveURL(/\/anmelden/);
});
