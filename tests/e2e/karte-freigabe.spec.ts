import { expect, test, type Page } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, newUser } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// Vertrag 012, M3c-1c (AC-7): Freigabe der Bank (3-D-Secure) in der Lobby. Fake-Pfad (PAYMENTS_FAKE=1 am Entwicklungsserver UND am Test): der Knopf loest ein signiertes Fake-Webhook-Ereignis
// aus (derselbe Weg wie in Produktion); das Ergebnis im Browser bucht nie selbst. Datenschutz: kein client_secret, keine PaymentIntent-ID, kein Knopf fuer Dritte.
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

const PI_PREFIX = "pi_e2e_freigabe_geheim";

/** Der Spieler mit dem Praefix hat einen Versuch, der die Freigabe der Bank braucht (requires_action, Fenster 90 Minuten). Liefert Nutzer-ID und PaymentIntent-ID. */
async function needsAuthorization(matchId: string, emailPrefix: string) {
  const [u] = await query<{ id: string }>("select u.id from users u join match_participants p on p.user_id = u.id where p.match_id = $1 and u.email like $2", [matchId, `${emailPrefix}-%`]);
  const pi = `${PI_PREFIX}_${u.id.slice(0, 8)}`;
  await query("insert into payment_profiles (user_id, stripe_customer_id, payment_method_id) values ($1, $2, $3) on conflict (user_id) do nothing", [u.id, `cus_e2e_${u.id}`, `pm_e2e_${u.id}`]);
  await query("update match_participants set card_status = 'failed' where match_id = $1 and user_id = $2", [matchId, u.id]);
  await query(
    `insert into payment_charges (match_id, user_id, amount_cents, status, failure_code, grace_until, idempotency_key, payment_intent_id)
     values ($1, $2, 800, 'requires_action', 'authentication_required', now() + interval '90 minutes', $3, $4)`,
    [matchId, u.id, `charge:${matchId}:${u.id}`, pi],
  );
  return { id: u.id, pi };
}
const bodies = async (page: Page, url: string) => ({ html: await (await page.request.get(url)).text(), rsc: await (await page.request.get(url, { headers: { RSC: "1" } })).text() });

test("Freigabe: Knopf fuer den Betroffenen, Klick => Webhook => bezahlt; Dritte sehen weder Knopf noch Secret noch PaymentIntent-ID", async ({ browser }) => {
  const { a, b, matchId } = await setupLobby(browser, "fg");
  const who = await needsAuthorization(matchId, "fga");
  const url = `/lobby/${matchId}`;

  // Dritte: Gegner-Captain und Gast
  const other = await bodies(b, url);
  const anonymous = await (await browser.newContext()).newPage();
  const guest = await bodies(anonymous, url);
  for (const body of [other.html, other.rsc, guest.html, guest.rsc]) {
    expect(body).not.toContain("authorize-section");
    expect(body).not.toContain("Zahlung freigeben");
    expect(body).not.toContain(PI_PREFIX);
    expect(body).not.toMatch(/client_secret|_secret_/);
  }

  // Betroffener: Knopf, aber weder PaymentIntent-ID noch Secret in Seite oder Payload
  await a.goto(url);
  await expect(a.getByTestId("authorize-section")).toBeVisible();
  const own = await bodies(a, url);
  for (const body of [own.html, own.rsc]) {
    expect(body).not.toContain(PI_PREFIX);
    expect(body).not.toMatch(/client_secret|_secret_/);
  }
  await a.getByTestId("authorize-fake").click();
  await expect(a.getByTestId("authorize-section")).toHaveCount(0, { timeout: 20_000 });
  const [row] = await query<{ status: string }>("select status from payment_charges where match_id = $1 and payment_intent_id = $2", [matchId, who.pi]);
  expect(row.status).toBe("succeeded"); // gebucht ueber den Webhook-Weg
});

test("gescheiterte Freigabe: Zeile failed im Fenster, kein Freigabe-Knopf mehr, 'Karte aendern' bleibt", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "fh");
  const who = await needsAuthorization(matchId, "fha");
  await a.goto(`/lobby/${matchId}`);
  await expect(a.getByTestId("authorize-fake-fail")).toBeVisible();
  await a.getByTestId("authorize-fake-fail").click();
  await expect(a.getByTestId("authorize-section")).toHaveCount(0, { timeout: 20_000 });
  await expect(a.getByTestId("charge-failed")).toBeVisible();
  const [row] = await query<{ status: string; grace: string | null }>("select status, grace_until::text as grace from payment_charges where match_id = $1 and payment_intent_id = $2", [matchId, who.pi]);
  expect(row.status).toBe("failed");
  expect(row.grace).not.toBeNull();
});

test("Konto: 'Offene Freigaben' nennt nur eigene offene Freigaben (Link, kein Secret)", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "fk");
  await needsAuthorization(matchId, "fka");
  await a.goto("/app/einstellungen");
  const list = a.getByTestId("open-authorizations");
  await expect(list).toBeVisible();
  await expect(list.getByRole("link", { name: /Zahlung freigeben/ })).toHaveAttribute("href", `/lobby/${matchId}`);
  expect(await a.content()).not.toContain(PI_PREFIX);
  // ein anderer Nutzer sieht nichts davon
  const c = await (await browser.newContext()).newPage();
  await newUser(c, "fkc");
  await c.goto("/app/einstellungen");
  await expect(c.getByTestId("open-authorizations")).toHaveCount(0);
});
