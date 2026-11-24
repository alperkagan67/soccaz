import { expect, test, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, newUser, run, seedUser, testDb } from "./helpers";
import { query, seedAdmin, userIdByEmail } from "./helpers-db";

// AC-17 (Entscheid t2q 2026-11-24), PR B: Rangliste, Spielerliste und Mitspieler gesucht: Angemeldete sehen Name und Link, Gäste und reine Hallenbetreiber Initialen und Zahlen ohne Link und ohne Position.
// Geprüft am ausgelieferten HTML UND an der RSC-Nutzlast (Header RSC: 1). Die Namenssuche der Spielerliste gilt nur angemeldet (q wird für alle anderen auch in der Adresse ignoriert).
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await query("delete from venue_access where venue_id in (select id from venues where name like $1)", [`Listen-Halle %${run}`]);
  await closeTestDb();
});

const NAME = `Zorro Vollname${run}`;
const NOTIZ = `Notiz Listen ${run}`;
const SEITEN = ["/rangliste", "/spieler", "/mitspieler"];

async function rohdaten(page: Page, url: string) {
  const html = await (await page.request.get(url)).text();
  const rsc = await (await page.request.get(url, { headers: { RSC: "1" } })).text();
  return { html, rsc };
}

test("Spielernamen in Listen je Rolle: Gast und Betreiber Initialen ohne Link, Spieler und Admin Name mit Link; nie Name oder Kennung im HTML/RSC der Gast- und Betreiber-Sicht", async ({ browser }) => {
  const id = await seedUser("knlist", NAME);
  await testDb().query("insert into player_stats (user_id, matches, goals, elo) values ($1, 12, 5, 1150) on conflict (user_id) do update set matches = 12, goals = 5, elo = 1150", [id]);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await testDb().query("insert into free_player_posts (user_id, city, day, note) values ($1, 'Gelsenkirchen', $2, $3)", [id, tomorrow, NOTIZ]);

  // Gast
  const gast = await (await browser.newContext()).newPage();
  for (const seite of SEITEN) {
    const { html, rsc } = await rohdaten(gast, seite);
    // erst belegen, dass die Person in der Gast-Liste wirklich vorkommt (als Initialen): sonst wären die Negativprüfungen leer (R-T380)
    expect(html, `${seite}: die Initialen stehen im Gast-HTML (sonst ist die Prüfung leer)`).toContain(">ZV<");
    for (const t of [html, rsc]) {
      expect(t, `${seite}: Name im Gast-HTML/RSC`).not.toContain(NAME);
      expect(t, `${seite}: Nachname im Gast-HTML/RSC`).not.toContain(`Vollname${run}`);
      expect(t, `${seite}: Kennung im Gast-HTML/RSC`).not.toContain(id);
    }
  }
  await gast.goto("/mitspieler");
  const gastPost = gast.getByRole("listitem").filter({ hasText: NOTIZ });
  await expect(gastPost.getByTestId("person-name")).toHaveText("ZV");
  await expect(gastPost.getByRole("link")).toHaveCount(0);
  await expect(gastPost).not.toContainText("Mittelfeld"); // Position nur für Angemeldete
  await gast.goto("/spieler");
  await expect(gast.getByTestId("person-name").first()).toBeVisible();
  await expect(gast.getByLabel("Name", { exact: true })).toHaveCount(0); // keine Namenssuche
  await expect(gast.locator('main a[href^="/spieler/"]')).toHaveCount(0);
  await gast.goto(`/spieler?q=ZZZ${run}`);
  await expect(gast.getByText("Keine Spieler gefunden.")).toHaveCount(0); // q wird für Gäste ignoriert (sonst ließen sich Namen erraten)

  // Spieler: Name mit Link, Namenssuche, Position
  const spieler = await (await browser.newContext()).newPage();
  await newUser(spieler, "knlsp");
  await spieler.goto("/mitspieler");
  const post = spieler.getByRole("listitem").filter({ hasText: NOTIZ });
  await expect(post.getByTestId("person-name")).toHaveText(NAME);
  await expect(post.getByTestId("person-name")).toHaveAttribute("href", `/spieler/${id}`);
  await expect(post).toContainText("Mittelfeld");
  await spieler.goto(`/spieler?q=ZZZ${run}`);
  await expect(spieler.getByText("Keine Spieler gefunden.")).toBeVisible(); // die Suche greift für Angemeldete
  await spieler.goto(`/spieler?q=Vollname${run}`);
  await expect(spieler.locator(`main a[href="/spieler/${id}"]`).filter({ hasText: NAME })).toBeVisible(); // die ganze Zeile ist der Link
  await spieler.goto("/rangliste");
  await expect(spieler.getByTestId("person-name").filter({ hasText: NAME }).first()).toHaveAttribute("href", `/spieler/${id}`);

  // reiner Hallenbetreiber: wie Gast
  const boss = await (await browser.newContext()).newPage();
  await newUser(boss, "knlbo");
  const bossId = await userIdByEmail(`knlbo-${run}@test.local`);
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Listen-Halle ${run}`, bossId]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, bossId]);
  for (const seite of SEITEN) {
    const { html, rsc } = await rohdaten(boss, seite);
    expect(html, `${seite}: die Initialen stehen im Betreiber-HTML (sonst ist die Prüfung leer)`).toContain(">ZV<");
    for (const t of [html, rsc]) {
      expect(t, `${seite}: Name in der Betreiber-Sicht`).not.toContain(NAME);
      expect(t, `${seite}: Kennung in der Betreiber-Sicht`).not.toContain(id);
    }
  }
  await boss.goto(`/spieler?q=ZZZ${run}`);
  await expect(boss.getByText("Keine Spieler gefunden.")).toHaveCount(0);

  // Plattform-Admin: Name mit Link
  await seedAdmin("knlad");
  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `knlad-${run}@test.local`, "Admin knlad");
  await expect(admin).toHaveURL(/\/app/);
  await admin.goto("/mitspieler");
  await expect(admin.getByRole("listitem").filter({ hasText: NOTIZ }).getByTestId("person-name")).toHaveText(NAME);
});

// R-T380: Rollentests für die drei weiteren Seiten dieses PR (Turnier, offene Lobby, Einladung). Seeds wie turnier-freigabe.spec und basics.spec; eigene Namen mit "Vollname", damit Treffer eindeutig sind.
const NAME_CAP = `Kapitan Vollname${run}`;
const NAME_MATE = `Mitspieler Vollname${run}`;

async function betreiber(browser: import("@playwright/test").Browser, key: string) {
  const p = await (await browser.newContext()).newPage();
  await newUser(p, key);
  const uid = await userIdByEmail(`${key}-${run}@test.local`);
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Listen-Halle ${key} ${run}`, uid]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, uid]);
  return { p, uid };
}

