import { expect, test, type Page } from "@playwright/test";
import { closeContexts, devLogin, newUser, run } from "./helpers";
import { query, seedAdmin } from "./helpers-db";

// 013 v3 M2d (AC-25, AC-31): Hallen-Onboarding Schritt für Schritt auf /halle/anfragen. Nur CI (Shard in tests/e2e-shards.json); lokal nicht gelaufen.
// Geprüft im Browser: Eingabe, Weiter/Zurück, Fehler am Feld mit Fokus, Entwurf nach dem Neuladen ohne Kontakt und Zustimmung, Abschluss, Daten in der Datenbank, Halle bleibt unsichtbar.
test.setTimeout(150_000);

const hall = (n: string) => `E2E Onboardinghalle ${n} ${run}`;
const names: string[] = [];

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
  await query("delete from price_rules where venue_id in (select id from venues where name = any($1))", [names]);
  await query("delete from venue_access where venue_id in (select id from venues where name = any($1))", [names]);
  await query("delete from venues where name = any($1)", [names]);
});

const weiter = (page: Page) => page.getByTestId("assistent-weiter");
const heading = (page: Page) => page.getByTestId("assistent-ueberschrift");

async function fillHall(page: Page, name: string) {
  await page.getByLabel(/Name der Halle/).fill(name);
  await page.getByLabel(/^Stadt/).selectOption("Essen");
  await page.getByLabel(/^Adresse/).fill("Hallenweg 1");
  await page.getByLabel(/^Kontakt/).fill(`betrieb-${run}@test.local`);
}

test("Anfrage in fünf Schritten: Fehler am Feld, Entwurf ohne Kontakt, Abschluss, Halle bleibt unsichtbar", async ({ browser }) => {
  const n = "1";
  const page = await (await browser.newContext()).newPage();
  await newUser(page, `ho${n}`);
  names.push(hall(n));

  // Einstieg über die Hallenliste
  await page.goto("/hallen");
  await page.getByTestId("halle-anfragen-link").getByRole("link", { name: "Halle anfragen" }).click();
  await expect(page).toHaveURL(/\/halle\/anfragen$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("assistent-fortschritt")).toContainText("1");

  // Schritt 1 leer: Fehler am Feld, Fokus auf das erste fehlerhafte Feld, kein Schrittwechsel
  await weiter(page).click();
  await expect(page.getByTestId("assistent")).toHaveAttribute("data-schritt", "1");
  await expect(page.getByLabel(/Name der Halle/)).toBeFocused();
  await expect(page.getByTestId("error-name")).toBeVisible();

  await fillHall(page, hall(n));
  await weiter(page).click();
  await expect(page.getByTestId("assistent")).toHaveAttribute("data-schritt", "2");
  await expect(heading(page)).toBeFocused();

  // Schritt 2: Plätze (ungültig, dann gültig)
  await page.getByLabel(/Anzahl Plätze/).fill("0");
  await weiter(page).click();
  await expect(page.getByTestId("error-courts")).toBeVisible();
  await page.getByLabel(/Anzahl Plätze/).fill("3");
  await page.getByLabel(/^Boden/).fill("Kunstrasen");
  await page.getByLabel(/Duschen/).check();
  await weiter(page).click();

  // Schritt 3: Hallenmiete je Termin (Eingabe mit Komma)
  await expect(page.getByText("Hallenmiete je Termin").first()).toBeVisible();
  await page.getByLabel(/60 Minuten/).fill("40,00");
  await page.getByLabel(/90 Minuten/).fill("55");
  await weiter(page).click();

  // Zurück und Neuladen: der Entwurf bleibt (ohne Kontakt), der Kontakt steht NIE im sessionStorage
  const draft = await page.evaluate(() => window.sessionStorage.getItem("assistent:halle-onboarding") ?? "");
  expect(draft).toContain(hall(n));
  expect(draft).not.toContain("@test.local");
  expect(draft).not.toContain("contact");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("assistent")).toHaveAttribute("data-schritt", "4");
  await page.getByTestId("assistent-zurueck").click();
  await page.getByTestId("assistent-zurueck").click();
  await page.getByTestId("assistent-zurueck").click();
  await expect(page.getByLabel(/Name der Halle/)).toHaveValue(hall(n));
  await expect(page.getByLabel(/^Kontakt/)).toHaveValue(""); // Kontakt wird nicht aus dem Entwurf wiederhergestellt
  await page.getByLabel(/^Kontakt/).fill(`betrieb-${run}@test.local`);
  await weiter(page).click();
  await weiter(page).click();
  await weiter(page).click();

  // Zusammenfassung zeigt die Angaben, Abschluss ohne Zustimmung: Fehler am Feld
  await expect(page.getByTestId("onboarding-summary")).toContainText(hall(n));
  await expect(page.getByTestId("summary-price60")).toContainText("40,00");
  await weiter(page).click();
  await expect(page.getByTestId("onboarding-terms-draft")).toContainText("ENTWURF");
  await page.getByTestId("assistent-abschluss").click();
  await expect(page.getByTestId("error-terms")).toBeVisible();
  await page.getByLabel(/Ich bestätige die Bedingungen/).check();
  await page.getByTestId("assistent-abschluss").click();
  await expect(page.getByTestId("onboarding-done")).toBeVisible();
  await expect(page.getByTestId("assistent-fertig")).toBeFocused();

  // Entwurf nach dem Abschluss gelöscht; Datenbank: angefragt, inaktiv, 3 Plätze, zwei Preiszeilen
  expect(await page.evaluate(() => window.sessionStorage.getItem("assistent:halle-onboarding"))).toBeNull();
  const [v] = await query<{ id: string; approval_status: string; active: boolean; court_count: number; is_partner: boolean }>("select id, approval_status, active, court_count, is_partner from venues where name = $1", [hall(n)]);
  expect(v).toMatchObject({ approval_status: "requested", active: false, court_count: 3, is_partner: false });
  const rules = await query<{ duration_min: number; price_cents: number }>("select duration_min, price_cents from price_rules where venue_id = $1 order by duration_min", [v.id]);
  expect(rules.map((r) => [r.duration_min, r.price_cents])).toEqual([[60, 4000], [90, 5500]]);

  // Die Halle ist öffentlich nicht sichtbar; der Betreiber sieht den Stand auf /halle
  await page.goto("/hallen");
  await expect(page.getByText(hall(n))).toHaveCount(0);
  await page.goto("/halle");
  await expect(page.getByTestId("venue-requested")).toContainText(hall(n));
});

test("Admin-Konto: Hinweis statt Formular", async ({ browser }) => {
  await seedAdmin("hoa");
  const page = await (await browser.newContext()).newPage();
  await devLogin(page, `hoa-${run}@test.local`, "Admin Onboarding", "/halle/anfragen");
  await expect(page.getByTestId("onboarding-admin-hint")).toBeVisible();
  await expect(page.getByTestId("assistent")).toHaveCount(0);
});
