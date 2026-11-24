import { expect, test, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, newUser, run, seedUser, testDb } from "./helpers";
import { query, seedAdmin, userIdByEmail } from "./helpers-db";

// AC-17 (Entscheid t2q 2026-11-24), PR C: Spielbericht (/spiele/[id]): Torschütze im Spielverlauf und "Spieler des Spiels" nur für Angemeldete mit Name und Link, Gäste und reine Hallenbetreiber Initialen ohne Link.
// Kanäle: Server-HTML, RSC-Nutzlast (Header RSC: 1), öffentliches JSON /api/spiele/[id]/live (immer Initialen), SSE (nur "update"), Overlay (nur Teamnamen).
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await query("delete from venue_access where venue_id in (select id from venues where name like $1)", [`Bericht-Halle %${run}`]);
  await closeTestDb();
});

const NAME = `Zorro Vollname${run}`;
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

async function rohdaten(page: Page, url: string) {
  const html = await (await page.request.get(url)).text();
  const rsc = await (await page.request.get(url, { headers: { RSC: "1" } })).text();
  return { html, rsc };
}

/** Erste Nachrichten eines SSE-Kanals lesen (Verbindungsgruß), dann abbrechen. */
async function sseAnfang(url: string): Promise<string> {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}${url}`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  const text = new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  return text;
}

test("Spielbericht je Rolle: Torschütze und Spieler des Spiels als Initialen für Gast und Betreiber, Name mit Link für Angemeldete; JSON, SSE und Overlay ohne Namen", async ({ browser }) => {
  const star = await seedUser("kbstar", NAME);
  const rival = await seedUser("kbrival", "Gegner Beispiel");
  const mk = async (name: string, admin: string) => {
    const { rows } = await testDb().query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, `e2e-${name.replace(/\W+/g, "-").toLowerCase()}`, admin]);
    await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
    return rows[0].id as string;
  };
  const home = await mk(`Bericht Heim ${run}`, star);
  const away = await mk(`Bericht Gast ${run}`, rival);
  const { rows } = await testDb().query(
    `insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at, mvp_user_id)
     values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour', $3) returning id`,
    [home, away, star],
  );
  const matchId = rows[0].id as string;
  await testDb().query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($1, $4, $5)", [matchId, star, home, rival, away]);
  await testDb().query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 2, 0, true, true)", [matchId]);
  for (const m of [5, 9]) await testDb().query("insert into match_events (match_id, type, user_id, team_id, minute) values ($1, 'goal', $2, $3, $4)", [matchId, star, home, m]);
  const url = `/spiele/${matchId}`;

  // Gast: Initialen im Spielverlauf und bei "Spieler des Spiels", weder Name noch Kennung in HTML und RSC
  const gast = await (await browser.newContext()).newPage();
  await gast.goto(url);
  await expect(gast.getByTestId("mvp-winner")).toContainText("ZV");
  await expect(gast.getByTestId("mvp-winner").getByRole("link")).toHaveCount(0);
  const g = await rohdaten(gast, url);
  expect(g.html, "die Initialen stehen im Gast-HTML (sonst ist die Prüfung leer)").toContain(">ZV<");
  expect(g.rsc, "die RSC-Nutzlast enthält die Seite").toContain("Spielverlauf");
  for (const text of [g.html, g.rsc]) {
    expect(text, "Spielbericht Gast: Name").not.toContain(NAME);
    expect(text, "Spielbericht Gast: Nachname").not.toContain(`Vollname${run}`);
    expect(text, "Spielbericht Gast: Kennung").not.toContain(star);
  }
  expect(g.html).not.toContain(`/spieler/${star}`);

  // Kanäle ohne Anmeldung: JSON nur Initialen, SSE nur "update", Overlay nur Teamnamen
  const live = await (await gast.request.get(`/api/spiele/${matchId}/live`)).text();
  expect(JSON.parse(live).goals).toEqual([
    { minute: 5, team: "home", player: "ZV" },
    { minute: 9, team: "home", player: "ZV" },
  ]);
  for (const kanal of [`/api/spiele/${matchId}/events`, "/api/spiele/stream"]) {
    const anfang = await sseAnfang(kanal);
    expect(anfang, `SSE ${kanal} liefert den Verbindungsgruß`).toContain("verbunden");
    expect(anfang).not.toContain("Zorro");
    expect(anfang).not.toContain(star);
  }
  const overlay = await (await gast.request.get(`/overlay/${matchId}`)).text();
  expect(overlay).toContain(`Bericht Heim ${run}`);
  expect(overlay).not.toContain("Zorro");
  expect(overlay).not.toContain(star);
  expect(live).not.toContain(NAME);

  // Spieler (angemeldet, nicht beteiligt): Name mit Link
  const spieler = await (await browser.newContext()).newPage();
  await newUser(spieler, "kbsp");
  await spieler.goto(url);
  await expect(spieler.getByTestId("mvp-winner").getByRole("link", { name: NAME })).toHaveAttribute("href", `/spieler/${star}`);
  await expect(spieler.getByText(NAME).first()).toBeVisible();

  // reiner Hallenbetreiber: wie Gast
  const boss = await (await browser.newContext()).newPage();
  await newUser(boss, "kbbo");
  const bossId = await userIdByEmail(`kbbo-${run}@test.local`);
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Bericht-Halle bo ${run}`, bossId]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, bossId]);
  await boss.goto(url);
  await expect(boss.getByTestId("mvp-winner")).toContainText("ZV");
  const b = await rohdaten(boss, url);
  expect(b.html).toContain(">ZV<");
  for (const text of [b.html, b.rsc]) {
    expect(text, "Spielbericht Betreiber: Name").not.toContain(NAME);
    expect(text, "Spielbericht Betreiber: Kennung").not.toContain(star);
  }

  // Teilnehmer, der zugleich Hallenbetreiber ist: Beteiligte gewinnen, Namen sichtbar (Argumente participant/teamAdmin)
  const [h2] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Bericht-Halle star ${run}`, star]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h2.id, star]);
  const starPage = await (await browser.newContext()).newPage();
  await devLogin(starPage, `kbstar-${run}@test.local`, NAME);
  await expect(starPage).toHaveURL(/\/app/);
  await starPage.goto(url);
  await expect(starPage.getByTestId("mvp-winner").getByRole("link", { name: NAME })).toBeVisible();

  // Mitspieler (nur Teilnehmer, kein Team-Admin), der zugleich Hallenbetreiber ist: der Teilnehmer-Status allein genügt für Namen (Argument participant)
  const mate = await seedUser("kbmate");
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [home, mate]);
  await query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3)", [matchId, mate, home]);
  const [h3] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Bericht-Halle mate ${run}`, mate]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h3.id, mate]);
  const matePage = await (await browser.newContext()).newPage();
  await devLogin(matePage, `kbmate-${run}@test.local`, "Spieler kbmate");
  await expect(matePage).toHaveURL(/\/app/);
  await matePage.goto(url);
  await expect(matePage.getByTestId("mvp-winner").getByRole("link", { name: NAME })).toBeVisible();

  // Plattform-Admin: Name mit Link
  await seedAdmin("kbad");
  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `kbad-${run}@test.local`, "Admin kbad");
  await expect(admin).toHaveURL(/\/app/);
  await admin.goto(url);
  await expect(admin.getByTestId("mvp-winner").getByRole("link", { name: NAME })).toBeVisible();
});