test("Turnier (öffentlich): Veranstalter, Captain und Spieler je Rolle; Captain, der zugleich Betreiber ist, sieht Namen (participant/teamAdmin verdrahtet)", async ({ browser }) => {
  const org = await seedUser("kntorg", NAME);
  const cap = await seedUser("kntcap", NAME_CAP);
  const mate = await seedUser("kntmate", NAME_MATE);
  const [team] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Turnier-Namen ${run}`, `e2e-knt-${run}`, cap]);
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, final_share_cents, status, registration_deadline, starts_at, is_private, price_round, venue_access_required_snapshot, commission_percent_snapshot)
     values ($1, $2, 'Essen', (now() + interval '5 days')::date, 'knockout', 2, 16000, 8000, 120, 1000, 'payment', now() + interval '3 days', now() + interval '5 days', false, 1, false, 10.00) returning id`,
    [org, `Namen-Cup ${run}`],
  );
  await query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at) values ($1, $2, $3, now())", [t.id, team.id, cap]);
  for (const u of [cap, mate]) {
    await query("insert into team_members (team_id, user_id, role) values ($1, $2, $3) on conflict do nothing", [team.id, u, u === cap ? "admin" : "player"]);
    await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3)", [t.id, team.id, u]);
  }
  const url = `/turniere/${t.id}`;
  const NAMEN = [NAME, NAME_CAP, NAME_MATE, `Vollname${run}`];

  // Gast: Veranstalter "Zorro V." (Vorname + Initial, t2q), Captain KV, Spieler KV und MV als Initialen, weder HTML noch RSC enthalten Name oder Kennung
  const gast = await (await browser.newContext()).newPage();
  await gast.goto(url);
  await expect(gast.getByTestId("team-captain")).toContainText("Captain: KV"); // die Zeile "–" (Zuschauer) darf es nicht sein: Initialen sind belegt
  await expect(gast.getByTestId("tournament-player").getByTestId("person-name")).toHaveText(["KV", "MV"]);
  await expect(gast.getByText("Veranstalter: Zorro V. ·", { exact: false })).toBeVisible(); // exakt Vorname + Initial, nie der Nachname (die NAMEN-Prüfung unten schließt "Zorro Vollname" aus)
  const g = await rohdaten(gast, url);
  expect(g.html).toContain(">KV<");
  for (const text of [g.html, g.rsc]) {
    for (const n of NAMEN) expect(text.split("Zorro V.").join(""), `Turnier Gast: ${n}`).not.toContain(n);
    for (const id of [org, cap, mate]) expect(text, "Turnier Gast: Kennung").not.toContain(id);
  }

  // Spieler (angemeldet, nicht beteiligt): Namen mit Link
  const spieler = await (await browser.newContext()).newPage();
  await newUser(spieler, "kntsp");
  await spieler.goto(url);
  await expect(spieler.getByTestId("team-captain")).toContainText(`Captain: ${NAME_CAP}`);
  await expect(spieler.getByText(new RegExp(`Veranstalter: ${NAME}`))).toBeVisible();
  await expect(spieler.getByTestId("tournament-player").getByTestId("person-name").first()).toHaveAttribute("href", /\/spieler\//);

  // reiner Betreiber: wie Gast
  const { p: boss } = await betreiber(browser, "kntbo");
  await boss.goto(url);
  await expect(boss.getByTestId("tournament-player").getByTestId("person-name")).toHaveText(["KV", "MV"]);
  const b = await rohdaten(boss, url);
  expect(b.html).toContain(">KV<");
  for (const text of [b.html, b.rsc]) for (const n of NAMEN) expect(text, `Turnier Betreiber: ${n}`).not.toContain(n);

  // Captain, der zugleich Hallenbetreiber ist: Teilnehmer und Team-Admin gewinnen, Namen sichtbar (Argumente participant/teamAdmin)
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Listen-Halle kntcap ${run}`, cap]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, cap]);
  const capPage = await (await browser.newContext()).newPage();
  await devLogin(capPage, `kntcap-${run}@test.local`, NAME_CAP);
  await expect(capPage).toHaveURL(/\/app/);
  await capPage.goto(url);
  await expect(capPage.getByTestId("team-captain")).toContainText(`Captain: ${NAME_CAP}`);
  expect(await capPage.getByTestId("tournament-player").getByTestId("person-name").allTextContents()).toContain(NAME_MATE);

  // Plattform-Admin: Namen
  await seedAdmin("kntad");
  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `kntad-${run}@test.local`, "Admin kntad");
  await expect(admin).toHaveURL(/\/app/);
  await admin.goto(url);
  await expect(admin.getByTestId("team-captain")).toContainText(`Captain: ${NAME_CAP}`);
});

test("Offene Lobby: Gast und Betreiber sehen keine Namen (der Server liefert sie nur Teammitgliedern); Captain und Captain+Betreiber sehen Namen", async ({ browser }) => {
  const cap = await seedUser("kolcap", NAME_CAP);
  const mate = await seedUser("kolmate", NAME_MATE);
  const [team] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Offen-Namen ${run}`, `e2e-kol-${run}`, cap]);
  for (const u of [cap, mate]) await query("insert into team_members (team_id, user_id, role) values ($1, $2, $3) on conflict do nothing", [team.id, u, u === cap ? "admin" : "player"]);
  const from = new Date(Date.now() + 3 * 86_400_000);
  from.setUTCHours(17, 0, 0, 0);
  const to = new Date(from.getTime() + 3 * 3_600_000);
  const [q] = await query<{ id: string }>("insert into matchmaking_queue (team_id, created_by, city, duration_min, windows, note, expires_at) values ($1, $2, 'Essen', 60, $3::jsonb, 'Offen-Namen', now() + interval '2 days') returning id", [team.id, cap, JSON.stringify([{ from: from.toISOString(), to: to.toISOString() }])]);
  const url = `/lobby/offen/${q.id}`;

  const gast = await (await browser.newContext()).newPage();
  await gast.goto(url);
  await expect(gast.getByTestId("open-lobby-team")).toBeVisible(); // die Seite ist da: die Negativprüfung ist nicht leer
  const g = await rohdaten(gast, url);
  expect(g.html).toContain("open-lobby-team");
  for (const text of [g.html, g.rsc]) for (const n of [NAME_CAP, NAME_MATE, `Vollname${run}`, cap, mate]) expect(text, `Offene Lobby Gast: ${n}`).not.toContain(n);

  const { p: boss } = await betreiber(browser, "kolbo");
  await boss.goto(url);
  await expect(boss.getByTestId("open-lobby-team")).toBeVisible();
  const b = await rohdaten(boss, url);
  for (const text of [b.html, b.rsc]) for (const n of [NAME_CAP, NAME_MATE]) expect(text, `Offene Lobby Betreiber: ${n}`).not.toContain(n);

  // Captain (Mitglied): Namen; Captain, der zugleich Betreiber ist: weiter Namen (participant/teamAdmin verdrahtet)
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Listen-Halle kolcap ${run}`, cap]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, cap]);
  const capPage = await (await browser.newContext()).newPage();
  await devLogin(capPage, `kolcap-${run}@test.local`, NAME_CAP);
  await expect(capPage).toHaveURL(/\/app/);
  await capPage.goto(url);
  await expect(capPage.getByTestId("open-lobby-team")).toContainText(NAME_MATE);
});

test("Privatspiel-Einladung: Gäste sehen den Veranstalter als Vorname und Initial, nie den Nachnamen (angemeldete Nutzer werden direkt ins Spiel geleitet und sehen die Seite nicht)", async ({ browser }) => {
  const organizer = await seedUser("kseorg", `Alper Vollname${run}`);
  const [rot] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, kind) values ('Team Rot', $1, 'Essen', $2, 'private') returning id", [`privat-kse-${run}-rot`, organizer]);
  const [blau] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, kind) values ('Team Blau', $1, 'Essen', $2, 'private') returning id", [`privat-kse-${run}-blau`, organizer]);
  const [m] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, kind, visibility) values ($1, $2, now() + interval '3 days', 60, 'lobby', 'private', 'private') returning id", [rot.id, blau.id]);
  const token = `kse-${run}`;
  await query("insert into game_invites (token, match_id, created_by, expires_at) values ($1, $2, $3, now() + interval '7 days')", [token, m.id, organizer]);
  const url = `/spiel/${token}`;
  const gast = await (await browser.newContext()).newPage();
  await gast.goto(url);
  const initial = `Vollname${run}`.slice(0, 1).toUpperCase();
  await expect(gast.getByTestId("game-organizer")).toContainText(`Alper ${initial}.`);
  const g = await rohdaten(gast, url);
  expect(g.html).toContain("game-organizer");
  for (const text of [g.html, g.rsc]) {
    expect(text, "Einladung: Nachname").not.toContain(`Vollname${run}`);
    expect(text, "Einladung: Kennung").not.toContain(organizer);
  }
});
