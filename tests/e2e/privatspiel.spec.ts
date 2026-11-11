import { expect, test } from "@playwright/test";
import { closeContexts, devLogin, futureLocal, newUser, onboard, run } from "./helpers";
import { callJob, fundWallet, query, setMatchTimes, setPlatformSetting, userIdByEmail, walletBalanceOf } from "./helpers-db";

test.setTimeout(180_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Privatspiel: anlegen, per Link beitreten (auch neu registriert), nicht öffentlich, Teams einteilen", async ({ browser }) => {
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pgorg");

  // drei Spielarten klar getrennt
  await org.goto("/app");
  const modes = org.getByTestId("game-modes");
  await expect(modes.getByTestId("mode-team")).toContainText("Teamspiel");
  await expect(modes.getByTestId("mode-private")).toContainText("Privatspiel");
  await expect(modes.getByTestId("mode-tournament")).toContainText("Turnier");
  await modes.getByRole("link", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/app\/privatspiel\/neu/);

  await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(5, "19:00"));
  await org.getByLabel("Halle und Adresse").fill(`E2E Kickhalle ${run}, Hauptstr. 1`);
  await expect(org.getByLabel("Spieler insgesamt")).toHaveValue("10"); // Standard sind 10 Spieler
  // Miete ist Pflicht: ohne ausdrückliche Wahl (Betrag oder kostenlos) wird nichts angelegt
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/app\/privatspiel\/neu/);
  await expect(org.getByLabel("Miete als Betrag")).not.toBeChecked();
  await expect(org.getByLabel("Kostenlos (0 €)")).not.toBeChecked();
  await org.getByLabel("Miete als Betrag").check();
  await org.getByLabel("Hallenmiete in Euro").fill("100");
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const lobbyUrl = org.url();
  const matchId = lobbyUrl.split("/").pop()!;
  await expect(org.getByTestId("game-number")).toContainText("Privatspiel #");
  await expect(org.getByTestId("win-chance")).toHaveCount(0); // keine Elo-Anzeige im Privatspiel
  const link = await org.getByTestId("game-invite").getByRole("textbox").inputValue();
  expect(link).toContain("/spiel/");
  await expect(org.getByTestId("game-invite")).toContainText("1 von 10 Plätzen belegt");
  expect(await org.getByTestId("free-slot").count()).toBe(10); // je Team 5 freie Plätze

  // nicht öffentlich: weder in der Liste noch ohne Anmeldung erreichbar, keine Teamseite
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/suche");
  await expect(anon.getByText(`E2E Kickhalle ${run}`)).toHaveCount(0);
  await anon.goto(`/lobby/${matchId}`);
  await expect(anon).toHaveURL(/\/anmelden/);
  const slug = (await query<{ slug: string }>("select t.slug from teams t join matches m on m.home_team_id = t.id where m.id = $1", [matchId]))[0].slug;
  await anon.goto(`/teams/${slug}`);
  await anon.waitForLoadState("networkidle");
  await expect(anon.getByRole("heading", { name: "Team Rot" })).toHaveCount(0);

  // ein ganz neuer Nutzer öffnet den Link, registriert sich und landet direkt im Spiel
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(link);
  await expect(fresh.getByTestId("game-invite-page")).toContainText("lädt dich ein");
  await fresh.getByRole("link", { name: /Anmelden oder registrieren/ }).click();
  await expect(fresh).toHaveURL(/\/anmelden\?next=/);
  // der Einladungs-Pfad bleibt als internes Rücksprungziel erhalten (kein fremdes Ziel, Token unverändert)
  expect(new URL(fresh.url()).searchParams.get("next")).toBe(new URL(link).pathname);
  await devLogin(fresh, `pgnew-${run}@test.local`, "Neuer Spieler", new URL(link).pathname);
  await onboard(fresh, "1996-06-06"); // Einrichten für neue Konten
  await expect(fresh).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
  await expect(fresh.getByText("Neuer Spieler").first()).toBeVisible();

  // weitere Spieler per Link (angemeldet: direkt hinein), insgesamt 4
  for (const key of ["pg2", "pg3"]) {
    const p = await (await browser.newContext()).newPage();
    await newUser(p, key);
    await p.goto(link);
    await expect(p).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
  }
  await org.reload();
  await expect(org.getByTestId("game-invite")).toContainText("4 von 10 Plätzen belegt");
  await expect(org.getByRole("heading", { name: "Spieler warten auf ihr Team" })).toBeVisible();

  // Veranstalter teilt einen Spieler von Hand zu, den Rest zufällig
  org.on("dialog", (d) => void d.accept());
  await org.getByRole("button", { name: "Zu Team Rot" }).first().click();
  await expect.poll(async () => (await query("select 1 from match_participants mp join matches m on m.id = mp.match_id where mp.match_id = $1 and mp.team_id = m.home_team_id", [matchId])).length).toBe(1);
  await org.reload();
  await org.getByRole("button", { name: "Zufällig einteilen" }).click();
  await expect.poll(async () => (await query("select 1 from match_participants where match_id = $1 and team_id is null", [matchId])).length).toBe(0);
  const split = await query<{ team: string; n: number }>("select case when mp.team_id = m.home_team_id then 'rot' else 'blau' end as team, count(*)::int as n from match_participants mp join matches m on m.id = mp.match_id where mp.match_id = $1 group by 1 order by 1", [matchId]);
  expect(split.reduce((s, r) => s + r.n, 0)).toBe(4);
  expect(Math.abs(split[0].n - split[1].n)).toBeLessThanOrEqual(1); // ausgeglichen

  // Rangliste und Elo: das Spiel taucht dort nicht auf
  expect((await query("select 1 from matches where id = $1 and kind = 'private' and visibility = 'private'", [matchId])).length).toBe(1);
});

