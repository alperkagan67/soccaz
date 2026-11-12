import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, newUser, run } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

// Vertrag 012, M3c-3b: "Anteil übernehmen" nur mit der Tastatur bedienbar, Dialogtext vollständig lesbar, Tippziele, und "Gedeckt" für Dritte neutral (kein Name, kein Knopf).
// Rollen wie in karte-uebernahme.spec.ts: C = Captain, A = Mitspieler ohne Karte, B = Übernehmer, T = Dritter. Teamspiel, Kartenmodell AN.
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

async function addMate(browser: Browser, key: string, matchId: string, withCard: boolean, viewport?: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await newUser(page, key);
  const uid = await idOf(key);
  const [m] = await query<{ home: string }>("select home_team_id as home from matches where id = $1", [matchId]);
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [m.home, uid]);
  await query("insert into match_participants (match_id, user_id, team_id, card_status) values ($1, $2, $3, $4)", [matchId, uid, m.home, withCard ? "card_ready" : "none"]);
  return page;
}

async function game(browser: Browser, key: string, viewport?: { width: number; height: number }) {
  const { a: captain, matchId } = await setupLobby(browser, key);
  await query("update matches set price_cents = 8000, cost_cents = 8000 where id = $1", [matchId]);
  await query("update match_participants set card_status = 'card_ready' where match_id = $1 and user_id = $2", [matchId, await idOf(`${key}a`)]);
  const A = await addMate(browser, `${key}x`, matchId, false);
  const B = await addMate(browser, `${key}y`, matchId, true, viewport);
  const T = await addMate(browser, `${key}z`, matchId, true, viewport);
  return { captain, A, B, T, matchId, url: `/lobby/${matchId}`, nameA: `Spieler ${key}x`, nameB: `Spieler ${key}y` };
}

const rowOf = (page: Page, name: string) => page.locator("li", { hasText: name }).filter({ has: page.locator("[data-card-light]") }).first();
const trigger = (page: Page, name: string) => rowOf(page, name).getByRole("button", { name: "Anteil übernehmen" });
const dialogOf = (page: Page, name: string) => page.getByRole("dialog", { name: `Anteil von ${name} übernehmen?` });
const activeInfo = (page: Page) =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    return { tag: e?.tagName ?? "", type: e?.getAttribute("type") ?? "", text: (e?.textContent ?? "").trim().slice(0, 40), inDialog: !!e?.closest("dialog[open]") };
  });
const height = async (l: Locator) => (await l.boundingBox())!.height;

