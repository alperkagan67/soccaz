import { expect, test } from "@playwright/test";
import { addParticipant, addTeamMember, closeContexts, createTeam, newUser, run, seedUser, testDb } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function slugOf(teamName: string) {
  return (await query<{ slug: string }>("select slug from teams where name = $1", [teamName]))[0].slug;
}

test("Herausforderung mit einem Klick: sofort die Lobby, für alle sichtbar, nur das Zielteam nimmt an", async ({ browser }) => {
  // das Hallen-Veto braucht mindestens zwei Hallen (auf frischer Datenbank gibt es keine)
  await query("insert into venues (name, city) select 'E2E Duell-Halle ' || g || ' ' || $1, 'Gelsenkirchen' from generate_series(1, 3) g", [run]);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const c = await (await browser.newContext()).newPage();
  await newUser(a, "cha");
  await newUser(b, "chb");
  await newUser(c, "chc");
  const teamA = `Chall A ${run}`;
  const teamB = `Chall B ${run}`;
  const teamC = `Chall C ${run}`;
  await createTeam(a, teamA);
  await createTeam(b, teamB);
  await createTeam(c, teamC);
  b.on("dialog", (d) => void d.accept());

  // ein Klick auf der Teamseite: kein Formular, sondern sofort die Lobby "A VS. B"
  await a.goto(`/teams/${await slugOf(teamB)}`);
  await a.waitForLoadState("networkidle");
  await a.getByRole("button", { name: `${teamB} herausfordern` }).click();
  await expect(a).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const lobbyUrl = a.url();
  await expect(a.getByRole("heading", { name: `${teamA} gegen ${teamB}` })).toBeVisible();
  await expect(a.getByText("VS.", { exact: true })).toBeVisible();
  await expect(a.getByTestId("challenge-panel")).toContainText("wartet auf Annahme");
  await expect(a.getByRole("button", { name: "Herausforderung zurückziehen" })).toBeVisible();
  await expect(a.getByTestId("light-legend")).toBeVisible(); // Ampel wie in jeder Lobby

  // öffentlich sichtbar (Startseite und Liste); ein drittes Team kann annehmen nicht, aber selbst herausfordern
  await c.goto("/suche");
  const card = c.getByTestId("board-entry").filter({ hasText: teamA });
  await expect(card).toContainText("Herausforderung: wartet auf Annahme");
  await expect(card.getByTestId("accept-challenge")).toHaveCount(0);
  await expect(card.getByRole("button", { name: `${teamA} herausfordern` })).toBeVisible();
  await c.goto("/");
  await expect(c.getByTestId("board-entry").filter({ hasText: teamA })).toBeVisible();
  await c.goto(lobbyUrl);
  await expect(c.getByTestId("challenge-panel")).toContainText(`Nur die Admins von ${teamB}`);
  await expect(c.getByRole("button", { name: "Herausforderung annehmen" })).toHaveCount(0);

  // B: Karte in Mein Bereich, Benachrichtigung, Annehmen in der Lobby
  await b.goto("/app");
  await expect(b.getByTestId("challenge-incoming")).toContainText(teamA);
  await a.goto("/app");
  await expect(a.getByTestId("challenge-outgoing")).toContainText(teamB);
  await c.goto("/app");
  await expect(c.getByTestId("challenges")).toHaveCount(0);
  await b.goto("/app/benachrichtigungen");
  await expect(b.getByText("Ihr wurdet herausgefordert")).toBeVisible();
  await b.goto("/suche");
  await b.getByTestId("board-entry").filter({ hasText: teamA }).getByTestId("accept-challenge").click();
  await expect(b).toHaveURL(new RegExp(lobbyUrl.split("/").pop()!));
  await b.waitForLoadState("networkidle");
  await b.getByRole("button", { name: "Herausforderung annehmen" }).click();
  await expect(b.getByTestId("veto")).toBeVisible({ timeout: 30_000 }); // jetzt beginnt das Hallen-Veto
  await expect(b.getByTestId("challenge-panel")).toHaveCount(0);
  await a.goto(lobbyUrl);
  await expect(a.getByTestId("veto")).toBeVisible();
});

