import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, devLogin, futureLocal, newUser, run, seedUser, testDb } from "./helpers";
import { query, seedAdmin } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function adminPage(browser: import("@playwright/test").Browser, key: string) {
  await seedAdmin(key);
  const page = await (await browser.newContext()).newPage();
  await devLogin(page, `${key}-${run}@test.local`, `Admin ${key}`);
  await expect(page).toHaveURL(/\/app$/);
  return page;
}

async function slugOf(name: string) {
  return (await query<{ slug: string }>("select slug from teams where name = $1", [name]))[0].slug;
}

async function seedTeam(key: string, name: string, city = "Essen") {
  const admin = await seedUser(key);
  const { rows } = await testDb().query("insert into teams (name, slug, city, created_by) values ($1, $2, $3, $4) returning id", [name, `e2e-${key}-${run}`, city, admin]);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
  return { id: rows[0].id as string, admin, slug: `e2e-${key}-${run}` };
}

async function playedGame(home: string, away: string, hs: number, as: number, daysAgo = 1) {
  const { rows } = await testDb().query("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at) values ($1, $2, now() - make_interval(days => $3), 60, 'played', now()) returning id", [home, away, daysAgo]);
  await testDb().query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, $2, $3, true, true)", [rows[0].id, hs, as]);
}

test("Liga: anlegen, Teams treten bei, Tabelle, Meister", async ({ browser }) => {
  const admin = await adminPage(browser, "lg-adm");
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "lga");
  await newUser(b, "lgb");
  const nameA = `Liga Alpha ${run}`;
  const nameB = `Liga Beta ${run}`;
  await createTeam(a, nameA);
  await createTeam(b, nameB);

  await admin.goto("/admin/ligen");
  await admin.getByLabel("Name", { exact: true }).fill(`E2E Saison ${run}`);
  await admin.getByLabel("Start", { exact: true }).fill(futureLocal(-5).slice(0, 10));
  await admin.getByLabel("Ende").fill(futureLocal(30).slice(0, 10));
  await admin.getByRole("button", { name: "Liga anlegen" }).click();
  await expect(admin.getByText("Gespeichert.")).toBeVisible();
  await admin.reload();
  const card = admin.getByTestId("admin-league").filter({ hasText: `E2E Saison ${run}` });
  await expect(card).toBeVisible();
  const leagueId = (await query<{ id: string }>("select id from leagues where name = $1", [`E2E Saison ${run}`]))[0].id;

  // Team A tritt selbst bei, Team B wird vom Admin hinzugefügt
  await a.goto(`/ligen/${leagueId}`);
  await a.getByRole("button", { name: "Anmelden" }).click();
  await expect(a.getByRole("main").getByRole("button", { name: "Abmelden" })).toBeVisible();
  await card.getByLabel(/Team \(Name aus der Adresse/).fill(await slugOf(nameB));
  await card.getByRole("button", { name: "Team hinzufügen" }).click();
  await expect(card.getByText("Gespeichert.")).toBeVisible();

  const idA = (await query<{ id: string }>("select id from teams where name = $1", [nameA]))[0].id;
  const idB = (await query<{ id: string }>("select id from teams where name = $1", [nameB]))[0].id;
  await playedGame(idB, idA, 4, 1);

  await b.goto(`/ligen/${leagueId}`);
  const rows = b.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(nameB);
  await expect(rows.nth(0)).toContainText("3"); // Punkte
  await expect(rows.nth(1)).toContainText(nameA);

  // Saison beenden
  admin.once("dialog", (d) => void d.accept());
  await admin.goto("/admin/ligen");
  await admin.getByTestId("admin-league").filter({ hasText: `E2E Saison ${run}` }).getByRole("button", { name: "Saison beenden" }).click();
  await expect.poll(async () => (await query<{ status: string }>("select status from leagues where id = $1", [leagueId]))[0].status).toBe("finished");
  await b.reload();
  await expect(b.getByTestId("champion")).toContainText(nameB);
  await b.goto("/app/benachrichtigungen");
  await expect(b.getByText("Liga beendet").first()).toBeVisible();
});

