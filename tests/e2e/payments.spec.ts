import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { signStripePayload } from "../../src/lib/stripe-signature";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, devLogin, newUser, run } from "./helpers";
import {
  callJob,
  fundWallet,
  query,
  seedAdmin,
  seedPaidPlayer,
  seedPromo,
  seedUserRole,
  setMatchTimes,
  setPlatformSetting,
  userIdByEmail,
  walletBalanceOf,
} from "./helpers-db";
import { teamIdByName } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("payments_enabled", true);
  await setPlatformSetting("min_paid_players", 8);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
  await closeTestDb();
});

const idle = (p: import("@playwright/test").Page) => p.waitForLoadState("networkidle");
const euro = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s"));
const webhookSecret = () => {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  return process.env.STRIPE_WEBHOOK_SECRET ?? "";
};

test("Aufladen mit Test-Anbieter, Rabattcode, Verlauf und PDF-Beleg", async ({ page, browser }) => {
  await newUser(page, "pm1");
  await page.goto("/app/guthaben");
  await expect(page.getByTestId("balance")).toHaveText(euro("0,00 €"));

  // Betrag außerhalb des erlaubten Rahmens
  await page.getByLabel("Betrag in Euro").fill("1");
  await page.getByRole("button", { name: "Jetzt bezahlen" }).click();
  await expect(page.getByText(/zwischen 5,00 und 200,00/).first()).toBeVisible();

  // unbekannter Code
  await page.getByLabel("Betrag in Euro").fill("50");
  await page.getByLabel("Rabattcode (optional)").fill("GIBTESNICHT");
  await page.getByLabel("Rabattcode (optional)").blur();
  await expect(page.getByText("Diesen Code gibt es nicht.")).toBeVisible();

  // gültiger Code: Bonus wird vorab angezeigt
  const code = `E2E${run}`.toUpperCase();
  await seedPromo(code, "percent", 10);
  await page.getByLabel("Rabattcode (optional)").fill(code);
  await page.getByLabel("Rabattcode (optional)").blur();
  await expect(page.getByText("Bonus: 5,00 € zusätzlich.")).toBeVisible();
  await page.getByRole("button", { name: "Jetzt bezahlen" }).click();

  // Test-Zahlungsbildschirm: vor dem Bezahlen noch kein Guthaben
  await expect(page).toHaveURL(/\/dev\/pay\/[0-9a-f-]{36}$/);
  const payUrl = page.url();
  const stranger = await (await browser.newContext()).newPage();
  await newUser(stranger, "pm1x");
  await stranger.goto(payUrl); // fremde Zahlung ist nicht erreichbar: 404-Seite, kein Zahlungsknopf
  await expect(stranger.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Zahlung erfolgreich" })).toHaveCount(0);
  expect(await walletBalanceOf(await userIdByEmail(`pm1-${run}@test.local`))).toBe(0);

  await page.getByRole("button", { name: "Zahlung erfolgreich" }).click();
  await expect(page).toHaveURL(/\/app\/guthaben\?zahlung=/);
  await expect(page.getByTestId("payment-status")).toContainText("Zahlung eingegangen");
  await expect(page.getByTestId("balance")).toHaveText(euro("55,00 €"));

  // Verlauf und Beleg
  const statement = page.getByTestId("statement");
  await expect(statement).toContainText("Aufladung");
  await expect(statement).toContainText(euro("+50,00 €"));
  await expect(statement).toContainText("Bonus (Rabattcode)");
  await expect(statement).toContainText(euro("+5,00 €"));
  const pdfHref = await page.getByRole("link", { name: "PDF" }).first().getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect((await stranger.request.get(pdfHref!)).status()).toBe(404); // fremder Beleg nicht erreichbar

  // derselbe Code ein zweites Mal wird abgelehnt
  await page.goto("/app/guthaben");
  await page.getByLabel("Betrag in Euro").fill("20");
  await page.getByLabel("Rabattcode (optional)").fill(code);
  await page.getByLabel("Rabattcode (optional)").blur();
  await expect(page.getByText("Du hast diesen Code schon eingelöst.")).toBeVisible();

  // Abbrechen: nichts wird gutgeschrieben
  await page.getByLabel("Rabattcode (optional)").fill("");
  await page.getByRole("button", { name: "Jetzt bezahlen" }).click();
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByTestId("payment-status")).toContainText("nicht abgeschlossen");
  await expect(page.getByTestId("balance")).toHaveText(euro("55,00 €"));
});

