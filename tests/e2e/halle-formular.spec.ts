import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeContexts, createTeam, newUser, run } from "./helpers";
import { query, userIdByEmail } from "./helpers-db";

// 011 M2b: /halle Ablehnen-Formular, Tastatur, Tippflächen, Fristanzeige, Namenfreiheit. Braucht die Datenbank (Lauf frei) und ist im Zwischenstand NICHT gelaufen.
// Angebunden (M2a-2): die Ablehnung speichert Kategorie und Anmerkung im Beweisprotokoll (Datenbank-Trigger beim COMMIT).
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

test("Ablehnen-Formular: Fehler am Feld, Fokus auf die Radiogruppe, sonstiges braucht Text (Browser), zu kurzer Text (Aktion), Grund wird gespeichert", async ({ browser }) => {
  const { boss, matchId, venueId } = await setup(browser, "1");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "1");
  await boss.waitForLoadState("networkidle");
  await inquiry.getByText("Halle ist belegt (Grund angeben)").click();

  // ohne Grund: Fehler unter der Gruppe, Fokus auf den ersten Radioknopf
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByTestId("error-reasonCode")).toContainText("Bitte wähle einen Grund.");
  await expect(inquiry.getByRole("radio", { name: "Belegt" })).toBeFocused();

  // „Sonstiges“ ohne Anmerkung: das Textfeld ist Pflicht (required), der Browser hält das Absenden an und springt auf das Feld (native Prüfung, kein Serveraufruf)
  await inquiry.getByRole("radio", { name: "Sonstiges" }).check();
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByLabel(/Anmerkung/)).toBeFocused();
  expect(await inquiry.getByLabel(/Anmerkung/).evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(true);

  // zu kurze Anmerkung (2 Zeichen): die Eingabeprüfung der Aktion meldet den Fehler am Feld (aria-invalid, Fokus)
  await inquiry.getByLabel(/Anmerkung/).fill("ab");
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByTestId("error-reason")).toContainText("3 bis 200 Zeichen");
  await expect(inquiry.getByLabel(/Anmerkung/)).toHaveAttribute("aria-invalid", "true");
  await expect(inquiry.getByLabel(/Anmerkung/)).toBeFocused();

  // gültige Eingabe: die Ablehnung wird gespeichert, mit Kategorie und bereinigter Anmerkung im Beweisprotokoll (Anmerkung nur in der Nebentabelle)
  await inquiry.getByLabel(/Anmerkung/).fill("  Platz   gesperrt ");
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiryOf(boss, "1")).toHaveCount(0);
  // die einzige angefragte Halle ist belegt: „keine Halle frei“ löscht die Anfragezeilen (der Beweiseintrag bleibt), die Teams wählen einen neuen Termin
  expect(await query("select 1 from match_hall_requests where match_id = $1 and venue_id = $2", [matchId, venueId])).toHaveLength(0);
  const [ev] = await query<{ reason_code: string; reason: string | null; hash_version: number }>("select reason_code, reason, hash_version from booking_evidence where match_id = $1 and venue_id = $2 and kind = 'declined'", [matchId, venueId]);
  expect(ev).toMatchObject({ reason_code: "sonstiges", reason: null, hash_version: 2 });
  const [txt] = await query<{ reason: string }>("select t.reason from booking_evidence_reason_text t join booking_evidence e on e.id = t.evidence_id where e.match_id = $1 and e.venue_id = $2 and e.kind = 'declined'", [matchId, venueId]);
  expect(txt.reason).toBe("Platz gesperrt");
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

// ---- Erweiterungen (a11y, Namenfreiheit): lokal geschrieben, nach dem Merge mit origin/main (5bb35ed) noch NICHT gelaufen ----

