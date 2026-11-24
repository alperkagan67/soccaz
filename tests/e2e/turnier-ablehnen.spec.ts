import { expect, test } from "@playwright/test";
import { closeContexts, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";
import { clickReady } from "./flows";

// Backlog 161 PR 2 (Oberflaeche, Entscheide t2q 2026-11-24): die Halle lehnt ein Turnier mit Grund-Kategorie ab (Hinweis "Die Ablehnung ist endgueltig"), danach gibt es fuer die Halle keine Zusage mehr
// ("Bitte den Veranstalter, die Halle erneut zu waehlen"); der Veranstalter sieht NUR die Kategorie (nie den Freitext) und zwei Wege ("Andere Halle waehlen" als einzige Hauptaktion, "Turnier absagen" ruhig);
// die erneute Hallenwahl (auch dieselbe Halle) setzt die Ablehnung zurueck. Alles per DB-Fixture und Oberflaeche (kein Fake-Pfad).
test.setTimeout(150_000);

const venueName = `E2E Ablehnhalle ${run}`;
const tournamentName = `Ablehn-Cup ${run}`;
const FREITEXT = `Wasserschaden geheim-${run}`;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
  await query("delete from notifications where body like $1", [`%${tournamentName}%`]);
});

test("Halle lehnt ab (Hinweis endgueltig), Veranstalter sieht nur die Kategorie und zwei Wege, erneute Hallenwahl setzt zurueck", async ({ browser }) => {
  const boss = await (await browser.newContext()).newPage();
  const org = await (await browser.newContext()).newPage();
  await newUser(boss, "abm");
  await newUser(org, "abo");
  const [bossId, orgId] = [await userIdByEmail(`abm-${run}@test.local`), await userIdByEmail(`abo-${run}@test.local`)];
  await query("update users set is_organizer = true where id = $1", [orgId]);
  const [halle] = await query<{ id: string }>("insert into venues (name, city, is_partner, active) values ($1, 'Essen', true, true) returning id", [venueName]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [halle.id, bossId]);
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, status, registration_deadline, starts_at, is_private, venue_id, venue_access_required_snapshot, commission_percent_snapshot, final_share_cents)
     values ($1, $2, 'Essen', (now() + interval '6 days')::date, 'knockout', 4, 16000, 8000, 120, 'payment', now() + interval '4 days', now() + interval '6 days', false, $3, true, 10.00, 1000) returning id`,
    [orgId, tournamentName, halle.id],
  );

  // --- Halle: Ablehnen mit Hinweis ---
  await boss.goto("/halle");
  const card = boss.getByTestId("tournament-confirmation").filter({ hasText: tournamentName });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await boss.waitForLoadState("networkidle");
  await card.getByTestId("tournament-decline").locator("summary").click();
  await expect(card.getByTestId("decline-final-note")).toHaveText(/Die Ablehnung ist endgültig\./, { timeout: 20_000 }); // vor dem Absenden
  await card.getByRole("radio", { name: "Belegt" }).check();
  await card.getByLabel("Anmerkung").fill(FREITEXT);
  await clickReady(card.getByRole("button", { name: "Ablehnung senden" }));
  // danach: keine Zusage mehr, Hinweis auf die erneute Wahl durch den Veranstalter
  await expect(card.getByTestId("tournament-declined-note")).toContainText("Bitte den Veranstalter, die Halle erneut zu wählen.", { timeout: 30_000 });
  await expect(card.getByRole("button", { name: "Zusagen" })).toHaveCount(0);
  await expect(card.getByTestId("tournament-decline")).toHaveCount(0);

  const [row] = await query<{ venue_declined_at: Date | null; venue_decline_code: string | null; venue_confirmed_at: Date | null }>("select venue_declined_at, venue_decline_code, venue_confirmed_at from tournaments where id = $1", [t.id]);
  expect(row.venue_declined_at).not.toBeNull();
  expect(row.venue_decline_code).toBe("belegt");
  expect(row.venue_confirmed_at).toBeNull();
  const ev = await query<{ kind: string; round: number; reason_code: string }>("select kind, round, reason_code from booking_evidence where tournament_id = $1", [t.id]);
  expect(ev).toEqual([{ kind: "declined", round: 1, reason_code: "belegt" }]);

  // --- Veranstalter: nur die Kategorie, zwei Wege, eine Hauptaktion, 44 px ---
  await org.goto(`/turniere/${t.id}`);
  const box = org.getByTestId("venue-declined");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await expect(org.getByTestId("venue-declined-reason")).toContainText("Grund: Belegt");
  const html = await (await org.request.get(`/turniere/${t.id}`)).text();
  const rsc = await (await org.request.get(`/turniere/${t.id}`, { headers: { RSC: "1" } })).text();
  for (const body of [await org.locator("body").innerText(), html, rsc]) {
    expect(body).not.toContain(FREITEXT); // nie der Freitext
    expect(body).not.toContain("Spieler abm"); // keine Person der Halle
  }
  await expect(box.locator(".btn-primary")).toHaveCount(1);
  const wahl = box.getByRole("button", { name: "Andere Halle wählen" });
  const absagen = box.getByRole("button", { name: "Turnier absagen" });
  await expect(wahl).toHaveClass(/btn-primary/);
  await expect(absagen).toHaveClass(/btn-ghost/);
  for (const b of [wahl, absagen]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(box).toContainText("vollständig erstattet");
  await expect(box).toContainText("nichts abgebucht");
  // der Veranstalter-Kasten bietet die beiden Wege nicht noch einmal an
  await expect(org.getByRole("button", { name: "Turnier absagen" })).toHaveCount(1);
  await expect(org.getByRole("button", { name: "Kader wieder öffnen" })).toHaveCount(0);

  // --- Weg 1: Kader oeffnen, dieselbe Halle erneut waehlen (neue Anfrage) ---
  await org.waitForLoadState("networkidle");
  org.once("dialog", (d) => d.accept());
  await clickReady(wahl);
  const pick = org.getByTestId("venue-pick");
  await expect(pick).toBeVisible({ timeout: 60_000 });
  await expect(pick.getByTestId("venue-pick-declined")).toContainText("Belegt");
  await expect(pick.locator("option", { hasText: `${venueName}, Essen (hat abgelehnt)` })).toHaveCount(1);
  await org.waitForLoadState("networkidle");
  await pick.locator("select").selectOption(halle.id);
  await clickReady(org.getByTestId("venue-pick-save"));
  await expect(pick).toHaveCount(0, { timeout: 30_000 });
  const [after] = await query<{ venue_declined_at: Date | null; venue_decline_code: string | null; status: string; venue_id: string }>("select venue_declined_at, venue_decline_code, status, venue_id from tournaments where id = $1", [t.id]);
  expect(after).toMatchObject({ venue_declined_at: null, venue_decline_code: null, status: "registration", venue_id: halle.id });
  // der Beweiseintrag bleibt (append-only)
  expect((await query<{ n: string }>("select count(*)::text as n from booking_evidence where tournament_id = $1 and kind = 'declined'", [t.id]))[0].n).toBe("1");
});
