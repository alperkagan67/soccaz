import { expect, test, type Page } from "@playwright/test";
import { closeContexts, createTeam, futureLocal, matchIdFromUrl, newUser, run, teamIdByName } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// Vertrag 004, AC-3 und AC-9: Der normale Teamspiel-Ablauf (Zahlungen aus):
// Team A öffnet eine Lobby, Team B findet sie unter den offenen Lobbys und tritt an bzw. fordert A heraus.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeEach(async () => {
  await setPlatformSetting("payments_enabled", false);
  await query("update matchmaking_queue set status = 'cancelled' where status = 'waiting'");
  // Das Veto braucht mindestens zwei Hallen; auf einer frischen Datenbank (CI) gibt es keine
  await query("insert into venues (name, city, address) select 'E2E Ablauf-Halle ' || g || ' ' || $1, 'Gelsenkirchen', 'Teststraße ' || g from generate_series(1, 3) g", [run]);
});

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function setup(browser: import("@playwright/test").Browser, key: string) {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, `${key}a`);
  await newUser(b, `${key}b`);
  const nameA = `Ablauf A ${key} ${run}`;
  const nameB = `Ablauf B ${key} ${run}`;
  await createTeam(a, nameA);
  const slugA = new URL(a.url()).pathname; // /teams/<slug>
  await createTeam(b, nameB);
  return { a, b, nameA, nameB, slugA };
}

async function openLobby(page: Page) {
  await page.goto("/matchmaking");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Zeitfenster 1", { exact: true }).fill(futureLocal(3).slice(0, 10));
  await page.getByLabel("Von", { exact: true }).first().fill("18:00");
  await page.getByLabel("Bis", { exact: true }).first().fill("21:00");
  await page.getByRole("button", { name: "Lobby aufmachen", exact: true }).click();
  await expect(page).toHaveURL(/\/lobby\/offen\/[0-9a-f-]{36}$/, { timeout: 30_000 });
}

async function matchesBetween(teamA: string, teamB: string) {
  const rows = await query<{ id: string }>("select id from matches where (home_team_id = $1 and away_team_id = $2) or (home_team_id = $2 and away_team_id = $1)", [teamA, teamB]);
  return rows.map((r) => r.id);
}

test("AC-3: A öffnet eine Lobby, B findet sie unter den offenen Lobbys und tritt an: genau ein Spiel, beide sehen /lobby/{id}", async ({ browser }) => {
  const { a, b, nameA, nameB } = await setup(browser, "tr");
  await openLobby(a);

  // B findet die Lobby unter "Offene Lobbys" (/suche) und im Matchmaking
  await b.goto("/suche");
  await expect(b.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: nameA })).toBeVisible();
  await b.goto("/matchmaking");
  await b.waitForLoadState("networkidle");
  b.on("dialog", (d) => void d.accept());
  await b.getByRole("button", { name: `Gegen ${nameA} antreten` }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const matchId = matchIdFromUrl(b.url());

  // genau ein Spiel zwischen den beiden Teams
  const ids = await matchesBetween(await teamIdByName(nameA), await teamIdByName(nameB));
  expect(ids).toEqual([matchId]);

  // beide Teams sehen es unter /lobby/{id}
  await expect(b.getByRole("heading", { level: 1 })).toBeVisible();
  await a.goto(`/lobby/${matchId}`);
  await expect(a).toHaveURL(new RegExp(`/lobby/${matchId}$`));
  await expect(a.getByTestId("scheduling")).toBeVisible();
  await expect(a.getByText(nameB).first()).toBeVisible();
  await expect(b.getByText(nameA).first()).toBeVisible();
});

test("AC-3 und AC-9: B fordert A heraus; Zielteam, Herausforderer und Dritte sehen das passende Panel; A nimmt an", async ({ browser }) => {
  const { a, b, nameA, nameB, slugA } = await setup(browser, "hf");
  const c = await (await browser.newContext()).newPage();
  await newUser(c, `hfc`);
  await openLobby(a);

  // B sieht die offene Lobby von A und fordert das Team auf dessen Teamseite heraus
  await b.goto("/suche");
  await expect(b.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: nameA })).toBeVisible();
  await b.goto(slugA);
  await b.waitForLoadState("networkidle");
  await b.getByRole("button", { name: `${nameA} herausfordern` }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const matchId = matchIdFromUrl(b.url());
  expect(await matchesBetween(await teamIdByName(nameA), await teamIdByName(nameB))).toEqual([matchId]);

  // Herausforderer (B): zurückziehen, kein Annehmen
  const panelB = b.getByTestId("challenge-panel");
  await expect(panelB).toBeVisible();
  await expect(panelB.getByRole("button", { name: "Herausforderung zurückziehen" })).toBeVisible();
  await expect(panelB.getByRole("button", { name: "Herausforderung annehmen" })).toHaveCount(0);

  // Dritte (C): nur der Hinweis
  await c.goto(`/lobby/${matchId}`);
  const panelC = c.getByTestId("challenge-panel");
  await expect(panelC).toContainText(`Nur die Admins von ${nameA} können annehmen.`);
  await expect(panelC.getByRole("button")).toHaveCount(0);

  // Zielteam (A): annehmen oder ablehnen; A sieht das Spiel unter /lobby/{id}
  await a.goto(`/lobby/${matchId}`);
  const panelA = a.getByTestId("challenge-panel");
  await expect(panelA.getByRole("button", { name: "Herausforderung annehmen" })).toBeVisible();
  await expect(panelA.getByRole("button", { name: "Ablehnen" })).toBeVisible();
  await expect(panelA.getByRole("button", { name: "Herausforderung zurückziehen" })).toHaveCount(0);

  // Annehmen: Panel verschwindet, es bleibt bei genau einem Spiel, die Terminwahl beginnt
  await panelA.getByRole("button", { name: "Herausforderung annehmen" }).click();
  await expect(a.getByTestId("challenge-panel")).toHaveCount(0, { timeout: 30_000 });
  await expect(a.getByTestId("scheduling")).toBeVisible();
  await b.goto(`/lobby/${matchId}`);
  await expect(b.getByTestId("challenge-panel")).toHaveCount(0);
  await expect(b.getByTestId("scheduling")).toBeVisible();
  expect(await matchesBetween(await teamIdByName(nameA), await teamIdByName(nameB))).toEqual([matchId]);
});
