import { expect, test } from "@playwright/test";
import { closeContexts, run, seedUser } from "./helpers";
import { query } from "./helpers-db";

// 013 M3 PR 3: Auswahlschritt "Spiel suchen" auf /suche (ohne neue URL) und die Einladungsseite für Neulinge.
test.afterAll(async ({ browser }) => {
  await closeContexts(browser);
});

test("Spiel suchen: Auswahl Teamspiel, Privatspiel, Turnier; genau eine Hauptaktion", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/suche", { timeout: 90_000 });
  const modes = page.getByTestId("search-modes");
  await expect(modes).toBeVisible({ timeout: 60_000 });
  await expect(modes.getByTestId("search-mode-team")).toContainText("Teamspiel");
  await expect(modes.getByTestId("search-mode-private")).toContainText("Privatspiel");
  await expect(modes.getByTestId("search-mode-tournament")).toContainText("Turnier");
  await expect(page.getByRole("heading", { name: /Offene Lobbys/ })).toBeVisible();
  // Gast: Privatspiel führt über die Anmeldung zurück auf die Anlage
  await expect(modes.getByRole("link", { name: "Privatspiel anlegen" })).toHaveAttribute("href", /\/anmelden\?next=\/app\/privatspiel\/neu/);
  await expect(modes.getByRole("link", { name: "Lobby aufmachen" })).toHaveAttribute("href", "/matchmaking");
  // genau eine Hauptaktion im Auswahlschritt, keine im Filter (die Liste darunter gehoert LobbyBoard, nicht diesem PR)
  await expect(modes.locator(".btn-primary")).toHaveCount(1);
  await expect(page.getByRole("form", { name: "Lobbys filtern" }).locator(".btn-primary")).toHaveCount(0);
  await modes.getByRole("link", { name: "Turniere ansehen" }).click();
  await expect(page).toHaveURL(/\/turniere$/);
});

test("Einladung als Gast: nächste Schritte sichtbar, ein Anmelden-Knopf", async ({ browser }) => {
  const owner = await seedUser("sa1");
  const token = `sa-${run}`;
  const [team] = await query<{ id: string }>("insert into teams (name, slug, city, color, created_by) values ($1, $2, 'Essen', 'blue', $3) returning id", [`Einladung FC ${run}`, `e2e-sa-${run}`, owner]);
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [team.id, owner]);
  await query("insert into invites (token, team_id, created_by, expires_at) values ($1, $2, $3, now() + interval '7 days')", [token, team.id, owner]);
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/einladung/${token}`, { timeout: 90_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Einladung FC ${run}`, { timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Anmelden und beitreten" })).toBeVisible();
  await expect(page.getByTestId("invite-steps")).toContainText("einrichten");
  await expect(page.locator("main .btn-primary")).toHaveCount(1);
});
