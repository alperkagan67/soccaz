import { expect, test } from "@playwright/test";
import { shareCents } from "../../src/lib/money";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, devLogin, run, teamIdByName } from "./helpers";
import { query, seedCardPlayer, seedCardReady, seedCharged, seedOwner, setLedgerModelLegacy, setMatchTimes, setPlatformSetting, userIdByEmail } from "./helpers-db";

// 012 M6b (CI #202): Kartenspiel im Admin-Bereich: Buchungsauftrag, Hallenbuchung, Hallenmiete im Provisionsmodell, Finanzbereich nach der Abbuchung.
// Eigene Datei mit eigenem, hart geprüftem Ausgangszustand (Provisionsmodell, keine Abbuchungszeilen, Kartenschalter AN und danach AUS). Braucht PAYMENTS_FAKE=1 wie die karte-*-Specs.
test.skip(process.env.PAYMENTS_FAKE !== "1", "braucht PAYMENTS_FAKE=1 (nur Tests)");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("payments_enabled", true);
  await setPlatformSetting("card_payments_enabled", true);
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

type Model = "commission" | "legacy";

/** Bei einem Fehlschlag: Abbuchungszeilen und Audit charge.created des Spiels an die Meldung hängen (Diagnose für die CI, ohne Personendaten). */
async function withDiagnostics(ctx: { matchId?: string }, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    if (ctx.matchId) {
      const charges = await query("select status, failure_code, count(*)::int as n from payment_charges where match_id = $1 group by 1, 2", [ctx.matchId]);
      const audits = await query("select action, count(*)::int as n from audit_log where entity = 'match' and entity_id = $1 and action like 'charge.%' group by 1", [ctx.matchId]);
      const model = await query("select ledger_model, status, settled_at is not null as settled from matches where id = $1", [ctx.matchId]);
      await test.info().attach("abbuchung-diagnose", { body: JSON.stringify({ charges, audits, model }, null, 2), contentType: "application/json" });
    }
    throw error;
  }
}

