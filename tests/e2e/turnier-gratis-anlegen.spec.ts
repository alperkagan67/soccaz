import { expect, test } from "@playwright/test";
import { closeContexts, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

// Gratis-Turnier PR A (Zahlungen AUS wie in Produktion, global-setup): der Veranstalter legt ein Turnier ohne Preisangabe an (kein Preisfeld, kein Erklärkasten mit Treuhandkonto), die Turnierseite erklärt den Ablauf.
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Veranstalter legt ein kostenloses Turnier an: Gratis-Hinweis statt Preisfeld, Ablauf auf der Turnierseite", async ({ browser }) => {
  const org = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await newUser(org, "gta");
  const orgId = await userIdByEmail(`gta-${run}@test.local`);
  await query("update users set is_organizer = true where id = $1", [orgId]);
  const flags = await query<{ key: string; value: boolean }>("select key, value from settings where key in ('payments_enabled', 'card_payments_enabled')");
  expect(flags.every((f) => f.value !== true), "Zahlungen sind in dieser Umgebung AUS").toBe(true);

  await org.goto("/app/turniere/neu");
  await expect(org.getByTestId("free-explainer")).toContainText("Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.", { timeout: 60_000 });
  await expect(org.getByTestId("fee-explainer")).toHaveCount(0);
  await expect(org.getByLabel(/Hallenpreis/)).toHaveCount(0);
  await expect(org.locator("body")).not.toContainText("Treuhandkonto");
  await expect(org.locator("#maxTeams")).toHaveAttribute("max", "16");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await org.getByLabel("Name des Turniers").fill(`Gratis-Cup ${run}`);
  await org.getByLabel(/Termin \(Beginn\)/).fill(`${day(12)}T10:00`);
  // Anmeldeschluss: Vorschlag 4 Tage vor Beginn (Gratis PR B), das Feld wird nicht von Hand gefuellt
  await expect(org.getByLabel("Anmeldeschluss")).toHaveValue(`${day(8)}T10:00`);
  await expect(org.getByTestId("deadline-hint")).toContainText("4 Tage vor Beginn");
  await org.waitForLoadState("networkidle");
  await org.getByRole("button", { name: "Turnier anlegen" }).click();
  await expect(org).toHaveURL(/\/turniere\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const flow = org.getByTestId("free-flow");
  await expect(flow).toBeVisible();
  await expect(flow).toContainText("Teams melden sich über den Einladungslink an");
  await expect(flow).toContainText("Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.");
  await expect(org.getByTestId("pricing-box")).toHaveCount(0);
  const [t] = await query<{ total_cents: number; hourly_cents: number; venue_id: string | null }>("select total_cents, hourly_cents, venue_id from tournaments where name = $1", [`Gratis-Cup ${run}`]);
  expect(t).toEqual({ total_cents: 0, hourly_cents: 0, venue_id: null });
});