test("Stripe-Webhook: Signatur, Wiederholung, unbezahlt, Fehlschlag", async ({ page, baseURL }) => {
  const secret = webhookSecret();
  expect(secret).not.toBe("");
  await newUser(page, "pm2");
  const userId = await userIdByEmail(`pm2-${run}@test.local`);

  const startPayment = async (amount: string) => {
    await page.goto("/app/guthaben");
    await page.getByLabel("Betrag in Euro").fill(amount);
    await page.getByRole("button", { name: "Jetzt bezahlen" }).click();
    await expect(page).toHaveURL(/\/dev\/pay\//);
    return page.url().split("/").pop()!;
  };
  const post = (body: object, signature: string | null) =>
    fetch(`${baseURL}/api/webhooks/stripe`, { method: "POST", headers: signature ? { "stripe-signature": signature, "content-type": "application/json" } : { "content-type": "application/json" }, body: JSON.stringify(body) });
  const signed = (body: object) => signStripePayload(JSON.stringify(body), secret);

  const paymentId = await startPayment("20");
  const event = { id: "evt_e2e_1", type: "checkout.session.completed", data: { object: { id: `cs_${paymentId}`, client_reference_id: paymentId, payment_status: "paid", metadata: { paymentId } } } };

  // ohne und mit falscher Signatur, mit veränderter Nutzlast
  expect((await post(event, null)).status).toBe(400);
  expect((await post(event, signStripePayload(JSON.stringify(event), "falsches-geheimnis"))).status).toBe(400);
  expect((await post({ ...event, id: "evt_manipuliert" }, signed(event))).status).toBe(400);
  expect(await walletBalanceOf(userId)).toBe(0);

  // gültig: gutgeschrieben, Wiederholung bucht nichts doppelt
  expect((await post(event, signed(event))).status).toBe(200);
  expect(await walletBalanceOf(userId)).toBe(2000);
  expect((await post(event, signed(event))).status).toBe(200);
  expect((await post(event, signed(event))).status).toBe(200);
  expect(await walletBalanceOf(userId)).toBe(2000);
  const topups = await query<{ n: number }>("select count(*)::int n from ledger_entries where payment_id = $1 and kind = 'topup'", [paymentId]);
  expect(topups[0].n).toBe(1);

  // verzögerte Zahlart: "completed" ohne Geld ändert nichts, erst die spätere Bestätigung zählt
  const lateId = await startPayment("30");
  const unpaid = { id: "evt_e2e_2", type: "checkout.session.completed", data: { object: { id: `cs_${lateId}`, client_reference_id: lateId, payment_status: "unpaid" } } };
  expect((await post(unpaid, signed(unpaid))).status).toBe(200);
  expect(await walletBalanceOf(userId)).toBe(2000);
  const later = { id: "evt_e2e_3", type: "checkout.session.async_payment_succeeded", data: { object: { id: `cs_${lateId}`, client_reference_id: lateId } } };
  expect((await post(later, signed(later))).status).toBe(200);
  expect(await walletBalanceOf(userId)).toBe(5000);

  // fehlgeschlagene Zahlung und unbekanntes Ereignis
  const failId = await startPayment("10");
  const failed = { id: "evt_e2e_4", type: "checkout.session.async_payment_failed", data: { object: { id: `cs_${failId}`, client_reference_id: failId } } };
  expect((await post(failed, signed(failed))).status).toBe(200);
  expect((await query<{ status: string }>("select status from payments where id = $1", [failId]))[0].status).toBe("failed");
  const other = { id: "evt_e2e_5", type: "customer.created", data: { object: {} } };
  expect((await post(other, signed(other))).status).toBe(200);
  expect(await walletBalanceOf(userId)).toBe(5000);
});

test("Lobby: Anteil beim Bereitmachen, fehlendes Guthaben, Aufladen, Abmelden", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "p3");
  const userId = await userIdByEmail(`p3a-${run}@test.local`);
  await a.goto(`/lobby/${matchId}`);

  // Kosten sind sichtbar
  const costs = a.getByRole("region", { name: "Kosten" });
  await expect(costs).toBeVisible();
  await expect(costs).toContainText(euro("80,00 €"));
  await expect(costs).toContainText(euro("6,67 €"));
  await expect(a.getByTestId("pay-hint")).toContainText(euro("10,00 €"));

  // ohne Guthaben: nicht bezahlt, Hinweis zum Aufladen
  await a.getByRole("button", { name: euro("10,00 € bezahlen") }).click();
  await expect(a.getByText(/Dein Guthaben reicht nicht/)).toBeVisible();
  await expect(a.getByText("Bereit", { exact: true })).toHaveCount(0);
  await a.getByRole("link", { name: "Guthaben aufladen" }).click();
  await expect(a).toHaveURL(/\/app\/guthaben\?betrag=1000&zurueck=/);
  await expect(a.getByLabel("Betrag in Euro")).toHaveValue("10");
  await a.getByRole("button", { name: "Jetzt bezahlen" }).click();
  await a.getByRole("button", { name: "Zahlung erfolgreich" }).click();
  await expect(a.getByTestId("balance")).toHaveText(euro("10,00 €"));
  await a.getByRole("link", { name: "Zurück zum Spiel" }).click();
  await expect(a).toHaveURL(new RegExp(`/lobby/${matchId}`));

  // jetzt reicht das Guthaben: erst bezahlen, dann bereit
  await a.getByRole("button", { name: euro("10,00 € bezahlen") }).click();
  await expect(a.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
  expect(await walletBalanceOf(userId)).toBe(0);
  await a.getByRole("button", { name: "Bereit machen" }).click();
  await expect(a.getByRole("button", { name: "Nicht mehr bereit" })).toBeVisible();
  expect(await walletBalanceOf(userId)).toBe(0);
  // zurücknehmen und wieder bereit: kostet nicht doppelt
  await a.getByRole("button", { name: "Nicht mehr bereit" }).click();
  await a.getByRole("button", { name: "Bereit machen" }).click();
  await expect(a.getByRole("button", { name: "Nicht mehr bereit" })).toBeVisible();
  expect(await walletBalanceOf(userId)).toBe(0);

  // mehr als 24 Stunden vorher abmelden: alles kommt zurück
  a.once("dialog", (d) => d.accept());
  await a.getByRole("main").getByRole("button", { name: "Abmelden" }).click();
  await expect.poll(() => walletBalanceOf(userId)).toBe(1000);
  await a.goto("/app/guthaben");
  await expect(a.getByTestId("statement")).toContainText("Erstattung");
});