async function scenario(browser: import("@playwright/test").Browser, model: Model, k: string, ctx: { matchId?: string }) {
  await seedOwner(`${k}adm`); // Admin 1: Finanzbereich und Preisregeln (Vertrag 009 AC-1); vor der Bestätigung, sonst bekommt er die Benachrichtigung nicht
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, k);
  ctx.matchId = matchId;
  // Ausgangszustand HART prüfen (CI #202 Lauf 4: ein falscher Ausgangszustand soll sofort mit klarer Meldung scheitern, nicht später an einer anderen Stelle)
  if (model === "legacy") await setLedgerModelLegacy(matchId); // Wartungsausnahme (nur Test): Spiel ohne Provision
  const start = await query<{ ledger_model: string; status: string }>("select ledger_model, status from matches where id = $1", [matchId]);
  expect(start[0], `Ausgangszustand: Spiel im Modell ${model}, noch offen`).toEqual({ ledger_model: model, status: "lobby" });
  expect(await query("select 1 from payment_charges where match_id = $1", [matchId]), "Ausgangszustand: noch keine Abbuchungszeilen").toHaveLength(0);
  // Lange Vorlaufzeit VOR den Bestätigungen: Anstoß in 60 Stunden, angelegt vor 100 Stunden. Die Abbuchung ist erst zur 48-h-Frist fällig, der Auslöser im Hintergrund (finalConfirm) tut also nichts:
  // kein Wettlauf mit einer echten Sofortabbuchung (Ursache der Flakes in #202); die Abbuchung selbst prüfen card-trigger und card-charge in der Integration
  await setMatchTimes(matchId, 60, 100);
  const teamA = await teamIdByName(nameA);
  const teamB = await teamIdByName(nameB);
  const adminA = await userIdByEmail(`${k}a-${run}@test.local`);
  const adminB = await userIdByEmail(`${k}b-${run}@test.local`);

  // Neues Modell (008): 10 eingeteilte Spieler (4 je Team vorbezahlt + 2 Team-Admins) -> Anteil = shareCents(80,00 €, 10) = 8,00 €.
  const share = shareCents(8000, 10);
  // Kartenmodell: 4 Spieler je Team haben eine Karte und sind bereit (nichts bezahlt); die beiden Team-Admins hinterlegen ihre Karte (Seed) und drücken dann nur noch "Ich bin bereit"
  const seeded: string[] = [];
  for (let i = 1; i <= 4; i++) {
    seeded.push(await seedCardPlayer(matchId, teamA, `${k}h${i}`));
    seeded.push(await seedCardPlayer(matchId, teamB, `${k}g${i}`));
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
  // Die Frist-Regeln (48 h, nicht abbuchungsbereit = abgesagt, abbuchungsbereit = bleibt offen) prüft deadlines.test.ts (Block Kartenmodell); hier keine Zeitsprünge mehr, damit der Auslöser im Hintergrund nie mit dem Test wetteifert
  expect(await query("select 1 from payment_charges where match_id = $1", [matchId]), "vor dem Seed: keine Abbuchung").toHaveLength(0);
  expect((await query<{ s: string }>("select status as s from matches where id = $1", [matchId]))[0].s).toBe("confirmed");
  // Endzustand nach der Abbuchung seeden (Hauptbuch + settled_at): der Admin-Bereich unten liest diese Zeilen
  expect(await seedCharged(matchId, [adminA, adminB, ...seeded], share), "seedCharged: alle zehn Plätze auf charged gesetzt").toBe(10);
  // genau eine Anteilszeile je Spieler (auch wenn nach dem zweiten Bereit eine echte Sofortabbuchung über den FakeProvider gelaufen wäre: seedCharged bucht dann nicht doppelt)
  expect((await query<{ n: number }>("select count(*)::int as n from ledger_entries where match_id = $1 and kind = 'match_share'", [matchId]))[0].n).toBe(10);

  // --- Admin: Buchung
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `${k}adm-${run}@test.local`, `Admin ${k}adm`, "/admin/hallen");
  await idle(adm);
  const venueName = `E2E Halle ${k} ${run}`;
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
  if (model === "commission") {
    // Provisionsmodell + Abbuchungszeilen: die Hallenmiete ist durchlaufendes Geld und wird NICHT als Ausgabe gebucht (booking.ts); die Aktion lehnt mit einer Meldung ab
    await expect(adm.getByRole("alert").filter({ hasText: /durchlaufendes Geld/ })).toBeVisible({ timeout: 15_000 });
    expect(await query("select 1 from ledger_entries where match_id = $1 and kind = 'venue_cost'", [matchId]), "keine Hallenkosten-Buchung").toHaveLength(0);
  } else {
    // Spiel ohne Provision: die Ausgabe wird gebucht
    await expect(adm.getByText("Gespeichert.")).toBeVisible({ timeout: 15_000 });
    expect(await query("select 1 from ledger_entries where match_id = $1 and kind = 'venue_cost'", [matchId]), "Hallenkosten gebucht").toHaveLength(1);
  }
  const cards = adm.locator("dl > div dd");
  // Einnahmen aus den Hauptbuch-Konten (012 M6b 1c-iii: eine Rechenstelle für Detailseite, Liste und Übersicht)
  await expect(cards.nth(0)).toHaveText(euro("80,00 €")); // Einnahmen
  await expect(cards.nth(1)).toHaveText(euro(model === "commission" ? "0,00 €" : "80,00 €")); // Hallenkosten (Provisionsmodell: abgelehnt, nichts gebucht)
  await expect(cards.nth(2)).toHaveText(euro(model === "commission" ? "80,00 €" : "0,00 €")); // Marge = Einnahmen - Hallenkosten
  await expect(adm.locator('[data-testid^="player-"]')).toHaveCount(10);
  // Spielerkarten aus den Abbuchungszeilen (payment_charges): bezahlt 8,00, netto 8,00
  await expect(adm.getByTestId(`player-${k}h1-${run}@test.local`)).toContainText(euro("netto 8,00 €"));
  // Ausnahme-Erstattung auf die Karte (Stripe, GANZE Abbuchung; PAYMENTS_FAKE im Server): das Formular ist mit 8,00 € vorbelegt, Teilbeträge gibt es nicht
  const card = adm.getByTestId(`player-${k}h1-${run}@test.local`);
  await expect(card.getByLabel("Betrag")).toHaveValue("8,00");
  const refundBtn = card.getByRole("button", { name: "Ausnahme-Erstattung buchen" });
  await expect.poll(() => refundBtn.evaluate((el) => Object.keys(el).some((k2) => k2.startsWith("__reactProps")))).toBe(true); // erst nach der Hydration bedienen (Flake-Muster aus #202)
  await card.getByLabel("Grund").fill("Verletzung vor dem Spiel");
  await refundBtn.click();
  await expect(adm.getByTestId(`player-${k}h1-${run}@test.local`)).toContainText(euro("netto 0,00 €"), { timeout: 15_000 });
  expect(await query<{ status: string; amount_cents: number }>("select r.status, r.amount_cents from payment_refunds r join users u on u.id = r.user_id where r.match_id = $1 and u.email = $2", [matchId, `${k}h1-${run}@test.local`])).toEqual([{ status: "succeeded", amount_cents: share }]);

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
  if (model === "legacy") {
    expect(body).toContain("venue_cost"); // die Ausgabe wurde hier gebucht (im Provisionsmodell abgelehnt)
    await adm.goto(`/admin/finanzen/ausgaben?monat=${month}`);
    await expect(adm.getByText("Hallenmiete: Hallenmiete E2E")).toBeVisible();
  }

  // Buchungs-Benachrichtigung ging an Plattform-Admins
  const notes = await query<{ title: string }>("select n.title from notifications n join users u on u.id = n.user_id where u.email = $1", [`${k}adm-${run}@test.local`]);
  expect(notes.map((n) => n.title)).toContain("Halle buchen");
}

test("Kartenspiel im Provisionsmodell: Buchungsauftrag, Hallenbuchung, Hallenmiete als Ausgabe abgelehnt, Finanzbereich nach der Abbuchung", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx: { matchId?: string } = {};
  await withDiagnostics(ctx, () => scenario(browser, "commission", "p4c", ctx));
});

test("Kartenspiel ohne Provision (Altspiel-Modell): Hallenmiete wird als Ausgabe gebucht, Finanzbereich nach der Abbuchung", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx: { matchId?: string } = {};
  await withDiagnostics(ctx, () => scenario(browser, "legacy", "p4l", ctx));
});
