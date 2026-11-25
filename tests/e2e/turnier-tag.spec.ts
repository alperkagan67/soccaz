import { expect, test } from "@playwright/test";
import { closeContexts, devLogin, onboard, run, seedUser } from "./helpers";
import { callJob, query, seedAdmin, userIdByEmail } from "./helpers-db";
import { login } from "./helpers-wertung";
import {
  addPlayer, seedFreeTournament, decideTieOnMatchPage, expectCleanPhonePage, forfeitOnPage, goalsThenAbpfiff, loginPhone, nextOpen, phonePage, playToEnd, seedOrganizer, seedTeam, waitDecided,
} from "./turnier-tag-helpers";

// Gratis-Turnier PR D: der Turniertag (12.12.) als ein durchgehender Ablauf mit 6 Teams (Freilose) auf dem Handy (390 px), Zahlungen AUS wie in Produktion.
// Echt bedient: Veranstalter-Formular, EIN neuer Nutzer über den Einladungslink, Abpfiff, Unentschieden, Kampflos, Fehlerpfad, Meldung durch Captains. Der Rest (5 weitere Teams) kommt per SQL (Laufzeit).
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Turniertag mit 6 Teams: Anlegen, neuer Nutzer über Link, Bracket ohne Klick, Abpfiff, Golden Goal auf der Spielseite, Kampflos, Finale, Sieger", async ({ browser }) => {
  const org = await seedOrganizer("tg6o");
  const orgPage = await loginPhone(browser, org.email, org.name);

  // --- 2.1 Anlegen (Handy): kein Preisfeld, Teamlimit 16, Anmeldeschluss-Vorschlag
  await orgPage.goto("/app/turniere/neu");
  await expect(orgPage.getByTestId("free-explainer")).toBeVisible({ timeout: 60_000 });
  await expect(orgPage.getByLabel(/Hallenpreis/)).toHaveCount(0);
  await expect(orgPage.locator("#maxTeams")).toHaveAttribute("max", "16");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await orgPage.getByLabel("Name des Turniers").fill(`Tag-Cup 6 ${run}`);
  await orgPage.locator("#maxTeams").fill("6");
  await orgPage.getByLabel(/Termin \(Beginn\)/).fill(`${day(12)}T10:00`);
  await expect(orgPage.getByLabel("Anmeldeschluss")).toHaveValue(`${day(8)}T10:00`);
  await orgPage.waitForLoadState("networkidle");
  await orgPage.getByRole("button", { name: "Turnier anlegen" }).click();
  await expect(orgPage).toHaveURL(/\/turniere\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const tid = orgPage.url().split("/turniere/")[1].split("?")[0];
  await expect(orgPage.getByTestId("free-flow")).toBeVisible();
  expect((await query<{ total_cents: number }>("select total_cents from tournaments where id = $1", [tid]))[0].total_cents).toBe(0);
  await expectCleanPhonePage(orgPage, "Turnierseite Veranstalter (angelegt)");
  const link = await orgPage.getByLabel("Einladungslink zum Turnier").first().inputValue();
  expect(link).toContain(`/turniere/${tid}?t=`);
  const token = link.split("?t=")[1];

  // --- fünf Teams per SQL angemeldet und vollzählig
  const seeded = [];
  for (let i = 1; i <= 5; i++) seeded.push(await seedTeam(tid, `tg6t${i}`, true));

  // --- 2.2 neuer Nutzer über den Einladungslink (Gast sieht Anmelden und mitmachen)
  const fresh = await phonePage(browser);
  await fresh.goto(`/turniere/${tid}?t=${token}`);
  await fresh.waitForLoadState("networkidle");
  await expectCleanPhonePage(fresh, "Turnierseite Gast");
  await fresh.getByRole("link", { name: "Anmelden und mitmachen" }).click();
  await expect(fresh).toHaveURL(/\/anmelden\?next=/, { timeout: 20_000 });
  await fresh.getByLabel("E-Mail").fill(`tg6new-${run}@test.local`);
  await fresh.getByLabel("Name").fill("Spieler tg6new");
  await fresh.getByRole("button", { name: "Als Dev-Nutzer anmelden" }).click();
  await onboard(fresh, "1995-05-05");
  await expect(fresh).toHaveURL(new RegExp(`/turniere/${tid}\\?t=${token}$`), { timeout: 30_000 });
  await fresh.getByTestId("no-team-hint").getByRole("link", { name: "Team gründen" }).click();
  const teamNew = `Tag tg6new ${run}`;
  await fresh.getByLabel("Teamname").fill(teamNew);
  await fresh.getByRole("button", { name: "Team gründen" }).click();
  await expect(fresh).toHaveURL(new RegExp(`/turniere/${tid}\\?t=${token}$`), { timeout: 30_000 });
  await fresh.getByRole("button", { name: "Team anmelden" }).click();
  await expect(fresh.getByTestId("tournament-team").filter({ hasText: teamNew })).toBeVisible({ timeout: 20_000 });
  await expect(fresh.getByTestId("register-hint")).toHaveCount(0); // nach der Anmeldung steht das Formular nicht mehr da
  await expectCleanPhonePage(fresh, "Turnierseite neuer Captain");

  // --- 2.3 Kader füllen (3 Mitspieler per SQL), "Team ist vollzählig": das Bracket entsteht OHNE Klick auf Schließen und OHNE zweites Bereit
  const newId = await userIdByEmail(`tg6new-${run}@test.local`);
  const [{ id: newTeamId }] = await query<{ id: string }>("select id from teams where name = $1", [teamNew]);
  for (let p = 1; p <= 3; p++) {
    const uid = (await query<{ id: string }>("insert into users (email, name, city, onboarded_at, age_confirmed_at, terms_accepted_at) values ($1, $2, 'Essen', now(), now(), now()) returning id", [`tg6np${p}-${run}@test.local`, `Spieler np${p}`]))[0].id;
    await addPlayer(tid, newTeamId, uid);
  }
  expect(newId).toBeTruthy();
  expect((await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length).toBe(0);
  await fresh.reload();
  await fresh.waitForLoadState("networkidle");
  await fresh.getByRole("button", { name: "Team ist vollzählig" }).click();
  await expect.poll(async () => (await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length, { timeout: 30_000 }).toBe(5);
  expect((await query<{ status: string }>("select status from tournaments where id = $1", [tid]))[0].status).toBe("running");
  await orgPage.goto(`/turniere/${tid}`);
  await expect(orgPage.getByTestId("tournament-match")).toHaveCount(5, { timeout: 30_000 });
  await expectCleanPhonePage(orgPage, "Turnierseite Veranstalter (Bracket)");

  // --- 2.4 Spieltag. Spiel 1: Tore, Abpfiff mit Fehlerpfad (erst scheitert die Aktion, dann klappt sie)
  const m1 = (await nextOpen(tid))!;
  await goalsThenAbpfiff(orgPage, m1, 2, 1, { failFirst: true });
  await waitDecided(m1.id);
  expect((await query<{ score_a: number; score_b: number }>("select score_a, score_b from tournament_matches where id = $1", [m1.id]))[0]).toEqual({ score_a: 2, score_b: 1 });
  expect((await query<{ status: string }>("select status from matches where id = $1", [m1.match_id]))[0].status).toBe("played"); // sofort endgültig, kein Bestätigen des Gegners

  // Spiel 2: Unentschieden 0:0 -> Golden Goal auf der Spielseite, Sieger rückt erst danach weiter
  const m2 = (await nextOpen(tid))!;
  await goalsThenAbpfiff(orgPage, m2, 0, 0);
  await expect.poll(async () => (await query<{ score_a: number | null }>("select score_a from tournament_matches where id = $1", [m2.id]))[0].score_a, { timeout: 30_000 }).toBe(0);
  await decideTieOnMatchPage(orgPage, m2, m2.nb); // Spielseite nach dem Abpfiff: Golden Goal für das zweite Team (Plan 0:1, Sieger rückt weiter); Neunmeter am Bracket deckt turnier-tiebreak.spec ab

  // Captains melden: das nächste Spiel melden die beiden Captains selbst (melden, der Gegner bestätigt; Abpfiff gibt es für Captains nicht)
  const m3 = (await nextOpen(tid))!;
  const capOf = async (teamId: string) => {
    const [r] = await query<{ email: string; name: string }>("select u.email, u.name from tournament_teams tt join users u on u.id = tt.captain_id where tt.tournament_id = $1 and tt.team_id = $2", [tid, teamId]);
    return r;
  };
  const home = await capOf(m3.team_a);
  const away = await capOf(m3.team_b);
  await query("update matches set starts_at = now() - interval '1 hour' where id = $1", [m3.match_id]);
  const homePage = await phonePage(browser);
  await login(homePage, home.email, home.name);
  await homePage.goto(`/spiele/${m3.match_id}`);
  await homePage.waitForLoadState("networkidle");
  await expect(homePage.getByTestId("end-match")).toHaveCount(0);
  await homePage.getByLabel(m3.na, { exact: true }).fill("3");
  await homePage.getByLabel(m3.nb, { exact: true }).fill("2");
  await homePage.getByRole("button", { name: "Ergebnis melden", exact: true }).click();
  await expect.poll(async () => (await query("select 1 from match_results where match_id = $1", [m3.match_id])).length).toBe(1);
  const awayPage = await phonePage(browser);
  await login(awayPage, away.email, away.name);
  await awayPage.goto(`/spiele/${m3.match_id}`);
  await awayPage.waitForLoadState("networkidle");
  await awayPage.getByRole("button", { name: "Bestätigen" }).click();
  await waitDecided(m3.id);

  // Kampflos: das nächste Spiel (falls beide Teams feststehen) wird für das Heimteam gewertet
  const m4 = (await nextOpen(tid))!;
  await forfeitOnPage(orgPage, tid, m4, m4.na);
  expect((await query<{ score_a: number; score_b: number }>("select score_a, score_b from tournament_matches where id = $1", [m4.id]))[0]).toEqual({ score_a: 3, score_b: 0 });
  expect((await query("select 1 from audit_log where action = 'tournament.forfeit' and entity_id = $1", [tid])).length).toBe(1);

  // Rest bis zum Finale von Hand, dann Turnier beendet und Sieger sichtbar
  await playToEnd(orgPage, tid);
  await expect.poll(async () => (await query<{ status: string }>("select status from tournaments where id = $1", [tid]))[0].status, { timeout: 30_000 }).toBe("finished");
  await orgPage.goto(`/turniere/${tid}`);
  await expect(orgPage.getByTestId("winner")).toContainText("Turniersieger", { timeout: 30_000 });
  await expectCleanPhonePage(orgPage, "Turnierseite Veranstalter (beendet)");
  expect(seeded.length).toBe(5);
});

test("Erinnerung per Job: 24 h vor dem Start genau EINE Mitteilung an den Veranstalter, ohne Namen Dritter, kein Absagen", async ({ baseURL }) => {
  const org = await seedOrganizer("tg6r");
  const { id: tid } = await seedFreeTournament(org.id, "tg6r", 8);
  const team = await seedTeam(tid, "tg6rt1", true);
  await query("update tournaments set starts_at = now() + interval '20 hours', registration_deadline = now() + interval '10 hours', starts_on = (now() + interval '20 hours')::date where id = $1", [tid]);
  const reminders = () => query<{ body: string }>("select body from notifications where user_id = $1 and url = $2 and title = 'Das Turnier beginnt bald'", [org.id, `/turniere/${tid}`]);
  await callJob(baseURL!, "lobby-deadlines"); // Frist-Job: Erinnerung, KEINE Absage (Gratis)
  const first = await reminders();
  expect(first).toHaveLength(1);
  expect(first[0].body).not.toContain(team.name);
  await callJob(baseURL!, "lobby-deadlines");
  expect(await reminders()).toHaveLength(1); // zweiter Lauf: keine zweite Erinnerung
  expect((await query<{ status: string }>("select status from tournaments where id = $1", [tid]))[0].status).toBe("registration");
});

test("Checkliste is_organizer: ohne Recht nur Hinweis, Admin schaltet frei, danach das Formular; Captain sieht keinen Veranstalterkasten", async ({ browser }) => {
  const userId = await seedUser("tg6chk", "Spieler tg6chk");
  const email = `tg6chk-${run}@test.local`;
  const page = await loginPhone(browser, email, "Spieler tg6chk");
  await page.goto("/app/turniere/neu");
  await expect(page.getByTestId("organizer-info")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Name des Turniers")).toHaveCount(0);
  await seedAdmin("tg6adm");
  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `tg6adm-${run}@test.local`, "Admin tg6adm", `/admin/nutzer?q=${encodeURIComponent(email)}`);
  await expect(admin.getByText("stoppt keine laufenden Turniere")).toBeVisible({ timeout: 60_000 });
  await admin.getByTestId(`user-${email}`).getByRole("button", { name: "Als Turnier-Veranstalter freischalten" }).click();
  await expect.poll(async () => (await query<{ is_organizer: boolean }>("select is_organizer from users where id = $1", [userId]))[0].is_organizer, { timeout: 30_000 }).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Name des Turniers")).toBeVisible({ timeout: 30_000 });
  // Captain eines angemeldeten Teams: kein Veranstalterkasten, kein Schließen
  const org = await seedOrganizer("tg6chko");
  const { id: tid } = await seedFreeTournament(org.id, "tg6chk", 8);
  const team = await seedTeam(tid, "tg6chkt", false);
  const cap = await loginPhone(browser, team.captainEmail, "Captain tg6chkt");
  await cap.goto(`/turniere/${tid}`);
  await expect(cap.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });
  await expect(cap.getByTestId("organizer-box")).toHaveCount(0);
  await expect(cap.getByRole("button", { name: /Anmeldung schließen/ })).toHaveCount(0);
});