test("Profi-Tag: bewerben, auslosen, Spiel entsteht", async ({ browser }) => {
  const admin = await adminPage(browser, "pt-adm");
  const pro = await seedTeam("ptpro", `Profis ${run}`);
  await testDb().query("update teams set is_verified = true where id = $1", [pro.id]);
  const applicant = await (await browser.newContext()).newPage();
  await newUser(applicant, "ptap");
  await createTeam(applicant, `Bewerber ${run}`);

  await admin.goto("/admin/profitag");
  await admin.getByLabel("Titel").fill(`E2E Profi-Tag ${run}`);
  await admin.getByLabel(/Profi-Team/).fill(pro.slug);
  await admin.getByLabel("Plätze").fill("1");
  await admin.getByLabel(/Beginn/).fill(futureLocal(20, "18:00"));
  await admin.getByLabel("Bewerbung bis").fill(futureLocal(10, "18:00"));
  await admin.getByRole("button", { name: "Profi-Tag anlegen" }).click();
  await expect(admin.getByText("Gespeichert.")).toBeVisible();
  const eventId = (await query<{ id: string }>("select id from pro_events where title = $1", [`E2E Profi-Tag ${run}`]))[0].id;

  await applicant.goto(`/profitag/${eventId}`);
  await applicant.getByRole("button", { name: "Mit diesem Team bewerben" }).click();
  await expect(applicant.getByRole("heading", { name: "Bewerbungen (1)" })).toBeVisible();

  admin.once("dialog", (d) => void d.accept());
  await admin.goto("/admin/profitag");
  await admin.getByTestId("admin-pro-event").filter({ hasText: `E2E Profi-Tag ${run}` }).getByRole("button", { name: "Jetzt auslosen" }).click();
  await expect.poll(async () => (await query<{ status: string }>("select status from pro_events where id = $1", [eventId]))[0].status).toBe("drawn");

  await applicant.reload();
  await expect(applicant.getByText("Gewonnen")).toBeVisible();
  await applicant.getByRole("link", { name: "Spiel", exact: true }).click();
  await expect(applicant).toHaveURL(/\/spiele\/[0-9a-f-]{36}$/);
  await applicant.goto("/app/benachrichtigungen");
  await expect(applicant.getByText("Ihr habt gewonnen: Profi-Tag")).toBeVisible();
});

