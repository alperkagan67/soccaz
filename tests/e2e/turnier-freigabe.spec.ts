import { expect, test, type Page } from "@playwright/test";
import { closeContexts, closeTestDb, newUser, run, seedUser } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// 012-Rest PR B (Backlog 143): Freigabe der Bank (3-D-Secure) fuer eine Turnier-Zeile. Fake-Pfad (PAYMENTS_FAKE=1 am Entwicklungsserver UND am Test): der Knopf loest ein signiertes Fake-Webhook-Ereignis
// aus (derselbe Weg wie in Produktion, applyTournamentCharge); das Ergebnis im Browser bucht nie selbst. Datenschutz: kein client_secret, keine PaymentIntent-ID, kein Knopf fuer Dritte.
// STAND: GESCHRIEBEN, lokal NICHT gelaufen (kein lokaler Browser, solange die Look-Server laufen); die CI faehrt die Spec.
test.skip(process.env.PAYMENTS_FAKE !== "1", "braucht PAYMENTS_FAKE=1 (nur Tests)");
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

const PI_PREFIX = "pi_e2e_turnier_freigabe_geheim";

/** Turnier in payment, der Spieler (Konto key) hat einen Versuch, der die Freigabe der Bank braucht (requires_action, Fenster 90 Minuten). */
async function setup(page: Page, key: string) {
  await newUser(page, key);
  const payer = (await query<{ id: string }>("select id from users where email = $1", [`${key}-${run}@test.local`]))[0].id;
  const org = await seedUser(`${key}org`);
  const mate = await seedUser(`${key}mate`);
  const [team] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Freigabe FC ${key} ${run}`, `ffc-${key}-${run}`, payer]);
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, final_share_cents, status, registration_deadline, starts_at, is_private, price_round, venue_access_required_snapshot, commission_percent_snapshot)
     values ($1, $2, 'Essen', (now() + interval '5 days')::date, 'knockout', 2, 16000, 8000, 120, 1000, 'payment', now() + interval '3 days', now() + interval '5 days', false, 1, false, 10.00) returning id`,
    [org, `Freigabe-Cup ${key} ${run}`],
  );
  await query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at) values ($1, $2, $3, now())", [t.id, team.id, payer]);
  for (const u of [payer, mate]) {
    await query("insert into team_members (team_id, user_id, role) values ($1, $2, $3) on conflict do nothing", [team.id, u, u === payer ? "admin" : "player"]);
    await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3)", [t.id, team.id, u]);
  }
  const pi = `${PI_PREFIX}_${payer.slice(0, 8)}`;
  await query("insert into payment_profiles (user_id, stripe_customer_id, payment_method_id) values ($1, $2, $3) on conflict (user_id) do nothing", [payer, `cus_e2e_${payer}`, `pm_e2e_${payer}`]);
  await query(
    `insert into payment_charges (tournament_id, user_id, amount_cents, status, failure_code, grace_until, idempotency_key, payment_intent_id)
     values ($1, $2, 1000, 'requires_action', 'authentication_required', now() + interval '90 minutes', $3, $4)`,
    [t.id, payer, `charge:t:${t.id}:${payer}:1:1`, pi],
  );
  return { tid: t.id, payer, mate, pi, org };
}
const statusOf = async (tid: string, uid: string) => (await query<{ status: string }>("select status from payment_charges where tournament_id = $1 and user_id = $2", [tid, uid]))[0].status;
const bodies = async (page: Page, url: string) => ({ html: await (await page.request.get(url)).text(), rsc: await (await page.request.get(url, { headers: { RSC: "1" } })).text() });

test("Freigabe im Turnier: Knopf fuer den Zahler, Klick => Webhook => bezahlt; Dritte sehen weder Knopf noch Secret noch PaymentIntent-ID", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const w = await setup(page, "tf1");
  const url = `/turniere/${w.tid}`;

  // Dritte: Mitspieler-Konto ohne eigene Zeile und Gast sehen den Abschnitt nicht
  const guest = await (await browser.newContext()).newPage();
  const g = await bodies(guest, url);
  for (const body of [g.html, g.rsc]) {
    expect(body).not.toContain("tournament-authorize");
    expect(body).not.toContain(PI_PREFIX);
    expect(body).not.toMatch(/client_secret|clientSecret/i);
  }

  await page.goto(url);
  await expect(page.getByTestId("tournament-authorize")).toBeVisible({ timeout: 60_000 });
  const own = await bodies(page, url);
  for (const body of [own.html, own.rsc]) {
    expect(body).not.toContain(PI_PREFIX); // auch der Betroffene sieht die PaymentIntent-ID nie
    expect(body).not.toMatch(/client_secret|clientSecret/i);
  }
  const btn = page.getByTestId("authorize-fake");
  await expect(btn).toBeVisible();
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44); // Zielgroesse (Vertrag 013 AC-3)
  await btn.click();
  await expect(page.getByTestId("tournament-authorize")).toHaveCount(0, { timeout: 20_000 });
  expect(await statusOf(w.tid, w.payer)).toBe("succeeded");
});

test("Freigabe scheitert: Abschnitt weg, Zeile fehlgeschlagen (Nachzahlfenster), Turnier bleibt in payment", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const w = await setup(page, "tf2");
  await page.goto(`/turniere/${w.tid}`);
  await expect(page.getByTestId("authorize-fake-fail")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("authorize-fake-fail").click();
  await expect(page.getByTestId("tournament-authorize")).toHaveCount(0, { timeout: 20_000 });
  expect(await statusOf(w.tid, w.payer)).toBe("failed");
  expect((await query<{ status: string }>("select status from tournaments where id = $1", [w.tid]))[0].status).toBe("payment");
});
