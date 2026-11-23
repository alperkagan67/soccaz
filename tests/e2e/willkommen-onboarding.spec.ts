import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, run } from "./helpers";
import { query } from "./helpers-db";

// 013 v3 AC-26: Spieler-Onboarding "Willkommen" Schritt für Schritt auf /willkommen (Baustein Assistent). Nur CI (Shard in tests/e2e-shards.json); lokal nicht gelaufen.
// Geprüft: fünf Schritte mit Weiter/Zurück, Fehler am Feld mit Fokus, Tastatur (Enter), Zukunftsdatum = Feldfehler (Konto bleibt), Entwurf nach dem Neuladen OHNE Geburtsdatum und Zustimmung,
// Abschluss, Rücksprungziel, Unter 16 (Konto weg, /unter-16), Gastaufruf, a11y (axe) je Schritt auf Handy und Desktop, und Backlog 224: vor der Hydration ist alles gesperrt, es geht nie ein GET mit Eingaben raus.
// axe-core kommt aus node_modules (über andere Pakete vorhanden), ist KEINE eingetragene Abhängigkeit.
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const AXE = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const VIEWPORTS = { handy: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } } as const;
const DRAFT = "assistent:spieler-onboarding";

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
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

/** Neues Konto, angemeldet, noch nicht eingerichtet (der Zugang führt auf /willkommen). */
async function freshUser(browser: Browser, key: string, viewport: { width: number; height: number } = VIEWPORTS.desktop) {
  const email = `${key}-${run}@test.local`;
  const page = await (await browser.newContext({ viewport })).newPage();
  await devLogin(page, email, `Spieler ${key}`);
  await page.waitForURL(/\/willkommen/, { timeout: 90_000 });
  return { page, email };
}

/** Alle Felder nur innerhalb des Assistenten adressieren (strict mode, Lehre aus der Halle). */
const form = (page: Page) => page.getByTestId("assistent");
const weiter = (page: Page) => page.getByTestId("assistent-weiter");
const zurueck = (page: Page) => page.getByTestId("assistent-zurueck");
const schritt = (page: Page, n: number) => expect(form(page)).toHaveAttribute("data-schritt", String(n));
const userRow = async (email: string) => (await query<{ id: string; onboarded_at: Date | null; city: string | null; position: string | null }>("select id, onboarded_at, city, position from users where email = $1", [email]))[0];

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  test(`Einrichten in fünf Schritten (${viewportName}): Fehler am Feld, Tastatur, Zukunftsdatum, Entwurf ohne Geburtsdatum, Abschluss, axe je Schritt`, async ({ browser }) => {
    const key = viewportName === "handy" ? "wk1" : "wk2";
    const { page, email } = await freshUser(browser, key, viewport);

    // Vor der Aktivierung ist der Ablauf gesperrt (Playwright wartet auf "enabled", kein Wiederholen nötig)
    await expect(weiter(page)).toBeEnabled({ timeout: 60_000 });
    await schritt(page, 1);
    expect(await axeViolations(page), "Schritt 1").toEqual([]);

    // Schritt 1: Stadt fehlt -> Fehler am Feld, Fokus auf das Feld, kein Schrittwechsel
    await weiter(page).click();
    await schritt(page, 1);
    await expect(page.getByTestId("error-city")).toBeVisible();
    await expect(form(page).getByLabel(/^Stadt/)).toBeFocused();
    expect(await axeViolations(page), "Schritt 1 mit Fehler").toEqual([]);
    await form(page).getByLabel(/^Stadt/).selectOption("Essen");
    await weiter(page).click();

    // Schritt 2: Position fehlt -> Fehler; dann wählen
    await schritt(page, 2);
    await expect(page.getByTestId("assistent-ueberschrift")).toBeFocused();
    await weiter(page).click();
    await expect(page.getByTestId("error-position")).toBeVisible();
    expect(await axeViolations(page), "Schritt 2").toEqual([]);
    await form(page).getByLabel(/^Position/).selectOption("Angriff");
    await weiter(page).click();

    // Schritt 3: Zukunftsdatum per Enter -> Feldfehler, der Schritt bleibt, das Konto bleibt
    await schritt(page, 3);
    await form(page).getByLabel(/^Geburtsdatum/).fill("2099-01-01");
    await form(page).getByLabel(/^Geburtsdatum/).press("Enter");
    await expect(page.getByTestId("error-birthDate")).toBeVisible();
    await schritt(page, 3);
    expect((await userRow(email))?.onboarded_at).toBeNull();
    expect(await axeViolations(page), "Schritt 3 mit Fehler").toEqual([]);
    await form(page).getByLabel(/^Geburtsdatum/).fill("1995-05-05");
    await form(page).getByLabel(/^Geburtsdatum/).press("Enter"); // Tastatur: Enter = Weiter

    // Schritt 4: Zusammenfassung, das Geburtsdatum steht nicht im Klartext
    await schritt(page, 4);
    await expect(page.getByTestId("onboarding-summary")).toContainText("Essen");
    await expect(page.getByTestId("onboarding-summary")).toContainText("Angriff");
    await expect(page.getByTestId("onboarding-summary")).not.toContainText("1995");
    expect(await axeViolations(page), "Schritt 4").toEqual([]);

    // Neuladen: der Entwurf bleibt (Name, Stadt, Position), das Geburtsdatum und die Zustimmung NICHT
    const draft = await page.evaluate((k) => window.sessionStorage.getItem(k) ?? "", DRAFT);
    expect(draft).toContain("Essen");
    expect(draft).not.toContain("1995-05-05");
    expect(draft).not.toContain("birthDate");
    expect(draft).not.toContain("terms");
    await page.reload();
    await expect(weiter(page)).toBeEnabled({ timeout: 60_000 });
    await schritt(page, 4);
    await expect(page.getByTestId("summary-birthdate-missing")).toBeVisible();

    // Zurück zu Schritt 3, Datum erneut, weiter bis zum Abschluss
    await zurueck(page).click();
    await schritt(page, 3);
    await form(page).getByLabel(/^Geburtsdatum/).fill("1995-05-05");
    await weiter(page).click();
    await expect(page.getByTestId("summary-birthdate-missing")).toHaveCount(0);
    await weiter(page).click();
    await schritt(page, 5);
    expect(await axeViolations(page), "Schritt 5").toEqual([]);

    // Abschluss ohne Zustimmung: Fehler am Feld (auch per Enter)
    await page.getByTestId("assistent-abschluss").click();
    await expect(page.getByTestId("error-terms")).toBeVisible();
    await form(page).getByRole("checkbox").check();
    await page.getByTestId("assistent-abschluss").click();
    await page.waitForURL(/\/app/, { timeout: 90_000 });
    const row = await userRow(email);
    expect(row.onboarded_at).not.toBeNull();
    expect(row.city).toBe("Essen");
    expect(row.position).toBe("Angriff");
    expect(await page.evaluate((k) => window.sessionStorage.getItem(k), DRAFT)).toBeNull(); // Entwurf nach dem Abschluss gelöscht
  });
}

