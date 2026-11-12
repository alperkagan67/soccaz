import { expect, test } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, newUser, run, seedUser } from "./helpers";
import { query, seedAdmin, seedUserRole } from "./helpers-db";

// Vertrag 012, M4a-2 (AC-11): Zahlungsstreit im Admin. Nur Admin sieht Liste und Detail; der Spieler ist im Nutzer-Bereich MARKIERT (keine Sperre, keine Aktion).
test.describe.configure({ mode: "serial" });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

const DISPUTE = `dp_test_e2e_${run}`;

test("Zahlungsstreit: Liste, Detail und Markierung am Spieler nur fuer Admin", async ({ browser }) => {
  await seedAdmin("zsa");
  const payerId = await seedUser("zsp", `Streit Zahler ${run}`);
  await query("insert into payment_disputes (dispute_id, payer_user_id, amount_cents, currency, reason, status, evidence_due_by) values ($1, $2, 800, 'eur', 'fraudulent', 'needs_response', now() + interval '5 days')", [DISPUTE, payerId]);
  await query("insert into payment_disputes (dispute_id, payer_user_id, amount_cents, currency, reason, status) values ($1, $2, 500, 'eur', 'general', 'lost')", [`${DISPUTE}_lost`, payerId]);

  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `zsa-${run}@test.local`, "Admin zsa", "/admin/zahlungsstreit");
  await expect(admin.getByRole("heading", { name: "Zahlungsstreit" })).toBeVisible();
  const row = admin.getByTestId(`dispute-${DISPUTE}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("Antwort nötig");
  await expect(row).toContainText(`Streit Zahler ${run}`);
  await expect(admin.getByTestId(`dispute-${DISPUTE}_lost`)).toHaveCount(0); // Standardansicht: nur offene
  await admin.getByRole("navigation", { name: "Filter" }).getByRole("link", { name: "Alle", exact: true }).click();
  await expect(admin.getByTestId(`dispute-${DISPUTE}_lost`)).toContainText("Verloren");

  // Detail mit Beweis-Ansicht und dem Hinweis, dass es keine automatische Sperre gibt
  await admin.getByTestId(`dispute-${DISPUTE}`).click();
  await expect(admin.getByTestId("dispute-status")).toContainText("Antwort nötig");
  await expect(admin.getByText("Eine Sperre des Spielers gibt es nicht automatisch")).toBeVisible();
  await expect(admin.getByText(DISPUTE)).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Beweise für das Stripe-Dashboard" })).toBeVisible();

  // Markierung am Spieler im Nutzer-Bereich (nur Markierung, Link auf den Streit)
  await admin.goto(`/admin/nutzer?q=${encodeURIComponent(`Streit Zahler ${run}`)}`);
  const card = admin.getByTestId(`user-zsp-${run}@test.local`);
  await expect(card.getByTestId("dispute-mark-open")).toContainText("Zahlungsstreit offen (1)");
  await expect(card.getByTestId("dispute-mark-lost")).toContainText("Zahlungsstreit verloren (1)");
  await card.getByTestId("dispute-mark-open").click();
  await expect(admin).toHaveURL(/\/admin\/zahlungsstreit$/);

  // ungueltige Streit-ID: kein Detail (notFound; im Dev-Server kommt der Status wegen Streaming als 200)
  await admin.goto("/admin/zahlungsstreit/kein-streit");
  await expect(admin.getByTestId("dispute-status")).toHaveCount(0);
  await expect(admin.getByRole("heading", { name: "Beweise für das Stripe-Dashboard" })).toHaveCount(0);
});

test("Zahlungsstreit: Spieler, Moderator und Finanzrolle kommen nicht hinein", async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  await newUser(player, "zsq");
  await player.goto("/admin/zahlungsstreit");
  await expect(player).toHaveURL(/\/app$/);

  for (const role of ["moderator", "finance", "booking"]) {
    await seedUserRole(`zs${role}`, role);
    const p = await (await browser.newContext()).newPage();
    await devLogin(p, `zs${role}-${run}@test.local`, `${role} zs`, "/admin");
    await expect(p.getByRole("heading", { name: "Admin", exact: true })).toBeVisible(); // Anmeldung abgeschlossen
    await expect(p.getByRole("link", { name: "Zahlungsstreit" })).toHaveCount(0);
    await p.goto("/admin/zahlungsstreit");
    await expect(p).toHaveURL(/\/app$/);
  }
});
