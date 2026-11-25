import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, teamMembers } from "@/db/schema";
import { tournaments, tournamentMatches } from "@/db/schema-league";
import { zahlungsWorte } from "@/lib/zahlungen-aus";
import { cancelTournament, closeWithJoinedTeams, createTournament, joinAsPlayer, notifyFreeTournamentReminders, notifyRegistrationDeadlines, registerTeam, setOrganizer, setRosterComplete, withdrawTeam } from "@/server/tournaments";
import { decideResult } from "@/server/results";
import { setSetting } from "@/server/settings";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// GESAMT-Test Mitteilungen (und damit Mails: der Versand schickt Titel und Text der Mitteilung): Bei Zahlungen AUS steht in KEINER Mitteilung eines Gratis-Turniers ein Zahlungswort (zahlungsWorte),
// über den ganzen Ablauf: Anmeldung, Team zurückziehen, vollzählig, Spielplan, Erinnerung, Anmeldeschluss, Schließen mit weniger Teams, Ergebnis, Absage.
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const DAY = 86_400_000;

async function gratisTurnier(name: string, maxTeams: number) {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  const org = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, org.id, true);
  const T0 = Date.now();
  const t = await createTournament(org.id, { name, city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams, durationMin: 120, hourlyCents: 0 } as Parameters<typeof createTournament>[1]);
  await db.update(tournaments).set({ totalCents: 0, hourlyCents: 0 }).where(eq(tournaments.id, t.id));
  return { t, org, admin };
}

async function team(tid: string, volllzaehlig: boolean) {
  const captain = await makeUser("cap");
  const tm = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, tm.id, await tokenOf(tid));
  for (let i = 1; i < 5; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: tm.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, tm.id);
  }
  if (volllzaehlig) await setRosterComplete(captain.id, tid, true);
  return { captain, team: tm };
}

/** Alle Mitteilungen der beteiligten Personen (Veranstalter, Admin, Captains, Spieler): Titel und Text müssen frei von Zahlungswörtern sein. */
async function alleTexte(userIds: string[]) {
  const rows = await db.select().from(notifications).where(inArray(notifications.userId, userIds));
  return rows.map((r) => ({ type: r.type, title: r.title, body: r.body ?? "", worte: zahlungsWorte(`${r.title} ${r.body ?? ""}`) }));
}

describe("Zahlungen AUS: Mitteilungen im Gratis-Turnier ohne Zahlungswörter", () => {
  it("voller Ablauf: Anmeldung, Zurückziehen, vollzählig, Spielplan, Ergebnis, Turnierende", async () => {
    const { t, org, admin } = await gratisTurnier("Texte-Cup", 4);
    const extra = await team(t.id, false);
    await withdrawTeam(extra.captain.id, t.id, extra.team.id); // Team zieht zurück
    const teams = [];
    for (let i = 0; i < 4; i++) teams.push(await team(t.id, true)); // das letzte vollzählige Team löst "Euer Spielplan steht" und den Spielplan aus
    const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
    expect(rows.length).toBeGreaterThan(0);
    const first = rows.find((r) => r.matchId && r.teamA && r.teamB)!;
    await decideResult(org.id, first.matchId!, 2, 1, "Test: Ergebnis vom Veranstalter");
    const ids = [org.id, admin.id, extra.captain.id, ...teams.map((x) => x.captain.id)];
    const texte = await alleTexte(ids);
    expect(texte.length).toBeGreaterThan(0);
    expect(texte.filter((x) => x.worte.length), JSON.stringify(texte.filter((x) => x.worte))).toEqual([]);
    expect(texte.map((x) => x.title)).toContain("Euer Spielplan steht");
  });

  it("Erinnerung 24 h vor dem Start, Anmeldeschluss, Schließen mit weniger Teams (zwei Teams nicht dabei), Absage", async () => {
    const { t, org } = await gratisTurnier("Texte-Cup 2", 8);
    const bereit = [];
    for (let i = 0; i < 4; i++) bereit.push(await team(t.id, true));
    const offen = [await team(t.id, false), await team(t.id, false)];
    await db.update(tournaments).set({ startsAt: new Date(Date.now() + 20 * 3_600_000), registrationDeadline: new Date(Date.now() - 3_600_000) }).where(eq(tournaments.id, t.id));
    await notifyFreeTournamentReminders(new Date());
    await notifyRegistrationDeadlines(new Date());
    await closeWithJoinedTeams(org.id, t.id);
    const abgesagt = await gratisTurnier("Texte-Cup 3", 4);
    const c = await team(abgesagt.t.id, true);
    await cancelTournament(abgesagt.org.id, abgesagt.t.id);
    const ids = [org.id, ...bereit.map((x) => x.captain.id), ...offen.map((x) => x.captain.id), abgesagt.org.id, c.captain.id];
    const texte = await alleTexte(ids);
    expect(texte.length).toBeGreaterThan(0);
    const funde = texte.filter((x) => x.worte.length > 0);
    expect(funde, JSON.stringify(funde)).toEqual([]);
    const titel = texte.map((x) => x.title);
    expect(titel).toContain("Euer Team ist nicht dabei");
  });
});
