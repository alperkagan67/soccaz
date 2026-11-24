import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { closeTournamentsAtDeadline, closeWithJoinedTeams, notifyFreeTournamentReminders, notifyRegistrationDeadlines, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Gratis-Turnier PR B (Entscheide t2q 2026-11-24, A und B): bei Preis 0 keine automatische Absage zur 48-h-Frist; "Bereit" entfällt (nach "vollzählig" gilt das Team als bereit); das Bracket entsteht erst bei geschlossener
// Anmeldung (alle Plätze belegt oder Veranstalter schließt) UND wenn alle angemeldeten Teams vollzählig sind, nie mit 2 von 16 Teams; Erinnerungen an den Veranstalter ohne Namen Dritter. Bezahlte Turniere unverändert.
afterAll(cleanup);
const DAY = 86_400_000;
let seq = 0;

type Over = Partial<typeof tournaments.$inferInsert>;
/** Turnier in der Anmeldung mit n angemeldeten Teams (je 4 Spieler); die ersten `ready` Teams haben "vollzählig" gemeldet (readyAt). */
async function setup(opts: { n: number; ready: number; max?: number; free?: boolean; startInDays?: number; deadlineInDays?: number; over?: Over }) {
  const { n, ready, max = n, free = true, startInDays = 12, deadlineInDays = 8 } = opts;
  const org = await makeUser("gb-org");
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: `Gratis-B ${++seq}`,
      city: "Essen",
      startsOn: new Date(Date.now() + startInDays * DAY).toISOString().slice(0, 10),
      format: "knockout",
      maxTeams: max,
      status: "registration",
      startsAt: new Date(Date.now() + startInDays * DAY),
      registrationDeadline: new Date(Date.now() + deadlineInDays * DAY),
      durationMin: 120,
      matchMinutes: 15,
      isPrivate: false,
      totalCents: free ? 0 : 16000,
      hourlyCents: free ? 0 : 8000,
      ...opts.over,
    } as typeof tournaments.$inferInsert)
    .returning();
  const caps: { id: string; teamId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const cap = await makeUser("gb-cap");
    const team = await makeTeam(cap.id, `GB ${seq}-${i}`);
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, captainId: cap.id, readyAt: i < ready ? new Date() : null });
    await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: cap.id });
    for (let p = 1; p < 4; p++) {
      const u = await makeUser("gb-pl");
      await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: u.id });
    }
    caps.push({ id: cap.id, teamId: team.id });
  }
  return { org, t, caps };
}
const row = async (id: string) => (await db.select().from(tournaments).where(eq(tournaments.id, id)))[0];
const matchesOf = (id: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
const teamsOf = (id: string) => db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, id));

describe("Frist-Job: Gratis-Turniere werden nicht automatisch abgesagt", () => {
  it("Preis 0, Frist (48 h vor Start) vorbei, kein Bracket: das Turnier bleibt bestehen", async () => {
    const { t } = await setup({ n: 5, ready: 2, max: 8, startInDays: 1, deadlineInDays: 0.5 });
    // bei bezahlten Turnieren wuerde der Job jetzt absagen
    await closeTournamentsAtDeadline(new Date(Date.now() + 23.5 * 3_600_000)); // 30 Minuten vor dem Start: hinter der 1-h-Abbruchfrist (Anlage unter 48 h Vorlauf)
    expect((await row(t.id)).status).toBe("registration");
  });
  it("bezahlte Turniere (Preis > 0) werden weiter zur Frist abgesagt (unveraendert)", async () => {
    const { t } = await setup({ n: 5, ready: 2, max: 8, free: false, startInDays: 1, deadlineInDays: 0.5 });
    await closeTournamentsAtDeadline(new Date(Date.now() + 23.5 * 3_600_000)); // 30 Minuten vor dem Start: hinter der 1-h-Abbruchfrist (Anlage unter 48 h Vorlauf)
    expect((await row(t.id)).status).toBe("cancelled");
  });
});

