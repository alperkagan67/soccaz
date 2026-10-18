import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb, createTeam, newUser, run } from "./helpers";
import { callJob, query, setMatchTimes, setSubmittedAgo, startMatchNow } from "./helpers-db";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

const titlesFor = async (email: string) =>
  (await query<{ title: string }>("select n.title from notifications n join users u on u.id = n.user_id where u.email = $1 order by n.created_at", [email])).map((r) => r.title);

const unreadFor = async (email: string) =>
  (await query<{ n: number }>("select count(*)::int n from notifications n join users u on u.id = n.user_id where u.email = $1 and n.read_at is null", [email]))[0].n;

test("Benachrichtigungen: Gegner angenommen, Glocke, gelesen, Zustellprotokoll", async ({ browser, baseURL }) => {
  const { a, matchId } = await setupLobby(browser, "n1");
  const emailA = `n1a-${run}@test.local`;

  // Team A (Besitzer der Suche) hat eine Benachrichtigung bekommen, Team B (Annehmer) nicht
  expect(await titlesFor(emailA)).toContain("Dein Gegner steht fest");
  expect(await titlesFor(`n1b-${run}@test.local`)).not.toContain("Dein Gegner steht fest");

  await a.goto("/app");
  await expect(a.getByTestId("unread-badge")).toHaveText("1");
  await a.goto("/app/benachrichtigungen");
  await expect(a.getByText("Dein Gegner steht fest")).toBeVisible();
  await expect(a.getByText(/hat deine Spielsuche angenommen/)).toBeVisible();
  // wird nach kurzer Zeit als gelesen markiert, das Abzeichen verschwindet
  await expect.poll(() => unreadFor(emailA), { timeout: 15_000 }).toBe(0);
  await a.goto("/app");
  await expect(a.getByTestId("unread-badge")).toHaveCount(0);

  // Klick führt zur Lobby
  await a.goto("/app/benachrichtigungen");
  await a.getByRole("link", { name: /Dein Gegner steht fest/ }).click();
  await expect(a).toHaveURL(new RegExp(`/lobby/${matchId}`));

  // Zustellung: ohne Anbieter wird protokolliert, nichts geht verloren
  const delivered = (await callJob(baseURL!, "deliver-notifications")) as number;
  expect(delivered).toBeGreaterThanOrEqual(1);
  const log = await query<{ channel: string; status: string }>(
    "select l.channel, l.status from delivery_log l join notifications n on n.id = l.notification_id join users u on u.id = n.user_id where u.email = $1",
    [emailA],
  );
  expect(log.length).toBeGreaterThan(0);
  expect(log.every((l) => l.status === "skipped")).toBe(true);
  const open = await query<{ n: number }>("select count(*)::int n from notifications n join users u on u.id = n.user_id where u.email = $1 and n.delivered_at is null", [emailA]);
  expect(open[0].n).toBe(0);

  // zweiter Lauf stellt nichts doppelt zu
  const before = (await query<{ n: number }>("select count(*)::int n from delivery_log"))[0].n;
  await callJob(baseURL!, "deliver-notifications");
  expect((await query<{ n: number }>("select count(*)::int n from delivery_log"))[0].n).toBe(before);
});

test("Benachrichtigungen: abgeschaltete Art kommt nicht an", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await newUser(admin, "n2a");
  await createTeam(admin, `N2-Team ${run}`);
  await admin.goto("/app/einstellungen");
  await expect(admin.getByLabel("Neues Mitglied in deinem Team")).toBeChecked();
  await admin.getByLabel("Neues Mitglied in deinem Team").uncheck();
  await admin.getByRole("button", { name: "Speichern" }).click();
  await expect(admin.getByText("Gespeichert.")).toBeVisible();

  // neues Mitglied tritt per Einladung bei
  const slug = (await query<{ slug: string }>("select slug from teams where name = $1", [`N2-Team ${run}`]))[0].slug;
  await admin.goto(`/teams/${slug}`);
  await admin.getByRole("button", { name: "Einladungslink erstellen" }).click();
  const link = await admin.getByLabel("Einladungslink").inputValue();
  const joiner = await (await browser.newContext()).newPage();
  await newUser(joiner, "n2b");
  await joiner.goto(link);
  await joiner.getByRole("button", { name: "Team beitreten" }).click();
  await expect(joiner).toHaveURL(/\/teams\//);
  expect(await titlesFor(`n2a-${run}@test.local`)).not.toContain("Neues Teammitglied");
});

