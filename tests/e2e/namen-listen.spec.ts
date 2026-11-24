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