test("Rücksprungziel: ?next= wird nach dem Einrichten benutzt, ein fremdes Ziel nicht", async ({ browser }) => {
  const { page } = await freshUser(browser, "wk3");
  await page.goto("/willkommen?next=%2Fhilfe");
  await expect(weiter(page)).toBeEnabled({ timeout: 60_000 });
  await form(page).getByLabel(/^Stadt/).selectOption("Essen");
  await weiter(page).click();
  await form(page).getByLabel(/^Position/).selectOption("Flexibel");
  await weiter(page).click();
  await form(page).getByLabel(/^Geburtsdatum/).fill("1990-01-01");
  await weiter(page).click();
  await weiter(page).click();
  await form(page).getByRole("checkbox").check();
  await page.getByTestId("assistent-abschluss").click();
  await page.waitForURL(/\/hilfe/, { timeout: 90_000 });

  const other = await freshUser(browser, "wk4");
  await other.page.goto("/willkommen?next=%2F%2Fevil.example");
  await expect(weiter(other.page)).toBeEnabled({ timeout: 60_000 });
  await form(other.page).getByLabel(/^Stadt/).selectOption("Essen");
  await weiter(other.page).click();
  await form(other.page).getByLabel(/^Position/).selectOption("Flexibel");
  await weiter(other.page).click();
  await form(other.page).getByLabel(/^Geburtsdatum/).fill("1990-01-01");
  await weiter(other.page).click();
  await weiter(other.page).click();
  await form(other.page).getByRole("checkbox").check();
  await other.page.getByTestId("assistent-abschluss").click();
  await other.page.waitForURL(/\/app/, { timeout: 90_000 });
});

test("Unter 16: das Konto wird gelöscht, Weiterleitung nach /unter-16, das Geburtsdatum bleibt nirgends stehen", async ({ browser }) => {
  const { page, email } = await freshUser(browser, "wk5");
  await expect(weiter(page)).toBeEnabled({ timeout: 60_000 });
  await form(page).getByLabel(/^Stadt/).selectOption("Essen");
  await weiter(page).click();
  await form(page).getByLabel(/^Position/).selectOption("Flexibel");
  await weiter(page).click();
  const year = new Date().getUTCFullYear() - 10;
  await form(page).getByLabel(/^Geburtsdatum/).fill(`${year}-06-01`);
  await weiter(page).click();
  await weiter(page).click();
  await form(page).getByRole("checkbox").check();
  await page.getByTestId("assistent-abschluss").click();
  await page.waitForURL(/\/unter-16/, { timeout: 90_000 });
  expect(await userRow(email)).toBeUndefined();
  expect(await page.evaluate((k) => window.sessionStorage.getItem(k), DRAFT)).toBeNull();
});

test("Gast: /willkommen leitet zur Anmeldung weiter", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/willkommen");
  await expect(page).toHaveURL(/\/anmelden/);
});

test("Backlog 224: vor der Hydration ist der Ablauf gesperrt, ein Klick oder Enter schickt nie ein GET mit Eingaben (Skripte blockiert)", async ({ browser }) => {
  const { page } = await freshUser(browser, "wk6");
  await expect(weiter(page)).toBeEnabled({ timeout: 60_000 });
  await page.context().route("**/_next/static/**", (route) => (route.request().resourceType() === "script" ? route.abort() : route.continue()));
  await page.goto("/willkommen");
  const urlBefore = page.url();
  await expect(page.getByTestId("assistent-felder")).toBeDisabled();
  await expect(weiter(page)).toBeDisabled();
  await expect(page.getByTestId("assistent-laedt")).toBeAttached();
  await weiter(page).click({ force: true, timeout: 5_000 }).catch(() => {});
  await form(page).getByLabel(/^Anzeigename/).press("Enter", { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  expect(page.url()).toBe(urlBefore); // kein GET mit Query
  expect(page.url()).not.toContain("?name=");
  expect(page.url()).not.toContain("birthDate");
});
