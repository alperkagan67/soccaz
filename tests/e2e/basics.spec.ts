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
  for (const step of ["Team gründen", "Gegner finden", "Termin und Ort wählen", "Spielen und zählen"]) await expect(how.getByText(step, { exact: true })).toBeVisible();
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
