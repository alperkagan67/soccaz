import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, newUser, run } from "./helpers";
import { query } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Startseite erklärt die Plattform in vier Schritten mit Preis und Zahlen", async ({ page }) => {
  await page.goto("/");
  const how = page.getByTestId("how-it-works");
  await expect(how.getByRole("heading", { name: "So funktioniert Socaz" })).toBeVisible();
  for (const step of ["Team gründen", "Gegner finden", "Hallen bannen, Termin wählen", "Spielen und zählen"]) await expect(how.getByText(step, { exact: true })).toBeVisible();
  await expect(how.getByText(/80,00/)).toBeVisible(); // Hallenpreis aus den Preisregeln
  await expect(page.getByTestId("platform-stats")).toContainText("Teams");
  await how.getByRole("link", { name: /Hilfe und Fragen/ }).click();
  await expect(page).toHaveURL(/\/hilfe$/);
  await expect(page.getByRole("heading", { name: "Hilfe und Fragen" })).toBeVisible();
  await page.getByText("Wie viel zahle ich genau?").click();
  await expect(page.getByText(/Je mehr mitspielen/)).toBeVisible();
  await page.goto("/kontakt");
  await expect(page.getByRole("heading", { name: "Kontakt" })).toBeVisible();
});

test("Guthaben ist immer erreichbar, auch wenn Zahlungen noch aus sind", async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await newUser(p, "bwal");
  await expect(p.getByTestId("first-steps")).toContainText("Team gründen"); // neue Nutzer bekommen eine Starthilfe
  await expect(p.getByTestId("wallet-card")).toBeVisible();
  await expect(p.getByTestId("header-wallet")).toContainText("0,00");
  await p.getByTestId("wallet-card").click();
  await expect(p).toHaveURL(/\/app\/guthaben$/);
  await expect(p.getByRole("heading", { name: "So funktioniert dein Guthaben" })).toBeVisible();
  await expect(p.getByRole("heading", { name: "Aufladen" })).toBeVisible();
  await p.goto("/app");
  for (const link of ["Matchmaking", "Mein Profil", "Rangliste", "Turniere", "Einstellungen", "Hilfe"]) await expect(p.getByRole("navigation", { name: "Schnellzugriff" }).getByRole("link", { name: link })).toBeVisible();
});