test("Privatspiel kostenlos: bewusst gewählt, die Lobby zeigt 'kostenlos' statt eines Preisblocks", async ({ browser }) => {
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pgfree");
  await org.goto("/app/privatspiel/neu");
  await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "19:00"));
  await org.getByLabel("Halle und Adresse").fill(`E2E Gratishalle ${run}, Hauptstr. 2`);
  await org.getByLabel("Kostenlos (0 €)").check();
  await expect(org.getByLabel("Hallenmiete in Euro")).toBeDisabled(); // bei kostenlos kein Betrag
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const matchId = org.url().split("/").pop()!;
  await expect(org.getByTestId("free-game")).toContainText("kostenlos");
  await expect(org.getByText(/geteilt durch alle zahlenden Spieler/)).toHaveCount(0); // kein Preisblock "Halle ... 0,00 €"
  expect((await query<{ price_cents: number }>("select price_cents from matches where id = $1", [matchId]))[0].price_cents).toBe(0);
});

test("Privatspiel: Fremde und Anonyme bekommen überall dieselbe Fehlerseite wie bei einem nicht vorhandenen Spiel (AC-12)", async ({ browser }) => {
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pgsecret");
  await org.goto("/app/privatspiel/neu");
  await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(7, "19:00"));
  await org.getByLabel("Halle und Adresse").fill(`E2E Geheimhalle ${run}, Hauptstr. 3`);
  await org.getByLabel("Miete als Betrag").check();
  await org.getByLabel("Hallenmiete in Euro").fill("80");
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const matchId = org.url().split("/").pop()!;
  const missingId = "00000000-0000-4000-8000-000000000000";

  const anon = await (await browser.newContext()).newPage();
  const stranger = await (await browser.newContext()).newPage();
  await newUser(stranger, "pgstranger");

  for (const [who, page] of [["anonym", anon], ["fremd", stranger]] as const) {
    // Spielseite: dieselbe Fehlerseite wie bei einem nicht vorhandenen Spiel (die App liefert sie gestreamt mit gleichem Status), keine Umleitung, keine Namen oder Orte
    const miss = await page.goto(`/spiele/${missingId}`);
    await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const missText = await page.locator("body").innerText();
    const res = await page.goto(`/spiele/${matchId}`);
    await expect(page, `Seite ${who}`).toHaveURL(new RegExp(`/spiele/${matchId}$`)); // keine Umleitung auf Login oder /app
    expect(res?.status()).toBe(miss?.status());
    await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const text = await page.locator("body").innerText();
    expect(text).toBe(missText);
    expect(text).not.toContain("Team Rot");
    expect(text).not.toContain(`E2E Geheimhalle ${run}`);
    // Live-API, Events-Stream, Overlay: 404
    expect((await page.request.get(`/api/spiele/${matchId}/live`)).status(), `Live ${who}`).toBe(404);
    const eventsOf = (url: string) =>
      page.evaluate(async (u) => {
        const controller = new AbortController();
        const res = await fetch(u, { signal: controller.signal });
        controller.abort(); // der Stream bleibt sonst offen
        return res.status;
      }, url);
    expect(await eventsOf(`/api/spiele/${matchId}/events`), `Events ${who}`).toBe(404);
    const ov = await page.goto(`/overlay/${matchId}`);
    const ovMissing = await page.goto(`/overlay/${missingId}`);
    expect(ov?.status(), `Overlay ${who}`).toBe(ovMissing?.status());
    await page.goto(`/overlay/${matchId}`);
    await expect(page.getByTestId("overlay")).toHaveCount(0);
    await expect(page.locator("body")).toContainText("Seite nicht gefunden");
    // Vorschaubild: dieselbe neutrale Karte wie bei einem nicht vorhandenen Spiel
    const card = await page.request.get(`/spiele/${matchId}/opengraph-image`);
    const cardMissing = await page.request.get(`/spiele/${missingId}/opengraph-image`);
    expect(card.status()).toBe(200);
    expect((await card.body()).equals(await cardMissing.body()), `Vorschaubild ${who}`).toBe(true);
  }

  // Auch ein nicht öffentliches Teamspiel (z. B. private Herausforderung) verrät Fremden und Anonymen nichts: Fehlerseite statt Umleitung auf Login oder /app
  await query("update matches set kind = 'team' where id = $1", [matchId]);
  for (const [who, other] of [["anonym", anon], ["fremd", stranger]] as const) {
    await other.goto(`/spiele/${matchId}`);
    await expect(other, `Teamspiel ${who}`).toHaveURL(new RegExp(`/spiele/${matchId}$`));
    await expect(other.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  }
  // Team-Vorschaubild der unsichtbaren Spiel-Teams: neutrale Karte wie bei einem nicht vorhandenen Team
  await query("update matches set kind = 'private' where id = $1", [matchId]);
  const slug = (await query<{ slug: string }>("select t.slug from teams t join matches m on m.home_team_id = t.id where m.id = $1", [matchId]))[0].slug;
  const teamCardRes = await anon.request.get(`/teams/${slug}/opengraph-image`);
  const teamCardMissing = await anon.request.get(`/teams/gibt-es-nicht-${run}/opengraph-image`);
  expect(teamCardRes.status()).toBe(200);
  expect((await teamCardRes.body()).equals(await teamCardMissing.body())).toBe(true);

  // Der Veranstalter behält Zugriff auf Seite und Ereignis-Stream
  const page = await org.goto(`/spiele/${matchId}`);
  expect(page?.status()).toBe(200);
  await expect(org.getByText("Team Rot").first()).toBeVisible();
  const eventsStatus = await org.evaluate(async (url) => {
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal });
    controller.abort();
    return res.status;
  }, `/api/spiele/${matchId}/events`);
  expect(eventsStatus).toBe(200);
  // Die öffentliche Live-API und das Overlay gibt es für Privatspiele auch für den Veranstalter nicht (wie bisher)
  expect((await org.request.get(`/api/spiele/${matchId}/live`)).status()).toBe(404);
  // Das Privatspiel steht in keiner öffentlichen Liste
  await anon.goto("/suche");
  await expect(anon.getByText(`E2E Geheimhalle ${run}`)).toHaveCount(0);
});