test("nur Tastatur: Auslöser per Fokus und Enter, Fokus auf dem Haken, Tab bleibt im Dialog, Leertaste hakt an, Enter bestätigt; Escape bricht ab und gibt den Fokus zurück", async ({ browser }) => {
  const g = await game(browser, "ka");
  await g.B.goto(g.url);
  await g.B.waitForLoadState("networkidle");
  // erst bedienen, wenn React die Seite übernommen hat
  await g.B.waitForFunction(() => Object.keys(document.querySelector("main button") ?? {}).some((k) => k.startsWith("__reactProps")));

  // Escape: schließt, Fokus kehrt zum Auslöser zurück, nichts wurde übernommen
  const btn = trigger(g.B, g.nameA);
  await btn.focus();
  await g.B.keyboard.press("Enter");
  const dlg = dialogOf(g.B, g.nameA);
  await expect(dlg).toBeVisible();
  expect(await activeInfo(g.B)).toMatchObject({ tag: "INPUT", type: "checkbox", inDialog: true }); // Startfokus auf dem Haken (die gesperrte Bestätigung nähme keinen Fokus)
  await g.B.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expect(btn).toBeFocused();
  const [none] = await query<{ by: string | null }>("select covered_by_user_id as by from match_participants where match_id = $1 and user_id = $2", [g.matchId, await idOf("kax")]);
  expect(none.by).toBeNull();

  // Tab-Reihenfolge im Dialog: Haken, Abbrechen, (Bestätigung ist gesperrt, also übersprungen) und wieder Haken
  await g.B.keyboard.press("Enter");
  await expect(dlg).toBeVisible();
  const confirm = dlg.getByRole("button", { name: "Anteil übernehmen" });
  await expect(confirm).toBeDisabled();
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = await activeInfo(g.B);
    expect(a.inDialog, `Fokus im Dialog (Schritt ${i})`).toBe(true);
    seen.push(a.type === "checkbox" ? "Haken" : a.text);
    await g.B.keyboard.press("Tab");
  }
  expect(seen).toEqual(["Haken", "Abbrechen", "Haken", "Abbrechen"]);

  // Leertaste hakt an, dann ist die Bestätigung erreichbar: Haken, Abbrechen, Bestätigung, zurück zum Haken
  await dlg.getByRole("checkbox").focus();
  await g.B.keyboard.press("Space");
  await expect(dlg.getByRole("checkbox")).toBeChecked();
  await expect(confirm).toBeEnabled();
  const order: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = await activeInfo(g.B);
    expect(a.inDialog).toBe(true);
    order.push(a.type === "checkbox" ? "Haken" : a.text);
    await g.B.keyboard.press("Tab");
  }
  expect(order).toEqual(["Haken", "Abbrechen", "Anteil übernehmen", "Haken"]);
  await dlg.getByRole("checkbox").focus();
  await g.B.keyboard.press("Shift+Tab"); // umgekehrt: vom Haken zurück zur Bestätigung (Falle schließt)
  expect((await activeInfo(g.B)).text).toBe("Anteil übernehmen");

  // Enter auf der Bestätigung übernimmt
  await g.B.keyboard.press("Enter");
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  await expect(g.B.getByTestId("cover-covering")).toContainText(`Du übernimmst den Anteil von ${g.nameA}.`);
  const [row] = await query<{ by: string | null }>("select covered_by_user_id as by from match_participants where match_id = $1 and user_id = $2", [g.matchId, await idOf("kax")]);
  expect(row.by).toBe(await idOf("kay"));
  // Der Auslöser ist nach der Übernahme weg (der Platz ist gedeckt): der Fokus darf nicht in einem geschlossenen Dialog hängen; Tab erreicht wieder die Seite
  expect((await activeInfo(g.B)).inDialog).toBe(false);
  await g.B.keyboard.press("Tab");
  expect((await activeInfo(g.B)).inDialog).toBe(false);

  // "Zurücknehmen" ist ebenfalls per Tastatur erreichbar und bedienbar (Fokus, Enter)
  const release = g.B.getByTestId("cover-release");
  await release.focus();
  await expect(release).toBeFocused();
  await g.B.keyboard.press("Enter");
  await expect(g.B.getByTestId("cover-covering")).toHaveCount(0, { timeout: 20_000 });
});

test("Dialogtext vollständig und lesbar (390 und 1280 px): alle Sätze der Vorgabe t9, Betrag, Zustimmung, beide Knöpfe erreichbar, nichts abgeschnitten", async ({ browser }) => {
  for (const vp of [{ width: 390, height: 640 }, { width: 1280, height: 800 }]) {
    const g = await game(browser, `kb${vp.width}`, vp);
    await g.B.goto(g.url);
    await g.B.waitForLoadState("networkidle");
    await trigger(g.B, g.nameA).click();
    const dlg = dialogOf(g.B, g.nameA);
    await expect(dlg).toBeVisible();
    const sentences = [
      "zusätzlich der Anteil von",
      "ein eigener Zusatzposten, nicht sofort",
      "Scheitert dieser Posten, verfällt der Platz",
      "du verlierst nur diesen Posten",
      "innerhalb des Fensters eine andere Karte hinterlegen; dann versuchen wir es einmal erneut",
      "Bis zur Frist kannst du die Übernahme hier zurücknehmen",
    ];
    for (const s of sentences) {
      const part = dlg.getByText(s, { exact: false }).first();
      await part.scrollIntoViewIfNeeded();
      await expect(part, s).toBeInViewport();
    }
    await expect(dlg.getByTestId("confirm-consequence")).toContainText(/zusammen \d+,\d{2}\s€/);
    await expect(dlg).toContainText("Entwurf, Rechtstext durch Anwalt");
    // nichts abgeschnitten: kein seitliches Scrollen, am Ende erreichbar sind beide Knöpfe
    expect(await dlg.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await g.B.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const name of ["Abbrechen", "Anteil übernehmen"]) {
      const b = dlg.getByRole("button", { name });
      await b.scrollIntoViewIfNeeded();
      await expect(b).toBeInViewport();
    }
    await closeContexts(browser);
  }
});