describe("Bereit entfällt, Bracket erst bei geschlossener Anmeldung und allen Teams vollzählig", () => {
  it("alle Plätze belegt (4 von 4), das letzte Team meldet 'vollzählig': Bracket sofort, ohne ein 'Bereit' (paid_ready_at automatisch)", async () => {
    const { t, caps } = await setup({ n: 4, ready: 3 });
    await setRosterComplete(caps[3].id, t.id, true);
    const after = await row(t.id);
    expect(after.status).toBe("running");
    expect(after.bracketGeneratedAt).not.toBeNull();
    expect((await matchesOf(t.id)).length).toBe(3); // 4 Teams: 3 Spiele
    expect((await teamsOf(t.id)).every((e) => e.paidReadyAt !== null)).toBe(true);
  });
  it("NIE 2 von 16: zwei vollzählige Teams lösen kein Bracket aus, die Anmeldung bleibt offen", async () => {
    const { t, caps } = await setup({ n: 2, ready: 1, max: 16 });
    await setRosterComplete(caps[1].id, t.id, true);
    const after = await row(t.id);
    expect(after.status).toBe("registration");
    expect(await matchesOf(t.id)).toHaveLength(0);
  });
  it("nicht alle Teams vollzählig (auch bei vollem Turnier): kein Bracket", async () => {
    const { t, caps } = await setup({ n: 4, ready: 2 });
    await setRosterComplete(caps[2].id, t.id, true);
    expect((await row(t.id)).status).toBe("registration");
    expect(await matchesOf(t.id)).toHaveLength(0);
  });
  it("Veranstalter schließt die Anmeldung mit den bereiten Teams (6 angemeldet, 5 bereit): das Team ohne vollzählig Kader wird entfernt und benachrichtigt, Bracket mit 5 Teams (Freilose)", async () => {
    const { org, t, caps } = await setup({ n: 6, ready: 5, max: 8, deadlineInDays: -1, startInDays: 3 });
    await closeWithJoinedTeams(org.id, t.id);
    const after = await row(t.id);
    expect(after.status).toBe("running");
    expect(after.maxTeams).toBe(5);
    expect(await teamsOf(t.id)).toHaveLength(5);
    expect((await matchesOf(t.id)).length).toBe(4); // 5 Teams: n-1 Spiele
    const removed = caps[5];
    expect((await teamsOf(t.id)).some((e) => e.teamId === removed.teamId)).toBe(false);
    expect(await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.teamId, removed.teamId)))).toHaveLength(0);
    const note = (await db.select().from(notifications).where(eq(notifications.userId, removed.id))).find((n) => n.body.includes(after.name));
    expect(note?.body).toMatch(/nicht dabei|nicht vollzählig/);
  });
  it("Veranstalter schließt VOR dem Anmeldeschluss (Gratis: jederzeit), mit weniger als 4 bereiten Teams: Fehler, nichts geändert", async () => {
    const { org, t } = await setup({ n: 5, ready: 3, max: 8 });
    await expect(closeWithJoinedTeams(org.id, t.id)).rejects.toThrow(/weniger als 4/);
    expect(await teamsOf(t.id)).toHaveLength(5);
    expect((await row(t.id)).status).toBe("registration");
  });
  it("Gratis, vor dem Anmeldeschluss, 4 bereite Teams: Schließen und Starten geht", async () => {
    const { org, t } = await setup({ n: 4, ready: 4, max: 8 });
    await closeWithJoinedTeams(org.id, t.id);
    expect((await row(t.id)).status).toBe("running");
  });
  it("bezahltes Turnier: 'erst nach dem Anmeldeschluss' bleibt bestehen", async () => {
    const { org, t } = await setup({ n: 4, ready: 4, max: 8, free: false });
    await expect(closeWithJoinedTeams(org.id, t.id)).rejects.toThrow(/erst nach dem Anmeldeschluss/);
  });
});

