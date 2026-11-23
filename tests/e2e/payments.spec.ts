import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, devLogin, newUser, run } from "./helpers";
import {
  seedOwner,
  seedAdmin,
  setPlatformSetting,
  userIdByEmail,
  walletBalanceOf,
} from "./helpers-db";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("payments_enabled", true);
  await setPlatformSetting("min_paid_players", 8);
});
test.afterEach(async ({ browser }) => {
  await setPlatformSetting("card_payments_enabled", false); // der Schalter gilt nur für den Test, der ihn setzt: jeder Test startet im Standard (AUS)
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
  await setPlatformSetting("card_payments_enabled", false);
  await closeTestDb();
});

const idle = (p: import("@playwright/test").Page) => p.waitForLoadState("networkidle");

// 012 M6a: Die Tests zu Aufladen, Guthaben-Seite, Rabattcodes und Stripe-Aufladung entfallen mit der Oberfläche (Vertrag 013 AC-14); die Datei wird mit 012 M6b für das Kartenmodell neu geschrieben.

// Das Kartenspiel-Szenario (Buchungsauftrag, Hallenbuchung, Finanzbereich) steht seit 012 M6b in karte-finanzen.spec.ts: eigener, hart geprüfter Ausgangszustand (CI #202: der Test hing von einer Sofortabbuchung im Hintergrund ab).

test("Berechtigungen im Geldbereich", async ({ browser }) => {
  // Teilrollen booking und finance entfallen (Vertrag 009 v4): Admin 2 (role admin) hat Buchungen und Hallen, aber keine Preise/Finanzen; Admin 1 hat zusätzlich Finanzen
  await seedAdmin("pm5b");
  await seedOwner("pm5f");
  const admin2 = await (await browser.newContext()).newPage();
  const owner = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await devLogin(admin2, `pm5b-${run}@test.local`, "Admin 2 pm5b", "/admin/buchungen");
  await devLogin(owner, `pm5f-${run}@test.local`, "Admin 1 pm5f", "/admin/finanzen");
  await newUser(player, "pm5p");

  await expect(admin2.getByRole("heading", { name: "Hallen-Buchungen" })).toBeVisible();
  await admin2.goto("/admin/hallen");
  await expect(admin2.getByRole("heading", { name: "Hallen und Preise" })).toBeVisible();
  // Admin 2 darf keine Preise ändern
  await expect(admin2.getByRole("button", { name: "Preisregel hinzufügen" })).toHaveCount(0);
  for (const url of ["/admin/finanzen", "/admin/einstellungen"]) {
    await admin2.goto(url);
    await expect(admin2).toHaveURL(/\/app$/);
  }

  await expect(owner.getByRole("heading", { name: "Finanzen" })).toBeVisible();
  await owner.goto("/admin/codes"); // Rabattcodes entfallen (012 M6a): die Seite gibt es nicht mehr
  await expect(owner.getByRole("heading", { name: "Rabattcodes" })).toHaveCount(0);
  await owner.goto("/admin/einstellungen");
  await expect(owner).toHaveURL(/\/admin\/einstellungen/);

  // CSV nur für Admin 1
  expect((await owner.request.get("/admin/finanzen/export")).status()).toBe(200);
  expect((await admin2.request.get("/admin/finanzen/export")).status()).toBe(403);
  expect((await player.request.get("/admin/finanzen/export")).status()).toBe(403);
  expect((await owner.request.get("/admin/finanzen/export?monat=quatsch")).status()).toBe(400);
  await player.goto("/admin/finanzen");
  await expect(player).toHaveURL(/\/app$/);
});

test("Einstellungen: Zahlungen aus macht Spiele kostenlos", async ({ browser }) => {
  // Annahme dieses Tests: Standard (Kartenmodell AUS). Bei eingeschaltetem Kartenmodell verlangt Bereit eine Karte, auch wenn "Zahlungen" aus sind; geprüft wird hier der Schalter "Zahlungen".
  await setPlatformSetting("card_payments_enabled", false);
  const { a, matchId } = await setupLobby(browser, "p7");
  await a.goto(`/lobby/${matchId}`);

  await seedOwner("p7adm"); // Einstellungen nur Admin 1 (Vertrag 009 AC-1)
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `p7adm-${run}@test.local`, "Admin p7adm", "/admin/einstellungen");
  await idle(adm);
  await expect(adm.getByText(/Test-Anbieter/)).toBeVisible();
  await adm.getByLabel("Zahlungen einschalten").uncheck();
  await adm.getByRole("button", { name: "Speichern" }).click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible();

  await a.reload();
  await a.getByRole("button", { name: "Ich bin bereit" }).click(); // ohne Zahlung
  await expect(a.getByRole("button", { name: "Nicht mehr bereit" })).toBeVisible();
  expect(await walletBalanceOf(await userIdByEmail(`p7a-${run}@test.local`))).toBe(0);

  // ungültige Mindestzahl wird abgelehnt
  const minField = adm.getByLabel("Mindestzahl zahlender Spieler");
  await minField.fill("1");
  await adm.getByRole("button", { name: "Speichern" }).click();
  expect(await minField.evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true); // der Browser blockiert zuerst
  await minField.evaluate((el) => {
    el.removeAttribute("min");
    el.removeAttribute("max");
  });
  await adm.getByRole("button", { name: "Speichern" }).click(); // Formularschutz umgangen: auch der Server lehnt ab
  await expect(adm.getByText(/zwischen 2 und 12/).first()).toBeVisible();
  await adm.getByLabel("Mindestzahl zahlender Spieler").fill("8");
  await adm.getByLabel("Zahlungen einschalten").check();
  await adm.getByRole("button", { name: "Speichern" }).click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible();
});