test("Tippziele ≥ 44 px (390 px): Auslöser in der Zeile, Haken-Zeile und Knöpfe im Dialog, Zurücknehmen", async ({ browser }) => {
  const g = await game(browser, "kc", { width: 390, height: 780 });
  await g.B.goto(g.url);
  await g.B.waitForLoadState("networkidle");
  expect(await height(trigger(g.B, g.nameA))).toBeGreaterThanOrEqual(43.5);
  await trigger(g.B, g.nameA).click();
  const dlg = dialogOf(g.B, g.nameA);
  await expect(dlg).toBeVisible();
  expect(await height(dlg.locator("label[data-testid=confirm-consent]"))).toBeGreaterThanOrEqual(43.5); // die ganze Zeile ist das Tippziel
  for (const name of ["Abbrechen", "Anteil übernehmen"]) {
    const b = dlg.getByRole("button", { name });
    await b.scrollIntoViewIfNeeded();
    const box = (await b.boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(43.5);
    expect(box.width, name).toBeGreaterThanOrEqual(43.5);
  }
  await dlg.getByRole("checkbox").check();
  await dlg.getByRole("button", { name: "Anteil übernehmen" }).click();
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  const release = g.B.getByTestId("cover-release");
  await release.scrollIntoViewIfNeeded();
  expect(await height(release)).toBeGreaterThanOrEqual(43.5);
});

test("Gedeckt für Dritte neutral: kein Name, kein Knopf, und auch beim Durchtabben der ganzen Seite nie ein Bedienelement zur Übernahme", async ({ browser }) => {
  const g = await game(browser, "kd");
  await query("update match_participants set covered_by_user_id = $2, cover_mandate_text = 'cover.mandate.v1.entwurf', cover_accepted_at = now() where match_id = $1 and user_id = $3", [g.matchId, await idOf("kdy"), await idOf("kdx")]);
  await g.T.goto(g.url);
  await g.T.waitForLoadState("networkidle");

  // Zeile von A: Wort Gedeckt, Form Ring (nicht gefüllt), kein Name von B, kein Knopf; Screenreader lesen "Gedeckt"
  const row = rowOf(g.T, g.nameA);
  await expect(row.locator("[data-card-light]")).toContainText("Gedeckt");
  await expect(row.locator('[data-card-status="covered"]')).toHaveCount(1);
  const text = await row.innerText();
  expect(text).not.toContain(g.nameB);
  expect(text).not.toMatch(/übernimmt|übernommen|Zurücknehmen/i);
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(g.T.getByTestId("cover-status")).toHaveCount(0);

  // die ganze Seite per Tab durchlaufen: kein Fokusziel, das zur Übernahme gehört
  const stops = new Set<string>();
  await g.T.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 80; i++) {
    await g.T.keyboard.press("Tab");
    const info = await g.T.evaluate(() => {
      const e = document.activeElement as HTMLElement;
      return `${e.tagName}:${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40)}`;
    });
    if (stops.has(info) && info.startsWith("BODY")) break;
    stops.add(info);
  }
  expect([...stops].some((s) => /übernehmen|Zurücknehmen/i.test(s))).toBe(false);
  expect(stops.size).toBeGreaterThan(5); // wirklich durch die Seite gelaufen
});
