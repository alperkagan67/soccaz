import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, newUser, run } from "./helpers";
import { query } from "./helpers-db";

// 013 M3 PR 2: Turnierliste. "Team anmelden" sieht nur ein Captain bei offener Anmeldung; Gäste und Spieler ohne eigenes Team lesen "Nur Captains melden Teams an". Der Server entscheidet beim Anmelden (Integration tournament-register-captain).
test.afterAll(async ({ browser }) => {
  await closeContexts(browser);
});

test("Turnierliste: Team anmelden nur für Captains, Gast und Spieler sehen den Hinweis", async ({ browser }) => {
  const orgPage = await (await browser.newContext()).newPage();
  await newUser(orgPage, "tl0");
  const org = (await query<{ id: string }>("select id from users where email = $1", [`tl0-${run}@test.local`]))[0].id;
  const name = `Listen-Cup ${run}`;
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, status, registration_deadline, starts_at, is_private)
     values ($1, $2, 'Essen', (now() + interval '5 days')::date, 'knockout', 4, 16000, 8000, 120, 'registration', now() + interval '3 days', now() + interval '5 days', false) returning id`,
    [org, name],
  );
  const row = (page: import("@playwright/test").Page) => page.getByTestId("tournament-row").filter({ hasText: name });

  // Gast
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/turniere?city=Essen");
  await expect(row(guest)).toBeVisible({ timeout: 60_000 });
  await expect(row(guest).getByTestId("tournament-captains-only")).toHaveText("Nur Captains melden Teams an");
  await expect(row(guest).getByTestId("tournament-register")).toHaveCount(0);

  // angemeldeter Spieler ohne Team
  const player = await (await browser.newContext()).newPage();
  await newUser(player, "tl1");
  await player.goto("/turniere?city=Essen");
  await expect(row(player).getByTestId("tournament-captains-only")).toBeVisible({ timeout: 60_000 });
  await expect(row(player).getByTestId("tournament-register")).toHaveCount(0);

  // Captain (Team-Admin)
  const captain = await (await browser.newContext()).newPage();
  await newUser(captain, "tl2");
  await createTeam(captain, `Listen FC ${run}`);
  await captain.goto("/turniere?city=Essen");
  const register = row(captain).getByTestId("tournament-register");
  await expect(register).toBeVisible({ timeout: 60_000 });
  await expect(row(captain).getByTestId("tournament-captains-only")).toHaveCount(0);
  await register.click();
  await expect(captain).toHaveURL(new RegExp(`/turniere/${t.id}$`));
});
