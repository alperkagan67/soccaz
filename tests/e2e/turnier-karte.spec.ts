import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, devLogin, newUser, run, seedUser } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// 012 M5-3: Turnier-Lobby im Kartenmodell (Sicht des Captains): Abschnitt "Deine Karte", Ampel, Legende, Bereit-Box.
// Nachweis laut Entscheid t9: Sichtpruefung Dark/Hell/Handy (Bilder nach E2E_SHOTS_DIR) und eine a11y-Pruefung mit axe-core. Kartenmodell AN, Schalter danach wieder AUS.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("card_payments_enabled", true);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("card_payments_enabled", false);
  await closeTestDb();
});

const SHOTS = process.env.E2E_SHOTS_DIR;

type Ctx = { page: Page; tid: string; names: { nocard: string; covered: string }; emails: { org: string; foreign: string } };

async function tournamentInPayment(browser: Browser, key: string, viewport = { width: 1280, height: 900 }): Promise<Ctx> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await newUser(page, key);
  const cap = (await query<{ id: string }>("select id from users where email = $1", [`${key}-${run}@test.local`]))[0].id;
  const org = await seedUser(`${key}org`);
  const mk = async (suffix: string) => seedUser(`${key}${suffix}`);
  const a = await mk("a"); // ohne Karte
  const b = await mk("b"); // mit Karte, uebernimmt nichts
  const c = await mk("c"); // ohne Karte, Anteil uebernommen
  const t2 = [await mk("t1"), await mk("t2"), await mk("t3"), await mk("t4")];
  const [team1] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Karten FC ${key} ${run}`, `kfc-${key}-${run}`, cap]);
  const [team2] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Gegner FC ${key} ${run}`, `gfc-${key}-${run}`, t2[0]]);
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, final_share_cents, status, registration_deadline, starts_at, is_private, price_round)
     values ($1, $2, 'Essen', (now() + interval '5 days')::date, 'knockout', 2, 16000, 8000, 120, 2000, 'payment', now() + interval '3 days', now() + interval '5 days', false, 1) returning id`,
    [org, `Karten-Cup ${key} ${run}`],
  );
  const link = async (team: string, users: string[], captain: string) => {
    await query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at) values ($1, $2, $3, now())", [t.id, team, captain]);
    for (const u of users) {
      await query("insert into team_members (team_id, user_id, role) values ($1, $2, $3) on conflict do nothing", [team, u, u === captain ? "admin" : "player"]);
      await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3)", [t.id, team, u]);
    }
  };
  await link(team1.id, [cap, a, b, c], cap);
  await link(team2.id, t2, t2[0]);
  let n = 0;
  for (const u of [cap, b, ...t2]) {
    n += 1;
    await query("insert into payment_profiles (user_id, stripe_customer_id, payment_method_id, card_brand, card_last4) values ($1, $2, $3, 'visa', '4242') on conflict (user_id) do nothing", [u, `cus_e2e_${key}_${n}`, `pm_e2e_${key}_${n}`]);
  }
  // c: Anteil von b uebernommen (b hat eine Karte)
  await query("update tournament_players set covered_by_user_id = $1, cover_mandate_text = 'cover.mandate.v1.entwurf', cover_accepted_at = now() where tournament_id = $2 and user_id = $3", [b, t.id, c]);
  return { page, tid: t.id, names: { nocard: `Spieler ${key}a`, covered: `Spieler ${key}c` }, emails: { org: `${key}org-${run}@test.local`, foreign: `${key}t2-${run}@test.local` } };
}

async function openAs(page: Page, tid: string, scheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`/turniere/${tid}`);
  await expect(page.getByTestId("tournament-card")).toBeVisible({ timeout: 60_000 });
}

test("Captain-Sicht: Karte hinterlegt, Mitspieler ohne Karte offen, uebernommener Platz gedeckt; nach der Uebernahme des letzten Platzes ist Bereit moeglich", async ({ browser }) => {
  const { page, tid, names } = await tournamentInPayment(browser, "tk1");
  await openAs(page, tid, "dark");
  await expect(page.getByTestId("tournament-card-ready")).toBeVisible();
  const row = (name: string) => page.getByTestId("tournament-player").filter({ hasText: new RegExp(`${name}(?![a-z])`) });
  await expect(row(names.nocard)).toHaveAttribute("data-paid", "false"); // ohne Karte
  await expect(row(names.covered)).toHaveAttribute("data-paid", "true"); // Anteil uebernommen: nicht rot
  await expect(page.getByTestId("paid-ready-box")).toHaveCount(0); // ein Platz ist noch offen
  await expect(page.getByTestId("pay-entry")).toHaveCount(0); // im Kartenmodell wird nichts bezahlt
  await expect(page.getByText(/Anteil bezahlen|Ich zahle für ihn/)).toHaveCount(0);

  // der Captain uebernimmt den Anteil des letzten Platzes (Dialog mit Pflicht-Haken), danach ist Bereit moeglich
  await page.getByTestId("tournament-cover-list").getByRole("button", { name: "Anteil übernehmen" }).click();
  const dlg = page.getByRole("dialog", { name: `Anteil von ${names.nocard} übernehmen?` });
  const confirm = dlg.getByRole("button", { name: "Anteil übernehmen" });
  await expect(confirm).toBeDisabled();
  await dlg.getByRole("checkbox").check();
  await confirm.click();
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId("tournament-covering")).toContainText(names.nocard);
  await expect(page.getByTestId("paid-ready-box")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("paid-ready-box").getByRole("button", { name: "Bereit" }).click();
  await expect(page.getByText("✓ Bereit")).toBeVisible({ timeout: 20_000 });
});

test("Sicht je Rolle (HTML): Gast und fremder Spieler sehen nur Anzahl und Status, der Veranstalter das Karten-Aggregat, keiner ausser dem Team Spieler-Ampeln", async ({ browser }) => {
  const { tid, emails } = await tournamentInPayment(browser, "tk4");
  const asGuest = await (await browser.newContext()).newPage();
  await asGuest.goto(`/turniere/${tid}`);
  await expect(asGuest.getByTestId("tournament-lobby")).toBeVisible({ timeout: 60_000 });
  await expect(asGuest.getByTestId("teams-count")).toContainText("Teams angemeldet: 2");
  await expect(asGuest.getByTestId("team-cards-state")).toHaveCount(0);
  await expect(asGuest.locator("[data-light]")).toHaveCount(0);
  await expect(asGuest.getByTestId("tournament-card")).toHaveCount(0);

  const asForeign = await (await browser.newContext()).newPage();
  await devLogin(asForeign, emails.foreign, "Fremder Spieler");
  await asForeign.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 30_000 });
  await asForeign.goto(`/turniere/${tid}`);
  await expect(asForeign.getByTestId("tournament-lobby").or(asForeign.getByTestId("teams-count")).first()).toBeVisible({ timeout: 60_000 });
  await expect(asForeign.locator("[data-light]").first()).toBeVisible(); // das eigene Team (Gegner FC) zeigt seine Ampeln
  await expect(asForeign.getByTestId("team-cards-state")).toHaveCount(0); // aber kein Aggregat fuer fremde Teams

  const asOrg = await (await browser.newContext()).newPage();
  await devLogin(asOrg, emails.org, "Veranstalter");
  await asOrg.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 30_000 });
  await asOrg.goto(`/turniere/${tid}`);
  await expect(asOrg.getByTestId("team-cards-state").first()).toBeVisible({ timeout: 60_000 });
  await expect(asOrg.getByTestId("tournament-player").locator("[data-light]")).toHaveCount(0); // keine Spieler-Ampeln fuer den Veranstalter (die Legende zeigt nur die Bedeutung)
});

test("Sichtpruefung: vier Bilder (Dark/Hell, Desktop/Handy) und a11y mit axe-core", async ({ browser }) => {
  const desktop = await tournamentInPayment(browser, "tk2");
  const mobile = await tournamentInPayment(browser, "tk3", { width: 390, height: 844 });
  const axeSource = readFileSync(join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf8");
  for (const [label, ctx] of [["desktop", desktop], ["mobile", mobile]] as const) {
    for (const scheme of ["dark", "light"] as const) {
      await openAs(ctx.page, ctx.tid, scheme);
      if (SHOTS) {
        await ctx.page.getByTestId("tournament-lobby").evaluate((el) => el.scrollIntoView()); // Viewport-Aufnahme ab der Turnier-Lobby (Abnahme), nicht die ganze Seite
        await ctx.page.screenshot({ path: `${SHOTS}/turnier-karte-${label}-${scheme}.png` });
      }
      await ctx.page.addScriptTag({ content: axeSource });
      const result = await ctx.page.evaluate(async () => {
        // @ts-expect-error axe wird per Script eingefuegt
        const r = await window.axe.run(document.querySelector("main") ?? document.body, { resultTypes: ["violations"] });
        return r.violations.map((v: { id: string; impact: string; nodes: { target: unknown }[] }) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, first: JSON.stringify(v.nodes[0]?.target) }));
      });
      // Schwere Verstoesse (kritisch/ernst) duerfen nicht vorkommen; weitere stehen im Ausgabetext zur Bewertung
      if (result.length) console.log(`axe ${label}/${scheme}:`, JSON.stringify(result));
      expect(result.filter((v: { impact: string }) => v.impact === "critical" || v.impact === "serious"), `${label}/${scheme}`).toEqual([]);
    }
  }
});

test("Turnier ohne Halle im Kartenmodell: der Veranstalter waehlt die Partnerhalle auf der Turnierseite, danach ist die Auswahl weg", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await newUser(page, "tv1");
  const org = (await query<{ id: string }>("select id from users where email = $1", [`tv1-${run}@test.local`]))[0].id;
  await query("update users set is_organizer = true where id = $1", [org]);
  const [v] = await query<{ id: string }>("insert into venues (name, city, is_partner, active) values ($1, 'Essen', true, true) returning id", [`E2E Halle TV ${run}`]);
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, status, registration_deadline, starts_at, is_private)
     values ($1, $2, 'Essen', (now() + interval '5 days')::date, 'knockout', 4, 16000, 8000, 120, 'registration', now() + interval '3 days', now() + interval '5 days', false) returning id`,
    [org, `Ohne Halle ${run}`],
  );
  // ein Nicht-Veranstalter (Gast) sieht die Auswahl nicht
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/turniere/${t.id}`);
  await expect(guest.getByTestId("tournament-lobby")).toBeVisible({ timeout: 60_000 });
  await expect(guest.getByTestId("venue-pick")).toHaveCount(0);
  await page.goto(`/turniere/${t.id}`);
  const pick = page.getByTestId("venue-pick");
  await expect(pick).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("venue-pick-save")).toBeDisabled(); // erst eine Halle waehlen
  await pick.getByRole("combobox").selectOption(v.id);
  await page.getByTestId("venue-pick-save").click();
  await expect(pick).toBeHidden({ timeout: 20_000 });
  expect((await query<{ venue_id: string | null }>("select venue_id from tournaments where id = $1", [t.id]))[0].venue_id).toBe(v.id);
});
