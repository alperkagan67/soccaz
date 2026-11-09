import { expect, test, type Page } from "@playwright/test";
import { closeContexts, createTeam, devLogin, futureLocal, newUser, onboard, run, seedUser, addTeamMember, teamIdByName } from "./helpers";
import { fundWallet, query } from "./helpers-db";

// Vertrag 005, End-to-End-Nachweis (AC-12, AC-13 und der Gesamtablauf):
// Organisator legt ein privates Turnier an, Teams treten per Einladungslink bei (ein Nutzer ganz neu über die Anmeldung,
// einer ohne Team gründet erst eins), alle zahlen, Captains drücken "Bereit", das Bracket entsteht erst dann, Ergebnisse bis ins Finale.
// Die Testdaten räumt global-teardown (cleanupTestData) über den Veranstalter-Nutzer auf.
test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function ctxPage(browser: import("@playwright/test").Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test("Turnier-Ablauf: Einladungslink, neuer Nutzer, Team gründen und zurück, Zahlen, Bereit, Bracket, Finale", async ({ browser }) => {
  // --- Organisator legt ein privates Turnier an
  const org = await ctxPage(browser);
  await newUser(org, "taorg");
  const orgId = (await query<{ id: string }>("select id from users where email = $1", [`taorg-${run}@test.local`]))[0].id;
  await query("update users set is_organizer = true where id = $1", [orgId]);

  await org.goto("/app/turniere/neu");
  await org.waitForLoadState("networkidle");
  await org.getByLabel("Name des Turniers").fill(`Ablauf Cup ${run}`);
  await org.getByLabel("Anzahl Teams (4 bis 32)").fill("4");
  await org.getByLabel("Spielort").fill("Soccerhalle Test");
  await org.getByLabel("Termin (Beginn)").fill(futureLocal(6, "12:00"));
  await org.getByLabel("Anmeldeschluss").fill(futureLocal(4, "12:00"));
  await org.getByLabel(/Hallenzeit/).fill("2");
  await org.getByLabel(/Hallenpreis pro Stunde/).fill("80");
  await org.getByRole("button", { name: "Turnier anlegen" }).click();
  await expect(org).toHaveURL(/\/turniere\/[0-9a-f-]{36}/, { timeout: 40_000 });
  const tid = org.url().split("/turniere/")[1].split("?")[0];
  await expect(org.getByTestId("tournament-meta")).toContainText("privat");
  const link = await org.getByLabel("Einladungslink zum Turnier").first().inputValue();
  const token = link.split("?t=")[1];
  expect(link).toContain(`/turniere/${tid}?t=`);
  const tournamentPath = `/turniere/${tid}?t=${token}`;

  // --- Regression: ein Fremder ohne Konto sieht weder Kader noch Zahlungsstand noch Einladungslink
  const anon = await ctxPage(browser);
  await anon.goto(`/turniere/${tid}`);
  await anon.waitForLoadState("networkidle");
  await expect(anon.getByTestId("tournament-name")).toHaveCount(1);
  await expect(anon.getByText("Einladungslink")).toHaveCount(0);
  await expect(anon.getByTestId("tournament-player")).toHaveCount(0);

  // --- Teams 1 bis 3: bestehende Nutzer mit Team treten über den Link bei
  const caps: { page: Page; team: string; id: string }[] = [];
  for (const key of ["ta1", "ta2", "ta3"]) {
    const page = await ctxPage(browser);
    await newUser(page, key);
    const team = `Ablauf ${key} ${run}`;
    await createTeam(page, team);
    await page.goto(link);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Team anmelden" }).click();
    await expect(page.getByTestId("tournament-team").filter({ hasText: team })).toBeVisible({ timeout: 20_000 });
    const id = (await query<{ id: string }>("select id from users where email = $1", [`${key}-${run}@test.local`]))[0].id;
    caps.push({ page, team, id });
  }

  // --- Team 4: ein ganz neuer Nutzer (AC-13): Link öffnen, anmelden, Onboarding, zurück im Turnier mit Einladung
  const fresh = await ctxPage(browser);
  await fresh.goto(tournamentPath);
  await fresh.waitForLoadState("networkidle");
  await fresh.getByRole("link", { name: "Anmelden und mitmachen" }).click();
  await expect(fresh).toHaveURL(/\/anmelden\?next=/);
  await fresh.getByLabel("E-Mail").fill(`ta4-${run}@test.local`);
  await fresh.getByLabel("Name").fill("Spieler ta4");
  await fresh.getByRole("button", { name: "Als Dev-Nutzer anmelden" }).click();
  await onboard(fresh, "1995-05-05");
  await expect(fresh).toHaveURL(new RegExp(`/turniere/${tid}\\?t=${token}$`), { timeout: 30_000 }); // Token bleibt erhalten
  await expect(fresh.getByTestId("tournament-name")).toBeVisible();

  // --- AC-12: kein Team -> Hinweis mit Link "Team gründen", nach der Gründung zurück im Turnier
  await expect(fresh.getByTestId("no-team-hint")).toBeVisible();
  await fresh.getByTestId("no-team-hint").getByRole("link", { name: "Team gründen" }).click();
  await expect(fresh).toHaveURL(/\/app\/teams\/neu\?next=/);
  const team4 = `Ablauf ta4 ${run}`;
  await fresh.getByLabel("Teamname").fill(team4);
  await fresh.getByRole("button", { name: "Team gründen" }).click();
  await expect(fresh).toHaveURL(new RegExp(`/turniere/${tid}\\?t=${token}$`), { timeout: 30_000 });
  await fresh.getByRole("button", { name: "Team anmelden" }).click();
  await expect(fresh.getByTestId("tournament-team").filter({ hasText: team4 })).toBeVisible({ timeout: 20_000 });
  const id4 = (await query<{ id: string }>("select id from users where email = $1", [`ta4-${run}@test.local`]))[0].id;
  caps.push({ page: fresh, team: team4, id: id4 });

  // --- Open-Redirect: fremde Rücksprungziele werden ignoriert, das neue Team landet auf seiner Teamseite
  for (const [i, bad] of ["https://evil.example/x", "//evil.example/x", "/\\evil.example/x"].entries()) {
    const p = await ctxPage(browser);
    await newUser(p, `tared${i}`);
    await p.goto(`/app/teams/neu?next=${encodeURIComponent(bad)}`);
    await p.getByLabel("Teamname").fill(`Redirect ${i} ${run}`);
    await p.getByRole("button", { name: "Team gründen" }).click();
    await p.waitForURL((url) => /^\/teams\/[a-z0-9-]+$/.test(url.pathname), { timeout: 30_000 });
    expect(new URL(p.url()).host).toBe(new URL(org.url()).host);
  }

  // --- Kader: je 4 Spieler (Captain plus 3), Spieler 1 von Team 1 geht den echten Weg, die anderen werden eingetragen
  const teamIds = new Map<string, string>();
  for (const c of caps) teamIds.set(c.team, await teamIdByName(c.team));
  const players = new Map<string, string[]>();
  for (const c of caps) {
    await fundWallet(c.id, 4000);
    const ids = [c.id];
    for (let i = 1; i <= 3; i++) {
      const uid = await seedUser(`${c.team.split(" ")[1]}p${i}`);
      await addTeamMember(teamIds.get(c.team)!, uid);
      ids.push(uid);
    }
    players.set(c.team, ids);
  }
  const t1 = caps[0];
  const p1id = players.get(t1.team)![1];
  await fundWallet(p1id, 1000);
  const p1email = (await query<{ email: string }>("select email from users where id = $1", [p1id]))[0].email;
  const p1 = await ctxPage(browser);
  await devLogin(p1, p1email, "Spieler Eins", tournamentPath);
  await p1.waitForLoadState("networkidle");
  await p1.getByTestId("tournament-team").filter({ hasText: t1.team }).getByRole("button", { name: "Dem Turnier-Kader beitreten" }).click();
  await expect.poll(async () => (await query("select 1 from tournament_players where tournament_id = $1 and user_id = $2", [tid, p1id])).length).toBe(1);
  for (const c of caps) {
    for (const uid of players.get(c.team)!.slice(c === t1 ? 2 : 1)) {
      await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3) on conflict do nothing", [tid, teamIds.get(c.team), uid]);
    }
  }

  // --- Alle Captains melden "vollzählig": erst dann steht der Preis fest
  for (const c of caps) {
    await c.page.goto(tournamentPath);
    await c.page.waitForLoadState("networkidle");
    await expect(c.page.getByTestId("bracket-hidden")).toBeVisible();
    await c.page.getByRole("button", { name: "Team ist vollzählig" }).click({ timeout: 10_000 }).catch(() => {});
    await expect(c.page.getByTestId("tournament-team").filter({ hasText: c.team })).toHaveAttribute("data-ready", "true", { timeout: 25_000 });
  }
  await expect.poll(async () => (await query<{ status: string }>("select status from tournaments where id = $1", [tid]))[0].status).toBe("payment");

  // --- Zahlen: Spieler 1 selbst, Captain 3 erst für einen einzelnen Spieler, danach alle Captains für die übrigen
  await p1.reload();
  await p1.getByRole("button", { name: /Anteil bezahlen/ }).click();
  await expect(p1.getByTestId("paid-note")).toBeVisible({ timeout: 20_000 });
  const t3 = caps[2];
  await t3.page.reload();
  await t3.page.getByTestId("tournament-team").filter({ hasText: t3.team }).getByRole("button", { name: "Ich zahle für ihn" }).first().click();
  await expect.poll(async () => (await query<{ n: number }>("select count(*)::int as n from tournament_players where tournament_id = $1 and team_id = $2 and paid_by = $3", [tid, teamIds.get(t3.team), t3.id]))[0].n).toBe(1);
  for (const c of caps) {
    await c.page.reload();
    await c.page.waitForLoadState("networkidle");
    await expect(c.page.getByTestId("bracket-hidden")).toBeVisible();
    await c.page.getByRole("button", { name: /Als Captain für alle offenen Spieler bezahlen/ }).click();
    await expect(c.page.getByTestId("captain-pay-box")).toHaveCount(0, { timeout: 20_000 });
    expect((await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length).toBe(0); // voll bezahlt, aber noch nicht bereit
  }

  // --- Bereit: das Bracket entsteht erst nach dem letzten Team
  for (const [i, c] of caps.entries()) {
    await c.page.reload();
    await c.page.waitForLoadState("networkidle");
    await c.page.getByTestId("paid-ready-box").getByRole("button", { name: "Bereit", exact: true }).click();
    await expect(c.page.getByTestId("tournament-team").filter({ hasText: c.team })).toHaveAttribute("data-paid-ready", "true", { timeout: 20_000 });
    if (i < 3) expect((await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length).toBe(0);
  }
  await expect.poll(async () => (await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length, { timeout: 20_000 }).toBe(3);
  await caps[3].page.reload();
  await expect(caps[3].page.getByTestId("tournament-match")).toHaveCount(3);

  // --- Ergebnisse über die Spielseite: ein Captain meldet, der andere bestätigt; zuletzt das Finale
  const pageOfTeam = (teamId: string) => caps.find((c) => teamIds.get(c.team) === teamId)!.page;
  const play = async (matchId: string, homeGoals: number, awayGoals: number) => {
    const m = (await query<{ home_team_id: string; away_team_id: string; hn: string; an: string }>(
      "select m.home_team_id, m.away_team_id, h.name as hn, a.name as an from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id where m.id = $1",
      [matchId],
    ))[0];
    await query("update matches set starts_at = now() - interval '1 hour' where id = $1", [matchId]);
    const home = pageOfTeam(m.home_team_id);
    const away = pageOfTeam(m.away_team_id);
    await home.goto(`/spiele/${matchId}`);
    await home.waitForLoadState("networkidle");
    await home.getByLabel(m.hn, { exact: true }).fill(String(homeGoals));
    await home.getByLabel(m.an, { exact: true }).fill(String(awayGoals));
    await home.getByRole("button", { name: "Ergebnis melden", exact: true }).click();
    await expect.poll(async () => (await query("select 1 from match_results where match_id = $1", [matchId])).length).toBe(1);
    await away.goto(`/spiele/${matchId}`);
    await away.waitForLoadState("networkidle");
    await away.getByRole("button", { name: "Bestätigen" }).click();
    await expect.poll(async () => (await query<{ status: string }>("select status from matches where id = $1", [matchId]))[0].status).toBe("played");
  };
  const semis = await query<{ match_id: string }>("select match_id from tournament_matches where tournament_id = $1 and stage = 'ko:4' order by slot", [tid]);
  await play(semis[0].match_id, 2, 1);
  await play(semis[1].match_id, 3, 0);
  const final = (await query<{ match_id: string | null }>("select match_id from tournament_matches where tournament_id = $1 and stage = 'ko:2'", [tid]))[0];
  expect(final.match_id).not.toBeNull(); // das Finale entsteht mit den beiden Siegern
  await play(final.match_id!, 2, 1);
  await expect.poll(async () => (await query<{ status: string }>("select status from tournaments where id = $1", [tid]))[0].status, { timeout: 20_000 }).toBe("finished");
  await org.reload();
  await expect(org.getByTestId("winner")).toBeVisible({ timeout: 20_000 });
});
