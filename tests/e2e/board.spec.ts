import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, futureLocal, newUser, run, seedUser, testDb } from "./helpers";
import { query } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function seedTeam(key: string, name: string, strength = 3) {
  const admin = await seedUser(key);
  const { rows } = await testDb().query("insert into teams (name, slug, city, strength, created_by) values ($1, $2, 'Essen', $3, $4) returning id", [name, `e2e-${key}-${run}`, strength, admin]);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
  return { id: rows[0].id as string, admin, slug: `e2e-${key}-${run}` };
}

test("Offene Lobbys: öffentlich mit Nummer, Ampel pro Spieler, Stärke und Herausfordern", async ({ browser }) => {
  const home = await seedTeam("bhome", `Board Heim ${run}`, 4);
  const away = await seedTeam("baway", `Board Gast ${run}`, 2);
  const { rows } = await testDb().query("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status) values ($1, $2, now() + interval '3 days', 60, 'lobby') returning id, number", [home.id, away.id]);
  const matchId = rows[0].id as string;
  const number = rows[0].number as number;
  // Heim: Admin (nur in der Lobby), Spieler 2 bereit und bezahlt; Gast: Admin in der Lobby
  const p2 = await seedUser("bp2", `Bereit Spieler ${run}`);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [home.id, p2]);
  await testDb().query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($1, $4, $3), ($1, $5, $6)", [matchId, home.admin, home.id, p2, away.admin, away.id]);
  await testDb().query("update match_participants set ready_at = now(), paid_cents = 1000 where match_id = $1 and user_id = $2", [matchId, p2]);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/suche");
  const card = anon.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: `Board Heim ${run}` });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("game-number")).toHaveText(`#${number}`);
  await expect(card).toContainText("Wartet auf Spieler");
  await expect(card).toContainText("Siegchance nach Elo");
  await expect(card).toContainText("Stärke 4/5");
  await expect(card).toContainText("Stärke 2/5");
  // Ampel: Heim hat einen roten und einen orangen Spieler, Gast einen roten
  const lights = await card.getByTestId("board-player").evaluateAll((els) => els.map((e) => e.getAttribute("data-light")));
  expect(lights.sort()).toEqual(["orange", "red", "red"]);
  await expect(card.getByTestId("board-team").first()).toContainText("1 von 2 bereit");
  await expect(anon.getByTestId("light-legend")).toBeVisible();
  await expect(card.getByRole("link", { name: "Team herausfordern" }).first()).toHaveAttribute("href", /anmelden/); // Gäste melden sich an

  // Bestätigtes Spiel: die Bereiten werden grün
  await testDb().query("update matches set status = 'confirmed' where id = $1", [matchId]);
  await anon.reload();
  await expect(card).toContainText("Bestätigt");
  const after = await card.getByTestId("board-player").evaluateAll((els) => els.map((e) => e.getAttribute("data-light")));
  expect(after.sort()).toEqual(["green", "red", "red"]);

  // Die Lobby selbst ist für Gäste lesbar, mit Nummer und Ampel
  await card.getByRole("link", { name: "Zur Lobby" }).click();
  await expect(anon).toHaveURL(new RegExp(`/lobby/${matchId}$`));
  await expect(anon.getByTestId("game-number").filter({ hasText: "Spiel #" }).locator("visible=true")).toContainText(`Spiel #${number}`);
  await expect(anon.getByTestId("win-chance").locator("visible=true")).toContainText("Siegchance");
  await expect(anon.getByTestId("light-legend").locator("visible=true")).toBeVisible(); // die vorige Seite bleibt im Cache verborgen im DOM
  await expect(anon.locator('[data-light="green"]').locator("visible=true").first()).toBeVisible();
  await expect(anon.getByRole("link", { name: "Anmelden" }).locator("visible=true").first()).toBeVisible();

  // Ein angemeldeter Team-Admin sieht den Herausfordern-Link zum Teamprofil
  const c = await (await browser.newContext()).newPage();
  await newUser(c, "bch");
  await createTeam(c, `Board Dritte ${run}`);
  await c.goto("/suche");
  const link = c.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: `Board Heim ${run}` }).getByTestId("challenge-link").first();
  await expect(link).toHaveAttribute("href", `/app/suche/neu?gegner=${home.slug}`);

  // auch auf der Startseite
  await anon.goto("/");
  await expect(anon.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: `Board Heim ${run}` })).toBeVisible();
});

test("Spielsuche mit festem Termin steht mit Nummer, Kader und Herausfordern öffentlich in der Liste", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await newUser(a, "bsa");
  const teamA = `Board Suche ${run}`;
  await createTeam(a, teamA);
  await a.goto("/app/suche/neu");
  await a.getByLabel(/Anstoß/).fill(futureLocal(8));
  await a.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const requestId = a.url().split("/").pop()!;
  const number = (await query<{ number: number }>("select number from match_requests where id = $1", [requestId]))[0].number;

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/suche");
  const card = anon.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: teamA });
  await expect(card.getByTestId("game-number")).toHaveText(`#${number}`);
  await expect(card).toContainText("Gegner gesucht");
  await expect(card).toContainText("Spieler bsa"); // Kader
  await expect(card.getByRole("link", { name: "Anmelden und Team herausfordern" })).toBeVisible();

  // Wird die Suche angenommen, behält das Spiel die Nummer
  const b = await (await browser.newContext()).newPage();
  await newUser(b, "bsb");
  await createTeam(b, `Board Gegner ${run}`);
  await b.goto(`/suche/${requestId}`);
  await b.getByRole("button", { name: "Spiel annehmen" }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
  await expect(b.getByTestId("game-number").filter({ hasText: "Spiel #" })).toContainText(`Spiel #${number}`);
});