test("Teamverzeichnis mit Suche", async ({ browser }) => {
  const p = await (await browser.newContext()).newPage();
  await newUser(p, "bdir");
  await createTeam(p, `Verzeichnis ${run}`);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/teams?q=${encodeURIComponent(`Verzeichnis ${run}`)}`);
  await expect(anon.getByRole("link", { name: new RegExp(`Verzeichnis ${run}`) })).toBeVisible();
  await anon.goto(`/teams?q=${encodeURIComponent("gibt-es-nicht-xyz")}`);
  await expect(anon.getByText("Keine Teams gefunden.")).toBeVisible();
});

test("Teamverwaltung: Admin ernennen, bearbeiten, Mitglied verlässt, Auflösen", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  const member = await (await browser.newContext()).newPage();
  admin.on("dialog", (d) => void d.accept());
  member.on("dialog", (d) => void d.accept());
  await newUser(admin, "badm");
  await newUser(member, "bmem");
  const name = `Verwaltet ${run}`;
  await createTeam(admin, name);
  const teamUrl = admin.url();
  const memberId = (await query<{ id: string }>("select id from users where email = $1", [`bmem-${run}@test.local`]))[0].id;
  const teamId = (await query<{ id: string }>("select id from teams where name = $1", [name]))[0].id;
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [teamId, memberId]);

  await admin.goto(teamUrl);
  await admin.waitForLoadState("networkidle");
  // Der Spieler sieht keine Verwaltung, aber „Team verlassen“
  await member.goto(teamUrl);
  await expect(member.getByTestId("team-settings")).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Team verlassen" })).toBeVisible();

  // Bearbeiten
  await admin.getByText("Team verwalten").click();
  await admin.getByLabel("Teamname").fill(`${name} neu`);
  await admin.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(admin.getByText("Gespeichert.")).toBeVisible();
  await expect(admin.getByRole("heading", { name: `${name} neu` })).toBeVisible();

  // Zum Admin machen, dann kann der erste Admin gehen
  const row = admin.getByTestId("member").filter({ hasText: "Spieler bmem" });
  await row.getByRole("button", { name: "Zum Admin machen" }).click();
  await expect.poll(async () => (await query<{ role: string }>("select role from team_members where team_id = $1 and user_id = $2", [teamId, memberId]))[0].role).toBe("admin");

  await admin.getByRole("button", { name: "Team verlassen" }).click();
  await expect(admin).toHaveURL(/\/app$/, { timeout: 30_000 });
  const adminId = (await query<{ id: string }>("select id from users where email = $1", [`badm-${run}@test.local`]))[0].id;
  expect((await query("select 1 from team_members where team_id = $1 and user_id = $2", [teamId, adminId])).length).toBe(0);
  await expect(admin.getByText(`${name} neu`)).toHaveCount(0);

  // Das letzte Mitglied löst das Team auf
  await member.reload();
  await member.getByText("Team verwalten").click();
  await member.getByRole("button", { name: "Team auflösen" }).click();
  await expect(member).toHaveURL(/\/app$/, { timeout: 30_000 });
  await member.goto(teamUrl);
  await expect(member.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
});

test("Profile: Steckbrief, Form, Elo-Verlauf, Direktvergleich", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "pfa");
  await newUser(b, "pfb");
  const nameA = `Profil A ${run}`;
  const nameB = `Profil B ${run}`;
  await createTeam(a, nameA);
  await createTeam(b, nameB);
  const idA = (await query<{ id: string }>("select id from users where email = $1", [`pfa-${run}@test.local`]))[0].id;
  const teamA = (await query<{ id: string; slug: string }>("select id, slug from teams where name = $1", [nameA]))[0];
  const teamB = (await query<{ id: string }>("select id from teams where name = $1", [nameB]))[0];

  // Steckbrief des Spielers und des Teams
  await a.goto("/app/einstellungen");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Steckbrief (optional)").fill(`Spiele seit zehn Jahren ${run}`);
  await a.getByRole("button", { name: "Profil speichern" }).click();
  await expect(a.getByText("Gespeichert.").first()).toBeVisible();
  await a.goto(`/teams/${teamA.slug}`);
  await a.waitForLoadState("networkidle");
  await a.getByText("Team verwalten").click();
  await a.getByLabel("Über uns (optional)").fill(`Wir spielen dienstags ${run}`);
  await a.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(a.getByText("Gespeichert.")).toBeVisible();
  await a.reload();
  await expect(a.getByTestId("bio")).toContainText(`Wir spielen dienstags ${run}`);

  // zwei gespielte Spiele: A gewinnt 3:1 und verliert 0:1; dazu Elo-Verlauf
  const game = async (home: string, away: string, hs: number, as: number) => {
    const m = (await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at) values ($1, $2, now() - interval '2 days', 60, 'played', now()) returning id", [home, away]))[0];
    await query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, $2, $3, true, true)", [m.id, hs, as]);
    return m.id;
  };
  const m1 = await game(teamA.id, teamB.id, 3, 1);
  const m2 = await game(teamB.id, teamA.id, 1, 0);
  await query("insert into team_stats (team_id, matches, wins, losses, goals_for, goals_against, elo) values ($1, 2, 1, 1, 3, 2, 1010)", [teamA.id]);
  await query("insert into player_stats (user_id, matches, wins, losses, goals, elo) values ($1, 2, 1, 1, 3, 1012)", [idA]);
  for (const [i, mid] of [m1, m2].entries()) {
    await query("insert into rating_history (kind, subject_id, match_id, elo_before, elo_after, at) values ('team', $1, $2, $3, $4, now() - make_interval(hours => $5))", [teamA.id, mid, i === 0 ? 1000 : 1016, i === 0 ? 1016 : 1010, 5 - i]);
    await query("insert into rating_history (kind, subject_id, match_id, elo_before, elo_after, at) values ('user', $1, $2, $3, $4, now() - make_interval(hours => $5))", [idA, mid, i === 0 ? 1000 : 1016, i === 0 ? 1016 : 1012, 5 - i]);
  }
  await query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($4, $2, $3)", [m1, idA, teamA.id, m2]);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/spieler/${idA}`);
  await expect(anon.getByTestId("bio")).toContainText(`Spiele seit zehn Jahren ${run}`);
  await expect(anon.getByTestId("sparkline")).toContainText("1000 → 1012");
  await expect(anon.getByTestId("form")).toBeVisible();
  await expect(anon.getByText("Siegquote")).toBeVisible();

  await anon.goto(`/teams/${teamA.slug}`);
  await expect(anon.getByTestId("sparkline")).toContainText("Elo-Verlauf");
  await expect(anon.getByTestId("form").locator("span")).toHaveCount(2);
  await expect(anon.getByText("Tore pro Spiel").first()).toBeVisible();

  // Der Admin des anderen Teams sieht den Direktvergleich
  await b.goto(`/teams/${teamA.slug}`);
  await expect(b.getByTestId("head-to-head")).toContainText("1 Siege, 0 Remis, 1 Niederlagen");
});