test("Turnier: privat per Link, Captains, Eintritt pro Spieler, Bereit nur nach Zahlung, Bracket erst am Ende, Sieger rücken weiter", async ({ browser }) => {
  test.setTimeout(300_000);
  const admin = await adminPage(browser, "tn-adm");
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "tnorg");
  const orgId = (await query<{ id: string }>("select id from users where email = $1", [`tnorg-${run}@test.local`]))[0].id;

  // ohne Freischaltung kein Anlegen, dafür der Hinweis, wie man Veranstalter wird
  await org.goto("/app/turniere/neu");
  await expect(org.getByText(/nur freigeschaltete Veranstalter/)).toBeVisible();
  await expect(org.getByTestId("organizer-info")).toContainText("Socaz-Admin an oder schreib uns eine E-Mail");
  await admin.goto(`/admin/nutzer?q=${encodeURIComponent(`tnorg-${run}`)}`);
  await admin.getByTestId(`user-tnorg-${run}@test.local`).getByRole("button", { name: "Als Turnier-Veranstalter freischalten" }).click();
  await expect.poll(async () => (await query<{ is_organizer: boolean }>("select is_organizer from users where id = $1", [orgId]))[0].is_organizer).toBe(true);

  await org.goto("/app/turniere/neu");
  await org.waitForLoadState("networkidle");
  await org.getByLabel("Name des Turniers").fill(`E2E Cup ${run}`);
  await org.getByLabel("Anzahl Teams (4 bis 32)").fill("4");
  await org.getByLabel("Spielort").fill("Soccerhalle Test");
  await org.getByLabel("Termin (Beginn)").fill(futureLocal(6, "12:00"));
  await org.getByLabel("Anmeldeschluss").fill(futureLocal(4, "12:00"));
  await expect(org.getByTestId("fee-explainer")).toContainText("automatisch berechnet"); // kein Eintrittsfeld: Hallenkosten werden durch alle Spieler geteilt
  await org.getByLabel(/Hallenzeit/).fill("2");
  await org.getByLabel(/Hallenpreis pro Stunde/).fill("80");
  await org.getByRole("button", { name: "Turnier anlegen" }).click();
  await expect(org).toHaveURL(/\/turniere\/[0-9a-f-]{36}/, { timeout: 40_000 });
  const tid = org.url().split("/turniere/")[1].split("?")[0];
  await expect(org.getByTestId("tournament-meta")).toContainText("privat");
  await expect(org.getByTestId("pricing-box")).toContainText("Hallenkosten: 160,00"); // 2 Stunden mal 80 Euro
  const link = await org.getByLabel("Einladungslink zum Turnier").first().inputValue();
  expect(link).toContain(`/turniere/${tid}?t=`);

  // ohne Link und ohne Anmeldung sieht niemand das private Turnier, auch nicht in der Liste
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/turniere/${tid}`);
  await anon.waitForLoadState("networkidle");
  await expect(anon.getByTestId("tournament-name")).toHaveCount(0); // privat: ohne Link nicht zu sehen
  await expect(anon.getByText(`E2E Cup ${run}`)).toHaveCount(0);
  await anon.goto("/turniere");
  await expect(anon.getByText(`E2E Cup ${run}`)).toHaveCount(0);

  // vier Captains treten mit ihrem Team über den Link bei
  const caps: { page: import("@playwright/test").Page; team: string; id: string }[] = [];
  for (const key of ["tn1", "tn2", "tn3", "tn4"]) {
    const page = await (await browser.newContext()).newPage();
    await newUser(page, key);
    const team = `Cup ${key} ${run}`;
    await createTeam(page, team);
    await page.goto(link);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Team anmelden" }).click();
    await expect(page.getByTestId("tournament-team").filter({ hasText: team })).toBeVisible({ timeout: 20_000 });
    const id = (await query<{ id: string }>("select id from users where email = $1", [`${key}-${run}@test.local`]))[0].id;
    caps.push({ page, team, id });
  }
  await expect(org.getByTestId("tournament-meta")).toBeVisible();

  // Team 1: ein Spieler tritt per Oberfläche bei, die anderen zwei in der Datenbank; Guthaben für alle
  const teamIds = new Map<string, string>();
  for (const c of caps) teamIds.set(c.team, (await query<{ id: string }>("select id from teams where name = $1", [c.team]))[0].id);
  const { seedUser, addTeamMember } = await import("./helpers");
  const { fundWallet } = await import("./helpers-db");
  const players = new Map<string, string[]>();
  for (const c of caps) {
    await fundWallet(c.id, 1000);
    const ids: string[] = [c.id];
    for (let i = 1; i <= 3; i++) {
      const uid = await seedUser(`${c.team.split(" ")[1]}p${i}`);
      await addTeamMember(teamIds.get(c.team)!, uid);
      await fundWallet(uid, 1000);
      ids.push(uid);
    }
    players.set(c.team, ids);
  }
  // Team 1, Spieler 1 geht den echten Weg: Link, Anmelden (Dev-Login), Beitreten, Bezahlen
  const t1 = caps[0];
  const p1email = (await query<{ email: string }>("select email from users where id = $1", [players.get(t1.team)![1]]))[0].email;
  const p1 = await (await browser.newContext()).newPage();
  await devLogin(p1, p1email, "Spieler Eins", `/turniere/${tid}?t=${link.split("?t=")[1]}`);
  await p1.waitForLoadState("networkidle");
  await p1.getByTestId("tournament-team").filter({ hasText: t1.team }).getByRole("button", { name: "Dem Turnier-Kader beitreten" }).click();
  await expect(p1.getByTestId("pay-entry")).toBeVisible({ timeout: 20_000 });
  await p1.getByRole("button", { name: /Anteil bezahlen/ }).click();
  await expect(p1.getByTestId("paid-note")).toBeVisible({ timeout: 20_000 });
  // die übrigen Spieler: im Kader, Zahlung später über die Datenbank-Hilfe (Eintrag wie nach einer Zahlung)
  for (const c of caps) {
    for (const uid of players.get(c.team)!.slice(c === t1 ? 2 : 1)) {
      await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3) on conflict do nothing", [tid, teamIds.get(c.team), uid]);
    }
  }

  // Captain 1 will bereit drücken, aber nicht alle haben bezahlt: der Server lehnt ab
  await t1.page.goto(link);
  await t1.page.waitForLoadState("networkidle");
  await t1.page.getByRole("button", { name: "Team ist bereit" }).click();
  await expect(t1.page.getByText(/bezahlt haben/).first()).toBeVisible();
  await expect(t1.page.getByTestId("bracket-hidden")).toBeVisible();

  // alle bezahlen (Eintragen wie nach der Zahlung), dann drücken die Captains bereit
  await query("update tournament_players set paid_cents = 1000, paid_at = now() where tournament_id = $1", [tid]);
  for (const [i, c] of caps.entries()) {
    await c.page.goto(link);
    await c.page.waitForLoadState("networkidle");
    await expect(c.page.getByTestId("tournament-team").filter({ hasText: c.team }).locator('[data-paid="false"]')).toHaveCount(0);
    // der Knopf kann nach dem Klick sofort verschwinden (Seite wird neu gerendert): ein Klick, danach auf den Zustand warten
    const readyButton = c.page.getByRole("button", { name: "Team ist bereit" });
    if (await readyButton.count()) await readyButton.click({ timeout: 10_000 }).catch(() => {});
    await expect(c.page.getByTestId("tournament-team").filter({ hasText: c.team })).toHaveAttribute("data-ready", "true", { timeout: 25_000 });
    if (i < 3) {
      // solange nicht alle bereit sind, bleibt das Bracket verborgen
      expect((await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length).toBe(0);
      await expect(c.page.getByTestId("bracket-stage")).toHaveCount(0);
    }
  }
  await caps[3].page.reload();
  await expect(caps[3].page.getByRole("heading", { name: "Halbfinale" })).toBeVisible({ timeout: 20_000 });
  expect((await query("select 1 from tournament_matches where tournament_id = $1", [tid])).length).toBe(3);
  await caps[3].page.reload();
  await expect(caps[3].page.getByTestId("final-share")).toContainText("10,00"); // 160 Euro durch 16 Spieler
  await org.reload();
  await expect(org.getByTestId("bracket-hidden")).toHaveCount(0);

  // Ergebnisse über die normale Spielseite: ein Captain meldet, der andere bestätigt
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
  expect(final.match_id).not.toBeNull(); // das Finale entsteht automatisch mit den beiden Siegern
  // Sieger der Halbfinals stehen im Finale
  const fin = (await query<{ team_a: string; team_b: string }>("select team_a, team_b from tournament_matches where tournament_id = $1 and stage = 'ko:2'", [tid]))[0];
  expect(fin.team_a && fin.team_b).toBeTruthy();
  // Finale endet unentschieden: der Veranstalter trägt das Siebenmeterschießen ein
  await play(final.match_id!, 1, 1);
  await org.reload();
  await expect(org.getByTestId("shootout")).toBeVisible({ timeout: 20_000 });
  await org.getByTestId("shootout").getByRole("button").first().click();
  await expect(org.getByTestId("winner")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await query<{ status: string }>("select status from tournaments where id = $1", [tid]))[0].status).toBe("finished");
});

test("Sponsoren: anlegen, auf der Startseite, Klick zählt und leitet weiter", async ({ browser }) => {
  const admin = await adminPage(browser, "sp-adm");
  await admin.goto("/admin/sponsoren");
  await admin.getByLabel("Name", { exact: true }).fill(`E2E Partner ${run}`);
  await admin.getByLabel("Adresse (https)").fill("https://example.com/angebot");
  await admin.getByLabel("Kurztext (optional)").fill("Sport und Mehr");
  await admin.getByRole("button", { name: "Anlegen" }).click();
  await expect(admin.getByText("Gespeichert.")).toBeVisible();

  // unsichere Adresse wird abgelehnt
  await admin.getByLabel("Name", { exact: true }).fill(`E2E Böse ${run}`);
  await admin.getByLabel("Adresse (https)").fill("javascript:alert(1)");
  await admin.getByRole("button", { name: "Anlegen" }).click();
  await expect(admin.getByText(/https|ungültig/).first()).toBeVisible();

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  const link = anon.getByRole("link", { name: new RegExp(`E2E Partner ${run}`) });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const res = await anon.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe("https://example.com/angebot");
  expect((await query<{ clicks: number }>("select clicks from sponsors where name = $1", [`E2E Partner ${run}`]))[0].clicks).toBe(1);

  await admin.goto("/admin/sponsoren");
  await admin.getByTestId("admin-sponsor").filter({ hasText: `E2E Partner ${run}` }).getByRole("button", { name: "Pausieren" }).click();
  await expect.poll(async () => (await anon.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);
});

test("Stadt-Challenge und Ligenübersicht auf der Rangliste", async ({ browser }) => {
  // eigene Städte pro Lauf, damit andere Testdaten im Monat das Ergebnis nicht verändern
  const cityA = `Teststadt A ${run}`;
  const cityB = `Teststadt B ${run}`;
  const teamA = await seedTeam("cc1", `Challenge A ${run}`, cityA);
  const teamB = await seedTeam("cc2", `Challenge B ${run}`, cityB);
  await playedGame(teamA.id, teamB.id, 3, 0, 0);
  await playedGame(teamB.id, teamA.id, 2, 1, 0);
  await playedGame(teamB.id, teamA.id, 1, 0, 0);

  const page = await (await browser.newContext()).newPage();
  await page.goto("/rangliste");
  const list = page.getByTestId("city-challenge");
  const rowB = list.getByRole("listitem").filter({ hasText: cityB });
  const rowA = list.getByRole("listitem").filter({ hasText: cityA });
  await expect(rowB).toContainText("2 Siege in 3 Spielen");
  await expect(rowA).toContainText("1 Siege in 3 Spielen");
  const texts = await list.getByRole("listitem").allInnerTexts();
  expect(texts.findIndex((t) => t.includes(cityB))).toBeLessThan(texts.findIndex((t) => t.includes(cityA)));
  await page.goto("/ligen");
  await expect(page.getByRole("heading", { name: "Ligen" })).toBeVisible();
  await page.goto("/turniere");
  await expect(page.getByRole("heading", { name: "Turniere" })).toBeVisible();
  await page.goto("/profitag");
  await expect(page.getByRole("heading", { name: "Profi-Tag" })).toBeVisible();
});

test("Betreiber ohne Spieler-Onboarding: Admin kommt direkt zum Turnier-Formular", async ({ browser }) => {
  const email = `rawadm-${run}@test.local`;
  await query("insert into users (email, name, role) values ($1, 'Roh Admin', 'admin')", [email]); // nie eingerichtet: keine Stadt, keine Position, kein Geburtsdatum
  const page = await (await browser.newContext()).newPage();
  await devLogin(page, email, "Roh Admin");
  await page.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  await page.goto("/");
  await page.getByTestId("mode-tournament").getByRole("link", { name: "Turnier veranstalten" }).click();
  await expect(page).toHaveURL(/\/app\/turniere\/neu/);
  await expect(page.getByLabel("Name des Turniers")).toBeVisible(); // kein Willkommen-Formular mit Stadt, Position, Geburtsdatum
});
