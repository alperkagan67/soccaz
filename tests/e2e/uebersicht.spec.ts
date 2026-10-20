import { expect, test } from "@playwright/test";
import { clickWhenReady, setupLobby } from "./flows";
import { addParticipant, addTeamMember, closeContexts, closeTestDb, run, seedUser, teamIdByName } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";

test.setTimeout(150_000);

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("emergency_phone", ""); // Testnummer nicht in der Datenbank lassen
  await closeTestDb();
});

test("Letzte Bestätigung beider Captains öffnet die Spielübersicht mit Ort, Navigation, Notfallnummer und Clips", async ({ browser }) => {
  await setPlatformSetting("emergency_phone", "+49 201 1234567");
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "ue");
  const teamA = await teamIdByName(nameA);
  const teamB = await teamIdByName(nameB);
  for (const [team, tag] of [[teamA, "ha"], [teamB, "ga"]] as const) {
    for (let i = 1; i <= 3; i++) {
      const id = await seedUser(`ue${tag}${i}`);
      await addTeamMember(team, id);
      await addParticipant(matchId, id, team, true);
    }
  }
  a.on("dialog", (d) => void d.accept());
  b.on("dialog", (d) => void d.accept());
  await a.reload();
  await b.reload();

  // beide Captains sind noch nicht bereit: die Bestätigung ist nicht möglich
  await expect(a.getByTestId("final-confirm")).toContainText("Captain hat noch nicht bestätigt");
  await expect(a.getByTestId("final-confirm")).toContainText("Noch nicht möglich");
  await clickWhenReady(a, "Ich bin bereit");
  await clickWhenReady(b, "Ich bin bereit");

  // getrennt sichtbar: erst A, dann B
  await a.reload();
  await a.getByRole("button", { name: /Spiel bestätigen/ }).click();
  await expect(a.getByTestId("final-team").filter({ hasText: nameA })).toHaveAttribute("data-confirmed", "true");
  await expect(a.getByTestId("final-team").filter({ hasText: nameB })).toHaveAttribute("data-confirmed", "false");
  await b.reload();
  await expect(b.getByTestId("final-team").filter({ hasText: nameA })).toHaveAttribute("data-confirmed", "true");
  await b.getByRole("button", { name: /Spiel bestätigen/ }).click();

  // beide landen in der Übersicht
  await expect(b).toHaveURL(new RegExp(`/lobby/${matchId}/uebersicht`), { timeout: 30_000 });
  await a.goto(`/lobby/${matchId}`);
  await expect(a).toHaveURL(new RegExp(`/lobby/${matchId}/uebersicht`));
  await expect(a.getByRole("heading", { name: `${nameA} gegen ${nameB}` })).toBeVisible();
  await expect(a.getByTestId("game-number")).toContainText("Spiel #");
  expect(await a.getByTestId("overview-player").count()).toBe(8);
  await expect(a.getByTestId("overview-time")).toContainText("Uhr");
  await expect(a.getByTestId("emergency-phone")).toContainText("+49 201 1234567");
  await expect(a.getByTestId("emergency-phone")).toHaveAttribute("href", "tel:+492011234567");
  await expect(a.getByTestId("clips")).toContainText("Noch keine Clips");
  await expect(a.getByTestId("kickoff-countdown")).toContainText("Anstoß in"); // Countdown bis zum Anstoß
  await a.goto(`/spiele/${matchId}`);
  await expect(a.getByTestId("kickoff-countdown")).toContainText("Sek");
  await a.goto(`/lobby/${matchId}/uebersicht`);

  // nach dem Anstoß können Spieler Clips einstellen
  await query("update matches set starts_at = now() - interval '2 hours' where id = $1", [matchId]);
  await a.reload();
  await a.getByLabel("Titel").fill(`Tor des Spiels ${run}`);
  await a.getByLabel(/Link \(YouTube/).fill("https://youtu.be/abc123");
  await a.getByRole("button", { name: "Clip veröffentlichen" }).click();
  await expect(a.getByTestId("clip").filter({ hasText: `Tor des Spiels ${run}` })).toBeVisible();
  await expect(a.getByTestId("clip").first().getByRole("link")).toHaveAttribute("href", "https://youtu.be/abc123");
  await b.reload();
  await expect(b.getByTestId("clip").filter({ hasText: `Tor des Spiels ${run}` })).toBeVisible();
  await expect(b.getByTestId("clip").first().getByRole("button", { name: "Löschen" })).toHaveCount(0); // nur der Autor löscht
});
