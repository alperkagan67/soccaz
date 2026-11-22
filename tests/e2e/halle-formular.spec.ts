import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeContexts, createTeam, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

// 011 M2b: /halle Ablehnen-Formular, Tastatur, Tippflächen, Fristanzeige, Namenfreiheit. Braucht die Datenbank (Lauf frei) und ist im Zwischenstand NICHT gelaufen.
// ZWISCHENSTAND: Solange HALL_DECLINE_WIRED = false ist, meldet das Formular nach gültiger Eingabe „Ablehnen mit Grund folgt“ und schreibt nichts (R-T238).
// Mit der Anbindung (M2a-2) ersetzt der Test „speichert den Grund“ den Test „ohne Anbindung ändert nichts“ (Backlog 156/157/158).
test.setTimeout(150_000);

const hall = (n: string) => `E2E Formularhalle ${n} ${run}`;
const names: string[] = [];

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
  await query("delete from venue_access where venue_id in (select id from venues where name = any($1))", [names]);
  await query("delete from venues where name = any($1)", [names]);
});

/** Spiel mit vereinbartem Termin und einer angefragten Halle mit Betreiber (boss); `deadline` ist ein SQL-Ausdruck für die Antwortfrist. */
async function setup(browser: Browser, n: string, deadline = "now() + interval '12 hours'"): Promise<{ boss: Page; matchId: string; venueId: string }> {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const boss = await (await browser.newContext()).newPage();
  await newUser(a, `hfa${n}`);
  await newUser(b, `hfb${n}`);
  await newUser(boss, `hfm${n}`);
  const [teamA, teamB] = [`Formular A ${n} ${run}`, `Formular B ${n} ${run}`];
  await createTeam(a, teamA);
  await createTeam(b, teamB);
  const bossId = await userIdByEmail(`hfm${n}-${run}@test.local`);
  names.push(hall(n));
  const [h] = await query<{ id: string }>("insert into venues (name, city, manager_user_id) values ($1, 'Gelsenkirchen', $2) returning id", [hall(n), bossId]);
  await query("insert into venue_access (venue_id, user_id, status, assigned_at) values ($1, $2, 'active', now())", [h.id, bossId]);
  const [ta] = await query<{ id: string }>("select id from teams where name = $1", [teamA]);
  const [tb] = await query<{ id: string }>("select id from teams where name = $1", [teamB]);
  const [m] = await query<{ id: string }>(
    `insert into matches (home_team_id, away_team_id, starts_at, duration_min, visibility, scheduling_open, veto_status, veto_turn_deadline) values ($1, $2, now() + interval '5 days', 60, 'public', false, 'halls', ${deadline}) returning id`,
    [ta.id, tb.id],
  );
  await query("insert into match_hall_requests (match_id, venue_id, position, status) values ($1, $2, 0, 'pending')", [m.id, h.id]);
  return { boss, matchId: m.id, venueId: h.id };
}

const inquiryOf = (boss: Page, n: string) => boss.getByTestId("inquiry").filter({ hasText: hall(n) });

test("Ablehnen-Formular: Fehler am Feld, Fokus auf die Radiogruppe, sonstiges braucht Text, ohne Anbindung ändert nichts", async ({ browser }) => {
  const { boss, matchId, venueId } = await setup(browser, "1");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "1");
  await boss.waitForLoadState("networkidle");
  await inquiry.getByText("Halle ist belegt (Grund angeben)").click();

  // ohne Grund: Fehler unter der Gruppe, Fokus auf den ersten Radioknopf
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByTestId("error-reasonCode")).toContainText("Bitte wähle einen Grund.");
  await expect(inquiry.getByRole("radio", { name: "Belegt" })).toBeFocused();

  // „Sonstiges“ ohne Anmerkung: Fehler am Textfeld, Fokus dort
  await inquiry.getByRole("radio", { name: "Sonstiges" }).check();
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByTestId("error-reason")).toContainText("3 bis 200 Zeichen");
  await expect(inquiry.getByLabel(/Anmerkung/)).toHaveAttribute("aria-invalid", "true");
  await expect(inquiry.getByLabel(/Anmerkung/)).toBeFocused();

  // gültige Eingabe, aber ohne Anbindung: Meldung, nichts geschrieben (R-T238)
  await inquiry.getByLabel(/Anmerkung/).fill("Platz gesperrt");
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByRole("alert").filter({ hasText: "Ablehnen mit Grund folgt" })).toBeVisible();
  const [row] = await query<{ status: string }>("select status from match_hall_requests where match_id = $1 and venue_id = $2", [matchId, venueId]);
  expect(row.status).toBe("pending");
});

