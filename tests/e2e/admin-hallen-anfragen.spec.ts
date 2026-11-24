import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, run } from "./helpers";
import { query, seedOwner } from "./helpers-db";
import { clickReady } from "./flows";

// 013 v3 AC-31, Nacharbeit der Admin-Ansicht (Review w2): Freischalten und Ablehnen per Dialog, Erfolgsmeldung mit Fokus außerhalb der Zeile, Name im zugänglichen Namen der Knöpfe,
// Pflichtgrund mit Zähler am Feld, "schon entschieden" (zweiter Admin war schneller). Nur CI (Shard in tests/e2e-shards.json); lokal nicht gelaufen.
// axe-core kommt aus node_modules (über andere Pakete vorhanden), ist KEINE eingetragene Abhängigkeit.
const AXE = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const hall = (n: string) => `E2E Anfragehalle ${n} ${run}`;
const names = [hall("A"), hall("B"), hall("C")];

test.beforeAll(async () => {
  for (const n of names) {
    await query("insert into venues (name, city, source, verified, active, approval_status, approval_requested_at) values ($1, 'Essen', 'manual', false, false, 'requested', now())", [n]);
  }
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await query("delete from venues where name = any($1)", [names]);
  await closeTestDb();
});

// ACHTUNG seedOwner: Admin 1 gibt es hoechstens einmal je Datenbank, seedOwner stuft einen frueheren Admin 1 zu Admin 2 zurueck. Darum nie zwei Kontexte mit verschiedenen Owner-Konten gleichzeitig
// offen halten und nach dem ersten Kontext schliessen, bevor ein zweiter Owner angelegt wird (Test 1 schliesst seinen Kontext je Durchlauf; afterEach schliesst den Rest).
async function adminPage(browser: Browser, key: string, viewport = { width: 1280, height: 900 }) {
  await seedOwner(key);
  const page = await (await browser.newContext({ viewport })).newPage();
  await devLogin(page, `${key}-${run}@test.local`, `Admin ${key}`, "/admin/hallen/anfragen");
  await page.waitForURL(/\/admin\/hallen\/anfragen/, { timeout: 90_000 });
  await page.waitForLoadState("networkidle");
  return page;
}

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string | null }[] }> } }).axe;
    const res = await axe.run(document.querySelector("main") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
  });
}

const row = (page: Page, name: string) => page.locator("li", { has: page.getByRole("heading", { name: new RegExp(name) }) });

test("Liste: Überschrift und Knopfnamen mit Hallennamen, keine schweren a11y-Verstöße (Handy und Desktop)", async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await adminPage(browser, `hra${viewport.width}`, viewport);
    await expect(page.getByRole("heading", { name: new RegExp(hall("A")) })).toBeVisible();
    await expect(page.getByRole("button", { name: `Freischalten Halle ${hall("A")}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Ablehnen Halle ${hall("B")}` })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.context().close();
  }
});

test("Abbrechen gibt den Fokus an den öffnenden Knopf zurück; nichts wird geändert", async ({ browser }) => {
  const page = await adminPage(browser, "hrc");
  const opener = page.getByRole("button", { name: `Ablehnen Halle ${hall("C")}` });
  await opener.click();
  const dialog = page.getByTestId("confirm-dialog").filter({ visible: true });
  await expect(dialog.getByRole("textbox", { name: /Grund der Ablehnung/ })).toBeFocused(); // Startfokus mit Feld = das Feld
  await clickReady(dialog.getByRole("button", { name: "Abbrechen" }));
  await expect(opener).toBeFocused();
  const [v] = await query<{ approval_status: string }>("select approval_status from venues where name = $1", [hall("C")]);
  expect(v.approval_status).toBe("requested");
});

test("Ablehnen: Grund Pflicht mit Zähler, Bestätigung erst ab 3 Zeichen; danach Meldung im Statusbereich mit Fokus, Zeile weg", async ({ browser }) => {
  const page = await adminPage(browser, "hrb");
  await row(page, hall("B")).getByRole("button", { name: /Ablehnen/ }).click();
  const dialog = page.getByTestId("confirm-dialog").filter({ visible: true });
  const confirm = dialog.getByRole("button", { name: "Halle ablehnen" });
  const reason = dialog.getByRole("textbox", { name: /Grund der Ablehnung/ });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await expect(dialog.getByTestId("confirm-field-count")).toContainText("0 von 200 Zeichen");
  await reason.fill("ab");
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await reason.fill("Adresse nicht auffindbar");
  await expect(dialog.getByTestId("confirm-field-count")).toContainText("24 von 200 Zeichen");
  await confirm.click();
  const status = page.getByTestId("requests-status");
  await expect(status).toContainText(`Halle „${hall("B")}“ abgelehnt.`);
  await expect(status).toBeFocused(); // die Zeile samt Auslöser ist weg: der Fokus liegt auf der Meldung
  await expect(row(page, hall("B"))).toHaveCount(0);
  const [v] = await query<{ approval_status: string; approval_reason: string; active: boolean }>("select approval_status, approval_reason, active from venues where name = $1", [hall("B")]);
  expect(v).toMatchObject({ approval_status: "rejected", approval_reason: "Adresse nicht auffindbar", active: false });
});

test("Freischalten: Rückfrage mit Folge, danach Meldung mit Fokus; Halle ist aktiv und freigegeben", async ({ browser }) => {
  const page = await adminPage(browser, "hra");
  await row(page, hall("A")).getByRole("button", { name: /Freischalten/ }).click();
  const dialog = page.getByTestId("confirm-dialog").filter({ visible: true });
  await expect(dialog.getByTestId("confirm-consequence")).toContainText("nicht zurücknehmen");
  await dialog.getByRole("button", { name: "Halle freischalten" }).click();
  const status = page.getByTestId("requests-status");
  await expect(status).toContainText(`Halle „${hall("A")}“ freigeschaltet.`);
  await expect(status).toBeFocused();
  await expect(row(page, hall("A"))).toHaveCount(0);
  const [v] = await query<{ approval_status: string; active: boolean }>("select approval_status, active from venues where name = $1", [hall("A")]);
  expect(v).toMatchObject({ approval_status: "approved", active: true });
});

test("schon entschieden (zweiter Admin war schneller): Meldung im Statusbereich, die Zeile verschwindet", async ({ browser }) => {
  const page = await adminPage(browser, "hrd");
  const [v] = await query<{ id: string }>("select id from venues where name = $1", [hall("C")]);
  await row(page, hall("C")).getByRole("button", { name: /Freischalten/ }).click();
  await query("update venues set approval_status = 'rejected', approval_reason = 'anderer Admin', active = false where id = $1", [v.id]); // jemand anderes hat entschieden
  const dialog = page.getByTestId("confirm-dialog").filter({ visible: true });
  await clickReady(dialog.getByRole("button", { name: "Halle freischalten" }));
  await expect(page.getByTestId("requests-status")).toContainText("keine offene Anfrage");
  await expect(row(page, hall("C"))).toHaveCount(0);
});
