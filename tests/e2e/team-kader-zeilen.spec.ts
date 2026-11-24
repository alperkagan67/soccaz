import { expect, test } from "@playwright/test";
import { closeContexts, run, seedUser, testDb } from "./helpers";
import { login } from "./helpers-wertung";

// Vertrag 013 v3, AC-17 und AC-30 (C3a): Teamseite mit Kader als einfache Zeilen (Initialen, Name, Position, Wertung, genau ein Stufen-Chip) in EINEM Rahmen, TeamCard im Teamkopf;
// Gäste sehen nur die Anzahl (keine Namen, keine Wertung). Screenshots 390/1280, hell/dunkel als Anhang (Look-Abnahme 2).
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Teamseite: Kader als Zeilen mit Wertung und Stufen-Chip für Angemeldete, Gast nur Anzahl; TeamCard mit Teamwertung", async ({ browser }, testInfo) => {
  const db = testDb();
  const names = [`Kapitaen ${run}`, `Stuermer ${run}`, `Torwart ${run}`, `Verteidiger ${run}`];
  const ids = [await seedUser("kzadm", names[0]), await seedUser("kzst", names[1]), await seedUser("kztw", names[2]), await seedUser("kzvt", names[3])];
  const teamName = `Kader Zeilen ${run}`;
  const slug = `e2e-kz-${run}`;
  const { rows } = await db.query("insert into teams (name, slug, city, created_by, color) values ($1, $2, 'Essen', $3, 'green') returning id", [teamName, slug, ids[0]]);
  const teamId = rows[0].id as string;
  await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'player'), ($1, $4, 'player'), ($1, $5, 'player')", [teamId, ids[0], ids[1], ids[2], ids[3]]);
  await db.query("update users set position = 'Angriff' where id = $1", [ids[1]]);
  // Elo 1000 (Wertung 50, Kreide), 1090 (61, Rasen), 1236 (80, Pokal), 1000 (50): Teamwertung (50 + 61 + 80 + 50) / 4 = 60,25, gerundet 60 (erst ab vier Mitgliedern, G30-013)
  await db.query("insert into player_stats (user_id, elo) values ($1, 1000), ($2, 1090), ($3, 1236), ($4, 1000)", [ids[0], ids[1], ids[2], ids[3]]);

  // Teamlogo als ECHTE media-Zeile (Backlog 243, R-T399): Gast bekommt weder Verweis noch Bild, Angemeldete beides
  const WEBP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
  const logo = await db.query("insert into media (owner_id, kind, ref_id, mime, data) values ($1, 'team_logo', $2, 'image/webp', decode($3, 'base64')) returning id", [ids[0], teamId, WEBP]);
  const logoPath = `/api/media/${logo.rows[0].id}`;
  await db.query("update teams set logo_url = $1 where id = $2", [logoPath, teamId]);

  // Gast: nur Anzahl, kein Name, keine Wertung, kein Chip in der Kader-Liste
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/teams/${slug}`);
  await expect(anon.getByTestId("roster-guest")).toContainText("4 Spieler im Kader");
  await expect(anon.getByTestId("member")).toHaveCount(0);
  await expect(anon.getByTestId("player-row")).toHaveCount(0);
  const html = await anon.content();
  for (const verboten of [names[1], names[2], "player-row-rating"]) expect(html, verboten).not.toContain(verboten);
  await expect(anon.getByTestId("team-card")).toBeVisible(); // die Teamwertung ist eine Zahl für alle
  await expect(anon.getByTestId("team-card-rating")).toHaveText("60");
  expect(html, "Gast: kein Logo-Verweis").not.toContain("Logo von");
  expect(html, "Gast: kein Bildpfad").not.toContain("/api/media");
  const gastBild = await anon.request.get(logoPath);
  const unbekannt = await anon.request.get("/api/media/00000000-0000-4000-8000-000000000000");
  expect(gastBild.status()).toBe(404);
  expect(await gastBild.text()).toBe(await unbekannt.text());
  expect(gastBild.headers()["cache-control"]).toBe("no-store");

  // Angemeldet: Zeilen mit Name, Position, Wertung und genau einem Stufen-Chip je Zeile; ein Rahmen um die Liste, keine Karte in der Karte
  const page = await (await browser.newContext()).newPage();
  await login(page, `kzst-${run}@test.local`, names[1]);
  await page.goto(`/teams/${slug}`);
  const members = page.getByTestId("member");
  await expect(members).toHaveCount(4);
  await expect(page.getByTestId("player-row")).toHaveCount(4);
  await expect(page.getByAltText(`Logo von ${teamName}`)).toBeVisible(); // Angemeldete sehen das Logo
  const bild = await page.request.get(logoPath); // dieselbe Adresse, angemeldet: das Bild
  expect(bild.status()).toBe(200);
  expect(bild.headers()["content-type"]).toMatch(/^image\//);
  expect(bild.headers()["cache-control"]).toMatch(/^private/);
  for (let i = 0; i < 4; i++) await expect(members.nth(i).getByTestId("player-card-tier")).toHaveCount(1);
  const stuermer = members.filter({ hasText: names[1] });
  await expect(stuermer.getByTestId("player-row-rating")).toHaveText("61");
  await expect(stuermer.getByTestId("player-card-tier")).toHaveText("Rasen");
  await expect(stuermer.getByTestId("player-row-position")).toContainText("Angriff");
  await expect(members.filter({ hasText: names[2] }).getByTestId("player-card-tier")).toHaveText("Pokal");
  await expect(page.getByTestId("roster")).toHaveClass(/card/);
  await expect(members.first()).not.toHaveClass(/card/);
  expect(await page.getByTestId("roster").locator(".card").count()).toBe(0); // innerhalb der Liste keine weitere Karte
  for (const [w, h] of [[390, 844], [1280, 800]] as const) {
    for (const scheme of ["dark", "light"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await page.getByTestId("roster").scrollIntoViewIfNeeded();
      await testInfo.attach(`team-kader-${w}-${scheme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
  }
});

test("Teamseite mit 3 Mitgliedern: 'Noch keine Teamwertung' für Gäste und Angemeldete, keine Zahl im HTML (G30-013)", async ({ browser }) => {
  const db = testDb();
  const ids = [await seedUser("kzk1"), await seedUser("kzk2"), await seedUser("kzk3")];
  const slug = `e2e-kz3-${run}`;
  const { rows } = await db.query("insert into teams (name, slug, city, created_by, color) values ($1, $2, 'Essen', $3, 'green') returning id", [`Klein ${run}`, slug, ids[0]]);
  await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'player'), ($1, $4, 'player')", [rows[0].id, ids[0], ids[1], ids[2]]);
  await db.query("insert into player_stats (user_id, elo) values ($1, 1000), ($2, 1090), ($3, 1236)", [ids[0], ids[1], ids[2]]);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/teams/${slug}`);
  await expect(anon.getByTestId("team-card")).toContainText("Noch keine Teamwertung");
  await expect(anon.getByTestId("team-card-rating")).toHaveCount(0);
  const html = await anon.content();
  expect(html).not.toContain("team-card-rating");
  expect(html).not.toMatch(/Teamwertung <span/);
});
