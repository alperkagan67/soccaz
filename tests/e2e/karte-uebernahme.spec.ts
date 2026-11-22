import { expect, test, type Browser, type Page } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, newUser, run } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// Vertrag 012, M3c-3b (AC-12, AC-13, AC-20): "Anteil übernehmen" in der Lobby. Teamspiel, Kartenmodell AN. Rollen: C = Captain (Heim), A = Mitspieler OHNE Karte (rot), B = Mitspieler mit Karte
// (Übernehmer), T = Dritter (Mitspieler mit Karte). Geprüft wird auch, was der SERVER an Dritte und Gäste liefert (HTML, RSC-Payload, Live-Kanal), nicht nur der Bildschirm.
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

const emailOf = (key: string) => `${key}-${run}@test.local`;
const idOf = async (key: string) => (await query<{ id: string }>("select id from users where email = $1", [emailOf(key)]))[0].id;

/** Neuer eingeloggter Mitspieler im Heimteam: in der Lobby eingeteilt, mit oder ohne Karte (card_ready). */
async function addMate(browser: Browser, key: string, matchId: string, withCard: boolean): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await newUser(page, key);
  const uid = await idOf(key);
  const [m] = await query<{ home: string }>("select home_team_id as home from matches where id = $1", [matchId]);
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [m.home, uid]);
  await query("insert into match_participants (match_id, user_id, team_id, card_status) values ($1, $2, $3, $4)", [matchId, uid, m.home, withCard ? "card_ready" : "none"]);
  return page;
}

async function game(browser: Browser, key: string) {
  const { a: captain, b: away, matchId } = await setupLobby(browser, key);
  await query("update matches set price_cents = 8000, cost_cents = 8000 where id = $1", [matchId]);
  await query("update match_participants set card_status = 'card_ready' where match_id = $1 and user_id = $2", [matchId, await idOf(`${key}a`)]); // Captain mit Karte
  const A = await addMate(browser, `${key}x`, matchId, false); // rot
  const B = await addMate(browser, `${key}y`, matchId, true); // Übernehmer
  const T = await addMate(browser, `${key}z`, matchId, true); // Dritter
  return { captain, away, A, B, T, matchId, url: `/lobby/${matchId}`, nameA: `Spieler ${key}x`, nameB: `Spieler ${key}y` };
}

const rowOf = (page: Page, name: string) => page.locator("li", { hasText: name }).filter({ has: page.locator("[data-card-light]") }).first();
const takeOverButton = (row: ReturnType<typeof rowOf>) => row.getByRole("button", { name: "Anteil übernehmen" });

async function bodies(page: Page, url: string) {
  const html = await (await page.request.get(url)).text();
  const rsc = await (await page.request.get(url, { headers: { RSC: "1" } })).text();
  return { html, rsc };
}

