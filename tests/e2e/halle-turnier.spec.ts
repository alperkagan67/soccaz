import { expect, test } from "@playwright/test";
import { closeContexts, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

// 012 M5-7b (Entscheid t2q F1, F3, F12): Zusage der Halle fuer ein Turnier in /halle. Namenfrei (HTML und RSC-Payload), Karte unterhalb der Spielanfragen, "Zusagen" im Namen der Halle.
// STAND: GESCHRIEBEN, NICHT GELAUFEN. Setzt eine Datenbank nach Nachlieferung 0054 voraus (der Beweis-Trigger auf tournaments laeuft beim COMMIT der Zusage mit).
// Kein Fake-Pfad noetig: alles per DB-Fixture und Oberflaeche, damit der Test in der CI laeuft (kein test.skip).
test.setTimeout(120_000);

const venueName = `E2E Zusagehalle ${run}`;
const tournamentName = `Zusage-Cup ${run}`;

// Aufraeumen: Turnier, Halle und Zugang bleiben stehen; das globale Aufraeumen der Testdaten loescht sie samt Beweiseintraegen (tests/cleanup.ts, Wartungsausnahme). Ein Loeschen hier scheitert am
// Turnier-Guard der Nachlieferung (Beweiseintrag der Zusage).
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
  await query("delete from notifications where body like $1", [`%${tournamentName}%`]);
});

test("Hallenbetreiber sieht das Turnier ohne Namen, sagt im Namen der Halle zu, danach ist die Karte weg und der Veranstalter ist benachrichtigt", async ({ browser }) => {
  const boss = await (await browser.newContext()).newPage();
  const org = await (await browser.newContext()).newPage();
  const other = await (await browser.newContext()).newPage();
  await newUser(boss, "zhm");
  await newUser(org, "zho");
  await newUser(other, "zhx"); // ein Betreiber ohne Zugang zu DIESER Halle
  const [bossId, orgId] = [await userIdByEmail(`zhm-${run}@test.local`), await userIdByEmail(`zho-${run}@test.local`)];
  await query("update users set is_organizer = true where id = $1", [orgId]);

  const [halle] = await query<{ id: string }>("insert into venues (name, city, is_partner, active) values ($1, 'Essen', true, true) returning id", [venueName]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [halle.id, bossId]);
  // Turnier in der Zahlungsphase mit eingefrorener Halle und Snapshot "Zugang noetig", Zusage fehlt
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, status, registration_deadline, starts_at, is_private, venue_id, venue_access_required_snapshot, commission_percent_snapshot, final_share_cents)
     values ($1, $2, 'Essen', (now() + interval '6 days')::date, 'knockout', 4, 16000, 8000, 120, 'payment', now() + interval '4 days', now() + interval '6 days', false, $3, true, 10.00, 1000) returning id`,
    [orgId, tournamentName, halle.id],
  );

  await boss.goto("/halle");
  const card = boss.getByTestId("tournament-confirmation").filter({ hasText: tournamentName });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(boss.getByRole("heading", { name: "Zusage der Halle" })).toBeVisible();
  await expect(card).toContainText(/120 Minuten/);
  await expect(card).toContainText(/Hallenmiete/);
  await expect(card).toContainText(venueName);

  // namenfrei: keine Person (Veranstalter, Spieler), kein Link auf die Turnierseite mit Spielern (HTML und RSC-Payload; Positivkontrolle: der Turniername steht drin)
  const html = await (await boss.request.get("/halle")).text();
  const rsc = await (await boss.request.get("/halle", { headers: { RSC: "1" } })).text();
  for (const body of [await boss.locator("body").innerText(), html, rsc]) {
    expect(body).toContain(tournamentName);
    expect(body).not.toContain("Spieler zho");
    expect(body).not.toContain(`/turniere/${t.id}`);
  }

  // Betreiber OHNE Zugang zu dieser Halle sieht das Turnier nicht (404 oder leere Liste, nie die Karte)
  await other.goto("/halle");
  await expect(other.getByTestId("tournament-confirmation")).toHaveCount(0);

  await boss.waitForLoadState("networkidle");
  await card.getByRole("button", { name: "Zusagen" }).click();
  await expect(boss.getByRole("dialog")).toContainText(/verbindlich/); // Bestaetigungsschritt: die Zusage ist nicht rueckgaengig zu machen
  await boss.getByRole("dialog").getByRole("button", { name: "Zusagen" }).click();
  await expect(boss.getByTestId("tournament-confirmation").filter({ hasText: tournamentName })).toHaveCount(0, { timeout: 20_000 });

  const [row] = await query<{ venue_confirmed_at: Date | null }>("select venue_confirmed_at from tournaments where id = $1", [t.id]);
  expect(row.venue_confirmed_at).not.toBeNull();
  // der Veranstalter bekommt die Mitteilung im Namen der Halle, ohne Namen Dritter
  await org.goto("/app/benachrichtigungen");
  await expect(org.getByText(`${venueName} hat für ${tournamentName} zugesagt.`)).toBeVisible({ timeout: 30_000 });
});
