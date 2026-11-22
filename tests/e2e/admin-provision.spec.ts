import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, run } from "./helpers";
import { query, seedAdmin, seedOwner } from "./helpers-db";

// Vertrag 009 M2, neue Admin-Oberfläche (Provisionsformular, Rechnungen, Rechnungseinstellungen): Zugriff nur Admin 1, a11y (axe) und Sicht hell/dunkel.
// Hinweis: Die Seiten sind degradiert gebaut (Admin wird in 013 M7 neu gebaut, AC-15 offen, Backlog 125).
// axe-core kommt aus node_modules (über andere Pakete vorhanden), ist KEINE eingetragene Abhängigkeit.
const AXE = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const SHOTS = process.env.E2E_SHOT_DIR; // optional: Ordner für Sichtprüfungs-Bilder

test.describe.configure({ mode: "serial" });
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

const venueName = `E2E Prov Halle ${run}`;

async function login(browser: import("@playwright/test").Browser, key: string, owner: boolean, next: string) {
  await (owner ? seedOwner(key) : seedAdmin(key));
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await devLogin(page, `${key}-${run}@test.local`, `Admin ${key}`, next);
  await page.waitForURL(/\/(admin|app)/, { timeout: 90_000 }); // Anmeldung abwarten, bevor weiternavigiert wird
  return page;
}

async function axeViolations(page: Page, scope = "main") {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (sel) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const res = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(" ")) }));
  }, scope);
}

test("Admin 1 sieht Provisionsformular, Rechnungen und Rechnungseinstellungen; keine schweren a11y-Verstöße (axe) in hellem und dunklem Modus", async ({ browser }) => {
  await query("insert into venues (name, city, source, verified, active) values ($1, 'Essen', 'manual', true, true) on conflict do nothing", [venueName]);
  const page = await login(browser, "pv1", true, "/admin/hallen");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/admin/hallen");
    const form = page.getByTestId("commission-percent").first();
    await expect(form).toBeVisible();
    await expect(page.getByRole("button", { name: "Provision übernehmen" }).first()).toBeVisible();
    if (SHOTS) await form.locator("xpath=ancestor::form[1]").screenshot({ path: `${SHOTS}/hallen-${scheme}.png` });
    expect(await axeViolations(page), `axe /admin/hallen (${scheme})`).toEqual([]);

    await page.goto("/admin/finanzen/rechnungen");
    await expect(page.getByRole("heading", { name: "Rechnungen" })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rechnungen-${scheme}.png` });
    expect(await axeViolations(page), `axe /admin/finanzen/rechnungen (${scheme})`).toEqual([]);

    await page.goto("/admin/einstellungen");
    await expect(page.getByTestId("vat-mode")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rechnungseinstellungen übernehmen" })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/einstellungen-${scheme}.png`, fullPage: true });
    expect(await axeViolations(page), `axe /admin/einstellungen (${scheme})`).toEqual([]);

    await page.goto("/admin/finanzen");
    await expect(page.getByRole("link", { name: "Rechnungen" }).first()).toBeVisible();
    expect(await axeViolations(page), `axe /admin/finanzen (${scheme})`).toEqual([]);
  }
});

test("Admin 2 sieht das Provisionsformular nicht; Rechnungsseite und Abruf-Route sind für ihn zu (Weiterleitung bzw. 404)", async ({ browser }) => {
  const page = await login(browser, "pv2", false, "/admin/hallen");
  await expect(page.getByRole("heading", { name: /Hallen/ }).first()).toBeVisible();
  await expect(page.getByTestId("commission-percent")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Provision übernehmen" })).toHaveCount(0);
  await page.goto("/admin/finanzen/rechnungen");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/admin/einstellungen");
  await expect(page).toHaveURL(/\/app$/);
  const res = await page.request.get("/api/rechnungen/00000000-0000-4000-8000-000000000000");
  expect(res.status()).toBe(404);
  const bad = await page.request.get("/api/rechnungen/kein-uuid");
  expect(bad.status()).toBe(404);
});
