import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
  await query("delete from venues where name in ($1, $2)", [`E2E Betreiberhalle ${run}`, `E2E Offene Halle ${run}`]); // Hallen mit Betreiber dürfen nicht in die Pools anderer Tests geraten
});

test("Hallenbetreiber: Anfrage sehen, Halle als frei bestätigen, danach läuft das Veto", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const boss = await (await browser.newContext()).newPage();
  await newUser(a, "hla");
  await newUser(b, "hlb");
  await newUser(boss, "hlm");
  const [teamA, teamB] = [`Halle A ${run}`, `Halle B ${run}`];
  await createTeam(a, teamA);
  await createTeam(b, teamB);

  // ohne Halle sieht der Betreiber nichts
  await boss.goto("/halle");
  await expect(boss.getByTestId("no-inquiries")).toBeVisible();

  // Spiel mit vereinbartem Termin und zwei angefragten Hallen: eine mit Betreiber (boss), eine ohne
  const bossId = await userIdByEmail(`hlm-${run}@test.local`);
  const [halle] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Gelsenkirchen', $2) returning id", [`E2E Betreiberhalle ${run}`, bossId]);
  const [offen] = await query<{ id: string }>("insert into venues (name, city) values ($1, 'Gelsenkirchen') returning id", [`E2E Offene Halle ${run}`]);
  const [ta] = await query<{ id: string }>("select id from teams where name = $1", [teamA]);
  const [tb] = await query<{ id: string }>("select id from teams where name = $1", [teamB]);
  const [m] = await query<{ id: string }>(
    "insert into matches (home_team_id, away_team_id, starts_at, duration_min, visibility, scheduling_open, veto_status, veto_turn_deadline) values ($1, $2, now() + interval '5 days', 60, 'public', false, 'halls', now() + interval '12 hours') returning id",
    [ta.id, tb.id],
  );
  await query("insert into match_hall_requests (match_id, venue_id, position, status) values ($1, $2, 0, 'pending'), ($1, $3, 1, 'unmanaged')", [m.id, halle.id, offen.id]);

  // Lobby zeigt den Stand
  await a.goto(`/lobby/${m.id}`);
  const check = a.getByTestId("hall-check");
  await expect(check).toContainText("Hallen werden angefragt");
  await expect(check.locator('[data-state="pending"]')).toContainText(`E2E Betreiberhalle ${run}`);

  // Betreiber bestätigt
  await boss.goto("/halle");
  const inquiry = boss.getByTestId("inquiry").filter({ hasText: `E2E Betreiberhalle ${run}` });
  await expect(inquiry).toContainText(`${teamA} gegen ${teamB}`);
  await boss.waitForLoadState("networkidle");
  await inquiry.getByRole("button", { name: "Halle ist frei" }).click();
  await expect(boss.getByTestId("inquiry")).toHaveCount(0);

  // jetzt läuft das Veto mit beiden Hallen
  await a.reload();
  await expect(a.getByTestId("veto")).toBeVisible();
  await expect(a.getByTestId("hall-check")).toHaveCount(0);
  expect(await a.getByTestId("hall").count()).toBe(2);
});
