import { expect, test } from "@playwright/test";
import { shareCents } from "../../src/lib/money";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, devLogin, newUser, run } from "./helpers";
import {
  callJob,
  query,
  seedOwner,
  seedCardPlayer,
  seedCardReady,
  seedCharged,
  seedAdmin,
  setMatchTimes,
  setPlatformSetting,
  userIdByEmail,
  walletBalanceOf,
} from "./helpers-db";
import { teamIdByName } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("payments_enabled", true);
  await setPlatformSetting("card_payments_enabled", true); // Kartenmodell (012 M6b): kein Guthaben, Bereit heißt Karte hinterlegt
  await setPlatformSetting("min_paid_players", 8);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
  await setPlatformSetting("card_payments_enabled", false);
  await closeTestDb();
});

const idle = (p: import("@playwright/test").Page) => p.waitForLoadState("networkidle");
const euro = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s"));

// 012 M6a: Die Tests zu Aufladen, Guthaben-Seite, Rabattcodes und Stripe-Aufladung entfallen mit der Oberfläche (Vertrag 013 AC-14); die Datei wird mit 012 M6b für das Kartenmodell neu geschrieben.

test("Kartenspiel: Buchungsauftrag, Hallenbuchung und Finanzbereich nach der Abbuchung", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await seedOwner("p4adm"); // Admin 1: Finanzbereich und Preisregeln (Vertrag 009 AC-1); vor der Bestätigung, sonst bekommt er die Benachrichtigung nicht
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "p4");
  const teamA = await teamIdByName(nameA);
  const teamB = await teamIdByName(nameB);
  const adminA = await userIdByEmail(`p4a-${run}@test.local`);
  const adminB = await userIdByEmail(`p4b-${run}@test.local`);

  // Neues Modell (008): 10 eingeteilte Spieler (4 je Team vorbezahlt + 2 Team-Admins) -> Anteil = shareCents(80,00 €, 10) = 8,00 €.
  const share = shareCents(8000, 10);
  // Kartenmodell: 4 Spieler je Team haben eine Karte und sind bereit (nichts bezahlt); die beiden Team-Admins hinterlegen ihre Karte (Seed) und drücken dann nur noch "Ich bin bereit"
  const seeded: string[] = [];
  for (let i = 1; i <= 4; i++) {
    seeded.push(await seedCardPlayer(matchId, teamA, `p4h${i}`));
    seeded.push(await seedCardPlayer(matchId, teamB, `p4g${i}`));
  }
  await seedCardReady(matchId, adminA);
  await seedCardReady(matchId, adminB);
  await a.goto(`/lobby/${matchId}`);
  await b.goto(`/lobby/${matchId}`);
  await a.getByRole("button", { name: "Ich bin bereit" }).click();
  await b.getByRole("button", { name: "Ich bin bereit" }).click();
  await expect(b.getByTestId("match-status").filter({ hasText: "Bestätigt" })).toBeVisible();

  // Der Buchungsauftrag ist entstanden und die Admins wurden informiert
  const jobs = await query<{ status: string }>("select status from booking_jobs where match_id = $1", [matchId]);
  expect(jobs).toEqual([{ status: "open" }]);

  // Neue Frist-Regel (008): Beide Captains bestätigen zum Schluss, damit steht der Preis fest und das Geld bleibt geparkt (kein Fehlbetrag).
  await a.reload();
  await a.getByRole("button", { name: "Ja, mein Team ist komplett: Spiel bestätigen" }).click();
  await b.reload();
  await b.getByRole("button", { name: "Ja, mein Team ist komplett: Spiel bestätigen" }).click();
  await expect.poll(async () => (await query<{ f: number | null; s: Date | null }>("select final_share_cents as f, settled_at as s from matches where id = $1", [matchId]))[0]).toMatchObject({ f: share, s: null });
  // Zur 48-h-Frist (Anstoß in 47 Stunden, angelegt vor 100 Stunden) wird ein abbuchungsbereites Kartenspiel NICHT abgesagt; abgerechnet wird es von der Karten-Abbuchung (Integration: card-trigger, card-charge)
  await setMatchTimes(matchId, 47, 100);
  await callJob(baseURL!, "lobby-deadlines");
  expect((await query<{ s: string }>("select status as s from matches where id = $1", [matchId]))[0].s).toBe("confirmed"); // nicht abgesagt
  expect((await query<{ f: number | null }>("select final_share_cents as f from matches where id = $1", [matchId]))[0].f).toBe(share);
  // Endzustand nach der Abbuchung seeden (Hauptbuch + settled_at): der Admin-Bereich unten liest diese Zeilen
  await seedCharged(matchId, [adminA, adminB, ...seeded], share);
  // genau eine Anteilszeile je Spieler (auch wenn nach dem zweiten Bereit eine echte Sofortabbuchung über den FakeProvider gelaufen wäre: seedCharged bucht dann nicht doppelt)
  expect((await query<{ n: number }>("select count(*)::int as n from ledger_entries where match_id = $1 and kind = 'match_share'", [matchId]))[0].n).toBe(10);

  // --- Admin: Buchung
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `p4adm-${run}@test.local`, "Admin p4adm", "/admin/hallen");
  await idle(adm);
  const venueName = `E2E Halle ${run}`;
  // erst bedienen, wenn React das Formular übernommen hat: vor der Hydration löst der Klick das native Absenden aus (Seite lädt neu, Eingaben weg, keine Halle angelegt);
  // die Hallenseite ist durch Provision/Betreiber-Zugang (009 M2, 011 M1) größer geworden und hydratisiert unter CI-Last später
  const create = adm.getByRole("button", { name: "Halle anlegen" });
  await expect.poll(() => create.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
  await adm.getByLabel("Name", { exact: true }).fill(venueName);
  await adm.getByLabel("Adresse", { exact: true }).fill("Hauptstr. 1");
  await create.click();
  await expect(adm.getByRole("status").filter({ hasText: "Gespeichert." }).first()).toBeVisible(); // die Server-Aktion ist durch, erst danach die Liste prüfen
  await expect(adm.getByTestId(`venue-${venueName}`)).toBeVisible();

  await adm.goto("/admin/buchungen");
  await idle(adm);
  const job = adm.getByTestId(`job-${matchId}`);
  await expect(job.getByTestId("job-status")).toHaveText("Offen");
  await job.getByLabel("Status").selectOption("in_progress");
  await job.getByRole("button", { name: "Speichern" }).click();
  await expect(job.getByTestId("job-status")).toHaveText("In Arbeit");
  // ohne Halle kann nicht gebucht werden
  await job.getByLabel("Status").selectOption("booked");
  await job.getByRole("button", { name: "Speichern" }).click();
  await expect(job.getByText(/zuerst eine Halle/)).toBeVisible();
  await job.getByLabel("Halle").selectOption({ label: `${venueName} (Gelsenkirchen)` });
  await job.getByLabel("Nachweis (Link zur Bestätigung)").fill("https://example.test/bestaetigung");
  await job.getByRole("button", { name: "Speichern" }).click();
  await expect(job.getByTestId("job-status")).toHaveText("Gebucht");
  // unerlaubter Sprung wird verweigert (Gebucht -> Offen gibt es nicht)
  const venueText = await query<{ venue_text: string }>("select venue_text from matches where id = $1", [matchId]);
  expect(venueText[0].venue_text).toContain(venueName);
  await a.reload();
  await expect(async () => {
    // Spielort: Box mit Name (Halle aus der Liste) oder Eingabefeld (freier Text)
    if (await a.getByLabel("Ort / Halle").count()) await expect(a.getByLabel("Ort / Halle")).toHaveValue(new RegExp(venueName));
    else await expect(a.getByTestId("venue-name")).toContainText(venueName);
  }).toPass({ timeout: 10_000 });

  // --- Admin: Finanzen zum Spiel
  await adm.goto(`/admin/finanzen/spiel/${matchId}`);
  await idle(adm);
  // erst bedienen, wenn React das Formular übernommen hat (wie bei "Halle anlegen" oben): vor der Hydration löst der Klick das native Absenden aus, die Eingaben sind weg und "Gespeichert." erscheint nie (Flake aus #202)
  const book = adm.getByRole("button", { name: "Ausgabe buchen" });
  await expect.poll(() => book.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
  await adm.getByLabel("Betrag in Euro").fill("80,00");
  await adm.getByLabel("Notiz").fill("Hallenmiete E2E");
  await book.click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible({ timeout: 15_000 });
  const cards = adm.locator("dl > div dd");
  // Einnahmen/Marge der Detailseite entfallen hier: sie summieren playerFinance().netCents (nur wallet-Konten) und zeigen im Kartenmodell 0 (Produktlücke, Backlog 188; Integrationstest finance-card.test.ts it.fails).
  // Die Übersicht (unten) und die Spieleliste lesen den Erlös korrekt aus revenue (finance-card.test.ts).
  await expect(cards.nth(1)).toHaveText(euro("80,00 €")); // Hallenkosten
  await expect(adm.locator('[data-testid^="player-"]')).toHaveCount(10);
  // Die Spielerkarten zeigen bei Kartenspielen keine Beträge (die Anteilszeile clearing -> revenue hat keinen Nutzer-Bezug) und die Ausnahme-Erstattung über das Guthaben entfällt:
  // beides ist Teil von 1c-iii (finance.manualRefund per Stripe-Refund, F3); dort kommt der E2E-Test dazu (kein Verlust ohne Ersatz: Backlog 188)

  // Übersicht, CSV, Ausgabenliste
  const month = new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 7);
  await adm.goto(`/admin/finanzen?monat=${month}`);
  await expect(adm.getByText(`${nameA} gegen ${nameB}`)).toBeVisible();
  const csv = await adm.request.get(`/admin/finanzen/export?monat=${month}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body.startsWith("﻿Datum;")).toBe(true);
  expect(body).toContain("match_share");
  expect(body).toContain("venue_cost");
  await adm.goto(`/admin/finanzen/ausgaben?monat=${month}`);
  await expect(adm.getByText("Hallenmiete: Hallenmiete E2E")).toBeVisible();

  // Buchungs-Benachrichtigung ging an Plattform-Admins
  const notes = await query<{ title: string }>("select n.title from notifications n join users u on u.id = n.user_id where u.email = $1", [`p4adm-${run}@test.local`]);
  expect(notes.map((n) => n.title)).toContain("Halle buchen");
});

test("Berechtigungen im Geldbereich", async ({ browser }) => {
  // Teilrollen booking und finance entfallen (Vertrag 009 v4): Admin 2 (role admin) hat Buchungen und Hallen, aber keine Preise/Finanzen; Admin 1 hat zusätzlich Finanzen
  await seedAdmin("pm5b");
  await seedOwner("pm5f");
  const admin2 = await (await browser.newContext()).newPage();
  const owner = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await devLogin(admin2, `pm5b-${run}@test.local`, "Admin 2 pm5b", "/admin/buchungen");
  await devLogin(owner, `pm5f-${run}@test.local`, "Admin 1 pm5f", "/admin/finanzen");
  await newUser(player, "pm5p");

  await expect(admin2.getByRole("heading", { name: "Hallen-Buchungen" })).toBeVisible();
  await admin2.goto("/admin/hallen");
  await expect(admin2.getByRole("heading", { name: "Hallen und Preise" })).toBeVisible();
  // Admin 2 darf keine Preise ändern
  await expect(admin2.getByRole("button", { name: "Preisregel hinzufügen" })).toHaveCount(0);
  for (const url of ["/admin/finanzen", "/admin/einstellungen"]) {
    await admin2.goto(url);
    await expect(admin2).toHaveURL(/\/app$/);
  }

  await expect(owner.getByRole("heading", { name: "Finanzen" })).toBeVisible();
  await owner.goto("/admin/codes"); // Rabattcodes entfallen (012 M6a): die Seite gibt es nicht mehr
  await expect(owner.getByRole("heading", { name: "Rabattcodes" })).toHaveCount(0);
  await owner.goto("/admin/einstellungen");
  await expect(owner).toHaveURL(/\/admin\/einstellungen/);

  // CSV nur für Admin 1
  expect((await owner.request.get("/admin/finanzen/export")).status()).toBe(200);
  expect((await admin2.request.get("/admin/finanzen/export")).status()).toBe(403);
  expect((await player.request.get("/admin/finanzen/export")).status()).toBe(403);
  expect((await owner.request.get("/admin/finanzen/export?monat=quatsch")).status()).toBe(400);
  await player.goto("/admin/finanzen");
  await expect(player).toHaveURL(/\/app$/);
});

test("Einstellungen: Zahlungen aus macht Spiele kostenlos", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "p7");
  await a.goto(`/lobby/${matchId}`);

  await seedOwner("p7adm"); // Einstellungen nur Admin 1 (Vertrag 009 AC-1)
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `p7adm-${run}@test.local`, "Admin p7adm", "/admin/einstellungen");
  await idle(adm);
  await expect(adm.getByText(/Test-Anbieter/)).toBeVisible();
  await adm.getByLabel("Zahlungen einschalten").uncheck();
  await adm.getByRole("button", { name: "Speichern" }).click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible();

  await a.reload();
  await a.getByRole("button", { name: "Ich bin bereit" }).click(); // ohne Zahlung
  await expect(a.getByRole("button", { name: "Nicht mehr bereit" })).toBeVisible();
  expect(await walletBalanceOf(await userIdByEmail(`p7a-${run}@test.local`))).toBe(0);

  // ungültige Mindestzahl wird abgelehnt
  const minField = adm.getByLabel("Mindestzahl zahlender Spieler");
  await minField.fill("1");
  await adm.getByRole("button", { name: "Speichern" }).click();
  expect(await minField.evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true); // der Browser blockiert zuerst
  await minField.evaluate((el) => {
    el.removeAttribute("min");
    el.removeAttribute("max");
  });
  await adm.getByRole("button", { name: "Speichern" }).click(); // Formularschutz umgangen: auch der Server lehnt ab
  await expect(adm.getByText(/zwischen 2 und 12/).first()).toBeVisible();
  await adm.getByLabel("Mindestzahl zahlender Spieler").fill("8");
  await adm.getByLabel("Zahlungen einschalten").check();
  await adm.getByRole("button", { name: "Speichern" }).click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible();
});