test("Tastatur und Tippflächen: Aufklappen, Radiogruppe, mindestens 44 px", async ({ browser }) => {
  const { boss } = await setup(browser, "2");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "2");
  await boss.waitForLoadState("networkidle");
  const summary = inquiry.locator("summary");

  await summary.focus();
  await boss.keyboard.press("Enter");
  await expect(inquiry.locator("details")).toHaveAttribute("open", "");
  await boss.keyboard.press("Tab");
  await expect(inquiry.getByRole("radio", { name: "Belegt" })).toBeFocused();
  await boss.keyboard.press("Space");
  await expect(inquiry.getByRole("radio", { name: "Belegt" })).toBeChecked();
  await boss.keyboard.press("ArrowDown");
  await expect(inquiry.getByRole("radio", { name: "Geschlossen oder Wartung" })).toBeChecked();

  // Tippflächen mindestens 44 px hoch (Vertrag 013 AC-3)
  const heights = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())?.height ?? 0;
  expect(await heights(inquiry.getByRole("button", { name: "Halle ist frei" }))).toBeGreaterThanOrEqual(44);
  expect(await heights(summary)).toBeGreaterThanOrEqual(44);
  expect(await heights(inquiry.getByRole("button", { name: "Ablehnung senden" }))).toBeGreaterThanOrEqual(44);
  for (const label of ["Belegt", "Geschlossen oder Wartung", "Veranstaltung", "Sonstiges"]) {
    expect(await heights(inquiry.locator("label", { hasText: label }))).toBeGreaterThanOrEqual(44);
  }
});

test("Fristanzeige: bald ablaufend mit Wort und Symbol, abgelaufen ohne Knöpfe", async ({ browser }) => {
  const { boss, matchId } = await setup(browser, "3", "now() + interval '30 minutes'");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "3");
  await expect(inquiry.getByTestId("inquiry-deadline")).toContainText("Antwort bis");
  await expect(inquiry.getByTestId("inquiry-deadline")).toContainText("Min.");
  await expect(inquiry.getByTestId("inquiry-deadline")).toContainText("Frist läuft bald ab");
  await expect(inquiry.getByRole("button", { name: "Halle ist frei" })).toBeVisible();

  // Frist in der Datenbank in die Vergangenheit: keine Knöpfe, neutraler Text
  await query("update matches set veto_turn_deadline = now() - interval '1 minute' where id = $1", [matchId]);
  await boss.reload();
  await expect(inquiryOf(boss, "3").getByTestId("inquiry-expired")).toContainText("Die Antwortfrist ist abgelaufen");
  await expect(inquiryOf(boss, "3").getByRole("button", { name: "Halle ist frei" })).toHaveCount(0);
  await expect(inquiryOf(boss, "3").locator("summary")).toHaveCount(0);
});

test("Namenfrei: Seite, HTML und RSC-Payload enthalten keine Spielernamen und keinen Lobby-Link, auch mit dem Formular", async ({ browser }) => {
  const { boss, matchId } = await setup(browser, "4");
  await boss.goto("/halle");
  const html = await (await boss.request.get("/halle")).text();
  const rsc = await (await boss.request.get("/halle", { headers: { RSC: "1" } })).text();
  expect(html).toContain("Halle ist belegt"); // Positivkontrolle: echte Seite mit Formular
  for (const body of [await boss.locator("body").innerText(), html, rsc]) {
    expect(body).not.toContain("Spieler hfa4");
    expect(body).not.toContain("Spieler hfb4");
    expect(body).not.toContain(`/lobby/${matchId}`);
  }
});
