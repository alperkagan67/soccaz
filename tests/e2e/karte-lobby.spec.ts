import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb } from "./helpers";
import { setPlatformSetting } from "./helpers-db";

// Vertrag 012, M1b: Karte hinterlegen in der Lobby (AC-1 Oberfläche), Ampel mit Wort und Form (AC-12), Texte ohne Guthaben (AC-15 teilweise).
// Läuft nur, wenn der Entwicklungsserver mit PAYMENTS_FAKE=1 gestartet wurde UND dieser Test-Prozess die Variable ebenfalls hat
// (lokal: PAYMENTS_FAKE=1 an beiden Befehlen). Die CI setzt sie bewusst nicht (.github/ ist gesperrt): dort wird der Test übersprungen.
test.skip(process.env.PAYMENTS_FAKE !== "1", "braucht PAYMENTS_FAKE=1 (nur Tests)");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("card_payments_enabled", true);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("card_payments_enabled", false);
  await closeTestDb();
});

test("Kartenmodell: ohne Karte rot mit Wort, Testkarte hinterlegen, grün mit Wort, kein Guthaben-Text", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "kl");
  await a.goto(`/lobby/${matchId}`);
  const main = a.locator("main");

  // ohne Karte: Hinweis, Formular mit Mandatstext, Ampel rot mit Wort, Bereit gesperrt
  await expect(a.getByTestId("card-hint")).toContainText("Karte hinterlegen");
  await expect(a.getByTestId("card-mandate")).toContainText("Ich erlaube Soccaz");
  await expect(a.getByTestId("card-light-legend")).toContainText("Keine Karte");
  await expect(a.getByTestId("card-light-legend")).toContainText("Karte hinterlegt");
  const mine = a.locator('[data-card-light="red"]').first();
  await expect(mine).toContainText("Keine Karte");
  await expect(a.getByRole("button", { name: "Ich bin bereit" })).toBeDisabled();

  // im Kartenmodell nirgends Guthaben, Aufladen, Reservierung oder Codes in der Lobby
  for (const word of [/Guthaben/, /aufladen/i, /reserviert/, /Rabatt/i, /Promo/i, /Code/]) await expect(main).not.toContainText(word);

  // Testkarte (Fake-Pfad): erst nach Zustimmung zum Mandat
  const fake = a.getByTestId("card-fake");
  await expect(fake).toBeDisabled();
  await a.getByLabel(/Ich erlaube Soccaz/).check();
  await fake.click();

  // danach grün mit Wort, Bereit möglich
  await expect(a.getByTestId("card-ready-text")).toBeVisible({ timeout: 15_000 });
  await expect(a.locator('[data-card-light="green"]').first()).toContainText("Karte hinterlegt");
  await expect(a.getByRole("button", { name: "Ich bin bereit" })).toBeEnabled();
});