test("Spielerprofil, Teamseite, Rangliste und Spieler des Spiels", async ({ browser }) => {
  const star = await seedUser("cstar", `Torjaeger ${run}`);
  const mate = await seedUser("cmate", `Mitspieler ${run}`);
  const rival = await seedUser("crival", `Gegner ${run}`);
  const hidden = await seedUser("chide", `Privat ${run}`);
  await testDb().query("update users set profile_public = false where id = $1", [hidden]);

  // Teams und ein gespieltes, abgeschlossenes Spiel 3:1 direkt in der Datenbank
  const db = testDb();
  const mkTeam = async (name: string, admin: string) => {
    const { rows } = await db.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, `e2e-${name.replace(/\W+/g, "-").toLowerCase()}`, admin]);
    await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
    return rows[0].id as string;
  };
  const homeName = `Stats Heim ${run}`;
  const awayName = `Stats Gast ${run}`;
  const home = await mkTeam(homeName, star);
  const away = await mkTeam(awayName, rival);
  await addTeamMember(home, mate);
  const { rows } = await db.query(
    `insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at)
     values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour') returning id`,
    [home, away],
  );
  const matchId = rows[0].id as string;
  await addParticipant(matchId, star, home);
  await addParticipant(matchId, mate, home);
  await addParticipant(matchId, rival, away);
  await db.query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 3, 1, true, true)", [matchId]);
  for (const m of [5, 9, 20]) await db.query("insert into match_events (match_id, type, user_id, team_id, minute) values ($1, 'goal', $2, $3, $4)", [matchId, star, home, m]);
  await db.query("insert into player_stats (user_id, matches, wins, goals, elo) values ($1, 1, 1, 3, 1010)", [star]);
  await db.query("insert into user_badges (user_id, code, match_id) values ($1, 'hattrick', $2)", [star, matchId]);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/spieler/${star}`);
  await expect(anon.getByRole("heading", { name: new RegExp(`Torjaeger ${run}`) })).toBeVisible();
  await expect(anon.getByText("Hattrick")).toBeVisible();
  await expect(anon.getByText(`${homeName} 3:1 ${awayName}`)).toBeVisible();
  await expect(anon.getByTestId("reliability")).toHaveCount(0); // privat

  // privates Profil: Name, sonst nichts
  await anon.goto(`/spieler/${hidden}`);
  await expect(anon.getByText("Dieses Profil ist nicht öffentlich.")).toBeVisible();
  await anon.goto(`/spieler?q=${encodeURIComponent(`Privat ${run}`)}`);
  await expect(anon.getByText("Keine Spieler gefunden.")).toBeVisible();
  await anon.goto(`/spieler?q=${encodeURIComponent(`Torjaeger ${run}`)}`);
  await expect(anon.getByRole("link", { name: new RegExp(`Torjaeger ${run}`) })).toBeVisible();

  // Teamseite
  await anon.goto(`/teams/e2e-${homeName.replace(/\W+/g, "-").toLowerCase()}`);
  await expect(anon.getByText(`${homeName} 3:1 ${awayName}`)).toBeVisible();

  // Rangliste: Monatswertung und Torjäger
  await anon.goto("/rangliste");
  await expect(anon.getByRole("link", { name: homeName })).toBeVisible();
  await expect(anon.getByRole("link", { name: `Torjaeger ${run}` })).toBeVisible();

  // Spieler des Spiels: Mitspieler stimmt ab, Gegner nicht auf der Liste der eigenen Wahl
  const mateEmail = `cmate-${run}@test.local`;
  const p = await (await browser.newContext()).newPage();
  await p.goto(`/anmelden?next=${encodeURIComponent(`/spiele/${matchId}`)}`);
  await p.getByLabel("E-Mail").fill(mateEmail);
  await p.getByLabel("Name").fill(`Mitspieler ${run}`);
  await p.getByRole("button", { name: "Als Dev-Nutzer anmelden" }).click();
  await expect(p).toHaveURL(new RegExp(`/spiele/${matchId}`));
  const panel = p.getByRole("region", { name: "Spieler des Spiels" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: new RegExp(`Mitspieler ${run}`) })).toHaveCount(0); // nicht für sich selbst
  await panel.getByRole("button", { name: new RegExp(`Torjaeger ${run}`) }).click();
  await expect(panel.getByRole("button", { name: new RegExp(`Torjaeger ${run}`) })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await query("select 1 from mvp_votes where match_id = $1", [matchId])).length).toBe(1);
  expect(await userIdByEmail(mateEmail)).toBe(mate);
});
