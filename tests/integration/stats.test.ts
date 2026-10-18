import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchEvents, matchParticipants, matches, notifications } from "@/db/schema";
import { lateCancels, matchFinalizations, playerStats, ratingHistory, teamStats, userBadges, userReliability } from "@/db/schema-community";
import { eloDelta } from "@/lib/elo";
import { leaveLobby } from "@/server/lobby";
import { decideResult } from "@/server/results";
import { applyMatchStats, castMvpVote, closeMvpVoting, markNoShow } from "@/server/stats";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

afterAll(cleanup);

const statsOf = async (userId: string) => (await db.select().from(playerStats).where(eq(playerStats.userId, userId)))[0];
const badgesOf = async (userId: string) => (await db.select().from(userBadges).where(eq(userBadges.userId, userId))).map((b) => b.code).sort();
const reliabilityOf = async (userId: string) => (await db.select().from(userReliability).where(eq(userReliability.userId, userId)))[0];

/** Ein gespieltes Spiel 3:1 für Heim mit Torschützen, Karte und endgültigem Ergebnis. */
async function playedMatch() {
  const m = await makeMatch({ hoursAhead: 72 });
  const star = await addPlayer(m.match.id, m.home.id, "star");
  const mate = await addPlayer(m.match.id, m.home.id, "mate");
  const rival = await addPlayer(m.match.id, m.away.id, "rival");
  await db.update(matches).set({ startsAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(matches.id, m.match.id));
  const goal = (userId: string, teamId: string, minute: number) => db.insert(matchEvents).values({ matchId: m.match.id, type: "goal", userId, teamId, minute });
  for (const min of [5, 9, 20]) await goal(star.id, m.home.id, min);
  await goal(rival.id, m.away.id, 30);
  await db.insert(matchEvents).values({ matchId: m.match.id, type: "yellow_card", userId: mate.id, teamId: m.home.id, minute: 12 });
  const admin = await makeUser("adm", "admin");
  await decideResult(admin.id, m.match.id, 3, 1, "Testergebnis");
  return { ...m, star, mate, rival, admin };
}

describe("Statistik nach dem Spiel", () => {
  let m: Awaited<ReturnType<typeof playedMatch>>;

  it("Spiel wird gespielt, eingerechnet und markiert", async () => {
    m = await playedMatch();
    const after = await reloadMatch(m.match.id);
    expect(after.status).toBe("played");
    expect(after.finalizedAt).not.toBeNull();
    expect(await db.select().from(matchFinalizations).where(eq(matchFinalizations.matchId, m.match.id))).toHaveLength(1);
  });

  it("Team-Statistik und Elo (gleich stark, 3:1 gleich +27 und −27)", async () => {
    const [home] = await db.select().from(teamStats).where(eq(teamStats.teamId, m.home.id));
    const [away] = await db.select().from(teamStats).where(eq(teamStats.teamId, m.away.id));
    expect(eloDelta(1000, 1000, 3, 1)).toBe(27);
    expect(home).toMatchObject({ matches: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, elo: 1027 });
    expect(away).toMatchObject({ matches: 1, wins: 0, losses: 1, goalsFor: 1, goalsAgainst: 3, elo: 973 });
    const hist = await db.select().from(ratingHistory).where(and(eq(ratingHistory.matchId, m.match.id), eq(ratingHistory.kind, "team")));
    expect(hist.map((h) => h.eloAfter - h.eloBefore).sort((a, b) => a - b)).toEqual([-27, 27]);
  });

  it("Spieler-Statistik: Tore, Siege, Karten, Serien, Elo", async () => {
    const star = await statsOf(m.star.id);
    expect(star).toMatchObject({ matches: 1, wins: 1, goals: 3, cleanStreak: 1, winStreak: 1 });
    expect(star.elo).toBeGreaterThan(1000);
    const mate = await statsOf(m.mate.id);
    expect(mate).toMatchObject({ matches: 1, wins: 1, goals: 0, yellowCards: 1, cleanStreak: 0 });
    const rival = await statsOf(m.rival.id);
    expect(rival).toMatchObject({ matches: 1, wins: 0, losses: 1, goals: 1, winStreak: 0 });
    expect(rival.elo).toBeLessThan(1000);
  });

  it("Abzeichen: Debüt, erstes Tor, Hattrick; Benachrichtigung", async () => {
    expect(await badgesOf(m.star.id)).toEqual(["debut", "first_goal", "hattrick"]);
    expect(await badgesOf(m.mate.id)).toEqual(["debut"]);
    expect(await badgesOf(m.rival.id)).toEqual(["debut", "first_goal"]);
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, m.star.id), eq(notifications.title, "Neues Abzeichen")));
    expect(notes).toHaveLength(3);
  });

  it("Zuverlässigkeit: Teilnahme wird gezählt", async () => {
    expect(await reliabilityOf(m.star.id)).toMatchObject({ attended: 1, noShows: 0, lateCancels: 0 });
  });

  it("zweite Einrechnung ändert nichts (genau einmal pro Spiel)", async () => {
    await db.transaction((tx) => applyMatchStats(tx, m.match.id));
    expect((await statsOf(m.star.id)).matches).toBe(1);
    const [home] = await db.select().from(teamStats).where(eq(teamStats.teamId, m.home.id));
    expect(home.matches).toBe(1);
    expect(home.elo).toBe(1027);
  });

  it("nicht erschienen: nur Team-Admin des Spielers, nicht für sich selbst, reversibel", async () => {
    // rival gehört zum Gast-Team, dessen Admin ist adminB
    await expect(markNoShow(m.adminA.id, m.match.id, m.rival.id, true)).rejects.toThrow(/Team-Admins/);
    await expect(markNoShow(m.adminB.id, m.match.id, m.adminB.id, true)).rejects.toThrow(/selbst/);
    await markNoShow(m.adminB.id, m.match.id, m.rival.id, true);
    expect(await reliabilityOf(m.rival.id)).toMatchObject({ attended: 0, noShows: 1 });
    expect((await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, m.rival.id))))[0].noShow).toBe(true);
    await markNoShow(m.adminB.id, m.match.id, m.rival.id, true); // doppelt: keine zweite Zählung
    expect(await reliabilityOf(m.rival.id)).toMatchObject({ attended: 0, noShows: 1 });
    await markNoShow(m.adminB.id, m.match.id, m.rival.id, false);
    expect(await reliabilityOf(m.rival.id)).toMatchObject({ attended: 1, noShows: 0 });
    // Plattform-Admin darf immer
    await markNoShow(m.admin.id, m.match.id, m.rival.id, true);
    await markNoShow(m.admin.id, m.match.id, m.rival.id, false);
  });
});

