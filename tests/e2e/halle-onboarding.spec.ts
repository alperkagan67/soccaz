import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, newUser, run } from "./helpers";
import { query, seedAdmin, userIdByEmail } from "./helpers-db";

// 013 v3 M2d (AC-25, AC-26, AC-31): Hallen-Onboarding Schritt für Schritt auf /halle/anfragen. Nur CI (Shard in tests/e2e-shards.json); lokal nicht gelaufen, dies ist der erste
// Browserlauf des Bausteins `Assistent`. Geprüft: Eingabe, Weiter/Zurück, Fehler am Feld mit Fokus, Tastatur (Enter), Entwurf nach dem Neuladen ohne Kontakt und Zustimmung,
// Abschluss, Daten in der Datenbank, Halle bleibt unsichtbar; erneute Anfrage mit getrenntem Entwurf und Vorbelegung; Gastaufruf; a11y (axe) je Schritt auf Handy und Desktop.
// axe-core kommt aus node_modules (über andere Pakete vorhanden), ist KEINE eingetragene Abhängigkeit.
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const AXE = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const VIEWPORTS = { handy: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } } as const;
const DRAFT = "assistent:halle-onboarding";

const hall = (n: string) => `E2E Onboardinghalle ${n} ${run}`;
const names: string[] = [];

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
  await query("delete from price_rules where venue_id in (select id from venues where name = any($1))", [names]);
  await query("delete from venue_access where venue_id in (select id from venues where name = any($1))", [names]);
  await query("delete from venues where name = any($1)", [names]);
});
test.afterAll(async () => {
  await closeTestDb();
});

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const res = await axe.run(document.querySelector("main") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(" ")) }));
  });
}

async function userPage(browser: Browser, key: string, viewport: { width: number; height: number }) {
  const page = await (await browser.newContext({ viewport })).newPage();
  await newUser(page, key);
  return page;
}

/** Alle Felder nur innerhalb des Assistenten adressieren: die Kopfzeile oder eine noch sichtbare Vorseite (/hallen hat ein Stadt-Auswahlfeld) kann dieselben Beschriftungen haben (CI-Lauf zu PR 240, strict mode). */
const form = (page: Page) => page.getByTestId("assistent");
const weiter = (page: Page) => page.getByTestId("assistent-weiter");
const zurueck = (page: Page) => page.getByTestId("assistent-zurueck");
const heading = (page: Page) => page.getByTestId("assistent-ueberschrift");
const schritt = (page: Page, n: number) => expect(page.getByTestId("assistent")).toHaveAttribute("data-schritt", String(n));
const contact = () => `betrieb-${run}@test.local`;

