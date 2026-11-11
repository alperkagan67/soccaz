import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, run } from "./helpers";
import { query, setPlatformSetting, userIdByEmail } from "./helpers-db";

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

test("Kartenmodell pro Spiel: liegt schon Geld im Spiel (bezahlter Platz), bleibt die Lobby im Guthaben-Modell", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "km");
  await query("update match_participants set paid_cents = 100 where match_id = $1", [matchId]);
  await a.goto(`/lobby/${matchId}`);
  await expect(a.getByTestId("card-form")).toHaveCount(0);
  await expect(a.getByTestId("card-hint")).toHaveCount(0);
  await expect(a.getByTestId("card-light-legend")).toHaveCount(0);
  await expect(a.getByTestId("light-legend")).toBeVisible();
});

async function seedStoredCard(email: string, suffix: string) {
  const userId = await userIdByEmail(email);
  await query(
    "insert into payment_profiles (user_id, stripe_customer_id, payment_method_id, card_brand, card_last4) values ($1, $2, $3, 'visa', '4242') on conflict (user_id) do update set payment_method_id = excluded.payment_method_id, card_brand = 'visa', card_last4 = '4242'",
    [userId, `cus_fake_e2e_${suffix}`, `pm_fake_e2e_${suffix}`],
  );
  return userId;
}

test("Gespeicherte Karte: Mandat sichtbar vor dem Klick, ein Klick, grün, Mandatszeile je Platz in der DB", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "ks");
  const userId = await seedStoredCard(`ksa-${run}@test.local`, `ok${run}`);
  await a.goto(`/lobby/${matchId}`);

  const stored = a.getByTestId("card-stored");
  await expect(stored).toContainText("4242");
  await expect(a.getByTestId("card-mandate")).toBeVisible();
  await expect(a.getByTestId("card-mandate")).toContainText("Ich erlaube Soccaz");
  const use = a.getByTestId("card-use-stored");
  await expect(use).toBeDisabled(); // ohne ausdrückliche Zustimmung kein Klick
  await a.getByLabel(/Ich erlaube Soccaz/).check();
  await use.click();

  await expect(a.getByTestId("card-ready-text")).toBeVisible({ timeout: 15_000 });
  await expect(a.locator('[data-card-light="green"]').first()).toContainText("Karte hinterlegt");
  const rows = await query<{ mandate_text: string; status: string }>("select mandate_text, status from payment_setup_intents where user_id = $1 and match_id = $2", [userId, matchId]);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("succeeded");
  expect(rows[0].mandate_text).toContain("Ich erlaube Soccaz");
  const [seat] = await query<{ card_status: string }>("select card_status from match_participants where match_id = $1 and user_id = $2", [matchId, userId]);
  expect(seat.card_status).toBe("card_ready");
});

test("Gespeicherte Karte ungültig (needsNewCard): die Lobby bietet das Formular für eine neue Karte an", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "kt");
  const userId = await seedStoredCard(`kta-${run}@test.local`, `bad${run}`);
  await a.goto(`/lobby/${matchId}`);
  await expect(a.getByTestId("card-stored")).toBeVisible();
  await query("update payment_profiles set payment_method_id = null where user_id = $1", [userId]); // Karte ist inzwischen weg
  await a.getByLabel(/Ich erlaube Soccaz/).check();
  await a.getByTestId("card-use-stored").click();
  await expect(a.getByTestId("card-error")).toContainText("Karte");
  await expect(a.getByTestId("card-form")).toBeVisible();
  // Zustimmung gilt je Schritt: im neuen Formular ist der Haken NICHT mehr gesetzt, der Knopf gesperrt, bis neu angehakt wird
  await expect(a.getByLabel(/Ich erlaube Soccaz/)).not.toBeChecked();
  await expect(a.getByTestId("card-fake")).toBeDisabled();
  await a.getByLabel(/Ich erlaube Soccaz/).check();
  await expect(a.getByTestId("card-fake")).toBeEnabled();
});

test("Gespeicherte Karte: 'Andere Karte hinterlegen' setzt die Zustimmung zurück", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "ku");
  await seedStoredCard(`kua-${run}@test.local`, `alt${run}`);
  await a.goto(`/lobby/${matchId}`);
  await a.getByLabel(/Ich erlaube Soccaz/).check();
  await a.getByRole("button", { name: "Andere Karte hinterlegen" }).click();
  await expect(a.getByTestId("card-form")).toBeVisible();
  await expect(a.getByLabel(/Ich erlaube Soccaz/)).not.toBeChecked();
  await expect(a.getByTestId("card-fake")).toBeDisabled();
});