test("Privatspiel: Einladungslink zurückziehen und neu erzeugen (AC-10)", async ({ browser }) => {
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pglink");
  await org.goto("/app/privatspiel/neu");
  await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "20:00"));
  await org.getByLabel("Halle und Adresse").fill(`E2E Linkhalle ${run}, Hauptstr. 3`);
  await org.getByLabel("Kostenlos (0 €)").check();
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const matchId = org.url().split("/").pop()!;
  const oldLink = await org.getByTestId("game-invite").getByRole("textbox").inputValue();

  // ein Spieler tritt mit dem alten Link bei
  const early = await (await browser.newContext()).newPage();
  await newUser(early, "pgearly");
  await early.goto(oldLink);
  await expect(early).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });

  // der Veranstalter zieht den Link zurück: kein Link mehr sichtbar, der alte ist ungültig
  org.on("dialog", (d) => void d.accept());
  await org.getByRole("button", { name: "Link zurückziehen" }).click();
  await expect(org.getByTestId("game-invite")).toHaveCount(0);
  await expect(org.getByText("Es gibt gerade keinen gültigen Einladungslink.")).toBeVisible();
  const late = await (await browser.newContext()).newPage();
  await newUser(late, "pglate");
  await late.goto(oldLink);
  await expect(late.getByRole("heading", { name: "Einladung nicht gültig" })).toBeVisible();
  await expect(late.getByText(/ungültig oder wurde zurückgezogen/)).toBeVisible();

  // neuen Link erzeugen: er funktioniert, der alte bleibt ungültig, Beigetretene bleiben
  await org.getByRole("button", { name: "Einladungslink erzeugen" }).click();
  await expect(org.getByTestId("game-invite")).toBeVisible();
  const newLink = await org.getByTestId("game-invite").getByRole("textbox").inputValue();
  expect(newLink).not.toBe(oldLink);
  await late.goto(newLink);
  await expect(late).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
  await late.goto(oldLink);
  await expect(late.getByRole("heading", { name: "Einladung nicht gültig" })).toBeVisible();
  expect((await query("select 1 from match_participants where match_id = $1", [matchId])).length).toBe(3); // Veranstalter, früher Spieler, später Spieler
  expect((await query("select 1 from game_invites where match_id = $1", [matchId])).length).toBe(1);

  // ein normaler Spieler sieht die Knöpfe nicht
  await early.reload();
  await expect(early.getByTestId("invite-admin")).toHaveCount(0);
});

