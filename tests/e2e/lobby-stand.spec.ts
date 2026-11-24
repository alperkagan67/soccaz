import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

// 013 M3 PR 5a: Lobby "Dein Stand" mit EINER Hauptaktion je Rolle (AC-30) und Hallenbetreiber namenfrei (AC-17, Backlog 216).
test.describe.configure({ mode: "serial" });
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await query("delete from venue_access where venue_id in (select id from venues where name like $1)", [`Stand-Halle %${run}`]);
  await closeTestDb();
});

test("Gast: Dein Stand führt zur Anmeldung, genau eine Hauptaktion", async ({ browser }) => {
  const { matchId } = await setupLobby(browser, "lsg");
  const gast = await (await browser.newContext()).newPage();
  await gast.goto(`/lobby/${matchId}`, { timeout: 90_000 });
  const stand = gast.getByTestId("lobby-stand");
  await expect(stand).toBeVisible({ timeout: 60_000 });
  await expect(stand).toHaveAttribute("data-aktion", "anmelden");
  await expect(stand.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", /\/anmelden\?next=/);
  await expect(gast.locator("main .btn-primary")).toHaveCount(1);
});

test("Captain (schon eingeteilt): Bereit machen ist die einzige Hauptaktion, danach keine", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "lsc");
  await a.goto(`/lobby/${matchId}`);
  const stand = a.getByTestId("lobby-stand");
  await expect(stand).toHaveAttribute("data-aktion", "bereit", { timeout: 60_000 });
  await expect(a.locator("main .btn-primary")).toHaveCount(1);
  await a.locator("main .btn-primary").click();
  await expect(stand).toHaveAttribute("data-aktion", "keine", { timeout: 60_000 }); // bereit: die Letzte Bestätigung geht erst, wenn das Team komplett bereit ist
  await expect(a.locator("main .btn-primary")).toHaveCount(0);
});

test("Hallenbetreiber sieht die Teilnehmer namenfrei, Mitspieler sehen Namen", async ({ browser }) => {
  const { b, matchId } = await setupLobby(browser, "lsh");
  await b.goto(`/lobby/${matchId}`); // beide Captains sind mit der Annahme eingeteilt
  await expect(b.getByTestId("participant-name")).toHaveCount(2, { timeout: 60_000 });
  await expect(b.getByTestId("participant-name").first()).toHaveAttribute("data-sicht", "member");

  const boss = await (await browser.newContext()).newPage();
  await newUser(boss, "lsb");
  const bossId = await userIdByEmail(`lsb-${run}@test.local`);
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Stand-Halle A ${run}`, bossId]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, bossId]);
  await boss.goto(`/lobby/${matchId}`);
  const namen = boss.getByTestId("participant-name");
  await expect(namen).toHaveCount(2, { timeout: 60_000 });
  await expect(namen.first()).toHaveAttribute("data-sicht", "hall");
  await expect(namen.first()).toHaveText(/^Spieler \d$/);
  await expect(boss.locator("main")).not.toContainText("Spieler lsa");
  await expect(boss.locator("main")).not.toContainText("Spieler lsb");
});
