import { expect, test, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, newUser, run, seedUser, testDb } from "./helpers";
import { query, seedAdmin, userIdByEmail } from "./helpers-db";

// AC-17 (Entscheid t2q 2026-11-24): Autor im Kommentar: Angemeldete Name und Link, Gäste und reine Hallenbetreiber Initialen ohne Link. Geprüft am ausgelieferten HTML UND an der RSC-Nutzlast (Anfrage mit Header RSC: 1).
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await query("delete from venue_access where venue_id in (select id from venues where name like $1)", [`Kommentar-Halle %${run}`]);
  await closeTestDb();
});

const NAME = `Zorro Vollname${run}`;
const INITIALEN = "ZV";

async function rohdaten(page: Page, url: string) {
  const html = await (await page.request.get(url)).text();
  const rsc = await (await page.request.get(url, { headers: { RSC: "1" } })).text();
  return { html, rsc };
}

test("Kommentar-Autor je Rolle: Gast und Betreiber Initialen ohne Link, Spieler und Plattform-Admin Name mit Link; Name und Kennung nie im HTML/RSC der Gast- und Betreiber-Sicht", async ({ browser }) => {
  const authorId = await seedUser("knau", NAME);
  const owner = await seedUser("know");
  const slug = `e2e-kn-${run}`;
  const { rows } = await testDb().query("insert into teams (name, slug, city, strength, created_by) values ($1, $2, 'Essen', 3, $3) returning id", [`Kommentar-Namen ${run}`, slug, owner]);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, owner]);
  await testDb().query("insert into comments (target_type, target_id, author_id, body) values ('team', $1, $2, $3)", [rows[0].id, authorId, `Tolles Team ${run}`]);
  const url = `/teams/${slug}`;

  // Gast
  const gast = await (await browser.newContext()).newPage();
  await gast.goto(url);
  await expect(gast.getByTestId("comment-author")).toHaveText(INITIALEN);
  await expect(gast.getByTestId("comment-author")).not.toHaveAttribute("href", /.*/);
  const g = await rohdaten(gast, url);
  expect(g.rsc, "die RSC-Nutzlast enthält die Seite (Kommentartext)").toContain(`Tolles Team ${run}`); // sonst wäre die Prüfung auf den Namen leer
  for (const t of [g.html, g.rsc]) {
    expect(t).not.toContain(NAME);
    expect(t).not.toContain("Vollname");
    expect(t).not.toContain(authorId);
  }
  expect(g.html).not.toContain(`/spieler/${authorId}`);

  // Spieler (angemeldet): Name mit Link, Hinweis beim Schreiben
  const spieler = await (await browser.newContext()).newPage();
  await newUser(spieler, "knsp");
  await spieler.goto(url);
  await expect(spieler.getByTestId("comment-author")).toHaveText(NAME);
  await expect(spieler.getByTestId("comment-author")).toHaveAttribute("href", `/spieler/${authorId}`);
  await expect(spieler.getByTestId("comment-name-hinweis")).toContainText("angemeldete Nutzer");

  // reiner Hallenbetreiber: Initialen, kein Link, weder im HTML noch in der RSC-Nutzlast
  const boss = await (await browser.newContext()).newPage();
  await newUser(boss, "knbo");
  const bossId = await userIdByEmail(`knbo-${run}@test.local`);
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Essen', $2) returning id", [`Kommentar-Halle ${run}`, bossId]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, bossId]);
  await boss.goto(url);
  await expect(boss.getByTestId("comment-author")).toHaveText(INITIALEN);
  await expect(boss.getByTestId("comment-author")).not.toHaveAttribute("href", /.*/);
  const b = await rohdaten(boss, url);
  expect(b.rsc).toContain(`Tolles Team ${run}`);
  for (const t of [b.html, b.rsc]) {
    expect(t).not.toContain(NAME);
    expect(t).not.toContain("Vollname");
    expect(t).not.toContain(authorId);
  }

  // Plattform-Admin: Name mit Link
  await seedAdmin("knad");
  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `knad-${run}@test.local`, "Admin knad");
  await expect(admin).toHaveURL(/\/app/); // erst nach der Anmeldung weiter (sonst bricht goto die Anmeldung ab)
  await admin.goto(url);
  await expect(admin.getByTestId("comment-author")).toHaveText(NAME);
});