test("Privatspiel: Teilen per WhatsApp enthält den Einladungslink, nur der Veranstalter sieht ihn (AC-14)", async ({ browser }) => {
  const org = await (await browser.newContext()).newPage();
  await newUser(org, "pgwa");
  await org.goto("/app/privatspiel/neu");
  await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "18:00"));
  await org.getByLabel("Halle und Adresse").fill(`E2E Teilenhalle ${run}, Hauptstr. 4`);
  await org.getByLabel("Kostenlos (0 €)").check();
  await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
  await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  const link = await org.getByTestId("game-invite").getByRole("textbox").inputValue();
  const href = (await org.getByTestId("game-invite-whatsapp").getAttribute("href"))!;
  const url = new URL(href);
  expect(url.hostname).toBe("wa.me");
  expect(href).toContain(encodeURIComponent(link)); // der vollständige Link ist URL-kodiert im Text
  expect(url.searchParams.get("text")).toContain(link);

  // ein normaler Mitspieler sieht weder Link noch Teilen-Knopf
  const p = await (await browser.newContext()).newPage();
  await newUser(p, "pgwa2");
  await p.goto(link);
  await expect(p).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
  await expect(p.getByTestId("game-invite")).toHaveCount(0);
  await expect(p.getByTestId("game-invite-whatsapp")).toHaveCount(0);
});

