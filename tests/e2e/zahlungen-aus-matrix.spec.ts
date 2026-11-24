import { expect, test, type Browser } from "@playwright/test";
import { closeContexts, devLogin, run, seedUser } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";
import { ZAHLUNGEN_AUS_HINWEIS, zahlungsWorte } from "@/lib/zahlungen-aus";

// Zustand-Matrix Zahlungen AUS/AN × Preis 0/>0 (Go-live-Paket a, Entscheid t2q 2026-11-24): Im Modus AUS steht auf den Seiten der Turnier-Nutzer KEIN Zahlungswort (Wortscan über die gerenderte Seite:
// Ampel, "So läuft es ab", Preis pro Spieler, Hallenkosten, Karte, Abbuchung, bezahl…, Treuhand), im Modus AN bleibt alles wie bisher (Gegenprobe gegen eine zu weit gehende Unterdrückung).
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function seedTournament(key: string, hourlyCents: number) {
  const org = await seedUser(`${key}o`, `Veranstalter ${key}`);
  const cap = await seedUser(`${key}c`, `Captain ${key}`);
  await query("update users set is_organizer = true where id = $1", [org]);
  const [team] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, color) values ($1, $2, 'Essen', $3, 'green') returning id", [`Matrix ${key} ${run}`, `matrix-${key}-${run}`, cap]);
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [team.id, cap]);
  const total = (hourlyCents * 120) / 60;
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, status, registration_deadline, starts_at, is_private)
     values ($1, $2, 'Essen', (now() + interval '20 days')::date, 'knockout', 4, $3, $4, 120, 'registration', now() + interval '18 days', now() + interval '20 days', false) returning id`,
    [org, `Matrix-Cup ${key} ${run}`, total, hourlyCents],
  );
  await query("insert into tournament_teams (tournament_id, team_id, captain_id) values ($1, $2, $3)", [t.id, team.id, cap]);
  await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3)", [t.id, team.id, cap]);
  return { id: t.id, org, cap, capEmail: `${key}c-${run}@test.local`, orgEmail: `${key}o-${run}@test.local` };
}

// Text der Seite PLUS Attribute (title, aria-label, alt): auch dort darf kein Zahlungswort stehen (z. B. PlayerLight title)
const main = async (page: import("@playwright/test").Page) => {
  const text = (await page.locator("main").textContent()) ?? ""; // textContent: auch zugeklappte <details> (Hilfe) zählen
  const attrs = await page.locator("main").evaluate((el) => [...el.querySelectorAll("[title],[aria-label],[alt]")].map((e) => [e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("alt")].filter(Boolean).join(" ")).join(" "));
  return `${text} ${attrs}`.replace(/\s+/g, " ");
};

async function seiten(browser: Browser, t: Awaited<ReturnType<typeof seedTournament>>) {
  const gast = await (await browser.newContext()).newPage();
  const captain = await (await browser.newContext()).newPage();
  await devLogin(captain, t.capEmail, "Captain");
  await captain.waitForURL(/\/app|\/willkommen/, { timeout: 60_000 });
  const out: Record<string, string> = {};
  await gast.goto(`/turniere/${t.id}`);
  out.turnierGast = await main(gast);
  await gast.goto("/turniere");
  out.liste = await main(gast);
  await gast.goto("/hilfe");
  out.hilfe = await main(gast);
  await gast.goto("/datenschutz");
  out.datenschutz = await main(gast);
  await gast.goto("/impressum");
  out.impressum = await main(gast);
  await captain.goto(`/turniere/${t.id}`);
  await expect(captain.getByTestId("tournament-lobby")).toBeVisible({ timeout: 60_000 });
  out.turnierCaptain = await main(captain);
  out.lobbyCaptain = await captain.getByTestId("tournament-lobby").innerText();
  return out;
}

for (const preis of [0, 8000]) {
  test(`Zahlungen AUS, Preis ${preis}: keine Zahlungswörter auf Turnierseite (Team- und Bereit-Bereich), Turnierliste und Hilfe; Hinweissatz in Hilfe`, async ({ browser }) => {
    await setPlatformSetting("payments_enabled", false);
    const t = await seedTournament(`aus${preis}`, preis);
    const s = await seiten(browser, t);
    // Turnier OHNE Preis (so entsteht bei Zahlungen AUS jedes neue Turnier): Teamlobby (Kader, Legende, Bereit-Texte, Status) und die ganze Turnierseite sauber. Ein Turnier MIT Preis (Altbestand) bleibt im
    // bisherigen pausierten Fluss (nie still gratis): dort prüft die Matrix nur die globalen Seiten (Liste, Hilfe); sein Verhalten decken die Kartenfluss-Tests ab.
    if (preis === 0) expect(zahlungsWorte(s.lobbyCaptain), `Teamlobby (Captain): ${s.lobbyCaptain.replace(/\s+/g, " ")}`).toEqual([]);
    expect(zahlungsWorte(s.liste), "Turnierliste").toEqual([]);
    expect(zahlungsWorte(s.hilfe), "Hilfe").toEqual([]);
    // Rechtstexte (Go-live): bei AUS ohne Zahlungswörter und ohne Zahlungsdienstleister; nie ein erfundener Wert, fehlende Betreiberangaben sind als Platzhalter markiert
    expect(zahlungsWorte(s.datenschutz), "Datenschutz").toEqual([]);
    expect(zahlungsWorte(s.impressum), "Impressum").toEqual([]);
    expect(s.datenschutz).not.toContain("Stripe");
    expect(s.datenschutz).toContain(ZAHLUNGEN_AUS_HINWEIS);
    expect(s.impressum).toContain("Angaben gemäß § 5 DDG");
    expect(s.hilfe).toContain(ZAHLUNGEN_AUS_HINWEIS);
    expect(s.liste).toContain(ZAHLUNGEN_AUS_HINWEIS);
    if (preis === 0) {
      expect(zahlungsWorte(s.turnierGast), "Turnierseite Gast").toEqual([]);
      expect(zahlungsWorte(s.turnierCaptain), "Turnierseite Captain").toEqual([]);
    }
    // die Anmeldung (RegisterForm) eines weiteren Captains: ohne Geldsatz
    const reg = await seedUser(`reg${preis}`, "Captain reg");
    await query("insert into teams (name, slug, city, created_by, color) values ($1, $2, 'Essen', $3, 'green')", [`Anmelde ${preis} ${run}`, `anmelde-${preis}-${run}`, reg]);
    await query("insert into team_members (team_id, user_id, role) select id, $1, 'admin' from teams where created_by = $1", [reg]);
    const p = await (await browser.newContext()).newPage();
    await devLogin(p, `reg${preis}-${run}@test.local`, "Captain reg");
    await p.waitForURL(/\/app|\/willkommen/, { timeout: 60_000 });
    await p.goto(`/turniere/${t.id}`);
    const form = p.getByTestId("register-team");
    await expect(form).toBeVisible({ timeout: 60_000 });
    const text = (await form.innerText()).replace(/\s+/g, " ");
    if (preis === 0) {
      expect(zahlungsWorte(text), "Anmeldeformular").toEqual([]);
      expect(text).toContain(ZAHLUNGEN_AUS_HINWEIS);
    }
  });
}

for (const preis of [0, 8000]) {
  test(`Zahlungen AN, Preis ${preis}: Hilfe zeigt Geld und Zahlung, Turnierliste die Preise; bei Preis > 0 die Turnierseite den Erklärkasten (Gegenprobe)`, async ({ browser }) => {
    await setPlatformSetting("payments_enabled", true);
    const t = await seedTournament(`an${preis}`, preis);
    const s = await seiten(browser, t);
    expect(s.hilfe).toContain("Geld und Zahlung");
    expect(s.datenschutz).toContain("Stripe"); // Gegenprobe: bei AN nennt die Datenschutzerklärung den Zahlungsdienstleister
    expect(s.hilfe).not.toContain(ZAHLUNGEN_AUS_HINWEIS);
    expect(s.liste).not.toContain(ZAHLUNGEN_AUS_HINWEIS);
    // Preis 0 bei AN: Teamlobby ohne Zahlungswörter (Turnier ohne Preis zeigt nie Zahlungstexte)
    if (preis === 0) expect(zahlungsWorte(s.lobbyCaptain), "Teamlobby AN, Preis 0").toEqual([]);
    if (preis > 0) {
      expect(s.turnierGast).toContain("So läuft es ab");
      expect(s.lobbyCaptain.length).toBeGreaterThan(0);
    }
  });
}
