import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, futureLocal, newUser, run } from "./helpers";
import { query } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function cancelWaiting() {
  await query("update matchmaking_queue set status = 'cancelled' where status = 'waiting'");
}

test("Matchmaking: Warteschlange, Gegner mit Kader sehen, Termin und Ort gemeinsam wählen", async ({ browser }) => {
  await cancelWaiting();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "mma");
  await newUser(b, "mmb");
  const nameA = `Ranked A ${run}`;
  const nameB = `Ranked B ${run}`;
  await createTeam(a, nameA);
  await createTeam(b, nameB);

  const day = futureLocal(3).slice(0, 10);
  const enter = async (page: typeof a) => {
    await page.goto("/matchmaking");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Tag 1").fill(day);
    await page.getByLabel("Von", { exact: true }).first().fill("18:00");
    await page.getByLabel("Bis", { exact: true }).first().fill("21:00");
    await page.getByRole("button", { name: "Gegner suchen", exact: true }).click();
  };

  await enter(a);
  await expect(a.getByTestId("my-queue")).toContainText("Sucht einen Gegner");
  // Abbrechen und wieder anstellen funktioniert
  await a.getByRole("button", { name: "Suche abbrechen" }).click();
  await expect(a.getByTestId("my-queue")).toHaveCount(0);
  await enter(a);
  await expect(a.getByTestId("my-queue")).toContainText("Sucht einen Gegner");

  await enter(b);
  await expect(b.getByRole("link", { name: "Zur Lobby" })).toBeVisible({ timeout: 30_000 });
  await b.getByRole("link", { name: "Zur Lobby" }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
  const lobbyUrl = b.url();

  // Beide Teams sehen Spielstärke, Termin ist noch offen, Bereit gibt es noch nicht
  await expect(b.getByText(/Termin und Ort werden noch gewählt/)).toBeVisible();
  await expect(b.getByText(/Elo \d+/).first()).toBeVisible();
  await expect(b.getByRole("button", { name: "Bereit" })).toHaveCount(0);
  await expect(b.getByTestId("scheduling")).toBeVisible();

  // A sieht den Gegner und stimmt für die erste Option
  await a.goto(lobbyUrl);
  await a.waitForLoadState("networkidle");
  const options = a.getByTestId("option");
  expect(await options.count()).toBeGreaterThanOrEqual(1);
  await options.first().getByRole("button", { name: "Dafür stimmen" }).click();
  await expect(options.first()).toContainText("Deine Wahl");
  await expect(a.getByTestId("scheduling")).toBeVisible(); // Gegner hat noch nicht gewählt

  // B schlägt etwas Eigenes vor, A stimmt zu, jetzt steht der Termin
  await b.reload();
  await b.waitForLoadState("networkidle");
  await b.getByLabel("Anstoß (deutsche Zeit)").fill(futureLocal(5, "19:00"));
  await b.getByLabel("Anderer Ort (nur wenn keine Halle gewählt)").fill("Sporthalle Test");
  await b.getByRole("button", { name: "Vorschlag machen" }).click();
  await expect.poll(async () => (await query("select 1 from match_options where venue_text = 'Sporthalle Test'")).length).toBe(1);

  await a.reload();
  await a.waitForLoadState("networkidle");
  const mine = a.getByTestId("option").filter({ hasText: "Sporthalle Test" });
  await mine.getByRole("button", { name: "Dafür stimmen" }).click();
  await expect.poll(async () => (await query<{ scheduling_open: boolean }>("select scheduling_open from matches where venue_text = 'Sporthalle Test'"))[0]?.scheduling_open).toBe(false);

  await b.reload();
  await expect(b.getByTestId("scheduling")).toHaveCount(0);
  await expect(b.locator(`input[value="Sporthalle Test"]`)).toBeVisible(); // Ort im Formular (Admin)
  await expect(b.getByRole("button", { name: "Bereit" }).first()).toBeVisible();
  await b.goto("/app/benachrichtigungen");
  await expect(b.getByText("Termin und Ort stehen fest")).toBeVisible();
});

test("Spielsuche zeigt den Kader des suchenden Teams, Lobby auch den Rest des gegnerischen Teams", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const c = await (await browser.newContext()).newPage();
  await newUser(a, "rka");
  await newUser(b, "rkb");
  await newUser(c, "rkc");
  const teamA = `Kader A ${run}`;
  await createTeam(a, teamA);
  await createTeam(b, `Kader B ${run}`);
  // c tritt Team A per Einladung bei (direkt in der DB)
  const teamId = (await query<{ id: string }>("select id from teams where name = $1", [teamA]))[0].id;
  const cId = (await query<{ id: string }>("select id from users where email = $1", [`rkc-${run}@test.local`]))[0].id;
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [teamId, cId]);

  await a.goto("/app/suche/neu");
  await a.getByLabel(/Anstoß/).fill(futureLocal(9));
  await a.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();

  await b.goto(url);
  const roster = b.getByTestId("request-roster");
  await expect(roster).toContainText("Spieler rka");
  await expect(roster).toContainText("Spieler rkc");
  await expect(roster).toContainText("Elo");
  await b.getByRole("button", { name: "Spiel annehmen" }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);

  // Der gegnerische Admin sieht in der Lobby auch Teammitglied c, das noch nicht beigetreten ist
  await expect(b.getByTestId(`roster-${await slugOf(teamA)}`)).toContainText("Spieler rkc");
});

async function slugOf(name: string) {
  return (await query<{ slug: string }>("select slug from teams where name = $1", [name]))[0].slug;
}
