import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, run } from "./helpers";
import { seedAdmin, seedOwner } from "./helpers-db";

// Vertrag 009 M3c, Admin-Seite Beweisprotokoll: Zugriff nur Admin 1, a11y (axe) in hellem und dunklem Modus; Admin 2 wird weitergeleitet, die Routen antworten 404.
// ENTWURF, NICHT GELAUFEN (ohne Datenbank/Browser geschrieben). Die Seite ist degradiert gebaut (Admin wird in 013 M7 neu gebaut, Impeccable AC-15 offen, Backlog 125).
// axe-core kommt aus node_modules (über andere Pakete vorhanden), ist KEINE eingetragene Abhängigkeit.
const AXE = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

test.describe.configure({ mode: "serial" });
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

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

test("Admin 1 sieht das Beweisprotokoll (Kopf-Hash, Anzahl, Prüfstand, Export-Link); keine schweren a11y-Verstöße (axe) in hellem und dunklem Modus", async ({ browser }) => {
  const page = await login(browser, "bw1", true, "/admin/beweis");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/admin/beweis");
    await expect(page.getByRole("heading", { name: "Beweisprotokoll" })).toBeVisible();
    await expect(page.getByTestId("evidence-count")).toBeVisible();
    await expect(page.getByTestId("evidence-head-hash")).toBeVisible();
    await expect(page.getByTestId("evidence-checked-at")).toBeVisible();
    await expect(page.getByRole("link", { name: "Gesamtketten-Export (NDJSON)" })).toBeVisible();
    expect(await axeViolations(page), `axe /admin/beweis (${scheme})`).toEqual([]);
  }
  const nav = page.getByRole("navigation", { name: "Admin-Bereich" });
  await expect(nav.getByRole("link", { name: "Beweise", exact: true })).toBeVisible();
});

test("Admin 1 lädt den Gesamtketten-Export (NDJSON, private, no-store); eine unbekannte Spiel-ID antwortet 404", async ({ browser }) => {
  const page = await login(browser, "bw2", true, "/admin/beweis");
  const res = await page.request.get("/api/beweis/kette");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("ndjson");
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  expect((await page.request.get("/api/beweis/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
});

test("Admin 2 sieht die Seite nicht (Weiterleitung nach /app, kein Navigationseintrag) und bekommt für beide Routen 404", async ({ browser }) => {
  const page = await login(browser, "bw3", false, "/admin");
  await expect(page.getByRole("navigation", { name: "Admin-Bereich" }).getByRole("link", { name: "Beweise", exact: true })).toHaveCount(0);
  await page.goto("/admin/beweis");
  await expect(page).toHaveURL(/\/app$/);
  for (const url of ["/api/beweis/kette", "/api/beweis/00000000-0000-4000-8000-000000000000", "/api/beweis/kein-uuid"]) {
    expect((await page.request.get(url)).status(), url).toBe(404);
  }
});

// 011 M2a: Admin 1 schaltet die Beweispflicht in zwei Schritten ein (Uhrenquelle Datenbank, dann Pflicht). Zustand vorher/nachher auf die Vorgabe (aus, js) gesetzt.
async function resetSwitches() {
  const { query } = await import("./helpers-db");
  await query("begin; select set_config('socaz.ledger_maintenance', 'on', true); update settings set value = to_jsonb('off'::text) where key = 'evidence_enforcement'; update settings set value = to_jsonb('js'::text) where key = 'evidence_clock_source'; commit;");
}

test("Beweispflicht einschalten: Schritt 1 Uhrenquelle, Schritt 2 Pflicht, Grund Pflicht, Admin 2 sieht die Seite nicht", async ({ browser }) => {
  await resetSwitches();
  try {
    const page = await login(browser, "bw5", true, "/admin/beweis");
    await page.goto("/admin/beweis");
    await page.waitForLoadState("networkidle");
    const box = page.getByTestId("evidence-switch");
    await expect(page.getByTestId("evidence-switch-state")).toContainText("noch nicht umgestellt");
    await expect(box.getByRole("button", { name: "Beweispflicht einschalten" })).toHaveCount(0); // Schritt 2 erst nach Schritt 1
    // ohne Grund: Fehler am Feld (native Pflichtprüfung hält an)
    await box.getByRole("button", { name: "Uhrenquelle auf Datenbank stellen" }).click();
    expect(await box.getByLabel(/Grund/).evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(true);
    await box.getByLabel(/Grund/).fill("App nutzt Datenbankzeit");
    await box.getByRole("button", { name: "Uhrenquelle auf Datenbank stellen" }).click();
    await expect(box.getByRole("button", { name: "Beweispflicht einschalten" })).toBeVisible();
    await box.getByLabel(/Grund/).fill("Go-live");
    await box.getByRole("button", { name: "Beweispflicht einschalten" }).click();
    await expect(page.getByTestId("switch-done")).toBeVisible();
    await expect(page.getByTestId("evidence-switch-state")).toContainText("eingeschaltet");
    await expect(box.getByRole("button")).toHaveCount(0); // kein Ausschalten über die Oberfläche
  } finally {
    await resetSwitches();
  }
});

// Welle 4 (Formulare vor der Hydration, Backlog 224): die Admin-Formulare der Bausteine ActionForm (Einstellungen, Notabschaltung Kartenzahlung) und ui/Form (Beweis-Schalter) senden vor der Hydration nativ POST an die
// Server-Aktion, nie GET mit den Feldern (Grund, Einstellungen) in der Adresse. Geprüft wird das vom Server gelieferte HTML (nur Lesen, es wird nichts geschaltet).
test("Admin-Formulare vor der Hydration: ActionForm und ui/Form senden nativ POST", async ({ browser }) => {
  const page = await login(browser, "fw4", true, "/admin/einstellungen");
  // Je Seite Gruppen von Knopftexten: von jeder Gruppe muss mindestens ein Formular vorhanden sein (die Notabschaltung zeigt je nach Schalterstand "ausschalten" ODER "wieder einschalten")
  const erwartet: [string, string[][]][] = [
    ["/admin/einstellungen", [["Speichern"], ["Rechnungseinstellungen übernehmen"], ["Kartenzahlung ausschalten (Notabschaltung)", "Kartenzahlung wieder einschalten"]]],
    ["/admin/beweis", [["Uhrenquelle auf Datenbank stellen"]]],
  ];
  for (const [pfad, gruppen] of erwartet) {
    const html = await (await page.context().request.get(pfad)).text();
    for (const gruppe of gruppen) {
      const treffer: string[] = [];
      for (const knopf of gruppe) {
        for (let at = html.indexOf(`>${knopf}</button>`); at >= 0; at = html.indexOf(`>${knopf}</button>`, at + 1)) treffer.push(html.slice(html.lastIndexOf("<form", at), html.indexOf("</form>", at)));
      }
      expect(treffer.length, `${pfad}: Formular mit "${gruppe.join(" / ")}"`).toBeGreaterThan(0);
      for (const form of treffer) {
        expect(form.slice(0, form.indexOf(">") + 1), `${pfad} ${gruppe[0]}`).toMatch(/\bmethod="POST"/);
        expect(form, `${pfad} ${gruppe[0]}`).toContain('name="$ACTION_');
        expect(form, `${pfad} ${gruppe[0]}`).not.toContain("javascript:throw");
      }
    }
  }
});