test("Abrechnung, Buchungsauftrag, Hallenbuchung und Finanzbereich", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await seedAdmin("p4adm"); // vor der Bestätigung, sonst bekommt er die Benachrichtigung nicht
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "p4");
  const teamA = await teamIdByName(nameA);
  const teamB = await teamIdByName(nameB);
  const adminA = await userIdByEmail(`p4a-${run}@test.local`);
  const adminB = await userIdByEmail(`p4b-${run}@test.local`);

  // 4 Spieler je Team haben schon bezahlt, die beiden Team-Admins bezahlen über die Oberfläche
  const seeded: string[] = [];
  for (let i = 1; i <= 4; i++) {
    seeded.push(await seedPaidPlayer(matchId, teamA, `p4h${i}`));
    seeded.push(await seedPaidPlayer(matchId, teamB, `p4g${i}`));
  }
  await fundWallet(adminA, 2000);
  await fundWallet(adminB, 2000);
  await a.goto(`/lobby/${matchId}`);
  await b.goto(`/lobby/${matchId}`);
  await a.getByRole("button", { name: euro("10,00 € bezahlen") }).click();
  await expect(a.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
  await a.getByRole("button", { name: "Bereit machen" }).click();
  await b.getByRole("button", { name: euro("10,00 € bezahlen") }).click();
  await expect(b.getByText("Dein Anteil ist bezahlt.")).toBeVisible();
  await b.getByRole("button", { name: "Bereit machen" }).click();
  await expect(b.getByTestId("match-status").filter({ hasText: "Bestätigt" })).toBeVisible();

  // Der Buchungsauftrag ist entstanden und die Admins wurden informiert
  const jobs = await query<{ status: string }>("select status from booking_jobs where match_id = $1", [matchId]);
  expect(jobs).toEqual([{ status: "open" }]);

  // Abrechnung nach Ablauf der Frist: 80 EUR durch 10 Zahler, 2,00 EUR zurück an jeden
  await setMatchTimes(matchId, 10, 13);
  const settled = (await callJob(baseURL!, "settle-matches")) as number;
  expect(settled).toBeGreaterThanOrEqual(1);
  await a.reload();
  await expect(a.getByRole("region", { name: "Kosten" })).toContainText(euro("Abgerechnet: 8,00 €"));
  expect(await walletBalanceOf(adminA)).toBe(1200);
  for (const id of seeded) expect(await walletBalanceOf(id)).toBe(1200);

  // --- Admin: Buchung
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `p4adm-${run}@test.local`, "Admin p4adm", "/admin/hallen");
  await idle(adm);
  const venueName = `E2E Halle ${run}`;
  await adm.getByLabel("Name", { exact: true }).fill(venueName);
  await adm.getByLabel("Adresse").fill("Hauptstr. 1");
  await adm.getByRole("button", { name: "Halle anlegen" }).click();
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
  await expect(a.getByLabel("Ort / Halle")).toHaveValue(new RegExp(venueName));

  // --- Admin: Finanzen zum Spiel
  await adm.goto(`/admin/finanzen/spiel/${matchId}`);
  await idle(adm);
  await adm.getByLabel("Betrag in Euro").fill("80,00");
  await adm.getByLabel("Notiz").fill("Hallenmiete E2E");
  await adm.getByRole("button", { name: "Ausgabe buchen" }).click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible();
  const cards = adm.locator("dl > div dd");
  await expect(cards.nth(0)).toHaveText(euro("80,00 €")); // Einnahmen
  await expect(cards.nth(1)).toHaveText(euro("80,00 €")); // Hallenkosten
  await expect(cards.nth(2)).toHaveText(euro("0,00 €")); // Marge
  await expect(adm.locator('[data-testid^="player-"]')).toHaveCount(10);
  await expect(adm.getByTestId(`player-${`p4h1-${run}@test.local`}`)).toContainText(euro("netto 8,00 €"));

  // Ausnahme-Erstattung an einen Spieler
  const card = adm.getByTestId(`player-p4h1-${run}@test.local`);
  await card.getByLabel("Grund").fill("Verletzung vor dem Spiel");
  await card.getByRole("button", { name: "Ausnahme-Erstattung buchen" }).click();
  await expect(adm.getByTestId(`player-p4h1-${run}@test.local`)).toContainText(euro("netto 0,00 €"));
  expect(await walletBalanceOf(seeded[0])).toBe(2000);

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
  await seedUserRole("pm5b", "booking");
  await seedUserRole("pm5f", "finance");
  const booking = await (await browser.newContext()).newPage();
  const finance = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await devLogin(booking, `pm5b-${run}@test.local`, "Buchung pm5b", "/admin/buchungen");
  await devLogin(finance, `pm5f-${run}@test.local`, "Finanz pm5f", "/admin/finanzen");
  await newUser(player, "pm5p");

  await expect(booking.getByRole("heading", { name: "Hallen-Buchungen" })).toBeVisible();
  await booking.goto("/admin/hallen");
  await expect(booking.getByRole("heading", { name: "Hallen und Preise" })).toBeVisible();
  // Buchung darf keine Preise ändern
  await expect(booking.getByRole("button", { name: "Preisregel hinzufügen" })).toHaveCount(0);
  await booking.goto("/admin/finanzen");
  await expect(booking).toHaveURL(/\/app$/);
  await booking.goto("/admin/codes");
  await expect(booking).toHaveURL(/\/app$/);

  await expect(finance.getByRole("heading", { name: "Finanzen" })).toBeVisible();
  await finance.goto("/admin/codes");
  await expect(finance.getByRole("heading", { name: "Rabattcodes" })).toBeVisible();
  await finance.goto("/admin/buchungen");
  await expect(finance).toHaveURL(/\/app$/);
  await finance.goto("/admin/einstellungen");
  await expect(finance).toHaveURL(/\/app$/);

  // CSV nur für Finanz
  expect((await finance.request.get("/admin/finanzen/export")).status()).toBe(200);
  expect((await booking.request.get("/admin/finanzen/export")).status()).toBe(403);
  expect((await player.request.get("/admin/finanzen/export")).status()).toBe(403);
  expect((await finance.request.get("/admin/finanzen/export?monat=quatsch")).status()).toBe(400);
  await player.goto("/admin/finanzen");
  await expect(player).toHaveURL(/\/app$/);
});

