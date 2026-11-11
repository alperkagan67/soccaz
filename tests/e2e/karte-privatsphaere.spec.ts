import { expect, test, type Page } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, devLogin, newUser, run } from "./helpers";
import { query, seedAdmin, setPlatformSetting } from "./helpers-db";

// Vertrag 012, AC-12/AC-20 (M3b): Dritte und Gäste dürfen den Fehlerzustand einer Abbuchung NICHT erfahren, und Gäste (nicht angemeldet) sehen nur
// Zahlen und Initialen statt Namen (Vertrag 013, Sichtbarkeitsmatrix). Geprüft wird die Antwort des SERVERS (HTML, RSC-Payload, Live-Kanal),
// nicht nur, was am Bildschirm sichtbar ist.
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

/** Setzt den Platz des Spielers (E-Mail beginnt mit dem Präfix) auf "Abbuchung fehlgeschlagen" mit Grund. */
async function failChargeOf(matchId: string, emailPrefix: string) {
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

/** Liest den Live-Kanal (SSE) kurz mit und gibt alles zurück, was in dieser Zeit gesendet wurde. */
async function readSse(baseURL: string, path: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  let text = "";
  try {
    const res = await fetch(baseURL + path, { signal: ctrl.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
  } catch {
    // Abbruch nach dem Zeitfenster ist gewollt
  } finally {
    clearTimeout(timer);
  }
  return text;
}

test("Dritte sehen nur die neutrale rote Ampel; Gäste sehen keinen Status und nur Initialen; der Betroffene sieht seinen Zustand", async ({
  browser,
  baseURL,
}) => {
  const { a, b, matchId } = await setupLobby(browser, "kp");
  await failChargeOf(matchId, "kpa");
  const url = `/lobby/${matchId}`;

  // Betroffener (a): echter Zustand
  const own = await bodies(a, url);
  expect(own.html).toContain('data-card-status="failed"');

  // Mitspieler (b, Captain des anderen Teams): nur neutral, nichts vom Fehler, Namen sichtbar (angemeldet)
  const member = await bodies(b, url);
  expect(member.html).toContain('data-card-status="open"');
  expect(member.html).toContain("Spieler kpa");
  for (const leak of LEAKS) {
    expect(member.html, `HTML ${leak}`).not.toMatch(leak);
    expect(member.rsc, `RSC ${leak}`).not.toMatch(leak);
  }

  // Gäste: nicht angemeldet ODER angemeldet ohne Teilnahme: gar kein Status je Person, auch keine Ampel-Legende
  const anonymous = await (await browser.newContext()).newPage();
  const outsider = await (await browser.newContext()).newPage();
  await newUser(outsider, "kpc");
  const anonymousBodies = await bodies(anonymous, url);
  for (const guest of [anonymousBodies, await bodies(outsider, url)]) {
    expect(guest.html).not.toContain("data-card-status");
    expect(guest.html).not.toContain("data-card-light");
    expect(guest.html).not.toContain("card-light-legend");
    expect(guest.rsc).not.toMatch(/"complete":true/); // Vollständigkeit der Teams liegt nur für das eigene Team im Payload
    for (const leak of LEAKS) {
      expect(guest.html, `HTML ${leak}`).not.toMatch(leak);
      expect(guest.rsc, `RSC ${leak}`).not.toMatch(leak);
    }
  }

  // Namen: Gäste ohne Konto sehen nur Initialen (kein Name, kein Link auf ein Spielerprofil), weder im HTML noch im RSC-Payload
  for (const body of [anonymousBodies.html, anonymousBodies.rsc]) {
    expect(body).not.toContain("Spieler kpa");
    expect(body).not.toContain("Spieler kpb");
    expect(body).not.toContain("/spieler/");
  }

  // Live-Kanal: nur Signale, nie Namen oder Status
  const live = await readSse(String(baseURL), `/api/lobby/${matchId}/events`);
  expect(live).not.toMatch(/Spieler kp|failed|card_declined|fehlgeschlagen/i);
  expect(
    live.replace(/^(event: update|data: 1|retry: \d+|:.*)$/gm, "").trim(),
  ).toBe("");
});

test("Offene Lobbys auf Start und Suche: Gäste sehen nur Initialen und keinen Status je Person (HTML und RSC), Angemeldete die Namen", async ({
  browser,
}) => {
  const { a, matchId } = await setupLobby(browser, "kq");
  const anonymous = await (await browser.newContext()).newPage();
  for (const path of ["/", "/suche"]) {
    const guest = await bodies(anonymous, path);
    for (const body of [guest.html, guest.rsc]) {
      expect(body, path).not.toContain("Spieler kqa");
      expect(body, path).not.toContain("Spieler kqb");
    }
    expect(guest.html, path).not.toContain('data-light="');
    expect(guest.html, path).not.toContain("/spieler/");
  }
  // Gegenprobe: angemeldet stehen die Namen auf der Suche (sonst wäre die Prüfung oben wertlos)
  const own = await bodies(a, "/suche");
  expect(own.html).toContain(matchId);
  expect(own.html).toContain("Spieler kqa");
});

test("Captain/Admin desselben Teams und der Plattform-Admin sehen den echten Fehlerzustand; das Teamprofil zeigt Gästen keine Namen", async ({
  browser,
}) => {
  const { a, matchId } = await setupLobby(browser, "kr");
  await failChargeOf(matchId, "kra");
  const url = `/lobby/${matchId}`;
  const [{ home_team_id: homeTeamId }] = await query<{ home_team_id: string }>(
    "select home_team_id from matches where id = $1",
    [matchId],
  );

  // zweiter Admin desselben Teams (ohne Teilnahme am Spiel)
  const coAdmin = await (await browser.newContext()).newPage();
  await newUser(coAdmin, "krc");
  await query(
    "insert into team_members (team_id, user_id, role) select $1, id, 'admin' from users where email = $2",
    [homeTeamId, `krc-${run}@test.local`],
  );
  expect((await bodies(coAdmin, url)).html).toContain(
    'data-card-status="failed"',
  );

  // Plattform-Admin
  await seedAdmin(`kradm`);
  const admin = await (await browser.newContext()).newPage();
  await devLogin(admin, `kradm-${run}@test.local`, "Admin kradm");
  await expect
    .poll(async () => (await admin.context().cookies()).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0); // erst anfragen, wenn die Anmeldung steht
  await admin.waitForLoadState("networkidle");
  expect((await bodies(admin, url)).html).toContain(
    'data-card-status="failed"',
  );

  // Teamprofil für Gäste: keine Spielernamen, keine Profil-Links
  const anonymous = await (await browser.newContext()).newPage();
  const lobbyHtml = (await bodies(anonymous, url)).html;
  const slug = new RegExp("/teams/([a-z0-9-]+)").exec(lobbyHtml)?.[1];
  expect(slug).toBeTruthy();
  const team = await bodies(anonymous, `/teams/${slug}`);
  for (const body of [team.html, team.rsc]) {
    expect(body).not.toContain("Spieler kra");
    expect(body).not.toContain("Spieler krc");
    expect(body).not.toContain("/spieler/");
  }
  await a.close();
});
