import { expect, test } from "@playwright/test";
import { clickWhenReady, setupLobby } from "./flows";
import { closeContexts, closeTestDb, devLogin, run } from "./helpers";
import { callJob, query, seedAdmin, setConfirmDeadline, startMatchNow } from "./helpers-db";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

test("Spieltag: Tore live erfassen, rückgängig, Ergebnis melden, Widerspruch, Admin entscheidet", async ({ browser }) => {
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "r1");

  // Vor dem Anstoß gibt es keine Erfassung
  await a.goto(`/spiele/${matchId}`);
  await expect(a.getByText("Geplant")).toBeVisible();
  await expect(a.getByRole("button", { name: `Tor ${nameA}` })).toHaveCount(0);

  await startMatchNow(matchId);
  await a.reload();
  await b.goto(`/spiele/${matchId}`);
  await expect(a.getByText("Läuft", { exact: true })).toBeVisible();
  await expect(b.getByText("● Live")).toBeVisible({ timeout: 15_000 });

  // Tor für Heim mit Torschütze: Stand 1:0, auch bei B ohne Neuladen
  await clickWhenReady(a, `Tor ${nameA}`);
  await a.getByRole("dialog").getByRole("button", { name: "Spieler r1a" }).click();
  await expect(a.getByLabel("Spielstand 1 zu 0")).toBeVisible();
  await expect(b.getByLabel("Spielstand 1 zu 0")).toBeVisible({ timeout: 15_000 });

  // Tor für Gast, Torschütze unbekannt: 1:1, dann rückgängig: 1:0
  await clickWhenReady(a, `Tor ${nameB}`);
  await a.getByRole("dialog").getByRole("button", { name: "Unbekannt" }).click();
  await expect(a.getByLabel("Spielstand 1 zu 1")).toBeVisible();
  await clickWhenReady(a, "Letzte Aktion rückgängig");
  await expect(a.getByLabel("Spielstand 1 zu 0")).toBeVisible();

  // Gelbe Karte wird erfasst, verändert den Spielstand nicht
  await a.getByRole("button", { name: "Gelb" }).first().click();
  await a.getByRole("dialog").getByRole("button", { name: "Spieler r1a" }).click();
  await expect(a.getByText("Gelbe Karte")).toBeVisible();
  await expect(a.getByLabel("Spielstand 1 zu 0")).toBeVisible();

  // Endergebnis melden: Felder sind mit dem Spielstand vorbelegt
  await expect(a.getByLabel(nameA, { exact: true })).toHaveValue("1");
  await a.getByRole("button", { name: "Ergebnis melden" }).click();
  await expect(a.getByText(/Gemeldetes Ergebnis/)).toBeVisible();
  await expect(a.getByRole("button", { name: `Tor ${nameA}` })).toHaveCount(0); // keine Erfassung mehr

  // B sieht Bestätigen/Widersprechen und widerspricht
  await expect(b.getByRole("button", { name: "Widersprechen" })).toBeVisible({ timeout: 15_000 });
  await b.getByRole("button", { name: "Widersprechen" }).click();
  await b.getByLabel(/Warum stimmt das Ergebnis nicht/).fill("Wir haben 2:1 gewonnen");
  await b.getByRole("button", { name: "Widerspruch senden" }).click();
  await expect(b.getByText("Das Ergebnis ist strittig").first()).toBeVisible();
  await expect(a.getByText("Das Ergebnis ist strittig").first()).toBeVisible({ timeout: 15_000 });

  // A kann nicht mehr selbst melden
  await expect(a.getByRole("button", { name: "Ergebnis melden" })).toHaveCount(0);

  // Plattform-Admin entscheidet 1:2
  await seedAdmin("r1adm");
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `r1adm-${run}@test.local`, "Admin r1adm", `/spiele/${matchId}`);
  await expect(adm.getByText("Plattform-Entscheidung")).toBeVisible();
  await expect(adm.getByText(/Wir haben 2:1 gewonnen/)).toBeVisible();
  await adm.getByLabel(nameA, { exact: true }).fill("1");
  await adm.getByLabel(nameB, { exact: true }).fill("2");
  await adm.getByLabel(/Begründung/).fill("Torprotokoll geprüft");
  await adm.getByRole("button", { name: "Endgültig entscheiden" }).click();
  await expect(adm.getByLabel("Spielstand 1 zu 2")).toBeVisible();
  await expect(adm.getByText("Beendet", { exact: true })).toBeVisible();
  await expect(a.getByLabel("Spielstand 1 zu 2")).toBeVisible({ timeout: 15_000 });

  const audit = await query<{ action: string }>("select action from audit_log where entity_id = $1 and action like 'result.%' order by at", [matchId]);
  expect(audit.map((r) => r.action)).toEqual(["result.submit", "result.dispute", "result.decide"]);

  // Das Ergebnis steht in der öffentlichen Übersicht
  await adm.goto("/spiele");
  await expect(adm.getByText(nameA).first()).toBeVisible();
});