describe("Spieler des Spiels", () => {
  it("Abstimmung, Regeln, eindeutiger Sieger bekommt Titel und Abzeichen", async () => {
    const m = await playedMatch();
    const outsider = await makeUser("outsider");
    await expect(castMvpVote(m.star.id, m.match.id, m.star.id)).rejects.toThrow(/dich selbst/);
    await expect(castMvpVote(outsider.id, m.match.id, m.star.id)).rejects.toThrow(/Mitspieler/);
    await expect(castMvpVote(m.mate.id, m.match.id, outsider.id)).rejects.toThrow(/nicht zur Wahl/);

    await castMvpVote(m.mate.id, m.match.id, m.star.id);
    await castMvpVote(m.rival.id, m.match.id, m.star.id);
    await castMvpVote(m.adminA.id, m.match.id, m.mate.id);
    await castMvpVote(m.adminA.id, m.match.id, m.star.id); // Stimme ändern ersetzt die alte

    // Frist läuft noch: nichts passiert
    expect(await closeMvpVoting()).toBe(0);
    // nach 25 Stunden
    const closed = await closeMvpVoting(new Date(Date.now() + 25 * 3_600_000));
    expect(closed).toBeGreaterThanOrEqual(1);
    const after = await reloadMatch(m.match.id);
    expect(after.mvpUserId).toBe(m.star.id);
    expect(after.mvpClosedAt).not.toBeNull();
    expect((await statsOf(m.star.id)).mvps).toBe(1);
    expect(await badgesOf(m.star.id)).toContain("mvp_1");
    // beendet: keine Stimme mehr, nichts doppelt
    await expect(castMvpVote(m.mate.id, m.match.id, m.star.id)).rejects.toThrow(/beendet/);
    expect(await closeMvpVoting(new Date(Date.now() + 26 * 3_600_000))).toBe(0);
    expect((await statsOf(m.star.id)).mvps).toBe(1);
  });

  it("Gleichstand ergibt keinen Sieger", async () => {
    const m = await playedMatch();
    await castMvpVote(m.mate.id, m.match.id, m.star.id);
    await castMvpVote(m.rival.id, m.match.id, m.mate.id);
    await closeMvpVoting(new Date(Date.now() + 25 * 3_600_000));
    const after = await reloadMatch(m.match.id);
    expect(after.mvpUserId).toBeNull();
    expect(after.mvpClosedAt).not.toBeNull();
  });
});

describe("Späte Abmeldung", () => {
  it("bereit und weniger als 24 Stunden vorher abgemeldet zählt gegen die Zuverlässigkeit", async () => {
    const m = await makeMatch({ hoursAhead: 10 });
    const late = await addPlayer(m.match.id, m.home.id, "late");
    await db.update(matchParticipants).set({ readyAt: new Date() }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, late.id)));
    await leaveLobby(late.id, m.match.id);
    expect(await reliabilityOf(late.id)).toMatchObject({ lateCancels: 1 });
    expect(await db.select().from(lateCancels).where(eq(lateCancels.userId, late.id))).toHaveLength(1);
  });

  it("rechtzeitig oder ohne Bereit-Status zählt nicht", async () => {
    const early = await makeMatch({ hoursAhead: 72 });
    const p1 = await addPlayer(early.match.id, early.home.id, "early");
    await db.update(matchParticipants).set({ readyAt: new Date() }).where(and(eq(matchParticipants.matchId, early.match.id), eq(matchParticipants.userId, p1.id)));
    await leaveLobby(p1.id, early.match.id);
    expect(await reliabilityOf(p1.id)).toBeUndefined();

    const notReady = await makeMatch({ hoursAhead: 10 });
    const p2 = await addPlayer(notReady.match.id, notReady.home.id, "unready");
    await leaveLobby(p2.id, notReady.match.id);
    expect(await reliabilityOf(p2.id)).toBeUndefined();
  });
});
