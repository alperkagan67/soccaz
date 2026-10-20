import { expect, test } from "@playwright/test";
import { clickWhenReady, setupLobby } from "./flows";
import {
  addParticipant,
  addTeamMember,
  closeContexts,
  closeTestDb,
  devLogin,
  newUser,
  run,
  seedUser,
  teamIdByName,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

test("Lobby: Ort live, Bereit, automatische Bestätigung, Rücknahme, Absage", async ({ browser }) => {
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "l1");
  const teamA = await teamIdByName(nameA);
  const teamB = await teamIdByName(nameB);

  // je 3 weitere bereite Spieler direkt in der Datenbank
  for (const [team, tag] of [[teamA, "ha"], [teamB, "ga"]] as const) {
    for (let i = 1; i <= 3; i++) {
      const id = await seedUser(`l1${tag}${i}`);
      await addTeamMember(team, id);
      await addParticipant(matchId, id, team, true);
    }
  }
  await a.reload();
  await b.reload();
  await expect(a.getByTestId("match-status").filter({ hasText: "Wartet auf Spieler" })).toBeVisible();
  // Live-Verbindung (SSE) steht bei beiden
  await expect(a.getByText("● Live")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText("● Live")).toBeVisible({ timeout: 15_000 });

  // Ort setzen: B sieht es live, ohne neu zu laden
  await expect(async () => {
    await a.getByLabel("Ort / Halle").fill("Soccerhalle Buer");
    await a.getByRole("button", { name: "Speichern" }).click();
    await expect(a.getByText("Gespeichert.")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await expect(b.getByLabel("Ort / Halle")).toHaveValue("Soccerhalle Buer", { timeout: 15_000 });

  // A wird bereit: 4/4 Heim, 3/4 Gast, noch nicht bestätigt
  await clickWhenReady(a, "Ich bin bereit");
  await expect(a.getByText("Nicht mehr bereit")).toBeVisible();
  await expect(a.getByTestId("match-status").filter({ hasText: "Wartet auf Spieler" })).toBeVisible();

  // B wird bereit: beide Teams 4, Spiel ist bestätigt, auch bei A ohne Neuladen
  await clickWhenReady(b, "Ich bin bereit");
  await expect(b.getByTestId("match-status").filter({ hasText: "Bestätigt" })).toBeVisible();
  await expect(a.getByTestId("match-status").filter({ hasText: "Bestätigt" })).toBeVisible({ timeout: 15_000 });

  // B nimmt Bereit zurück: wieder Wartet auf Spieler
  await clickWhenReady(b, "Nicht mehr bereit");
  await expect(b.getByTestId("match-status").filter({ hasText: "Wartet auf Spieler" })).toBeVisible();
  await expect(a.getByTestId("match-status").filter({ hasText: "Wartet auf Spieler" })).toBeVisible({ timeout: 15_000 });

  // Absagen mit Grund
  await clickWhenReady(a, "Spiel absagen");
  await a.getByLabel(/Grund der Absage/).fill("Halle fällt aus");
  await a.getByRole("button", { name: "Endgültig absagen" }).click();
  await expect(a.getByText("Dieses Spiel wurde abgesagt.")).toBeVisible();
  await expect(b.getByText("Dieses Spiel wurde abgesagt.")).toBeVisible({ timeout: 15_000 });
  await expect(a.getByRole("button", { name: "Ich bin bereit" })).toHaveCount(0);
  await expect(a.getByRole("button", { name: "Spiel absagen" })).toHaveCount(0);
});

test("Lobby: Teammitglied tritt bei, Team voll, Ersatzspieler von außen wird zugewiesen", async ({ browser }) => {
  const { a, matchId, nameA, nameB } = await setupLobby(browser, "l2");
  const teamA = await teamIdByName(nameA);

  // Spieler M ist Mitglied von Team A und tritt über die Oberfläche bei
  const m = await (await browser.newContext()).newPage();
  const mId = await seedUser("l2m", "Mitglied Mia");
  await addTeamMember(teamA, mId);
  await devLogin(m, `l2m-${run}@test.local`, "Mitglied Mia", `/lobby/${matchId}`);
  await expect(m).toHaveURL(/\/lobby\//);
  await clickWhenReady(m, "Dem Spiel beitreten");
  await expect(m.getByText("Mitglied Mia")).toBeVisible();
  await expect(a.getByText("Mitglied Mia")).toBeVisible({ timeout: 15_000 }); // live bei A

  // Team A auf 6 auffüllen (Admin + Mia + 4), dann ist ein weiteres Mitglied abgewiesen
  for (let i = 1; i <= 4; i++) {
    const id = await seedUser(`l2f${i}`);
    await addTeamMember(teamA, id);
    await addParticipant(matchId, id, teamA);
  }
  const lateId = await seedUser("l2late", "Spaet Sven");
  await addTeamMember(teamA, lateId);
  const late = await (await browser.newContext()).newPage();
  await devLogin(late, `l2late-${run}@test.local`, "Spaet Sven", `/lobby/${matchId}`);
  await expect(late.getByText("Dein Team ist voll")).toBeVisible();
  await expect(late.getByRole("button", { name: "Dem Spiel beitreten" })).toHaveCount(0);

  // Ein Fremder bietet sich als Ersatz an, Team B hat noch Platz
  const s = await (await browser.newContext()).newPage();
  await newUser(s, "l2s");
  await s.goto(`/lobby/${matchId}`);
  await clickWhenReady(s, "Als Ersatzspieler anbieten");
  await expect(s.getByText("Ersatzspieler warten auf Zuweisung")).toBeVisible();

  // Team-A-Admin sieht ihn live; Team A ist voll, also gibt es für A keinen Zuweisen-Knopf
  await expect(a.getByText("Ersatzspieler warten auf Zuweisung")).toBeVisible({ timeout: 15_000 });
  await expect(a.getByRole("button", { name: `Zu ${nameA}` })).toHaveCount(0);

  // Team B kann ihn aufnehmen
  const b = await (await browser.newContext()).newPage();
  await devLogin(b, `l2b-${run}@test.local`, "Spieler l2b", `/lobby/${matchId}`);
  await clickWhenReady(b, `Zu ${nameB}`);
  await expect(b.getByText("Ersatzspieler warten auf Zuweisung")).toHaveCount(0);
  await expect(s.getByText("Spieler l2s")).toBeVisible({ timeout: 15_000 });
  await expect(s.getByRole("listitem").filter({ hasText: "Spieler l2s" }).getByText("Ersatz", { exact: true })).toBeVisible();
});

test("Lobby: private Lobby ist für Fremde gesperrt", async ({ browser }) => {
  const { matchId } = await setupLobby(browser, "l3", "private");
  const stranger = await (await browser.newContext()).newPage();
  await newUser(stranger, "l3x");
  await stranger.goto(`/lobby/${matchId}`);
  await expect(stranger).toHaveURL(/\/app$/);
  // auch der Live-Kanal ist gesperrt
  const status = await stranger.evaluate(async (id) => (await fetch(`/api/lobby/${id}/events`)).status, matchId);
  expect(status).toBe(404);
});
