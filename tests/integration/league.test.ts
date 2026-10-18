import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, notifications, teams } from "@/db/schema";
import { cityChallengeResults, leagues, proApplications, proEvents, sponsors } from "@/db/schema-league";
import { closeCityChallenge, cityChallenge } from "@/server/city-challenge";
import { addTeamToLeague, createLeague, finishLeague, joinLeague, leagueTable, leaveLeague } from "@/server/leagues";
import { applyToProEvent, createProEvent, drawProEvent, withdrawProApplication } from "@/server/pro-events";
import { assignJersey, cleanSponsorUrl, createSponsor, registerClick, setSponsorActive, sponsorsOfTeam } from "@/server/sponsors";
import { berlinMonthRange } from "@/lib/time";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(async () => {
  await db.delete(sponsors).where(sql`${sponsors.name} like 'E2E %'`);
  await db.delete(leagues).where(sql`${leagues.name} like 'E2E %'`);
  await db.delete(proEvents).where(sql`${proEvents.title} like 'E2E %'`);
  await db.execute(sql`delete from city_challenge_results where month = '2001-03'`);
  await cleanup();
});

async function game(home: string, away: string, hs: number, as: number, startsAt = new Date(Date.now() - 86_400_000)) {
  const [m] = await db.insert(matches).values({ homeTeamId: home, awayTeamId: away, startsAt, durationMin: 60, status: "played", visibility: "public", finalizedAt: startsAt }).returning();
  await db.execute(sql`insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values (${m.id}, ${hs}, ${as}, true, true)`);
  return m;
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function trio() {
  const [a, b, c] = await Promise.all([makeUser("la"), makeUser("lb"), makeUser("lc")]);
  const [ta, tb, tc] = [await makeTeam(a.id, "Liga A"), await makeTeam(b.id, "Liga B"), await makeTeam(c.id, "Liga C")];
  return { a, b, c, ta, tb, tc };
}

describe("Ligen", () => {
  it("Regeln beim Anlegen", async () => {
    const admin = await makeUser("ladm", "admin");
    await expect(createLeague(admin.id, { name: "ab", startsOn: day(0), endsOn: day(30), openJoin: true })).rejects.toThrow(/3 bis 80/);
    await expect(createLeague(admin.id, { name: "E2E Liga", startsOn: day(30), endsOn: day(0), openJoin: true })).rejects.toThrow(/Ende liegt vor/);
    await expect(createLeague(admin.id, { name: "E2E Liga", city: "Mars", startsOn: day(0), endsOn: day(30), openJoin: true })).rejects.toThrow(/Stadt/);
  });

  it("Tabelle live aus gespielten Spielen zwischen Teilnehmern; fremde Spiele und Spiele außerhalb zählen nicht", async () => {
    const { a, b, ta, tb, tc } = await trio();
    const admin = await makeUser("ladm2", "admin");
    const league = await createLeague(admin.id, { name: "E2E Saison", city: "Essen", startsOn: day(-10), endsOn: day(10), openJoin: true });

    await joinLeague(a.id, league.id, ta.id);
    await joinLeague(b.id, league.id, tb.id);
    await expect(joinLeague(a.id, league.id, ta.id)).rejects.toThrow(/schon dabei/);
    await expect(joinLeague(b.id, league.id, ta.id)).rejects.toThrow(/Team-Admins/);

    await game(ta.id, tb.id, 3, 1);
    await game(tb.id, ta.id, 2, 2);
    await game(ta.id, tc.id, 9, 0); // tc ist nicht in der Liga
    await game(ta.id, tb.id, 5, 0, new Date(Date.now() - 40 * 86_400_000)); // außerhalb des Zeitraums

    const table = await leagueTable(league.id);
    expect(table.map((r) => r.team_id)).toEqual([ta.id, tb.id]);
    expect(table[0]).toMatchObject({ played: 2, wins: 1, draws: 1, points: 4, gf: 5, ga: 3, gd: 2 });
    expect(table[1]).toMatchObject({ played: 2, losses: 1, draws: 1, points: 1 });

    await leaveLeague(b.id, league.id, tb.id);
    expect((await leagueTable(league.id)).map((r) => r.team_id)).toEqual([ta.id]);
    expect((await leagueTable(league.id))[0].played).toBe(0);
  });

  it("Stadt-Liga nimmt nur Teams aus der Stadt, Saisonende kürt den Meister und benachrichtigt", async () => {
    const { a, b, ta, tb } = await trio();
    const admin = await makeUser("ladm3", "admin");
    const dortmund = await createLeague(admin.id, { name: "E2E Dortmund", city: "Dortmund", startsOn: day(-5), endsOn: day(5), openJoin: false });
    await expect(addTeamToLeague(admin.id, dortmund.id, ta.id)).rejects.toThrow(/Dortmund/);
    await expect(joinLeague(a.id, dortmund.id, ta.id)).rejects.toThrow(/Einladung/);

    const league = await createLeague(admin.id, { name: "E2E Meister", startsOn: day(-5), endsOn: day(5), openJoin: true });
    await addTeamToLeague(admin.id, league.id, ta.id);
    await addTeamToLeague(admin.id, league.id, tb.id);
    expect(await addTeamToLeague(admin.id, league.id, tb.id)).toBe(false);
    await game(tb.id, ta.id, 4, 0);

    const champion = await finishLeague(admin.id, league.id);
    expect(champion?.team_id).toBe(tb.id);
    expect((await db.select().from(leagues).where(eq(leagues.id, league.id)))[0]).toMatchObject({ status: "finished", championTeamId: tb.id });
    const won = await db.select().from(notifications).where(eq(notifications.userId, b.id));
    expect(won.some((n) => n.title === "Liga beendet" && n.body.includes("Meister"))).toBe(true);
    const lost = await db.select().from(notifications).where(eq(notifications.userId, a.id));
    expect(lost.some((n) => n.body.includes("Platz 2"))).toBe(true);
    await expect(finishLeague(admin.id, league.id)).rejects.toThrow(/abgeschlossen/);
  });
});

describe("Stadt-Challenge", () => {
  it("zählt nur Siege gegen Teams anderer Städte im Monat", async () => {
    const x = await makeUser("cx");
    const y = await makeUser("cy");
    const z = await makeUser("cz");
    const [tx, ty, tz] = [await makeTeam(x.id, "Stadt X"), await makeTeam(y.id, "Stadt Y"), await makeTeam(z.id, "Stadt Z")];
    await db.update(teams).set({ city: "Bochum" }).where(eq(teams.id, ty.id));
    await db.update(teams).set({ city: "Bochum" }).where(eq(teams.id, tz.id));
    const when = new Date("2001-03-10T18:00:00Z");
    await game(tx.id, ty.id, 3, 0, when); // Essen schlägt Bochum
    await game(ty.id, tx.id, 1, 2, when); // Essen schlägt Bochum
    await game(tz.id, tx.id, 4, 0, when); // Bochum schlägt Essen
    await game(ty.id, tz.id, 9, 0, when); // beide Bochum: zählt nicht
    const range = berlinMonthRange("2001-03");
    const result = (await cityChallenge(range.from, range.to)).filter((r) => ["Essen", "Bochum"].includes(r.city));
    expect(result).toEqual([
      { city: "Essen", wins: 2, games: 3 },
      { city: "Bochum", wins: 1, games: 3 },
    ]);
  });

  it("Monatsjob schreibt den Vormonat genau einmal fest", async () => {
    await db.execute(sql`delete from city_challenge_results where month = '2001-03'`);
    const first = await closeCityChallenge(new Date("2001-04-01T05:00:00Z"));
    expect(first).toMatchObject({ month: "2001-03", closed: true });
    const rows = await db.select().from(cityChallengeResults).where(eq(cityChallengeResults.month, "2001-03"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.find((r) => r.rank === 1)).toBeTruthy();
    expect(await closeCityChallenge(new Date("2001-04-02T05:00:00Z"))).toMatchObject({ closed: false });
    expect(await db.select().from(cityChallengeResults).where(eq(cityChallengeResults.month, "2001-03"))).toHaveLength(rows.length);
  });
});

describe("Profi-Tag", () => {
  async function setup() {
    const admin = await makeUser("padm", "admin");
    const proAdmin = await makeUser("pro");
    const pro = await makeTeam(proAdmin.id, "Profis");
    return { admin, proAdmin, pro };
  }
  const soon = (h: number) => new Date(Date.now() + h * 3_600_000);

  it("Anlegen verlangt ein verifiziertes Team und sinnvolle Zeiten", async () => {
    const { admin, pro } = await setup();
    const base = { title: "E2E Profi-Tag", proTeamId: pro.id, city: "Essen", startsAt: soon(100), slots: 2, slotMinutes: 60 as const, applyUntil: soon(50) };
    await expect(createProEvent(admin.id, base)).rejects.toThrow(/verifiziert/);
    await db.update(teams).set({ isVerified: true }).where(eq(teams.id, pro.id));
    await expect(createProEvent(admin.id, { ...base, applyUntil: soon(-1) })).rejects.toThrow(/Vergangenheit/);
    await expect(createProEvent(admin.id, { ...base, startsAt: soon(10) })).rejects.toThrow(/nach der Bewerbungsfrist/);
    await expect(createProEvent(admin.id, { ...base, slots: 0 })).rejects.toThrow(/Plätze/);
    expect((await createProEvent(admin.id, base)).status).toBe("open");
  });

  it("Bewerbung, Los mit festem Zufall, Spiele und Benachrichtigungen", async () => {
    const { admin, proAdmin, pro } = await setup();
    await db.update(teams).set({ isVerified: true }).where(eq(teams.id, pro.id));
    const event = await createProEvent(admin.id, { title: "E2E Los", proTeamId: pro.id, city: "Essen", startsAt: soon(100), slots: 2, slotMinutes: 60, applyUntil: soon(50) });

    const users = await Promise.all([makeUser("p1"), makeUser("p2"), makeUser("p3")]);
    const ts = [await makeTeam(users[0].id, "Bew 1"), await makeTeam(users[1].id, "Bew 2"), await makeTeam(users[2].id, "Bew 3")];
    await expect(applyToProEvent(proAdmin.id, event.id, pro.id)).rejects.toThrow(/Profi-Team/);
    await expect(applyToProEvent(users[1].id, event.id, ts[0].id)).rejects.toThrow(/Team-Admins/);
    for (const [i, t] of ts.entries()) await applyToProEvent(users[i].id, event.id, t.id);
    await expect(applyToProEvent(users[0].id, event.id, ts[0].id)).rejects.toThrow(/schon beworben/);

    // Zurückziehen und neu bewerben
    await withdrawProApplication(users[2].id, event.id, ts[2].id);
    await applyToProEvent(users[2].id, event.id, ts[2].id);

    // fester Zufall: immer das erste Element -> Reihenfolge bleibt, die ersten beiden gewinnen
    const winners = await drawProEvent(admin.id, event.id, () => 0);
    expect(winners).toHaveLength(2);
    const apps = await db.select().from(proApplications).where(eq(proApplications.eventId, event.id));
    const selected = apps.filter((a) => a.selected);
    expect(selected).toHaveLength(2);
    const created = await db.select().from(matches).where(sql`${matches.id} in (${sql.join(selected.map((s) => sql`${s.matchId}`), sql`, `)})`);
    expect(created).toHaveLength(2);
    expect(created.every((m) => m.homeTeamId === pro.id && m.visibility === "public")).toBe(true);
    const times = created.map((m) => m.startsAt.getTime()).sort();
    expect(times[1] - times[0]).toBe(60 * 60_000); // Spiele nacheinander
    // Profis sind automatisch Teilnehmer
    const parts = await db.execute(sql`select count(*)::int as n from match_participants where match_id = ${created[0].id} and user_id = ${proAdmin.id}`);
    expect((parts.rows[0] as { n: number }).n).toBe(1);

    // Benachrichtigungen: Gewinner und Verlierer
    const loserApp = apps.find((a) => !a.selected)!;
    const loserIdx = ts.findIndex((t) => t.id === loserApp.teamId);
    const loserNotes = await db.select().from(notifications).where(eq(notifications.userId, users[loserIdx].id));
    expect(loserNotes.some((n) => n.title.includes("nicht gelost"))).toBe(true);
    const winnerIdx = ts.findIndex((t) => t.id === selected[0].teamId);
    expect((await db.select().from(notifications).where(eq(notifications.userId, users[winnerIdx].id))).some((n) => n.title.includes("Profi-Tag"))).toBe(true);

    await expect(drawProEvent(admin.id, event.id)).rejects.toThrow(/schon gelost/);
    await expect(applyToProEvent(users[0].id, event.id, ts[0].id)).rejects.toThrow(/geschlossen/);
  });

  it("ohne Bewerbungen kein Los", async () => {
    const { admin, pro } = await setup();
    await db.update(teams).set({ isVerified: true }).where(eq(teams.id, pro.id));
    const event = await createProEvent(admin.id, { title: "E2E Leer", proTeamId: pro.id, city: "Essen", startsAt: soon(100), slots: 1, slotMinutes: 90, applyUntil: soon(50) });
    await expect(drawProEvent(admin.id, event.id)).rejects.toThrow(/keine Bewerbungen/);
  });
});

describe("Sponsoren", () => {
  it("nur https-Adressen ohne Zugangsdaten", () => {
    expect(cleanSponsorUrl("https://example.com/shop?x=1")).toBe("https://example.com/shop?x=1");
    expect(() => cleanSponsorUrl("http://example.com")).toThrow(/https/);
    expect(() => cleanSponsorUrl("javascript:alert(1)")).toThrow();
    expect(() => cleanSponsorUrl("https://user:pw@example.com")).toThrow(/Zugangsdaten/);
    expect(() => cleanSponsorUrl("kein link")).toThrow(/ungültig/);
  });

  it("Klicks zählen nur bei laufenden Sponsoren, Trikot-Partner am Team", async () => {
    const admin = await makeUser("sadm", "admin");
    const owner = await makeUser("sown");
    const team = await makeTeam(owner.id, "Trikot");
    const s = await createSponsor(admin.id, { name: "E2E Sponsor", url: "https://example.com", kind: "sponsor" });
    const j = await createSponsor(admin.id, { name: "E2E Trikot", url: "https://example.org", kind: "jersey", tagline: "Wir tragen Grün" });

    expect(await registerClick(s.id)).toBe("https://example.com/");
    expect(await registerClick(s.id)).toBe("https://example.com/");
    expect((await db.select().from(sponsors).where(eq(sponsors.id, s.id)))[0].clicks).toBe(2);

    await expect(assignJersey(admin.id, team.id, s.id)).rejects.toThrow(/kein Trikot/);
    await assignJersey(admin.id, team.id, j.id);
    expect((await sponsorsOfTeam(team.id)).map((x) => x.name)).toEqual(["E2E Trikot"]);

    await setSponsorActive(admin.id, s.id, false);
    expect(await registerClick(s.id)).toBeNull();
    expect((await db.select().from(sponsors).where(eq(sponsors.id, s.id)))[0].clicks).toBe(2);
    await setSponsorActive(admin.id, j.id, false);
    expect(await sponsorsOfTeam(team.id)).toHaveLength(0);

    // abgelaufener Zeitraum
    const old = await createSponsor(admin.id, { name: "E2E Alt", url: "https://example.net", kind: "sponsor", startsOn: "2020-01-01", endsOn: "2020-12-31" });
    expect(await registerClick(old.id)).toBeNull();
    await expect(createSponsor(admin.id, { name: "E2E Bad", url: "https://example.net", kind: "sponsor", startsOn: "2020-12-31", endsOn: "2020-01-01" })).rejects.toThrow(/Ende liegt vor/);
  });
});
