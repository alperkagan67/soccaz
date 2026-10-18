import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, createTeam, devLogin, newUser, run } from "./helpers";
import { query, seedAdmin, seedUserRole, startMatchNow } from "./helpers-db";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

async function adminPage(browser: import("@playwright/test").Browser, key: string, next = "/admin") {
  await seedAdmin(key);
  const page = await (await browser.newContext()).newPage();
  await devLogin(page, `${key}-${run}@test.local`, `Admin ${key}`, next);
  return page;
}

test("Admin: Zugriff nur mit Berechtigung", async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  await newUser(player, "ad1p");
  await player.goto("/admin");
  await expect(player).toHaveURL(/\/app$/);
  await player.goto("/admin/nutzer");
  await expect(player).toHaveURL(/\/app$/);
  await expect(player.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  // Moderator sieht die Übersicht, aber nicht Nutzer und Teams
  await seedUserRole("ad1m", "moderator");
  const mod = await (await browser.newContext()).newPage();
  await devLogin(mod, `ad1m-${run}@test.local`, "Moderator ad1m", "/admin");
  await expect(mod.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
  await expect(mod.getByRole("link", { name: "Nutzer" })).toHaveCount(0);
  await mod.goto("/admin/nutzer");
  await expect(mod).toHaveURL(/\/app$/);

  // Admin sieht alles
  const admin = await adminPage(browser, "ad1a");
  await expect(admin.getByRole("link", { name: "Nutzer" })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Protokoll" })).toBeVisible();
});

test("Admin: Streitfall erscheint als Aufgabe, Spiele-Liste", async ({ browser }) => {
  const { a, b, matchId, nameA } = await setupLobby(browser, "ad2");
  await startMatchNow(matchId);
  await a.goto(`/spiele/${matchId}`);
  await expect(async () => {
    await a.getByRole("button", { name: "Ergebnis melden" }).click();
    await expect(a.getByText(/Gemeldetes Ergebnis/)).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await b.goto(`/spiele/${matchId}`);
  await b.getByRole("button", { name: "Widersprechen" }).click();
  await b.getByLabel(/Warum stimmt das Ergebnis nicht/).fill("Falsches Ergebnis");
  await b.getByRole("button", { name: "Widerspruch senden" }).click();
  await expect(b.getByText("Das Ergebnis ist strittig").first()).toBeVisible();

  const admin = await adminPage(browser, "ad2adm");
  await expect(admin.getByText(new RegExp(`Streitfall: ${nameA}`))).toBeVisible();
  await expect(admin.getByText(/Falsches Ergebnis/)).toBeVisible();
  // Die Aufgabe führt zum Spiel mit der Entscheidungsmaske
  await admin.getByRole("link", { name: new RegExp(`Streitfall: ${nameA}`) }).click();
  await expect(admin.getByText("Plattform-Entscheidung")).toBeVisible();

  await admin.goto(`/admin/spiele?q=${encodeURIComponent(nameA)}&status=disputed`);
  await expect(admin.getByText(nameA).first()).toBeVisible();
  await expect(admin.locator("li").getByText(/Strittig/).first()).toBeVisible();
  await admin.goto(`/admin/spiele?q=${encodeURIComponent(nameA)}&status=cancelled`);
  await expect(admin.getByText("Keine Spiele gefunden.")).toBeVisible();
});

test("Admin: Nutzer sperren, Rolle ändern, Profi-Badge, Protokoll", async ({ browser }) => {
  const victim = await (await browser.newContext()).newPage();
  await newUser(victim, "ad3v");
  const email = `ad3v-${run}@test.local`;

  const admin = await adminPage(browser, "ad3a", "/admin/nutzer");
  await admin.getByLabel("Name oder E-Mail").fill(email);
  await admin.getByRole("button", { name: "Filtern" }).click();
  const card = admin.getByTestId(`user-${email}`);
  await expect(card).toBeVisible();

  // Profi-Badge
  await card.getByRole("button", { name: "Profi-Badge geben" }).click();
  await expect(card.getByText("Profi", { exact: true })).toBeVisible();

  // Sperren mit Grund
  admin.once("dialog", (d) => d.accept("Beleidigung im Chat"));
  await card.getByRole("button", { name: "Sperren" }).click();
  await expect(card.getByText("Gesperrt")).toBeVisible();

  // Das gesperrte Konto kommt nicht mehr in geschützte Bereiche und sieht einen Hinweis
  await victim.goto("/app");
  await expect(victim).toHaveURL(/\/anmelden/);
  await expect(victim.getByText(/Dein Konto ist gesperrt/)).toBeVisible();

  // Entsperren
  await card.getByRole("button", { name: "Entsperren" }).click();
  await expect(card.getByText("Gesperrt")).toHaveCount(0);
  await victim.goto("/app");
  await expect(victim).toHaveURL(/\/app$/);

  // Rolle ändern
  await card.getByLabel("Rolle").selectOption("finance");
  await expect.poll(async () => (await query<{ role: string }>("select role from users where email = $1", [email]))[0].role).toBe("finance");

  // Admins können nicht gesperrt werden
  await seedAdmin("ad3x");
  await admin.getByLabel("Name oder E-Mail").fill(`ad3x-${run}@test.local`);
  await admin.getByRole("button", { name: "Filtern" }).click();
  const adminCard = admin.getByTestId(`user-ad3x-${run}@test.local`);
  admin.once("dialog", (d) => d.accept("Test"));
  await adminCard.getByRole("button", { name: "Sperren" }).click();
  await expect(adminCard.getByText(/Plattform-Admins können nicht gesperrt werden/)).toBeVisible();

  // Protokoll enthält Sperre mit Grund
  await admin.goto(`/admin/protokoll?action=user.&q=${encodeURIComponent("Admin ad3a")}`);
  await expect(admin.getByText("user.ban").first()).toBeVisible();
  await admin.getByText("Vorher und nachher").first().click();
  const audit = await query<{ after: { reason: string } }>("select after from audit_log where action = 'user.ban' and entity_id = (select id::text from users where email = $1)", [email]);
  expect(audit[0].after.reason).toBe("Beleidigung im Chat");
});

test("Admin: Team verifizieren und zusammenführen", async ({ browser }) => {
  const u1 = await (await browser.newContext()).newPage();
  const u2 = await (await browser.newContext()).newPage();
  await newUser(u1, "ad4a");
  await newUser(u2, "ad4b");
  const nameA = `Dublette ${run}`;
  const nameB = `Original ${run}`;
  await createTeam(u1, nameA);
  await createTeam(u2, nameB);
  const slugA = (await query<{ slug: string }>("select slug from teams where name = $1", [nameA]))[0].slug;
  const slugB = (await query<{ slug: string }>("select slug from teams where name = $1", [nameB]))[0].slug;

  const admin = await adminPage(browser, "ad4adm", "/admin/teams");
  await admin.getByPlaceholder("Name oder Stadt").fill(`${run}`);
  await admin.getByRole("button", { name: "Suchen" }).click();
  const cardA = admin.getByTestId(`team-${slugA}`);
  await expect(cardA).toBeVisible();

  await cardA.getByRole("button", { name: "Verifizieren" }).click();
  await expect(cardA.getByText("Verifiziert")).toBeVisible();

  admin.once("dialog", (d) => d.accept());
  await cardA.getByLabel("Zusammenführen mit").selectOption({ label: nameB });
  await cardA.getByRole("button", { name: "Zusammenführen" }).click();
  await expect(admin.getByTestId(`team-${slugA}`)).toHaveCount(0);

  // Mitglied von A ist jetzt im Team B, Team A existiert nicht mehr
  const members = await query<{ email: string }>("select u.email from team_members m join users u on u.id = m.user_id join teams t on t.id = m.team_id where t.slug = $1 order by u.email", [slugB]);
  expect(members.map((m) => m.email)).toEqual([`ad4a-${run}@test.local`, `ad4b-${run}@test.local`]);
  expect(await query("select 1 from teams where slug = $1", [slugA])).toHaveLength(0);
  const merged = await query<{ n: number }>("select count(*)::int n from audit_log where action = 'team.merge'");
  expect(merged[0].n).toBeGreaterThan(0);

  // Teams, die gegeneinander gespielt haben, lassen sich nicht zusammenführen
  const m = await setupLobby(browser, "ad4m");
  await admin.getByPlaceholder("Name oder Stadt").fill("AD4M");
  await admin.getByRole("button", { name: "Suchen" }).click();
  const slugHome = (await query<{ slug: string }>("select slug from teams where name = $1", [m.nameA]))[0].slug;
  const card = admin.getByTestId(`team-${slugHome}`);
  admin.once("dialog", (d) => d.accept());
  await card.getByLabel("Zusammenführen mit").selectOption({ label: m.nameB });
  await card.getByRole("button", { name: "Zusammenführen" }).click();
  await expect(card.getByText(/gegeneinander gespielt/)).toBeVisible();
});
