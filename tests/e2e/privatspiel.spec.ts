import { expect, test } from "@playwright/test";
import { closeContexts, devLogin, futureLocal, newUser, onboard, run } from "./helpers";
import { query } from "./helpers-db";

test.setTimeout(180_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Privatspiel: anlegen, per Link beitreten (auch neu registriert), nicht öffentlich, Teams einteilen", async ({ browser }) => {
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pgorg");

  // drei Spielarten klar getrennt
  await org.goto("/app");
  const modes = org.getByTestId("game-modes");
  await expect(modes.getByTestId("mode-team")).toContainText("Teamspiel");
  await expect(modes.getByTestId("mode-private")).toContainText("Privatspiel");
  await expect(modes.getByTestId("mode-tournament")).toContainText("Turnier");
  await modes.getByRole("link", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/app\/privatspiel\/neu/);

  await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(5, "19:00"));
  await org.getByLabel("Halle und Adresse").fill(`E2E Kickhalle ${run}, Hauptstr. 1`);
  await expect(org.getByLabel("Spieler insgesamt")).toHaveValue("10"); // Standard sind 10 Spieler
  // Miete ist Pflicht: ohne ausdrückliche Wahl (Betrag oder kostenlos) wird nichts angelegt
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/app\/privatspiel\/neu/);
  await expect(org.getByLabel("Miete als Betrag")).not.toBeChecked();
  await expect(org.getByLabel("Kostenlos (0 €)")).not.toBeChecked();
  await org.getByLabel("Miete als Betrag").check();
  await org.getByLabel("Hallenmiete in Euro").fill("100");
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const lobbyUrl = org.url();
  const matchId = lobbyUrl.split("/").pop()!;
  await expect(org.getByTestId("game-number")).toContainText("Privatspiel #");
  await expect(org.getByTestId("win-chance")).toHaveCount(0); // keine Elo-Anzeige im Privatspiel
  const link = await org.getByTestId("game-invite").getByRole("textbox").inputValue();
  expect(link).toContain("/spiel/");
  await expect(org.getByTestId("game-invite")).toContainText("1 von 10 Plätzen belegt");
  expect(await org.getByTestId("free-slot").count()).toBe(10); // je Team 5 freie Plätze

  // nicht öffentlich: weder in der Liste noch ohne Anmeldung erreichbar, keine Teamseite
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/suche");
  await expect(anon.getByText(`E2E Kickhalle ${run}`)).toHaveCount(0);
  await anon.goto(`/lobby/${matchId}`);
  await expect(anon).toHaveURL(/\/anmelden/);
  const slug = (await query<{ slug: string }>("select t.slug from teams t join matches m on m.home_team_id = t.id where m.id = $1", [matchId]))[0].slug;
  await anon.goto(`/teams/${slug}`);
  await anon.waitForLoadState("networkidle");
  await expect(anon.getByRole("heading", { name: "Team Rot" })).toHaveCount(0);

  // ein ganz neuer Nutzer öffnet den Link, registriert sich und landet direkt im Spiel
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(link);
  await expect(fresh.getByTestId("game-invite-page")).toContainText("lädt dich ein");
  await fresh.getByRole("link", { name: /Anmelden oder registrieren/ }).click();
  await expect(fresh).toHaveURL(/\/anmelden\?next=/);
  await devLogin(fresh, `pgnew-${run}@test.local`, "Neuer Spieler", new URL(link).pathname);
  await onboard(fresh, "1996-06-06"); // Einrichten für neue Konten
  await expect(fresh).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
  await expect(fresh.getByText("Neuer Spieler").first()).toBeVisible();

  // weitere Spieler per Link (angemeldet: direkt hinein), insgesamt 4
  for (const key of ["pg2", "pg3"]) {
    const p = await (await browser.newContext()).newPage();
    await newUser(p, key);
    await p.goto(link);
    await expect(p).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
  }
  await org.reload();
  await expect(org.getByTestId("game-invite")).toContainText("4 von 10 Plätzen belegt");
  await expect(org.getByRole("heading", { name: "Spieler warten auf ihr Team" })).toBeVisible();

  // Veranstalter teilt einen Spieler von Hand zu, den Rest zufällig
  org.on("dialog", (d) => void d.accept());
  await org.getByRole("button", { name: "Zu Team Rot" }).first().click();
  await expect.poll(async () => (await query("select 1 from match_participants mp join matches m on m.id = mp.match_id where mp.match_id = $1 and mp.team_id = m.home_team_id", [matchId])).length).toBe(1);
  await org.reload();
  await org.getByRole("button", { name: "Zufällig einteilen" }).click();
  await expect.poll(async () => (await query("select 1 from match_participants where match_id = $1 and team_id is null", [matchId])).length).toBe(0);
  const split = await query<{ team: string; n: number }>("select case when mp.team_id = m.home_team_id then 'rot' else 'blau' end as team, count(*)::int as n from match_participants mp join matches m on m.id = mp.match_id where mp.match_id = $1 group by 1 order by 1", [matchId]);
  expect(split.reduce((s, r) => s + r.n, 0)).toBe(4);
  expect(Math.abs(split[0].n - split[1].n)).toBeLessThanOrEqual(1); // ausgeglichen

  // Rangliste und Elo: das Spiel taucht dort nicht auf
  expect((await query("select 1 from matches where id = $1 and kind = 'private' and visibility = 'private'", [matchId])).length).toBe(1);
});