async function fillHall(page: Page, name: string) {
  await form(page).getByLabel(/Name der Halle/).fill(name);
  await form(page).getByLabel(/^Stadt/).selectOption("Essen");
  await form(page).getByLabel(/^Adresse/).fill("Hallenweg 1");
  await form(page).getByLabel(/^Kontakt/).fill(contact());
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  test(`Anfrage in fünf Schritten (${viewportName}): Fehler am Feld, Entwurf ohne Kontakt, Hinweis, Abschluss, Halle bleibt unsichtbar, axe je Schritt`, async ({ browser }) => {
    const n = viewportName === "handy" ? "1" : "2";
    const page = await userPage(browser, `ho${n}`, viewport);
    names.push(hall(n));

    // Einstieg über die Hallenliste
    await page.goto("/hallen");
    await page.getByTestId("halle-anfragen-link").getByRole("link", { name: "Halle anfragen" }).click();
    await expect(page).toHaveURL(/\/halle\/anfragen$/);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("assistent-fortschritt")).toContainText("1");
    expect(await axeViolations(page), "Schritt 1").toEqual([]);

    // Schritt 1 leer: Fehler am Feld, Fokus auf das erste fehlerhafte Feld, kein Schrittwechsel
    await weiter(page).click();
    await schritt(page, 1);
    await expect(form(page).getByLabel(/Name der Halle/)).toBeFocused();
    await expect(page.getByTestId("error-name")).toBeVisible();
    expect(await axeViolations(page), "Schritt 1 mit Fehlern").toEqual([]);

    // Tastatur: Enter im Namensfeld geht weiter (ein Submit-Knopf), sobald alles stimmt
    await fillHall(page, hall(n));
    await form(page).getByLabel(/Name der Halle/).press("Enter");
    await schritt(page, 2);
    await expect(heading(page)).toBeFocused();
    expect(await axeViolations(page), "Schritt 2").toEqual([]);

    // Schritt 2: Plätze (ungültig, dann gültig)
    await form(page).getByLabel(/Anzahl Plätze/).fill("0");
    await weiter(page).click();
    await expect(page.getByTestId("error-courts")).toBeVisible();
    await form(page).getByLabel(/Anzahl Plätze/).fill("3");
    await form(page).getByLabel(/^Boden/).fill("Kunstrasen");
    await form(page).getByLabel(/Duschen/).check();
    await weiter(page).click();

    // Schritt 3: Hallenmiete je Termin (Eingabe mit Komma)
    await schritt(page, 3);
    await expect(page.getByText("Hallenmiete je Termin").first()).toBeVisible();
    expect(await axeViolations(page), "Schritt 3").toEqual([]);
    await form(page).getByLabel(/60 Minuten/).fill("40,00");
    await form(page).getByLabel(/90 Minuten/).fill("55");
    await weiter(page).click();
    await schritt(page, 4);
    expect(await axeViolations(page), "Schritt 4").toEqual([]);

    // Neuladen: der Entwurf bleibt (ohne Kontakt), der Kontakt steht NIE im sessionStorage; die Zusammenfassung weist auf den fehlenden Kontakt hin
    const draft = await page.evaluate((k) => window.sessionStorage.getItem(k) ?? "", DRAFT);
    expect(draft).toContain(hall(n));
    expect(draft).not.toContain("@test.local");
    expect(draft).not.toContain("contact");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await schritt(page, 4);
    await expect(page.getByTestId("summary-contact-missing")).toBeVisible();
    await zurueck(page).click();
    await zurueck(page).click();
    await zurueck(page).click();
    await expect(form(page).getByLabel(/Name der Halle/)).toHaveValue(hall(n));
    await expect(form(page).getByLabel(/^Kontakt/)).toHaveValue(""); // Kontakt wird nicht aus dem Entwurf wiederhergestellt
    await form(page).getByLabel(/^Kontakt/).fill(contact());
    await weiter(page).click();
    await weiter(page).click();
    await weiter(page).click();

    // Zusammenfassung zeigt die Angaben und keinen Hinweis mehr; Abschluss ohne Zustimmung: Fehler am Feld, auch per Enter
    await expect(page.getByTestId("onboarding-summary")).toContainText(hall(n));
    await expect(page.getByTestId("summary-price60")).toContainText("40,00");
    await expect(page.getByTestId("summary-contact-missing")).toHaveCount(0);
    await weiter(page).click();
    await schritt(page, 5);
    await expect(page.getByTestId("onboarding-terms-draft")).toContainText("ENTWURF");
    expect(await axeViolations(page), "Schritt 5").toEqual([]);
    await page.getByTestId("assistent-abschluss").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("error-terms")).toBeVisible();
    await form(page).getByLabel(/Ich bestätige die Bedingungen/).check();
    await page.getByTestId("assistent-abschluss").click();
    await expect(page.getByTestId("onboarding-done")).toBeVisible();
    await expect(page.getByTestId("assistent-fertig")).toBeFocused();

    // Entwurf nach dem Abschluss gelöscht; Datenbank: angefragt, inaktiv, 3 Plätze, zwei Preiszeilen
    expect(await page.evaluate((k) => window.sessionStorage.getItem(k), DRAFT)).toBeNull();
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
}

test("Tastatur: Enter im letzten Schritt ohne Zustimmung zeigt den Feldfehler, nichts wird angelegt", async ({ browser }) => {
  const n = "3";
  const page = await userPage(browser, `ho${n}`, VIEWPORTS.desktop);
  names.push(hall(n));
  await page.goto("/halle/anfragen");
  await page.waitForLoadState("networkidle");
  await fillHall(page, hall(n));
  await weiter(page).click();
  await form(page).getByLabel(/Anzahl Plätze/).fill("2");
  await form(page).getByLabel(/Anzahl Plätze/).press("Enter");
  await form(page).getByLabel(/60 Minuten/).fill("30");
  await form(page).getByLabel(/90 Minuten/).fill("45");
  await form(page).getByLabel(/90 Minuten/).press("Enter");
  await weiter(page).click(); // Zusammenfassung -> Abschluss
  await schritt(page, 5);
  await page.getByTestId("assistent-abschluss").focus();
  await page.keyboard.press("Enter"); // Enter auf dem einen Submit-Knopf
  await expect(page.getByTestId("error-terms")).toBeVisible();
  await expect(page.getByTestId("onboarding-done")).toHaveCount(0);
  expect(await query("select 1 from venues where name = $1", [hall(n)])).toHaveLength(0);
});

