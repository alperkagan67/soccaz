import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, futureLocal, newUser, run } from "./helpers";
import { query } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function seedHalls() {
  // Das Veto braucht mindestens zwei Hallen; auf einer frischen Datenbank (CI) gibt es keine
  await query("insert into venues (name, city, address) select 'E2E Veto-Halle ' || g || ' ' || $1, 'Gelsenkirchen', 'Teststraße ' || g from generate_series(1, 3) g", [run]);
}

async function cancelWaiting() {
  await query("update matchmaking_queue set status = 'cancelled' where status = 'waiting'");
}

test("Matchmaking: Warteschlange, Gegner mit Kader sehen, erst Termin gemeinsam wählen, dann Hallen-Veto", async ({ browser }) => {
  await cancelWaiting();
  await seedHalls();
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
    await page.getByRole("button", { name: "Lobby aufmachen", exact: true }).click();
  };

  await enter(a);
  // direkt weiter zur Übersicht der eigenen Lobby: Team mit freien Plätzen, Einladungslink, noch kein Gegner
  await expect(a).toHaveURL(/\/lobby\/offen\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(a.getByTestId("open-lobby-status")).toContainText("wartet auf einen Gegner");
  await expect(a.getByTestId("open-lobby-player")).toHaveCount(1); // der Captain
  await expect(a.getByTestId("open-lobby-free").first()).toContainText("Wartet auf Spieler 2");
  await expect(a.getByRole("button", { name: "Einladungslink erstellen" })).toBeVisible();
  await a.goto("/matchmaking");
  await expect(a.getByTestId("my-queue")).toContainText("wartet auf einen Gegner");
  // Abbrechen und wieder anstellen funktioniert
  await a.getByRole("button", { name: "Suche abbrechen" }).click();
  await expect(a.getByTestId("my-queue")).toHaveCount(0);
  await enter(a);
  await expect(a).toHaveURL(/\/lobby\/offen\//, { timeout: 30_000 });
  await a.goto("/matchmaking");
  await expect(a.getByTestId("my-queue")).toContainText("wartet auf einen Gegner");

  // Team B sieht die offene Lobby und tritt an (keine automatische Paarung)
  b.on("dialog", (d) => void d.accept());
  await b.goto("/matchmaking");
  await b.waitForLoadState("networkidle");
  await b.getByRole("button", { name: `Gegen ${nameA} antreten` }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const lobbyUrl = b.url();

  // Beide Teams sehen Spielstärke; zuerst wird der Termin gewählt, Veto und Bereit gibt es noch nicht
  a.on("dialog", (d) => void d.accept());
  const matchId = lobbyUrl.split("/").pop()!;
  // Mein aktuelles Spiel: eigene, auffällige Sektion über den offenen Lobbys anderer
  await a.goto("/suche");
  await expect(a.getByTestId("my-games")).toContainText("Uhrzeit");
  await expect(a.getByTestId("my-game")).toContainText(nameB);
  await a.getByTestId("my-game").getByRole("link", { name: "Zur Lobby" }).click();
  await expect(a).toHaveURL(new RegExp(matchId));
  await expect(b.getByText(/Termin wird noch gewählt/)).toBeVisible();
  await expect(b.getByText(/Elo \d+/).first()).toBeVisible();
  await expect(b.getByRole("button", { name: "Bereit machen" })).toBeDisabled(); // noch nicht aktiv
  await expect(b.getByTestId("veto")).toHaveCount(0);
  await expect(b.getByTestId("scheduling")).toBeVisible();
  await expect(b.getByLabel("Halle", { exact: true })).toHaveCount(0); // Vorschläge betreffen nur die Uhrzeit, der Tag steht fest
  await expect(b.getByTestId("steps")).toHaveAttribute("data-step", "1");
  await expect(b.getByTestId("ready-later")).toContainText("Bereit machen"); // der Knopf ist da, aber erst nach Uhrzeit und Halle aktiv
  await expect(b.getByTestId("team-decision")).toHaveCount(2); // beide Captains getrennt sichtbar

  // A stimmt für die erste Option
  await a.goto(lobbyUrl);
  await a.waitForLoadState("networkidle");
  const options = a.getByTestId("option");
  expect(await options.count()).toBeGreaterThanOrEqual(1);
  await options.first().getByRole("button", { name: "Dafür stimmen" }).click();
  await expect(options.first()).toContainText("Deine Wahl");
  await expect(a.getByTestId("scheduling")).toBeVisible(); // Gegner hat noch nicht gewählt

  // B schlägt einen eigenen Termin vor, A stimmt zu: der Termin steht
  await b.goto(lobbyUrl);
  await b.waitForLoadState("networkidle");
  await b.getByLabel("Anstoß (deutsche Zeit)").selectOption({ label: "19:15 Uhr" });
  await b.getByRole("button", { name: "Vorschlag machen" }).click();
  await expect.poll(async () => (await query("select 1 from match_options where match_id = $1 and proposed_by_team is not null", [matchId])).length).toBe(1);

  await a.reload();
  await a.waitForLoadState("networkidle");
  const mine = a.getByTestId("option").filter({ hasText: "Vorschlag von" });
  await mine.getByRole("button", { name: "Dafür stimmen" }).click();
  await expect.poll(async () => (await query<{ scheduling_open: boolean }>("select scheduling_open from matches where id = $1", [matchId]))[0]?.scheduling_open).toBe(false);

  // Jetzt das Hallen-Veto (Hallen ohne Betreiber-Konto bleiben im Rennen); nur wer dran ist, sieht Bannen-Knöpfe
  await b.reload();
  await expect(b.getByTestId("scheduling")).toHaveCount(0);
  await expect(b.getByTestId("veto")).toBeVisible();
  await expect(b.getByTestId("steps")).toHaveAttribute("data-step", "2");
  expect(await b.getByTestId("hall").count()).toBeGreaterThanOrEqual(2);
  await expect(b.getByRole("button", { name: "Bereit machen" })).toBeDisabled(); // noch nicht aktiv
  for (let i = 0; i < 12; i++) {
    const done = (await query<{ veto_status: string }>("select veto_status from matches where id = $1", [matchId]))[0].veto_status === "done";
    if (done) break;
    let banned = false;
    for (const page of [a, b]) {
      await page.goto(lobbyUrl);
      await page.waitForLoadState("networkidle");
      const ban = page.getByRole("button", { name: "Bannen" }).first();
      if (await ban.isVisible().catch(() => false)) {
        const before = (await query("select 1 from match_veto_halls where match_id = $1 and banned_by_team is not null", [matchId])).length;
        await ban.click();
        await expect.poll(async () => (await query("select 1 from match_veto_halls where match_id = $1 and banned_by_team is not null", [matchId])).length).toBe(before + 1);
        banned = true;
        break;
      }
    }
    expect(banned).toBe(true);
  }
  await a.goto(lobbyUrl);
  await expect(a.getByTestId("veto-result")).toContainText("Gewählt:");
  await expect(a.getByTestId("hall").and(a.locator('[data-state="picked"]'))).toHaveCount(1);
  expect(await a.getByTestId("hall").and(a.locator('[data-state="banned"]')).count()).toBeGreaterThanOrEqual(1);

  // Danach ist alles klar: Bereitmachen ist möglich
  await b.goto(lobbyUrl);
  // Spielort-Box: Halle, Adresse, Uhrzeit und Karten-Links statt Eingabefeld
  const venue = b.getByTestId("venue-box");
  await expect(venue.getByTestId("venue-name")).not.toBeEmpty(); // je nach Veto eine der Hallen
  await expect(venue.getByTestId("venue-address")).toBeVisible();
  await expect(venue.getByTestId("venue-time")).toContainText("Uhr");
  await expect(venue.getByRole("link", { name: "Google Maps" })).toHaveAttribute("href", /google\.com\/maps/);
  await expect(venue.getByRole("link", { name: "Apple Maps" })).toHaveAttribute("href", /maps\.apple\.com/);
  await expect(b.getByRole("button", { name: "Speichern" })).toHaveCount(0);
  await expect(b.getByRole("button", { name: "Bereit" }).first()).toBeVisible();
  await b.goto("/app/benachrichtigungen");
  await expect(b.getByText("Termin steht fest")).toBeVisible();
  await expect(b.getByText(/Halle steht fest/).first()).toBeVisible();
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

test("Offene Suchen: alle Details sehen und eine Suche direkt annehmen", async ({ browser }) => {
  await cancelWaiting();
  await seedHalls();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "osa");
  await newUser(b, "osb");
  const nameA = `Offen A ${run}`;
  const nameB = `Offen B ${run}`;
  await createTeam(a, nameA);
  await createTeam(b, nameB);

  await a.goto("/matchmaking");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Gesuchte Stärke des Gegners von").selectOption("2");
  await a.getByLabel("bis", { exact: true }).first().selectOption("4");
  await a.getByLabel("Hinweis für andere Teams (optional)").fill(`Mixed-Team, locker ${run}`);
  await a.getByLabel("Tag 1").fill(futureLocal(3).slice(0, 10));
  await a.getByLabel("Von", { exact: true }).first().fill("18:00");
  await a.getByLabel("Bis", { exact: true }).first().fill("21:00");
  await a.getByRole("button", { name: "Lobby aufmachen", exact: true }).click();
  await expect(a).toHaveURL(/\/lobby\/offen\//, { timeout: 30_000 });
  await a.goto("/matchmaking");
  await expect(a.getByTestId("my-queue")).toContainText("wartet auf einen Gegner");
  // die eigene Suche steht auch in der offenen Liste, ohne Annehmen
  await expect(a.getByTestId("open-search").filter({ hasText: nameA })).toContainText("Euer Team");

  // B findet sie unter "Spielsuchen" und im Matchmaking, mit allen Angaben
  await b.goto("/suche");
  const card = b.getByTestId("lobby-board").getByTestId("board-entry").filter({ hasText: nameA });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Elo 1000");
  await expect(card).toContainText("Stufe 2 bis 4");
  await expect(card).toContainText("60 Min");
  await expect(card).toContainText("im Kader");
  await expect(card).toContainText(`Mixed-Team, locker ${run}`);
  await expect(card).toContainText("18:00 bis 21:00"); // Zeitfenster
  await b.goto("/matchmaking");
  await expect(b.getByTestId("open-search").filter({ hasText: nameA })).toBeVisible();
  await expect(b.getByRole("heading", { name: /Offene Suchen \(1\)/ })).toBeVisible();

  // direkt annehmen
  b.on("dialog", (d) => void d.accept());
  await b.waitForLoadState("networkidle");
  await b.getByRole("button", { name: `Gegen ${nameA} antreten` }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  await expect(b.getByTestId("scheduling")).toBeVisible(); // zuerst Tag und Uhrzeit, das Veto folgt danach
  await expect(b.getByText(/Termin wird noch gewählt/)).toBeVisible();

  // die Suche ist weg
  await a.goto("/suche");
  await expect(a.locator('[data-kind="search"]').filter({ hasText: nameA })).toHaveCount(0); // die Suche ist zur Lobby geworden
});