/** Liest den Live-Kanal (SSE) kurz mit. */
async function readSse(baseURL: string, path: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  let text = "";
  try {
    const res = await fetch(baseURL + path, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
  } catch {
    /* Abbruch nach dem Zeitlimit ist gewollt */
  } finally {
    clearTimeout(timer);
  }
  return text;
}

// Wörter, die Dritte und Gäste NIE zur Übernahme zu sehen bekommen dürfen (Plan Abschnitt 5, LEAKS)
const COVER_LEAKS = [/übernimmt/i, /übernommen/i, /Zurücknehmen/, /cover-covering/, /cover-pairs/, /coveredBy|covered_by|"covered":|covered:\s*true/, /payer/i, /fehlgeschlagen/i, /card_declined/i];

test("Übernehmen: Knopf nur für berechtigte Mitspieler, Dialog mit Text, Betrag und Pflicht-Zustimmung, Eintrag mit Mandatszusatz", async ({ browser }) => {
  const g = await game(browser, "cu");
  for (const page of [g.A, g.B, g.T, g.captain]) await page.goto(g.url);

  // A (ohne Karte) und der andere Captain bekommen keinen Knopf; B, T und der Captain (mit Karte) schon, nur neben dem roten Platz von A
  await expect(takeOverButton(rowOf(g.A, g.nameA))).toHaveCount(0);
  await expect(g.away.getByRole("button", { name: "Anteil übernehmen" })).toHaveCount(0);
  for (const page of [g.B, g.T, g.captain]) {
    await page.goto(g.url);
    await expect(takeOverButton(rowOf(page, g.nameA))).toBeVisible();
    await expect(takeOverButton(rowOf(page, g.nameB))).toHaveCount(0); // B hat eine Karte: kein Ziel
  }

  await takeOverButton(rowOf(g.B, g.nameA)).click();
  const dlg = g.B.getByRole("dialog", { name: `Anteil von ${g.nameA} übernehmen?` });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("zusätzlich der Anteil von"); // Vorgabe t9
  await expect(dlg).toContainText("Scheitert dieser Posten, verfällt der Platz");
  await expect(dlg).toContainText("du verlierst nur diesen Posten");
  await expect(dlg).toContainText("innerhalb des Fensters eine andere Karte hinterlegen; dann versuchen wir es einmal erneut");
  await expect(dlg.getByTestId("confirm-consequence")).toContainText(/zusammen \d+,\d{2}\s€/); // Betrag steht im Dialog
  await expect(dlg).toContainText("Entwurf, Rechtstext durch Anwalt"); // Mandatszusatz ist als Entwurf gekennzeichnet
  const confirm = dlg.getByRole("button", { name: "Anteil übernehmen" });
  await expect(confirm).toBeDisabled(); // Pflicht-Haken
  await dlg.getByRole("checkbox").check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dlg).toBeHidden({ timeout: 20_000 });

  await expect(g.B.getByTestId("cover-covering")).toContainText(`Du übernimmst den Anteil von ${g.nameA}.`);
  await expect(g.B.getByTestId("cover-release")).toBeVisible(); // Zurücknehmen vor der Frist sichtbar
  const [row] = await query<{ by: string; text: string; at: string | null }>("select covered_by_user_id as by, cover_mandate_text as text, cover_accepted_at as at from match_participants where match_id = $1 and user_id = $2", [g.matchId, await idOf("cux")]);
  expect(row.by).toBe(await idOf("cuy")); // der Übernehmer kommt aus der Sitzung
  expect(row.text).toBe("cover.mandate.v1.entwurf"); // Schlüssel samt Version, nie freier Text
  expect(row.at).not.toBeNull();
});