test("Zeitplan: Erinnerung genau einmal, automatische Absage, Ergebnis-Erinnerung, abgelaufene Suche", async ({ browser, baseURL }) => {
  // --- Erinnerung 2 Stunden vorher
  const r = await setupLobby(browser, "n3");
  await setMatchTimes(r.matchId, 1.5, 30);
  await callJob(baseURL!, "send-reminders");
  await callJob(baseURL!, "send-reminders"); // zweiter Lauf: keine Dopplung
  const reminders = (await titlesFor(`n3a-${run}@test.local`)).filter((t) => t === "Anstoß in zwei Stunden");
  expect(reminders).toHaveLength(1);

  // --- Automatische Absage: Anstoß in 10 Stunden, Annahme vor 13 Stunden, nicht bestätigt
  const c = await setupLobby(browser, "n4");
  await setMatchTimes(c.matchId, 10, 13);
  const cancelled = (await callJob(baseURL!, "lobby-deadlines")) as number;
  expect(cancelled).toBeGreaterThanOrEqual(1);
  await c.a.goto(`/lobby/${c.matchId}`);
  await expect(c.a.getByText("Dieses Spiel wurde abgesagt.")).toBeVisible();
  expect(await titlesFor(`n4b-${run}@test.local`)).toContain("Spiel abgesagt");
  const why = await query<{ after: { reason: string } }>("select after from audit_log where entity_id = $1 and action = 'match.cancel'", [c.matchId]);
  expect(why[0].after.reason).toMatch(/Zu wenige bereite Spieler/);

  // --- Frist noch nicht erreicht: Anstoß in 40 Stunden bleibt bestehen
  const d = await setupLobby(browser, "n5");
  await setMatchTimes(d.matchId, 40, 1);
  await callJob(baseURL!, "lobby-deadlines");
  await d.a.reload();
  await expect(d.a.getByText("Wartet auf Spieler").first()).toBeVisible();

  // --- Ergebnis-Erinnerung nach 24 Stunden, nur einmal
  const e = await setupLobby(browser, "n6");
  await startMatchNow(e.matchId);
  await e.a.goto(`/spiele/${e.matchId}`);
  await expect(async () => {
    await e.a.getByRole("button", { name: "Ergebnis melden" }).click();
    await expect(e.a.getByText(/Gemeldetes Ergebnis/)).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  expect(await titlesFor(`n6b-${run}@test.local`)).toContain("Bitte Ergebnis bestätigen");
  await setSubmittedAgo(e.matchId, 25);
  await callJob(baseURL!, "result-reminders");
  await callJob(baseURL!, "result-reminders");
  expect((await titlesFor(`n6b-${run}@test.local`)).filter((t) => t === "Erinnerung: Ergebnis bestätigen")).toHaveLength(1);

  // --- Abgelaufene Spielsuche
  const f = await setupLobby(browser, "n7");
  await f.a.goto("/app/suche/neu");
  await f.a.getByLabel("Team", { exact: true }).selectOption({ label: f.nameA });
  await f.a.getByLabel(/Anstoß/).fill(new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10) + "T19:00");
  await f.a.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(f.a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const reqId = f.a.url().split("/").pop()!;
  await query("update match_requests set starts_at = now() - interval '1 hour' where id = $1", [reqId]);
  await callJob(baseURL!, "expire-requests");
  const status = await query<{ status: string }>("select status from match_requests where id = $1", [reqId]);
  expect(status[0].status).toBe("expired");
});
