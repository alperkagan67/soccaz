import { expect, test, type Page } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, newUser } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// Vertrag 012, AC-12/AC-20 (M3b): Dritte und Gäste dürfen den Fehlerzustand einer Abbuchung NICHT erfahren. Geprüft wird die Antwort des SERVERS
// (HTML und RSC-Payload), nicht nur, was am Bildschirm sichtbar ist.
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

const LEAKS = [
  /failed/i,
  /fehlgeschlagen/i,
  /card_declined/i,
  /insufficient_funds/i,
  /abgelehnt/i,
];

/** Setzt den Platz des ersten Teilnehmers (Captain a) auf "Abbuchung fehlgeschlagen" mit Grund. */
async function failChargeOfFirst(matchId: string, emailPrefix: string) {
  const [u] = await query<{ id: string }>(
    "select u.id from users u join match_participants p on p.user_id = u.id where p.match_id = $1 and u.email like $2",
    [matchId, `${emailPrefix}-%`],
  );
  await query(
    "update match_participants set card_status = 'failed' where match_id = $1 and user_id = $2",
    [matchId, u.id],
  );
  await query(
    `insert into payment_charges (match_id, user_id, amount_cents, status, failure_code, idempotency_key)
     values ($1, $2, 500, 'failed', 'card_declined', $3)`,
    [matchId, u.id, `charge:${matchId}:${u.id}`],
  );
  return u.id;
}

async function bodies(page: Page, url: string) {
  const html = await (await page.request.get(url)).text();
  const rsc = await (
    await page.request.get(url, { headers: { RSC: "1" } })
  ).text();
  return { html, rsc };
}

test("Dritte sehen nur die neutrale rote Ampel; Gäste sehen keinen Status je Person; der Betroffene sieht seinen Zustand", async ({
  browser,
}) => {
  const { a, b, matchId } = await setupLobby(browser, "kp");
  await failChargeOfFirst(matchId, "kpa");
  const url = `/lobby/${matchId}`;

  // Betroffener (a): echter Zustand
  const own = await bodies(a, url);
  expect(own.html).toContain('data-card-status="failed"');

  // Mitspieler (b, Captain des anderen Teams): nur neutral, nichts vom Fehler
  const member = await bodies(b, url);
  expect(member.html).toContain('data-card-status="open"');
  for (const leak of LEAKS) {
    expect(member.html, `HTML ${leak}`).not.toMatch(leak);
    expect(member.rsc, `RSC ${leak}`).not.toMatch(leak);
  }

  // Gäste: nicht angemeldet ODER angemeldet ohne Teilnahme: gar kein Status je Person, auch keine Ampel-Legende
  const anonymous = await (await browser.newContext()).newPage();
  const outsider = await (await browser.newContext()).newPage();
  await newUser(outsider, "kpc");
  for (const guest of [
    await bodies(anonymous, url),
    await bodies(outsider, url),
  ]) {
    expect(guest.html).not.toContain("data-card-status");
    expect(guest.html).not.toContain("data-card-light");
    expect(guest.html).not.toContain("card-light-legend");
    for (const leak of LEAKS) {
      expect(guest.html, `HTML ${leak}`).not.toMatch(leak);
      expect(guest.rsc, `RSC ${leak}`).not.toMatch(leak);
    }
  }
});