describe("Erinnerungen an den Veranstalter (ohne Namen Dritter)", () => {
  const bodies = async (userId: string) => (await db.select().from(notifications).where(eq(notifications.userId, userId))).map((n) => n.body);
  it("am Anmeldeschluss: 'X Teams angemeldet, Y bereit', genau einmal; die Meldung für volle Turniere/Preis-Turniere bleibt wie sie war", async () => {
    const { org, t } = await setup({ n: 6, ready: 4, max: 8, deadlineInDays: -0.1, startInDays: 4 });
    expect(await notifyRegistrationDeadlines(new Date())).toBeGreaterThanOrEqual(1);
    expect(await notifyRegistrationDeadlines(new Date())).toBe(0); // einmal
    const list = (await bodies(org.id)).filter((b) => b.includes(t.name));
    expect(list).toHaveLength(1);
    expect(list[0]).toContain("6 Teams angemeldet, 4 bereit");
    expect(list[0]).toMatch(/mit den bereiten Teams starten oder .* absagen/);
  });
  it("24 Stunden vor dem Start ohne Bracket: einmal, ohne Namen von Teams oder Spielern", async () => {
    const { org, t, caps } = await setup({ n: 5, ready: 3, max: 8, startInDays: 0.9, deadlineInDays: -2 });
    expect(await notifyFreeTournamentReminders(new Date())).toBeGreaterThanOrEqual(1);
    expect(await notifyFreeTournamentReminders(new Date())).toBe(0);
    const list = (await bodies(org.id)).filter((b) => b.includes(t.name));
    expect(list.some((b) => /5 Teams angemeldet, 3 bereit/.test(b) && /24 Stunden/.test(b))).toBe(true);
    for (const b of list) for (const c of caps) expect(b).not.toContain(c.teamId);
    const teamNames = await db.select({ id: tournamentTeams.teamId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
    expect(teamNames.length).toBe(5);
    expect(list.join(" ")).not.toMatch(/GB \d+-\d/); // keine Teamnamen
    expect((await db.select().from(auditLog).where(and(eq(auditLog.entityId, t.id), eq(auditLog.action, "tournament.free_reminder.24h")))).length).toBe(1);
  });
  it("keine Erinnerung für bezahlte Turniere, mit Bracket oder zu früh", async () => {
    const paid = await setup({ n: 5, ready: 3, max: 8, free: false, startInDays: 0.9, deadlineInDays: -2 });
    const early = await setup({ n: 5, ready: 3, max: 8, startInDays: 5, deadlineInDays: 3 });
    await notifyFreeTournamentReminders(new Date());
    expect((await bodies(paid.org.id)).filter((b) => b.includes(paid.t.name))).toHaveLength(0);
    expect((await bodies(early.org.id)).filter((b) => b.includes(early.t.name))).toHaveLength(0);
  });
});

describe("PR C: Team entfernen nach dem Anmeldeschluss (Gratis) und Mitteilung 'Euer Spielplan steht'", () => {
  it("Gratis: der Veranstalter entfernt nach dem Anmeldeschluss ein Team (solange kein Bracket); bezahlt: weiter gesperrt", async () => {
    const { withdrawTeam } = await import("@/server/tournaments");
    const free = await setup({ n: 5, ready: 5, max: 8, deadlineInDays: -1, startInDays: 3 });
    await withdrawTeam(free.org.id, free.t.id, free.caps[4].teamId);
    expect(await teamsOf(free.t.id)).toHaveLength(4);
    const paid = await setup({ n: 5, ready: 5, max: 8, free: false, deadlineInDays: -1, startInDays: 3 });
    await expect(withdrawTeam(paid.org.id, paid.t.id, paid.caps[4].teamId)).rejects.toThrow(/Anmeldeschluss/);
  });
  it("Gratis: nach dem Bracket bekommen die Spieler 'Euer Spielplan steht' (type system), NICHT 'Der Preis steht fest'", async () => {
    const { t, caps } = await setup({ n: 4, ready: 3 });
    await setRosterComplete(caps[3].id, t.id, true);
    expect((await row(t.id)).status).toBe("running");
    const notes = await db.select().from(notifications).where(eq(notifications.userId, caps[0].id));
    const mine = notes.filter((n) => n.body.includes(t.name));
    expect(mine.some((n) => n.title === "Euer Spielplan steht" && n.type === "system")).toBe(true);
    expect(mine.some((n) => n.title === "Der Preis steht fest")).toBe(false);
  });
});