test("Sichtbarkeit nach der Übernahme: A 'wird übernommen', Captain sieht das Paar, Dritte nur 'Gedeckt' ohne Namen, Gäste nichts", async ({ browser, baseURL }) => {
  const g = await game(browser, "cv");
  await query("update match_participants set covered_by_user_id = $2, cover_mandate_text = 'cover.mandate.v1.entwurf', cover_accepted_at = now() where match_id = $1 and user_id = $3", [g.matchId, await idOf("cvy"), await idOf("cvx")]);
  for (const page of [g.A, g.B, g.T, g.captain, g.away]) await page.goto(g.url);

  // A: Gedeckt und der klare Satz, kein Knopf, kein Zurücknehmen, kein Name von B
  await expect(g.A.getByTestId("cover-covered")).toContainText("Dein Anteil wird übernommen");
  await expect(rowOf(g.A, g.nameA).locator("[data-card-light]")).toContainText("Gedeckt");
  expect(await g.A.getByTestId("cover-status").innerText()).not.toContain(g.nameB);
  await expect(g.A.getByTestId("cover-release")).toHaveCount(0);

  // B: Übernimmt, Zurücknehmen vorhanden
  await expect(g.B.getByTestId("cover-covering")).toContainText(g.nameA);
  await expect(g.B.getByTestId("cover-release")).toBeVisible();

  // Captain: beide Namen, kein Zurücknehmen für ihn (das gehört B)
  await expect(g.captain.getByTestId("cover-pairs")).toContainText(`${g.nameB} übernimmt den Anteil von ${g.nameA}.`);
  await expect(g.captain.getByTestId("cover-release")).toHaveCount(0);

  // Dritter (T) und Captain des anderen Teams: neutral "Gedeckt", kein Knopf, keine Statuskarte, nichts zur Übernahme in HTML und RSC
  for (const page of [g.T, g.away]) {
    await expect(page.getByTestId("cover-status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Anteil übernehmen" })).toHaveCount(0);
    const body = await bodies(page, g.url);
    for (const leak of COVER_LEAKS) {
      expect(body.html, `HTML ${leak}`).not.toMatch(leak);
      expect(body.rsc, `RSC ${leak}`).not.toMatch(leak);
    }
  }
  await expect(rowOf(g.T, g.nameA).locator("[data-card-light]")).toContainText("Gedeckt");
  expect(await rowOf(g.T, g.nameA).innerText()).not.toMatch(/übernomm|übernimmt/i);

  // Gäste (nicht angemeldet, angemeldet ohne Teilnahme): gar nichts je Person
  const anonymous = await (await browser.newContext()).newPage();
  const outsider = await (await browser.newContext()).newPage();
  await newUser(outsider, "cvo");
  for (const guest of [await bodies(anonymous, g.url), await bodies(outsider, g.url)]) {
    expect(guest.html).not.toContain("data-card-status");
    expect(guest.html).not.toContain("Gedeckt");
    for (const leak of COVER_LEAKS) {
      expect(guest.html, `Gast HTML ${leak}`).not.toMatch(leak);
      expect(guest.rsc, `Gast RSC ${leak}`).not.toMatch(leak);
    }
  }

  // Live-Kanal ohne Kartendaten: nur Signale, nie Namen, Status oder Übernahme
  const live = await readSse(String(baseURL), `/api/lobby/${g.matchId}/events`);
  expect(live).not.toMatch(/Spieler cv|covered|übernomm|Gedeckt|card_|failed/i);
  expect(live.replace(/^(event: update|data: 1|retry: \d+|:.*)$/gm, "").trim()).toBe("");
});

test("Zurücknehmen vor der Frist: A ist wieder rot, die Nachrichten gehen nur an A und den Captain; nach den Abbuchungszeilen gibt es nirgends mehr einen Knopf", async ({ browser }) => {
  const g = await game(browser, "cw");
  await query("update match_participants set covered_by_user_id = $2, cover_mandate_text = 'cover.mandate.v1.entwurf', cover_accepted_at = now() where match_id = $1 and user_id = $3", [g.matchId, await idOf("cwy"), await idOf("cwx")]);
  await g.B.goto(g.url);
  await g.B.getByTestId("cover-release").click();
  await expect(g.B.getByTestId("cover-covering")).toHaveCount(0, { timeout: 20_000 });
  const [row] = await query<{ by: string | null; at: string | null }>("select covered_by_user_id as by, cover_accepted_at as at from match_participants where match_id = $1 and user_id = $2", [g.matchId, await idOf("cwx")]);
  expect(row.by).toBeNull();
  expect(row.at).toBeNull();
  await g.A.goto(g.url);
  await expect(g.A.getByTestId("cover-covered")).toHaveCount(0);
  await expect(rowOf(g.A, g.nameA).locator("[data-card-light]")).toContainText("Keine Karte");

  // Nachrichten: nur A (und der Captain nur bei einer Übernahme über die Aktion); B und Dritte nie wegen der Rücknahme
  const titles = async (key: string) => (await query<{ title: string }>("select title from notifications where user_id = $1", [await idOf(key)])).map((r) => r.title);
  expect(await titles("cwz")).toEqual([]); // Dritter: nichts
  expect(await titles("cwb")).toEqual([]); // anderer Captain: nichts

  // Ab dem Anlegen der Abbuchungszeilen: spielweit kein Knopf mehr, auch nicht bei einem Platz mit gescheiterter Abbuchung (kein Unterschied zu "keine Karte")
  await query("insert into payment_charges (match_id, user_id, amount_cents, status, idempotency_key) values ($1, $2, 800, 'pending', $3)", [g.matchId, await idOf("cwy"), `e2e-cover:${g.matchId}`]);
  for (const page of [g.B, g.T, g.captain]) {
    await page.goto(g.url);
    await expect(page.getByRole("button", { name: "Anteil übernehmen" })).toHaveCount(0);
  }
});