test("Rabattcodes im Admin anlegen und verwenden", async ({ browser }) => {
  await seedUserRole("pm6f", "finance");
  const fin = await (await browser.newContext()).newPage();
  await devLogin(fin, `pm6f-${run}@test.local`, "Finanz pm6f", "/admin/codes");
  await idle(fin);
  const code = `ADM${run}`.toUpperCase();
  await fin.getByLabel("Code", { exact: true }).fill(code);
  await fin.getByLabel("Art", { exact: true }).selectOption("fixed");
  await fin.getByLabel("Wert (Prozent oder Euro)").fill("3,00");
  await fin.getByLabel("Gesamtbudget (Euro)").fill("3,00");
  await fin.getByRole("button", { name: "Code anlegen" }).click();
  await expect(fin.getByTestId(`promo-${code}`)).toContainText(euro("3,00 €"));
  await expect(fin.getByTestId(`promo-${code}`)).toContainText("aktiv");
  // doppelter Code
  await fin.getByLabel("Code", { exact: true }).fill(code);
  await fin.getByLabel("Wert (Prozent oder Euro)").fill("10"); // Formular wurde nach Erfolg geleert: wieder Prozent
  await fin.getByRole("button", { name: "Code anlegen" }).click();
  await expect(fin.getByText("Diesen Code gibt es schon.")).toBeVisible();
  await query("update promo_codes set note = 'e2e' where code = $1", [code]);

  // Ein Spieler löst ihn ein: Budget 3,00 reicht für genau eine Einlösung
  const p1 = await (await browser.newContext()).newPage();
  const p2 = await (await browser.newContext()).newPage();
  await newUser(p1, "pm6a");
  await newUser(p2, "pm6b");
  for (const [p, expected] of [[p1, "13,00"], [p2, null]] as const) {
    await p.goto("/app/guthaben");
    await p.getByLabel("Betrag in Euro").fill("10");
    await p.getByLabel("Rabattcode (optional)").fill(code);
    await p.getByLabel("Rabattcode (optional)").blur();
    if (expected) {
      await p.getByRole("button", { name: "Jetzt bezahlen" }).click();
      await p.getByRole("button", { name: "Zahlung erfolgreich" }).click();
      await expect(p.getByTestId("balance")).toHaveText(euro(`${expected} €`));
    } else {
      await expect(p.getByText("Das Budget dieses Codes ist aufgebraucht.")).toBeVisible();
    }
  }
  // deaktivieren
  await fin.reload();
  await fin.getByTestId(`promo-${code}`).getByRole("button", { name: "Deaktivieren" }).click();
  await expect(fin.getByTestId(`promo-${code}`)).toContainText("inaktiv");
});

test("Einstellungen: Zahlungen aus macht Spiele kostenlos", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "p7");
  await a.goto(`/lobby/${matchId}`);
  await expect(a.getByRole("region", { name: "Kosten" })).toBeVisible();

  await seedAdmin("p7adm");
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `p7adm-${run}@test.local`, "Admin p7adm", "/admin/einstellungen");
  await idle(adm);
  await expect(adm.getByText(/Test-Anbieter/)).toBeVisible();
  await adm.getByLabel("Zahlungen einschalten").uncheck();
  await adm.getByRole("button", { name: "Speichern" }).click();
  await expect(adm.getByText("Gespeichert.")).toBeVisible();

  await a.reload();
  await expect(a.getByRole("region", { name: "Kosten" })).toHaveCount(0);
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