test("Privatspiel: sinkt die Spielerzahl, sieht ein Unterzahler 'Anteil jetzt X, noch Y zu zahlen' und kann nachzahlen (T53-Rest)", async ({ browser }) => {
  test.setTimeout(240_000);
  await setPlatformSetting("payments_enabled", true);
  try {
    const org = await (await browser.newContext()).newPage();
    await newUser(org, "pgdue");
    await org.goto("/app/privatspiel/neu");
    await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "19:00"));
    await org.getByLabel("Halle und Adresse").fill(`E2E Nachzahlhalle ${run}, Hauptstr. 5`);
    await org.getByLabel("Spieler insgesamt").fill("4");
    await org.getByLabel("Miete als Betrag").check();
    await org.getByLabel("Hallenmiete in Euro").fill("100");
    await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
    await expect(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    const matchId = org.url().split("/").pop()!;
    const link = await org.getByTestId("game-invite").getByRole("textbox").inputValue();

    const others = [];
    for (const key of ["pgdue1", "pgdue2", "pgdue3"]) {
      const p = await (await browser.newContext()).newPage();
      await newUser(p, key);
      await p.goto(link);
      await expect(p).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
      others.push({ key, p });
    }
    for (const key of ["pgdue", "pgdue1", "pgdue2", "pgdue3"]) await fundWallet(await userIdByEmail(`${key}-${run}@test.local`), 5000);
    await org.reload();
    await org.getByRole("button", { name: "Zufällig einteilen" }).click();
    await expect.poll(async () => (await query("select 1 from match_participants where match_id = $1 and team_id is null", [matchId])).length).toBe(0);

    // alle vier zahlen 100 / 4 = 25,00 Euro
    for (const page of [org, ...others.map((o) => o.p)]) {
      await page.reload();
      await page.getByRole("button", { name: /25,00.*bezahlen/ }).click();
      await expect(page.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
    }

    // einer geht: 3 Spieler, der Anteil steigt auf 33,34 Euro, die anderen zahlen 8,34 Euro nach
    const leaver = others[2].p;
    leaver.once("dialog", (d) => void d.accept());
    await leaver.getByRole("button", { name: "Abmelden" }).click();
    await expect.poll(async () => (await query("select 1 from match_participants where match_id = $1", [matchId])).length).toBe(3);
    const stay = others[0].p;
    await stay.reload();
    const hint = stay.getByTestId("due-hint");
    await expect(hint).toContainText("33,34");
    await expect(hint).toContainText("8,34");
    await stay.getByRole("button", { name: /8,34.*bezahlen/ }).click();
    await expect(stay.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
    await expect(stay.getByTestId("due-hint")).toHaveCount(0);
    const paid = await query<{ paid_cents: number }>("select paid_cents from match_participants mp join users u on u.id = mp.user_id where mp.match_id = $1 and u.email = $2", [matchId, `pgdue1-${run}@test.local`]);
    expect(paid[0].paid_cents).toBe(3334);
  } finally {
    await setPlatformSetting("payments_enabled", false);
  }
});

/**
 * In der CI läuft der Server langsamer (Server-Aktionen mit Sperren, Zahlungen, Neuberechnung): Anzeigen und Datenbank-Zustände
 * bekommen 30 Sekunden statt 5. Das ist keine feste Wartezeit, die Prüfung endet, sobald der Zustand da ist.
 */
const slow = expect.configure({ timeout: 30_000 });
const euroRe = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*"));

test("Privatspiel Gesamtablauf: Miete, Link teilen, 10 Spieler (einer neu), alle zahlen, Bereit, Preis fest, nicht öffentlich (AC-15)", async ({ browser }) => {
  test.setTimeout(600_000);
  await setPlatformSetting("payments_enabled", true);
  try {
    const org = await (await browser.newContext()).newPage();
    await newUser(org, "pgfull");
    await org.goto("/app/privatspiel/neu");
    await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "19:00"));
    await org.getByLabel("Halle und Adresse").fill(`E2E Gesamthalle ${run}, Hauptstr. 6`);
    await slow(org.getByLabel("Spieler insgesamt")).toHaveValue("10");
    await org.getByLabel("Miete als Betrag").check();
    await org.getByLabel("Hallenmiete in Euro").fill("100"); // 100 € / 10 Spieler = 10,00 € Anteil
    await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
    await slow(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    const matchId = org.url().split("/").pop()!;

    // Link teilen: der WhatsApp-Link enthält den vollständigen Einladungslink
    const link = await org.getByTestId("game-invite").getByRole("textbox").inputValue();
    expect((await org.getByTestId("game-invite-whatsapp").getAttribute("href"))!).toContain(encodeURIComponent(link));

    // neun Spieler treten per Link bei, einer davon ganz neu (Anmelden und Einrichten über den Link)
    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto(link);
    await fresh.getByRole("link", { name: /Anmelden oder registrieren/ }).click();
    await devLogin(fresh, `pgfullnew-${run}@test.local`, "Neuer Gesamtspieler", new URL(link).pathname);
    await onboard(fresh, "1996-06-06");
    await slow(fresh).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
    const players = [{ key: "pgfullnew", page: fresh }];
    for (let i = 1; i <= 8; i++) {
      const page = await (await browser.newContext()).newPage();
      await newUser(page, `pgfull${i}`);
      await page.goto(link);
      await slow(page).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
      players.push({ key: `pgfull${i}`, page });
    }
    const everyone = [{ key: "pgfull", page: org }, ...players];
    for (const p of everyone) await fundWallet(await userIdByEmail(`${p.key}-${run}@test.local`), 3000);
    await slow.poll(async () => (await query("select 1 from match_participants where match_id = $1", [matchId])).length).toBe(10);

    // Einteilung, dann zahlt jeder seinen Anteil (Miete geteilt durch 10 = 10,00 €)
    org.on("dialog", (d) => void d.accept());
    await org.reload();
    await org.getByRole("button", { name: "Zufällig einteilen" }).click();
    await slow.poll(async () => (await query("select 1 from match_participants where match_id = $1 and team_id is null", [matchId])).length).toBe(0);
    for (const p of everyone) {
      await p.page.reload();
      await p.page.getByRole("button", { name: euroRe("10,00 € bezahlen") }).click();
      await slow(p.page.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
    }
    const paid = await query<{ paid_cents: number }>("select paid_cents from match_participants where match_id = $1", [matchId]);
    expect(paid).toHaveLength(10);
    expect(paid.every((r) => r.paid_cents === 1000)).toBe(true);
    expect((await query<{ final_share_cents: number | null }>("select final_share_cents from matches where id = $1", [matchId]))[0].final_share_cents).toBeNull(); // vor dem zweiten Bereit ist der Preis noch nicht fest

    // alle machen sich bereit; der Veranstalter ist Captain beider Teams und bestätigt für beide
    for (const p of everyone) {
      await p.page.reload();
      await p.page.getByRole("button", { name: "Bereit machen" }).click();
      await slow(p.page.getByRole("button", { name: "Nicht mehr bereit" })).toBeVisible();
    }
    await org.reload();
    await org.getByRole("button", { name: "Ja, mein Team ist komplett: Spiel bestätigen" }).click();
    await slow
      .poll(async () => (await query<{ f: number | null; s: string }>("select final_share_cents as f, status as s from matches where id = $1", [matchId]))[0])
      .toMatchObject({ f: 1000, s: "confirmed" }); // Preis steht fest, Spiel ist bestätigt
    const done = (await query<{ h: Date | null; a: Date | null }>("select home_final_at as h, away_final_at as a from matches where id = $1", [matchId]))[0];
    expect(done.h).not.toBeNull();
    expect(done.a).not.toBeNull();
    expect((await query<{ n: number }>("select coalesce(sum(paid_cents), 0)::int as n from match_participants where match_id = $1", [matchId]))[0].n).toBe(10_000); // die Miete ist gedeckt
    // nach der Bestätigung beider Captains steht die Spielübersicht mit allen Infos offen
    await org.goto(`/lobby/${matchId}/uebersicht`);
    await slow(org.getByText(`E2E Gesamthalle ${run}`).first()).toBeVisible();
    expect(await walletBalanceOf(await userIdByEmail(`pgfull-${run}@test.local`))).toBe(2000);

    // nicht öffentlich: nicht in der Suche, Fremde sehen Fehlerseiten wie bei einem nicht vorhandenen Spiel, nicht in der Rangliste
    const anon = await (await browser.newContext()).newPage();
    await anon.goto("/suche");
    await slow(anon.getByText(`E2E Gesamthalle ${run}`)).toHaveCount(0);
    const stranger = await (await browser.newContext()).newPage();
    await newUser(stranger, "pgfullfremd");
    const missing = await stranger.goto("/spiele/00000000-0000-4000-8000-000000000000");
    for (const path of [`/spiele/${matchId}`, `/lobby/${matchId}`]) {
      const response = await stranger.goto(path);
      expect(response?.status(), path).toBe(missing?.status());
      await slow(stranger.getByText(`E2E Gesamthalle ${run}`)).toHaveCount(0);
    }
    const teamIds = await query<{ home: string; away: string }>("select home_team_id as home, away_team_id as away from matches where id = $1", [matchId]);
    expect((await query("select 1 from team_stats where team_id in ($1, $2)", [teamIds[0].home, teamIds[0].away])).length).toBe(0);
    await anon.goto("/rangliste");
    await anon.waitForLoadState("networkidle");
    await slow(anon.getByText("Team Rot")).toHaveCount(0);
    await slow(anon.getByText("Team Blau")).toHaveCount(0);
  } finally {
    await setPlatformSetting("payments_enabled", false);
  }
});

test("Privatspiel ohne volle Miete: zur 48-h-Frist vor Anstoß wird abgesagt, alle Zahlenden bekommen ihren Anteil zurück, der Veranstalter trägt nichts (AC-9/AC-15)", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  await setPlatformSetting("payments_enabled", true);
  try {
    const org = await (await browser.newContext()).newPage();
    await newUser(org, "pgcov");
    await org.goto("/app/privatspiel/neu");
    await org.getByLabel("Anstoß (Datum und Uhrzeit)").fill(futureLocal(6, "19:00"));
    await org.getByLabel("Halle und Adresse").fill(`E2E Deckungshalle ${run}, Hauptstr. 7`);
    await org.getByLabel("Spieler insgesamt").fill("4");
    await org.getByLabel("Miete als Betrag").check();
    await org.getByLabel("Hallenmiete in Euro").fill("100"); // 100 € / 4 = 25,00 € Anteil
    await org.getByRole("button", { name: "Privatspiel anlegen" }).click();
    await slow(org).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 40_000 });
    const matchId = org.url().split("/").pop()!;
    const link = await org.getByTestId("game-invite").getByRole("textbox").inputValue();

    const others = [];
    for (const key of ["pgcov1", "pgcov2", "pgcov3"]) {
      const page = await (await browser.newContext()).newPage();
      await newUser(page, key);
      await page.goto(link);
      await slow(page).toHaveURL(new RegExp(`/lobby/${matchId}$`), { timeout: 40_000 });
      others.push({ key, page });
    }
    const everyone = [{ key: "pgcov", page: org }, ...others];
    for (const p of everyone) await fundWallet(await userIdByEmail(`${p.key}-${run}@test.local`), 5000);
    org.on("dialog", (d) => void d.accept());
    await org.reload();
    await org.getByRole("button", { name: "Zufällig einteilen" }).click();
    await slow.poll(async () => (await query("select 1 from match_participants where match_id = $1 and team_id is null", [matchId])).length).toBe(0);

    // nur der Veranstalter und ein Spieler zahlen (2 x 25,00 = 50,00 € von 100,00 €), zwei zahlen nicht
    const payers = [everyone[0], everyone[1]];
    for (const p of payers) {
      await p.page.reload();
      await p.page.getByRole("button", { name: euroRe("25,00 € bezahlen") }).click();
      await slow(p.page.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
      expect(await walletBalanceOf(await userIdByEmail(`${p.key}-${run}@test.local`))).toBe(2500);
    }

    // Vor der Frist (Anstoß in 60 Stunden, angelegt vor 100 Stunden) passiert nichts, die Lobby bleibt offen
    await setMatchTimes(matchId, 60, 100);
    await callJob(baseURL!, "lobby-deadlines");
    expect((await query<{ status: string }>("select status from matches where id = $1", [matchId]))[0].status).not.toBe("cancelled");
    // Frist erreicht (Anstoß in 47 Stunden): keine feste Wartezeit, die Zeit wird in der Datenbank gesetzt
    await setMatchTimes(matchId, 47, 100);
    await callJob(baseURL!, "lobby-deadlines");
    await slow.poll(async () => (await query<{ status: string }>("select status from matches where id = $1", [matchId]))[0].status).toBe("cancelled");

    // alle Zahlenden haben ihren Anteil zurück, der Veranstalter hat nichts verloren
    for (const p of everyone) expect(await walletBalanceOf(await userIdByEmail(`${p.key}-${run}@test.local`)), p.key).toBe(5000);
    await payers[1].page.reload();
    await slow(payers[1].page.getByText("Dieses Spiel wurde abgesagt.")).toBeVisible();
    await payers[1].page.goto("/app/guthaben");
    await slow(payers[1].page.getByTestId("statement")).toContainText("Erstattung");
  } finally {
    await setPlatformSetting("payments_enabled", false);
  }
});