test("Erneute Anfrage: Vorbelegung aus der abgelehnten Halle (ohne Kontakt), eigener Entwurf, ein angefangener neuer Antrag bleibt unberührt, die Halle wird wieder angefragt", async ({ browser }) => {
  const n = "4";
  const page = await userPage(browser, `ho${n}`, VIEWPORTS.desktop);
  names.push(hall(n));
  const userId = await userIdByEmail(`ho${n}-${run}@test.local`);
  const [h] = await query<{ id: string }>(
    "insert into venues (name, city, address, contact, surface, court_count, has_showers, approval_status, active, approval_reason, approval_decided_at) values ($1, 'Essen', 'Alte Straße 5', 'alt@test.local', 'Hartboden', 4, true, 'rejected', false, 'Angaben unvollständig', now()) returning id",
    [hall(n)],
  );
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, userId]);
  await query("insert into price_rules (venue_id, duration_min, price_cents, cost_cents) values ($1, 60, 4200, 4200), ($1, 90, 6000, 6000)", [h.id]);

  // ein angefangener NEUER Antrag (Entwurf unter der Standard-Kennung)
  await page.goto("/halle/anfragen");
  await page.waitForLoadState("networkidle");
  await form(page).getByLabel(/Name der Halle/).fill("Anderer Entwurf");
  await form(page).getByLabel(/^Stadt/).selectOption("Bochum");
  await form(page).getByLabel(/^Adresse/).fill("Neue Straße 9");
  await form(page).getByLabel(/^Kontakt/).fill(contact());
  await weiter(page).click();
  await schritt(page, 2);

  // erneute Anfrage: Werte der abgelehnten Halle, NICHT die des angefangenen Antrags; Kontakt leer
  await page.goto("/halle");
  await expect(page.getByTestId("venue-rejected")).toContainText("Angaben unvollständig");
  await page.getByTestId("venue-resubmit").click();
  await expect(page).toHaveURL(new RegExp(`/halle/anfragen\\?erneut=${h.id}`));
  await page.waitForLoadState("networkidle");
  await schritt(page, 1);
  await expect(form(page).getByLabel(/Name der Halle/)).toHaveValue(hall(n));
  await expect(form(page).getByLabel(/^Stadt/)).toHaveValue("Essen");
  await expect(form(page).getByLabel(/^Adresse/)).toHaveValue("Alte Straße 5");
  await expect(form(page).getByLabel(/^Kontakt/)).toHaveValue("");
  await form(page).getByLabel(/^Kontakt/).fill(contact());
  await weiter(page).click();
  await expect(form(page).getByLabel(/Anzahl Plätze/)).toHaveValue("4");
  await expect(form(page).getByLabel(/^Boden/)).toHaveValue("Hartboden");
  await weiter(page).click();
  await expect(form(page).getByLabel(/60 Minuten/)).toHaveValue("42,00");
  await expect(form(page).getByLabel(/90 Minuten/)).toHaveValue("60,00");
  await weiter(page).click();
  await weiter(page).click();
  await form(page).getByLabel(/Ich bestätige die Bedingungen/).check();
  await page.getByTestId("assistent-abschluss").click();
  await expect(page.getByTestId("onboarding-done")).toBeVisible();
  const [after] = await query<{ approval_status: string; contact: string }>("select approval_status, contact from venues where id = $1", [h.id]);
  expect(after).toMatchObject({ approval_status: "requested", contact: contact() });
  expect(await query("select 1 from price_rules where venue_id = $1", [h.id])).toHaveLength(2); // ersetzt, nicht verdoppelt

  // der angefangene neue Antrag liegt weiter unter seiner eigenen Kennung
  await page.goto("/halle/anfragen");
  await page.waitForLoadState("networkidle");
  await schritt(page, 2); // der Entwurf wird an der Stelle wiederhergestellt, an der er verlassen wurde (Schritt 2)
  await zurueck(page).click();
  await expect(form(page).getByLabel(/Name der Halle/)).toHaveValue("Anderer Entwurf");
});

test("Gastaufruf: Weiterleitung zur Anmeldung mit Rückkehr auf /halle/anfragen", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/halle/anfragen");
  await expect(page).toHaveURL(/\/anmelden\?next=%2Fhalle%2Fanfragen/);
});

test("Admin-Konto: Hinweis statt Formular", async ({ browser }) => {
  await seedAdmin("hoa");
  const page = await (await browser.newContext()).newPage();
  await devLogin(page, `hoa-${run}@test.local`, "Admin Onboarding", "/halle/anfragen");
  await expect(page.getByTestId("onboarding-admin-hint")).toBeVisible();
  await expect(page.getByTestId("assistent")).toHaveCount(0);
});
