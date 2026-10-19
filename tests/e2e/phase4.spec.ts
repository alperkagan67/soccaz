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

test("Turnier: Veranstalter legt an, Teams melden sich an, K.-o.-System bis zum Sieger", async ({ browser }) => {
  const admin = await adminPage(browser, "tn-adm");
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "tnorg");
  const orgId = (await query<{ id: string }>("select id from users where email = $1", [`tnorg-${run}@test.local`]))[0].id;

  // ohne Freischaltung kein Anlegen
  await org.goto("/app/turniere/neu");
  await expect(org.getByText(/nur freigeschaltete Veranstalter/)).toBeVisible();
  // Freischalten über die Nutzerverwaltung
  await admin.goto(`/admin/nutzer?q=${encodeURIComponent(`tnorg-${run}`)}`);
  await admin.getByTestId(`user-tnorg-${run}@test.local`).getByRole("button", { name: "Als Turnier-Veranstalter freischalten" }).click();
  await expect.poll(async () => (await query<{ is_organizer: boolean }>("select is_organizer from users where id = $1", [orgId]))[0].is_organizer).toBe(true);

  await org.goto("/app/turniere/neu");
  await org.waitForLoadState("networkidle");
  await org.getByLabel("Name", { exact: true }).fill(`E2E Cup ${run}`);
  await org.getByLabel("Tag").fill(futureLocal(5).slice(0, 10));
  await org.getByLabel("Höchstens Teams").fill("4");
  await org.getByRole("button", { name: "Turnier anlegen" }).click();
  await expect(org).toHaveURL(/\/turniere\/[0-9a-f-]{36}$/, { timeout: 40_000 }); // erste Kompilierung der Seite kann dauern
  const url = org.url();

  // vier Teams melden sich an
  const teams = [];
  for (const [i, key] of ["tn1", "tn2", "tn3", "tn4"].entries()) {
    const p = await (await browser.newContext()).newPage();
    await newUser(p, key);
    await createTeam(p, `Cup ${key} ${run}`);
    await p.goto(url);
    await p.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect.poll(async () => (await query<{ n: number }>("select count(*)::int as n from tournament_teams tt join tournaments t on t.id = tt.tournament_id where t.organizer_id = $1", [orgId]))[0].n).toBe(i + 1);
    teams.push(p);
  }
  await org.reload();
  await expect(org.getByRole("heading", { name: "Teams (4)" })).toBeVisible();

  await org.waitForLoadState("networkidle");
  org.once("dialog", (d) => void d.accept());
  await org.getByRole("button", { name: "Turnier starten" }).click();
  await expect(org.getByRole("heading", { name: "Halbfinale" })).toBeVisible();

  // beide Halbfinals: Heimteam gewinnt
  for (let i = 0; i < 2; i++) {
    const m = org.getByTestId("tournament-match").nth(i);
    await m.getByLabel(/^Cup tn\d/).first().fill("2");
    await m.getByLabel(/^Cup tn\d/).nth(1).fill("1");
    await m.getByRole("button", { name: "Eintragen" }).click();
    await expect(org.getByTestId("tournament-match").nth(i)).toContainText("2 : 1");
  }
  // Finale endet unentschieden: Siebenmeterschießen verlangt
  const final = org.getByTestId("tournament-match").nth(2);
  await expect(final).not.toContainText("offen");
  await final.getByLabel(/^Cup tn\d/).first().fill("1");
  await final.getByLabel(/^Cup tn\d/).nth(1).fill("1");
  await expect(final.getByLabel("Sieger im Siebenmeterschießen")).toBeVisible();
  await final.getByRole("button", { name: "Eintragen" }).click();
  await expect(final.getByText(/bitte|Sieger/i).first()).toBeVisible();
  await final.getByLabel("Sieger im Siebenmeterschießen").selectOption({ index: 1 });
  await final.getByRole("button", { name: "Eintragen" }).click();
  await expect(org.getByTestId("winner")).toBeVisible();
  await expect.poll(async () => (await query<{ status: string }>("select status from tournaments where organizer_id = $1", [orgId]))[0].status).toBe("finished");
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
