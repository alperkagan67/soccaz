import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, newUser, run } from "./helpers";
import { query } from "./helpers-db";

// 013 M3 PR 4: „Meine Spiele“ (/app): Dein Stand mit der einen Hauptaktion, Fehlerzustand der eigenen Abbuchung, Gruppen nach Spielart mit Zustandswort, Handy 390 px (AC-3: Touch >= 44 px, kein Scrollen), AC-5 (Test-IDs).
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const userIdOf = async (email: string) => (await query<{ id: string }>("select id from users where email = $1", [email]))[0].id;

test("Neuling: Dein Stand mit Team gründen, Leerzustand, keine Lobby-aufmachen-Kachel, kein Guthaben", async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await newUser(p, "m3n");
  await p.goto("/app");
  await expect(p.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(p.getByTestId("page-stand")).toContainText("noch in keinem Team");
  await expect(p.getByTestId("page-action").getByRole("link", { name: "Team gründen" })).toBeVisible(); // die eine Hauptaktion
  await expect(p.getByTestId("first-steps")).toContainText("Team gründen"); // bleibt (AC-5)
  await expect(p.getByTestId("my-matches")).toContainText("Noch keine Spiele");
  await expect(p.getByRole("navigation", { name: "Schnellzugriff" }).getByRole("link", { name: "Lobby aufmachen" })).toHaveCount(0);
  await expect(p.getByRole("main")).not.toContainText(/Guthaben|Aufladen/);
  await expect(p.getByTestId("game-modes")).toBeVisible(); // Spielarten bleiben (AC-5)
});

test("Spieler mit Spiel: Gruppe Teamspiele mit Zustandswort, Dein Stand führt zur Lobby, Touch-Ziele und kein Scrollen (390 px)", async ({ browser }) => {
  const { a, nameB } = await setupLobby(browser, "m3a");
  await a.setViewportSize({ width: 390, height: 844 });
  await a.goto("/app");
  await expect(a.getByTestId("page-stand")).toContainText("Nächstes Spiel");
  await expect(a.getByTestId("page-stand")).toContainText(nameB);
  const gruppe = a.getByTestId("my-matches-team");
  await expect(gruppe.getByRole("heading", { name: "Teamspiele" })).toBeVisible();
  const row = gruppe.getByTestId("my-match-row").filter({ hasText: nameB });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/Wartet auf Spieler|Spiel ist angesetzt/); // immer ein Wort, nie nur Farbe
  await expect(a.getByTestId("my-games")).toBeVisible(); // bestehende Test-ID (AC-5)
  await expect(a.getByTestId("my-game")).toContainText(nameB);
  await expect(a.getByTestId("my-matches-private")).toHaveCount(0); // leere Gruppen entfallen
  await expect(a.getByTestId("my-matches-tournament")).toHaveCount(0);

  // AC-3: Touch-Ziele >= 44 px (Knöpfe und Links im Hauptbereich), kein horizontales Scrollen bei 390 px
  const small = await a.locator("main a, main button").evaluateAll((els) =>
    els
      .map((el) => ({ el, r: (el as HTMLElement).getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 43.5)
      .map(({ el }) => `${el.tagName} ${(el.textContent ?? "").trim().slice(0, 30)}`),
  );
  expect(small, "Ziele unter 44 px").toEqual([]);
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // die eine Hauptaktion: Zur Lobby
  await a.getByTestId("page-action").getByRole("link", { name: "Zur Lobby" }).click();
  await expect(a).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
});

test("Fehlgeschlagene Abbuchung: nur die Person selbst sieht den Fehlerzustand mit Karte ändern, Dritte nie", async ({ browser }) => {
  const { a, b, matchId } = await setupLobby(browser, "m3f");
  const idA = await userIdOf(`m3fa-${run}@test.local`);
  await query("insert into match_participants (match_id, user_id, team_id, card_status) values ($1, $2, (select home_team_id from matches where id = $1), 'failed') on conflict (match_id, user_id) do update set card_status = 'failed'", [matchId, idA]);
  await a.goto("/app");
  const fehler = a.getByTestId("charge-failed-self");
  await expect(fehler).toBeVisible();
  await expect(fehler.getByRole("alert")).toContainText("Abbuchung fehlgeschlagen");
  await expect(fehler.getByRole("link", { name: "Karte ändern" })).toHaveAttribute("href", `/lobby/${matchId}`);
  // Dritte (der andere Captain) sehen den Fehlerzustand von A nicht
  await b.goto("/app");
  await expect(b.getByTestId("charge-failed-self")).toHaveCount(0);
});
