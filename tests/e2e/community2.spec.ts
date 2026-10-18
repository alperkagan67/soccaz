import { expect, test } from "@playwright/test";
import { closeContexts, createTeam, devLogin, futureLocal, newUser, run, seedUser, testDb } from "./helpers";
import { query, seedUserRole } from "./helpers-db";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// kleines gültiges PNG (1x1), reicht für den Upload-Test
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function userId(email: string) {
  return (await query<{ id: string }>("select id from users where email = $1", [email]))[0].id;
}

test("Rechtstexte, Fußzeile, robots und sitemap", async ({ page }) => {
  for (const [path, heading] of [["/impressum", "Impressum"], ["/datenschutz", "Datenschutzerklärung"], ["/agb", "Allgemeine Geschäftsbedingungen"], ["/hausordnung", "Hausordnung"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Entwurf");
  }
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Rechtliches" }).getByRole("link", { name: "Datenschutz" })).toBeVisible();
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /admin");
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/rangliste");
});

test("Kommentare: schreiben, melden, automatisch ausblenden, Moderation stellt wieder her", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const author = await (await browser.newContext()).newPage();
  const reporter = await (await browser.newContext()).newPage();
  await newUser(owner, "kmo");
  await newUser(author, "kma");
  await newUser(reporter, "kmr");
  const teamName = `Kommentar ${run}`;
  await createTeam(owner, teamName);
  const teamUrl = owner.url();

  await author.goto(teamUrl);
  await author.getByLabel("Dein Kommentar").fill(`Tolles Team ${run}`);
  await author.getByRole("button", { name: "Senden" }).click();
  await expect(author.getByText(`Tolles Team ${run}`)).toBeVisible();
  await expect(author.getByRole("button", { name: "Löschen" })).toBeVisible(); // eigener Kommentar

  // zwei Meldungen direkt in der Datenbank, die dritte über die Oberfläche
  const commentId = (await query<{ id: string }>("select id from comments where body = $1", [`Tolles Team ${run}`]))[0].id;
  for (const key of ["rep1", "rep2"]) {
    const id = await seedUser(key);
    await testDb().query("insert into comment_reports (comment_id, reporter_id, reason) values ($1, $2, 'Spam')", [commentId, id]);
  }
  await reporter.goto(teamUrl);
  await reporter.getByRole("button", { name: "Melden", exact: true }).click();
  await reporter.getByLabel("Grund der Meldung").fill("beleidigend");
  await reporter.getByRole("listitem").filter({ hasText: `Tolles Team ${run}` }).getByRole("button", { name: "Senden" }).click();
  // die dritte Meldung blendet den Kommentar sofort aus
  await expect(reporter.getByText(`Tolles Team ${run}`)).toHaveCount(0);

  // Moderation
  await seedUserRole("kmmod", "moderator");
  const mod = await (await browser.newContext()).newPage();
  await devLogin(mod, `kmmod-${run}@test.local`, "Moderator");
  await expect(mod).toHaveURL(/\/app$/);
  await mod.goto("/admin/moderation");
  const item = mod.getByTestId("moderation-item").filter({ hasText: `Tolles Team ${run}` });
  await expect(item).toBeVisible();
  await expect(item).toContainText("3 Meldungen");
  await item.getByRole("button", { name: "Wieder anzeigen" }).click();
  await expect(item).toHaveCount(0);
  await reporter.reload();
  await expect(reporter.getByText(`Tolles Team ${run}`)).toBeVisible();

  // normale Spieler kommen nicht in die Moderation
  await reporter.goto("/admin/moderation");
  await expect(reporter).toHaveURL(/\/app$/);
});

test("Einstellungen: Profil, privates Profil, Profilbild, Datenexport, Konto löschen", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await newUser(page, "set");
  const email = `set-${run}@test.local`;
  const id = await userId(email);

  await page.goto("/app/einstellungen");
  await page.getByLabel("Name", { exact: true }).fill(`Neuer Name ${run}`);
  await page.getByLabel("Position").selectOption("Torwart");
  await page.getByLabel("Öffentliches Profil").uncheck();
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();

  // privat: Fremde sehen nichts, man selbst schon
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/spieler/${id}`);
  await expect(anon.getByText("Dieses Profil ist nicht öffentlich.")).toBeVisible();
  await page.goto(`/spieler/${id}`);
  await expect(page.getByRole("heading", { name: `Neuer Name ${run}` })).toBeVisible();
  await expect(page.getByText(/Dein Profil ist privat/)).toBeVisible();

  // Profilbild
  await page.goto("/app/einstellungen");
  await page.waitForLoadState("networkidle"); // erst wenn die Seite bedienbar ist
  await page.getByLabel("Profilbild ändern").setInputFiles({ name: "bild.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Dein Profilbild")).toBeVisible({ timeout: 15_000 });
  const src = await page.getByAltText("Dein Profilbild").getAttribute("src");
  const image = await page.request.get(src!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");

  // Kein Bild: abgelehnt
  await page.getByLabel("Profilbild ändern").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("kein bild") });
  await expect(page.getByRole("alert").filter({ hasText: /gelesen|Erlaubt/ })).toBeVisible();

  // Export
  const exported = await page.request.get("/api/mein-konto/export");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-disposition"]).toContain("attachment");
  expect((await exported.json()).user.email).toBe(email);
  expect((await anon.request.get("/api/mein-konto/export")).status()).toBe(401);

  // Löschen: Bestätigung nötig
  await page.getByText("Konto löschen").click();
  await page.getByRole("button", { name: "Konto endgültig löschen" }).click();
  await expect(page.getByText("Bitte tippe LÖSCHEN zur Bestätigung.")).toBeVisible();
  await page.getByLabel(/Tippe LÖSCHEN/).fill("LÖSCHEN");
  await page.getByRole("button", { name: "Konto endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/\?konto=geloescht|\/$/);
  const [row] = await query<{ name: string; email: string }>("select name, email from users where id = $1", [id]);
  expect(row.name).toBe("Gelöschter Nutzer");
  expect(row.email).toContain("geloescht");
  // mit der alten Adresse entsteht ein neues, leeres Konto
  await page.goto("/app");
  await expect(page).toHaveURL(/\/anmelden/);
});

test("Mitspieler gesucht und Spielserie", async ({ browser }) => {
  const poster = await (await browser.newContext()).newPage();
  const captain = await (await browser.newContext()).newPage();
  await newUser(poster, "mp");
  await newUser(captain, "mc");
  await createTeam(captain, `Sucher ${run}`);

  await poster.goto("/mitspieler");
  await poster.getByLabel("Tag").fill(futureLocal(5).slice(0, 10));
  await poster.getByLabel("Hinweis (optional)").fill(`spiele im Tor ${run}`);
  await poster.getByRole("button", { name: "Eintragen" }).click();
  await expect(poster.getByText(`spiele im Tor ${run}`)).toBeVisible();
  // am selben Tag nur einmal
  await poster.getByLabel("Tag").fill(futureLocal(5).slice(0, 10));
  await poster.getByRole("button", { name: "Eintragen" }).click();
  await expect(poster.getByText(/schon eingetragen/)).toBeVisible();

  await captain.goto("/mitspieler");
  const entry = captain.getByRole("listitem").filter({ hasText: `spiele im Tor ${run}` });
  await entry.getByRole("button", { name: "Anfragen" }).click();
  await expect(entry.getByText("Anfrage gesendet.")).toBeVisible();
  await poster.goto("/app/benachrichtigungen");
  await expect(poster.getByText("Ein Team sucht dich")).toBeVisible();

  // Serie: drei Wochen hintereinander
  await captain.goto("/app/suche/neu");
  await captain.getByLabel(/Anstoß/).fill(futureLocal(12));
  await captain.getByLabel("Wiederholen").selectOption("3");
  await captain.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(captain).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const rows = await query<{ starts_at: Date }>(
    "select r.starts_at from match_requests r join teams t on t.id = r.team_id where t.name = $1 order by r.starts_at",
    [`Sucher ${run}`],
  );
  expect(rows).toHaveLength(3);
  expect(rows[1].starts_at.getTime() - rows[0].starts_at.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000 - 3_600_000);
  // mehr als fünf offene Suchen gehen nicht
  await captain.goto("/app/suche/neu");
  await captain.getByLabel(/Anstoß/).fill(futureLocal(40));
  await captain.getByLabel("Wiederholen").selectOption("4");
  await captain.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(captain.getByText(/mehr als 5 offene Spielsuchen/).first()).toBeVisible();
});

test("Hallen: Liste, Seite und Bewertung durch erfahrene Spieler", async ({ browser }) => {
  const { rows } = await testDb().query("insert into venues (name, city, surface) values ($1, 'Essen', 'Kunstrasen') returning id", [`E2E Halle ${run}`]);
  const venueId = rows[0].id as string;
  const rookie = await (await browser.newContext()).newPage();
  const veteran = await (await browser.newContext()).newPage();
  await newUser(rookie, "hr");
  await newUser(veteran, "hv");
  await testDb().query("insert into player_stats (user_id, matches) select id, 4 from users where email = $1", [`hv-${run}@test.local`]);

  await rookie.goto("/hallen");
  await expect(rookie.getByRole("link", { name: new RegExp(`E2E Halle ${run}`) })).toBeVisible();
  await rookie.goto(`/hallen/${venueId}`);
  await expect(rookie.getByRole("heading", { name: `E2E Halle ${run}` })).toBeVisible();
  await rookie.getByLabel("Deine Bewertung").fill("Noch kein Spiel");
  await rookie.getByRole("button", { name: "Senden" }).click();
  await expect(rookie.getByText(/schon ein Spiel/)).toBeVisible();

  await veteran.goto(`/hallen/${venueId}`);
  await veteran.getByLabel("Sterne").selectOption("4");
  await veteran.getByLabel("Deine Bewertung").fill("Guter Boden, faire Preise");
  await veteran.getByRole("button", { name: "Senden" }).click();
  await expect(veteran.getByText("Guter Boden, faire Preise")).toBeVisible();
  await veteran.goto("/hallen");
  await expect(veteran.getByRole("link", { name: new RegExp(`E2E Halle ${run}`) })).toContainText("4.0");
});

