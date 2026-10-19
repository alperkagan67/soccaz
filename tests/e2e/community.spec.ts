import { expect, test } from "@playwright/test";
import { addParticipant, addTeamMember, closeContexts, createTeam, futureLocal, newUser, run, seedUser, testDb } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function slugOf(teamName: string) {
  return (await query<{ slug: string }>("select slug from teams where name = $1", [teamName]))[0].slug;
}

test("Herausforderung: nur das Zielteam kann annehmen, nie in der öffentlichen Liste", async ({ browser }) => {
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

  await a.goto(`/teams/${await slugOf(teamB)}`);
  await a.getByRole("link", { name: "Herausfordern" }).click();
  await expect(a.getByTestId("challenge-banner")).toContainText(teamB);
  await a.getByLabel(/Anstoß/).fill(futureLocal(9));
  await a.getByRole("button", { name: "Herausfordern" }).click();
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();
  await expect(a.getByRole("heading", { name: new RegExp(`${teamA}.*fordert.*${teamB}.*heraus`) })).toBeVisible();

  // nicht in der öffentlichen Liste, auch nicht auf der Startseite
  await c.goto("/suche");
  await expect(c.getByText(teamA)).toHaveCount(0);
  await c.goto("/");
  await expect(c.getByText(teamA)).toHaveCount(0);

  // Team C darf nicht annehmen
  await c.goto(url);
  await expect(c.getByText(/gilt .* Nur deren Team-Admins/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Spiel annehmen" })).toHaveCount(0);

  // Die Herausforderung steht bei B in "Mein Bereich" und unter Spielsuchen, bei A als ausgehende; bei C nirgends
  await b.goto("/app");
  await expect(b.getByTestId("challenge-incoming")).toContainText(teamA);
  await b.goto("/suche");
  await expect(b.getByTestId("challenge-incoming")).toContainText(teamA);
  await a.goto("/app");
  await expect(a.getByTestId("challenge-outgoing")).toContainText(teamB);
  await c.goto("/app");
  await expect(c.getByTestId("challenges")).toHaveCount(0);

  // Team B wurde benachrichtigt und nimmt an
  await b.goto("/app/benachrichtigungen");
  await expect(b.getByText("Ihr wurdet herausgefordert")).toBeVisible();
  await b.goto(url);
  await b.getByRole("button", { name: "Spiel annehmen" }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
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