test("Spieltag: Ergebnis wird vom Gegner bestätigt", async ({ browser }) => {
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "r2");
  await startMatchNow(matchId);
  await a.goto(`/spiele/${matchId}`);
  await b.goto(`/spiele/${matchId}`);

  // Ohne Torerfassung direkt das Ergebnis eintragen: 3:2
  await expect(async () => {
    await a.getByLabel(nameA, { exact: true }).fill("3");
    await a.getByLabel(nameB, { exact: true }).fill("2");
    await a.getByRole("button", { name: "Ergebnis melden" }).click();
    await expect(a.getByText(/Gemeldetes Ergebnis/)).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  // Der Meldende kann sein eigenes Ergebnis nicht bestätigen
  await expect(a.getByRole("button", { name: "Bestätigen" })).toHaveCount(0);

  // Live-Aktualisierung kann auf langsamen Rechnern dauern: bei Bedarf neu laden
  await expect(async () => {
    await b.reload();
    await expect(b.getByRole("button", { name: "Bestätigen" })).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 40_000 });
  await b.getByRole("button", { name: "Bestätigen" }).click();
  await expect(b.getByLabel("Spielstand 3 zu 2")).toBeVisible();
  await expect(b.getByText("Beendet", { exact: true })).toBeVisible();
  await expect(a.getByText("Beendet", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Anonym sichtbar, weil öffentlich
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/spiele/${matchId}`);
  await expect(anon.getByLabel("Spielstand 3 zu 2")).toBeVisible();
  await anon.goto("/spiele");
  await expect(anon.getByText(nameA).first()).toBeVisible();
});

test("Spieltag: ohne Antwort gilt das Ergebnis nach 48 Stunden automatisch", async ({ browser, baseURL }) => {
  const { a, matchId, nameA, nameB } = await setupLobby(browser, "r3");
  await startMatchNow(matchId);
  await a.goto(`/spiele/${matchId}`);
  await expect(async () => {
    await a.getByLabel(nameA, { exact: true }).fill("4");
    await a.getByLabel(nameB, { exact: true }).fill("4");
    await a.getByRole("button", { name: "Ergebnis melden" }).click();
    await expect(a.getByText(/Gemeldetes Ergebnis/)).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  // Frist noch nicht abgelaufen: der Job ändert nichts an diesem Spiel
  await callJob(baseURL!, "auto-confirm-results");
  await a.reload();
  await expect(a.getByText(/Gemeldetes Ergebnis/)).toBeVisible();

  // Frist abgelaufen: der Job bestätigt automatisch
  await setConfirmDeadline(matchId, -1);
  const done = (await callJob(baseURL!, "auto-confirm-results")) as number;
  expect(done).toBeGreaterThanOrEqual(1);
  await a.reload();
  await expect(a.getByText("Beendet", { exact: true })).toBeVisible();
  await expect(a.getByText(/automatisch bestätigt/)).toBeVisible();
  const rows = await query<{ action: string }>("select action from audit_log where entity_id = $1 and action = 'result.auto_confirm'", [matchId]);
  expect(rows).toHaveLength(1);
});

test("Job-Schnittstelle ist geschützt", async ({ baseURL }) => {
  const res = await fetch(`${baseURL}/api/jobs/auto-confirm-results`, { method: "POST" });
  expect(res.status).toBe(403);
  const wrong = await fetch(`${baseURL}/api/jobs/auto-confirm-results`, { method: "POST", headers: { "x-job-secret": "falsch" } });
  expect(wrong.status).toBe(403);
});
