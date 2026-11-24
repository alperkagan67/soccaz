import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { addParticipant, addTeamMember, closeContexts, closeTestDb, seedUser, teamIdByName } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// 013 M3 PR 5b: Fehlerzustand "Abbuchung fehlgeschlagen" mit EINEM nächsten Schritt (AC-30) und Captain-Leiste. Fake-Pfad wie karte-freigabe.spec (PAYMENTS_FAKE=1 am Entwicklungsserver UND am Test).
test.skip(process.env.PAYMENTS_FAKE !== "1", "braucht PAYMENTS_FAKE=1 (nur Tests)");
test.describe.configure({ mode: "serial" });

// Schalter pro Test (Regel 23): Kartenmodell UND Zahlungen AN; Reset nach jedem Test.
test.beforeEach(async () => {
  await setPlatformSetting("payments_enabled", true);
  await setPlatformSetting("card_payments_enabled", true);
});
test.afterEach(async () => {
  await setPlatformSetting("payments_enabled", false);
  await setPlatformSetting("card_payments_enabled", false);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
  await setPlatformSetting("card_payments_enabled", false);
  await closeTestDb();
});

/** Der Spieler mit dem Präfix bekommt einen fehlgeschlagenen Versuch (Grund und Frist wählbar). */
async function failCharge(matchId: string, emailPrefix: string, code: string, status: "requires_action" | "failed", graceMinutes: number) {
  const [u] = await query<{ id: string }>("select u.id from users u join match_participants p on p.user_id = u.id where p.match_id = $1 and u.email like $2", [matchId, `${emailPrefix}-%`]);
  await query("insert into payment_profiles (user_id, stripe_customer_id, payment_method_id) values ($1, $2, $3) on conflict (user_id) do nothing", [u.id, `cus_e2e_${u.id}`, `pm_e2e_${u.id}`]);
  await query("update match_participants set card_status = 'failed' where match_id = $1 and user_id = $2", [matchId, u.id]);
  await query(
    `insert into payment_charges (match_id, user_id, amount_cents, status, failure_code, grace_until, idempotency_key, payment_intent_id)
     values ($1, $2, 800, $3, $4, now() + ($5 || ' minutes')::interval, $6, $7)`,
    [matchId, u.id, status, code, String(graceMinutes), `charge:${matchId}:${u.id}`, `pi_e2e_lc_${u.id.slice(0, 8)}`],
  );
  return u.id;
}

// Impeccable Lauf 2 (P1-1, P1-2): im Fehlerzustand steht die eine Hauptaktion in der ersten Ansicht (390x844, im Fluss), keine Karte in der Karte
async function ersteAnsichtFehler(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  // erst warten, bis der Knopf sichtbar ist: der Fehlerblock wird bei der Hydration neu aufgebaut, boundingBox() wartet nicht (CI Teil 1/5, #317)
  const primary = page.locator("main .btn-primary:visible").first();
  await expect(primary).toBeVisible({ timeout: 30_000 });
  const box = await primary.boundingBox();
  expect(box, "Hauptknopf hat eine Position").not.toBeNull();
  expect(box!.y + box!.height, "Hauptknopf liegt in der ersten Ansicht").toBeLessThanOrEqual(844);
  expect(await page.locator("main .card .card").count()).toBe(0);
  expect(await page.locator("main .card div.rounded-lg.border").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("Fehlerzustand Freigabe: genau ein Primary (Zahlung freigeben), andere Karte nur eingeklappt, Dein Stand nennt den Schritt", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "lc1");
  await failCharge(matchId, "lc1a", "authentication_required", "requires_action", 90);
  await a.goto(`/lobby/${matchId}`);
  await expect(a.getByTestId("charge-failed")).toBeVisible({ timeout: 60_000 });
  await expect(a.getByTestId("lobby-stand")).toHaveAttribute("data-aktion", "freigeben");
  await expect(a.locator("main .btn-primary")).toHaveCount(1);
  await expect(a.getByTestId("authorize-fake")).toHaveClass(/btn-primary/);
  await expect(a.getByTestId("charge-failed-other-card")).toBeVisible();
  await expect(a.getByTestId("charge-failed-other-card")).not.toHaveAttribute("open", "");
  await expect(a.getByRole("button", { name: /bereit/i })).toHaveCount(0); // im Fehlerzustand konkurriert kein Bereit-Knopf
  await ersteAnsichtFehler(a);
});

test("Fehlerzustand Karte: genau ein Primary (Karte ändern); abgelaufenes Fenster: kein Schritt, kein Primary", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "lc2");
  await failCharge(matchId, "lc2a", "card_declined", "failed", 90);
  await a.goto(`/lobby/${matchId}`);
  await expect(a.getByTestId("lobby-stand")).toHaveAttribute("data-aktion", "karte", { timeout: 60_000 });
  await expect(a.locator("main .btn-primary")).toHaveCount(1);
  await expect(a.getByTestId("authorize-section")).toHaveCount(0);
  await ersteAnsichtFehler(a);
  // Fenster vorbei
  await query("update payment_charges set grace_until = now() - interval '5 minutes' where match_id = $1", [matchId]);
  await a.reload();
  await expect(a.getByTestId("charge-failed-expired")).toBeVisible({ timeout: 60_000 });
  // ruhiger Ausweg statt Sackgasse (Pilot-P2): Ghost-Link, 44 px, KEINE Hauptaktion
  const ausweg = a.getByTestId("charge-failed-search");
  await expect(ausweg).toHaveText("Andere Spiele suchen");
  await expect(ausweg).toHaveClass(/btn-ghost/);
  await expect(ausweg).toHaveAttribute("href", "/suche");
  expect((await ausweg.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(a.getByTestId("lobby-stand")).toHaveAttribute("data-aktion", "keine");
  await expect(a.locator("main .btn-primary")).toHaveCount(0);
});

test("Captain-Leiste: Team-Stand und Fehlerzeile mit Schritt für den Captain, der Gegner-Captain sieht die Zeile nicht", async ({ browser }) => {
  const { a, b, matchId, nameA } = await setupLobby(browser, "lc3");
  const teamA = await teamIdByName(nameA);
  const id = await seedUser("lc3m1");
  await addTeamMember(teamA, id);
  await addParticipant(matchId, id, teamA, false);
  await failCharge(matchId, "lc3m1", "card_declined", "failed", 90);
  await a.goto(`/lobby/${matchId}`);
  const bar = a.getByTestId("captain-bar");
  await expect(bar).toBeVisible({ timeout: 60_000 });
  await expect(bar.getByTestId("captain-team-stand")).toContainText("von");
  const zeile = bar.getByTestId("charge-failed-player");
  await expect(zeile).toHaveCount(1);
  await expect(zeile).toContainText("Spieler lc3m1");
  await b.goto(`/lobby/${matchId}`);
  await expect(b.getByTestId("captain-bar")).toBeVisible({ timeout: 60_000 });
  await expect(b.getByTestId("charge-failed-captain")).toHaveCount(0);
});
