import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, newUser, run, seedUser, testDb } from "./helpers";
import { query } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Stream: Link eintragen, Player erst nach Klick, Overlay und JSON für OBS", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await newUser(a, "sta");
  await createTeam(a, `Stream A ${run}`);
  const homeId = (await query<{ id: string }>("select id from teams where name = $1", [`Stream A ${run}`]))[0].id;
  const rival = await seedUser("stb");
  const { rows } = await testDb().query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Stream B ${run}`, `e2e-stb-${run}`, rival]);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, rival]);
  const m = await testDb().query("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status) values ($1, $2, now() + interval '2 days', 60, 'confirmed') returning id", [homeId, rows[0].id]);
  const matchId = m.rows[0].id as string;
  const adminId = (await query<{ id: string }>("select id from users where email = $1", [`sta-${run}@test.local`]))[0].id;
  await testDb().query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3)", [matchId, adminId, homeId]);

  await a.goto(`/spiele/${matchId}`);
  await a.waitForLoadState("networkidle");
  await expect(a.getByRole("region", { name: "Live-Stream" })).toHaveCount(0);
  await a.getByText("Live-Stream eintragen").click();
  await a.getByLabel("Link zu Twitch, YouTube oder Kick").fill("https://evil.example/live");
  await a.getByRole("button", { name: "Speichern" }).click();
  await expect(a.getByText(/nicht unterstützt/)).toBeVisible();
  await a.getByLabel("Link zu Twitch, YouTube oder Kick").fill("https://www.twitch.tv/socaz_live");
  await a.getByRole("button", { name: "Speichern" }).click();
  await expect(a.getByText("Gespeichert.", { exact: false }).first()).toBeVisible();

  // Fremde sehen den Platzhalter; der iframe kommt erst nach dem Klick
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/spiele/${matchId}`);
  const region = anon.getByRole("region", { name: "Live-Stream" });
  await expect(region).toBeVisible();
  await expect(anon.locator("iframe")).toHaveCount(0);
  await anon.waitForLoadState("networkidle");
  await region.getByRole("button", { name: "Stream von Twitch laden" }).click();
  const src = await anon.locator("iframe").getAttribute("src");
  expect(src).toMatch(/^https:\/\/player\.twitch\.tv\/\?channel=socaz_live&parent=127\.0\.0\.1/);

  // Overlay und JSON
  await anon.goto(`/overlay/${matchId}`);
  await expect(anon.getByTestId("overlay")).toContainText(`Stream A ${run}`);
  await expect(anon.getByRole("banner")).toBeHidden(); // Kopfleiste ausgeblendet
  const json = await anon.request.get(`/api/spiele/${matchId}/live`);
  expect(json.status()).toBe(200);
  expect(json.headers()["access-control-allow-origin"]).toBe("*");
  expect(await json.json()).toMatchObject({ home: { name: `Stream A ${run}`, score: 0 }, away: { score: 0 } });

  // privates Spiel: weder Overlay noch JSON
  await testDb().query("update matches set visibility = 'private' where id = $1", [matchId]);
  expect((await anon.request.get(`/api/spiele/${matchId}/live`)).status()).toBe(404);
  await anon.goto(`/overlay/${matchId}`);
  await expect(anon.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible(); // Streaming liefert 200, der Inhalt ist die Fehlerseite
  await expect(anon.getByTestId("overlay")).toHaveCount(0);
});

test("Sprache: Englisch wählen, bleibt erhalten, Deutsch bleibt Standard", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" }); // Browser-Sprache entscheidet nicht
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hallenfußball/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: /Indoor football/ })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Match requests" }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible(); // bleibt erhalten

  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Deutsch" }).click();
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});