test("Struktur (a11y): eine h1, je Karte eine h2, Gruppe mit Namen, Radios und Textfeld mit Namen, Fehler per aria-describedby verknüpft", async ({ browser }) => {
  const { boss } = await setup(browser, "5");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "5");
  await boss.waitForLoadState("networkidle");
  await expect(boss.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(inquiry.getByRole("heading", { level: 2, name: hall("5") })).toBeVisible();
  await inquiry.getByText("Halle ist belegt (Grund angeben)").click();
  await expect(inquiry.getByRole("group", { name: "Grund der Ablehnung (Pflicht)" })).toBeVisible();
  await expect(inquiry.getByRole("radiogroup")).toHaveCount(1);
  for (const label of ["Belegt", "Geschlossen oder Wartung", "Veranstaltung", "Sonstiges"]) await expect(inquiry.getByRole("radio", { name: label })).toBeVisible();
  await expect(inquiry.getByLabel(/Anmerkung/)).toBeVisible();
  await expect(inquiry.getByRole("button", { name: "Ablehnung senden" })).toBeVisible();

  // Fehler: Meldung als Alarm, der erste Radioknopf verweist per aria-describedby auf sie
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click();
  await expect(inquiry.getByTestId("error-reasonCode")).toBeVisible();
  await expect(inquiry.getByRole("alert").filter({ hasText: "Bitte wähle einen Grund." })).toHaveCount(1); // genau ein Alarm, kein doppelt vorgelesener zweiter
  const describedBy = await inquiry.getByRole("radio", { name: "Belegt" }).getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  expect(await boss.locator(`#${describedBy}`).innerText()).toContain("Bitte wähle einen Grund.");
  await expect(inquiry.getByRole("radio", { name: "Belegt" })).toHaveAttribute("aria-invalid", "true");
});

for (const scheme of ["dark", "light"] as const) {
  test(`Handy 390 px (${scheme}): kein seitliches Scrollen, sichtbarer Fokus auf Aufklapper und Radioknopf`, async ({ browser }) => {
    const { boss } = await setup(browser, `6${scheme}`);
    await boss.emulateMedia({ colorScheme: scheme });
    await boss.setViewportSize({ width: 390, height: 844 });
    await boss.goto("/halle");
    const inquiry = inquiryOf(boss, `6${scheme}`);
    await boss.waitForLoadState("networkidle");
    const noOverflow = () => boss.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    await inquiry.getByText("Halle ist belegt (Grund angeben)").click();
    expect(await noOverflow()).toBe(true);

    // Fokus per Tastatur auf den Aufklapper: sichtbarer Ring (Umriss vorhanden)
    const summary = inquiry.locator("summary");
    await summary.focus();
    await boss.keyboard.press("Shift+Tab");
    await boss.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    const ring = (loc: ReturnType<Page["locator"]>) => loc.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    const r1 = await ring(summary);
    expect(r1.style).not.toBe("none");
    expect(r1.width).toBeGreaterThanOrEqual(2);
    await boss.keyboard.press("Tab");
    const radio = inquiry.getByRole("radio", { name: "Belegt" });
    await expect(radio).toBeFocused();
    const r2 = await ring(radio);
    expect(r2.style).not.toBe("none");
    expect(r2.width).toBeGreaterThanOrEqual(2);
  });
}

test("Namenfrei auch nach Fehlern: Text, Attribute und Links ohne Spielernamen und Lobby-Link", async ({ browser }) => {
  const { boss, matchId } = await setup(browser, "7");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "7");
  await boss.waitForLoadState("networkidle");
  await inquiry.getByText("Halle ist belegt (Grund angeben)").click();
  await inquiry.getByRole("button", { name: "Ablehnung senden" }).click(); // Fehler am Feld
  await inquiry.getByRole("radio", { name: "Veranstaltung" }).check();
  const text = await boss.locator("body").innerText();
  expect(text).not.toContain("Spieler hfa7");
  expect(text).not.toContain("Spieler hfb7");
  expect(await boss.locator('a[href*="/lobby/"]').count()).toBe(0);
  expect(await boss.content()).not.toContain(`/lobby/${matchId}`);
});

test("Antwort nach Fristende: neutraler Text, Zeile bleibt, genau ein late_attempt", async ({ browser }) => {
  const { boss, matchId, venueId } = await setup(browser, "8", "now() + interval '20 seconds'");
  await boss.goto("/halle");
  const inquiry = inquiryOf(boss, "8");
  await boss.waitForLoadState("networkidle");
  await query("update matches set veto_turn_deadline = now() - interval '1 minute' where id = $1", [matchId]); // die Seite zeigt noch den Stand beim Laden
  await inquiry.getByRole("button", { name: "Halle ist frei" }).click();
  // je nach Zeitpunkt der Revalidierung als Meldung am Knopf (Alarm) oder als Hinweis der danach abgelaufen angezeigten Karte: der Text ist in beiden Fällen derselbe
  await expect(boss.getByText("Die Antwortfrist ist abgelaufen").first()).toBeVisible();
  const [row] = await query<{ status: string }>("select status from match_hall_requests where match_id = $1 and venue_id = $2", [matchId, venueId]);
  expect(row.status).toBe("pending");
  const [n] = await query<{ n: string }>("select count(*)::text as n from booking_evidence where match_id = $1 and venue_id = $2 and kind = 'late_attempt'", [matchId, venueId]);
  expect(n.n).toBe("1");
});
