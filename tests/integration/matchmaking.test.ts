import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { matchmakingQueue, matchOptions, matchOptionVotes } from "@/db/schema-matchmaking";
import { venues } from "@/db/schema-finance";
import { joinQueue, leaveQueue, runMatchmaker } from "@/server/matchmaking";
import { proposeOption, voteOption, withdrawOption, expireScheduling } from "@/server/scheduling";
import { setReady, setVenue } from "@/server/lobby";
import { cleanup, makeTeam, makeUser } from "./helpers";

beforeAll(async () => {
  await db.update(matchmakingQueue).set({ status: "cancelled" }).where(eq(matchmakingQueue.status, "waiting")); // nur unsere Teams sollen in der Warteschlange sein
});
afterEach(async () => {
  await db.update(matchmakingQueue).set({ status: "cancelled" }).where(eq(matchmakingQueue.status, "waiting"));
});
afterAll(async () => {
  await db.delete(venues).where(sql`${venues.name} like 'E2E %'`);
  await cleanup();
});

const day = (offset: number, hour: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};
const evening = (offset = 3) => [{ from: day(offset, 17), to: day(offset, 21) }];

async function twoTeams() {
  const a = await makeUser("qa");
  const b = await makeUser("qb");
  const [ta, tb] = [await makeTeam(a.id, "Queue A"), await makeTeam(b.id, "Queue B")];
  return { a, b, ta, tb };
}

async function matched() {
  const t = await twoTeams();
  await joinQueue(t.a.id, { teamId: t.ta.id, city: "Essen", durationMin: 60, windows: evening() });
  expect(await joinQueue(t.b.id, { teamId: t.tb.id, city: "Essen", durationMin: 60, windows: evening() })).toBeGreaterThanOrEqual(1);
  const [q] = await db.select().from(matchmakingQueue).where(eq(matchmakingQueue.teamId, t.ta.id));
  const [match] = await db.select().from(matches).where(eq(matches.id, q.matchId!));
  return { ...t, match };
}

describe("Warteschlange", () => {
  it("Eingaben werden geprüft", async () => {
    const { a, ta } = await twoTeams();
    const base = { teamId: ta.id, city: "Essen", durationMin: 60, windows: evening() };
    await expect(joinQueue(a.id, { ...base, city: "Mars" })).rejects.toThrow(/Stadt/);
    await expect(joinQueue(a.id, { ...base, durationMin: 75 })).rejects.toThrow(/60 oder 90/);
    await expect(joinQueue(a.id, { ...base, windows: [] })).rejects.toThrow(/mindestens ein Zeitfenster/);
    await expect(joinQueue(a.id, { ...base, windows: [{ from: day(3, 20), to: day(3, 18) }] })).rejects.toThrow(/endet vor/);
    await expect(joinQueue(a.id, { ...base, windows: [{ from: day(3, 17), to: day(3, 17) }] })).rejects.toThrow(/endet vor/);
    await expect(joinQueue(a.id, { ...base, windows: [{ from: new Date(Date.now() + 3_600_000), to: new Date(Date.now() + 5 * 3_600_000) }] })).rejects.toThrow(/Kein Zeitfenster passt/);
    await expect(joinQueue(a.id, { ...base, windows: [{ from: day(30, 17), to: day(30, 20) }] })).rejects.toThrow(/Tage in der Zukunft/);
    const stranger = await makeUser("stranger");
    await expect(joinQueue(stranger.id, base)).rejects.toThrow(/Team-Admins/);
  });

  it("allein wartet das Team, doppelt geht nicht, Abbrechen funktioniert", async () => {
    const { a, ta } = await twoTeams();
    const base = { teamId: ta.id, city: "Essen", durationMin: 60, windows: evening() };
    expect(await joinQueue(a.id, base)).toBe(0);
    await expect(joinQueue(a.id, base)).rejects.toThrow(/wartet schon/);
    await leaveQueue(a.id, ta.id);
    await expect(leaveQueue(a.id, ta.id)).rejects.toThrow(/wartet nicht/);
    expect(await joinQueue(a.id, base)).toBe(0); // danach wieder möglich
    await leaveQueue(a.id, ta.id);
  });

  it("zwei passende Teams werden sofort gepaart: Spiel mit offener Terminwahl, Vorschläge, Admins in der Lobby, Benachrichtigung", async () => {
    const [venue] = await db.insert(venues).values({ name: "E2E Matchmaking-Halle", city: "Essen", isPartner: true }).returning();
    const { a, b, ta, tb, match } = await matched();
    expect(match).toMatchObject({ status: "lobby", schedulingOpen: true, visibility: "public", durationMin: 60 });
    expect([match.homeTeamId, match.awayTeamId].sort()).toEqual([ta.id, tb.id].sort());
    expect(match.schedulingDeadline!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    const options = await db.select().from(matchOptions).where(eq(matchOptions.matchId, match.id));
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.every((o) => o.proposedByTeam === null)).toBe(true);
    expect(options.some((o) => o.venueId === venue.id)).toBe(true);
    const admins = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(admins.map((p) => p.userId).sort()).toEqual([a.id, b.id].sort());
    for (const u of [a, b]) expect((await db.select().from(notifications).where(eq(notifications.userId, u.id))).some((n) => n.title === "Gegner gefunden")).toBe(true);
    const queue = await db.select().from(matchmakingQueue).where(eq(matchmakingQueue.matchId, match.id));
    expect(queue.every((q) => q.status === "matched")).toBe(true);
  });

  it("zu großer Elo-Abstand: kein Spiel", async () => {
    const t = await twoTeams();
    await db.insert(teamStats).values({ teamId: t.ta.id, elo: 1500 });
    await db.insert(teamStats).values({ teamId: t.tb.id, elo: 900 });
    await joinQueue(t.a.id, { teamId: t.ta.id, city: "Essen", durationMin: 60, windows: evening() });
    expect(await joinQueue(t.b.id, { teamId: t.tb.id, city: "Essen", durationMin: 60, windows: evening() })).toBe(0);
    // nach langer Wartezeit wird der Bereich weit genug (Zeit simuliert)
    const later = new Date(Date.now() + 2 * 3_600_000);
    expect(await runMatchmaker(later)).toBeGreaterThanOrEqual(1);
  });

  it("abgelaufene Einträge werden beendet", async () => {
    const t = await twoTeams();
    await joinQueue(t.a.id, { teamId: t.ta.id, city: "Essen", durationMin: 60, windows: evening() });
    await runMatchmaker(new Date(Date.now() + 49 * 3_600_000));
    expect((await db.select().from(matchmakingQueue).where(eq(matchmakingQueue.teamId, t.ta.id)))[0].status).toBe("expired");
  });
});

describe("Termin und Ort gemeinsam wählen", () => {
  it("beide Teams wählen dieselbe Option: Termin, Ort und Preis stehen fest", async () => {
    const m = await matched();
    const options = await db.select().from(matchOptions).where(eq(matchOptions.matchId, m.match.id));
    const [first, second] = options;

    await expect(voteOption((await makeUser("fremd")).id, m.match.id, first.id)).rejects.toThrow(/Team-Admins/);
    await voteOption(m.a.id, m.match.id, first.id);
    expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].schedulingOpen).toBe(true);
    // Gegner wählt etwas anderes (falls vorhanden), dann ändert Team A seine Stimme: erst bei Gleichheit steht der Termin
    if (second) {
      await voteOption(m.b.id, m.match.id, second.id);
      expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].schedulingOpen).toBe(true);
      await voteOption(m.a.id, m.match.id, second.id);
    } else {
      await voteOption(m.b.id, m.match.id, first.id);
    }
    const locked = (await db.select().from(matches).where(eq(matches.id, m.match.id)))[0];
    const chosen = second ?? first;
    expect(locked.schedulingOpen).toBe(false);
    expect(locked.schedulingDeadline).toBeNull();
    expect(locked.startsAt.getTime()).toBe(chosen.startsAt.getTime());
    expect(locked.priceCents).not.toBeNull();
    for (const u of [m.a, m.b]) expect((await db.select().from(notifications).where(eq(notifications.userId, u.id))).some((n) => n.title === "Termin und Ort stehen fest")).toBe(true);
    // danach keine Änderung mehr
    await expect(voteOption(m.a.id, m.match.id, first.id)).rejects.toThrow(/schon fest/);
  });

  it("eigener Vorschlag: Regeln, automatische Stimme, Rückzug, Obergrenze", async () => {
    const m = await matched();
    const when = day(5, 18);
    await expect(proposeOption(m.a.id, m.match.id, { startsAt: new Date(Date.now() + 3_600_000), venueText: "Halle X" })).rejects.toThrow(/24 Stunden/);
    await expect(proposeOption(m.a.id, m.match.id, { startsAt: when })).rejects.toThrow(/Halle oder gib einen Ort/);
    await expect(proposeOption((await makeUser("o")).id, m.match.id, { startsAt: when, venueText: "Halle X" })).rejects.toThrow(/Team-Admins/);
    await proposeOption(m.a.id, m.match.id, { startsAt: when, venueText: "Sporthalle Nord" });
    await expect(proposeOption(m.a.id, m.match.id, { startsAt: when, venueText: "Sporthalle Nord" })).rejects.toThrow(/gibt es schon/);

    const mine = (await db.select().from(matchOptions).where(eq(matchOptions.matchId, m.match.id))).find((o) => o.venueText === "Sporthalle Nord")!;
    expect(mine.proposedByTeam).toBe(m.ta.id);
    const votes = await db.select().from(matchOptionVotes).where(eq(matchOptionVotes.matchId, m.match.id));
    expect(votes.find((v) => v.teamId === m.ta.id)?.optionId).toBe(mine.id); // eigene Stimme automatisch

    await expect(withdrawOption(m.b.id, m.match.id, mine.id)).rejects.toThrow(/vorschlagende Team/);
    await withdrawOption(m.a.id, m.match.id, mine.id);
    expect(await db.select().from(matchOptionVotes).where(eq(matchOptionVotes.optionId, mine.id))).toHaveLength(0);

    for (let i = 0; i < 4; i++) await proposeOption(m.a.id, m.match.id, { startsAt: day(6 + i, 18), venueText: `Ort ${i}` });
    await expect(proposeOption(m.a.id, m.match.id, { startsAt: day(12, 18), venueText: "Zu viel" })).rejects.toThrow(/höchstens 4/);
  });

  it("Vorschlag des Gegners annehmen: Termin steht, sobald beide dafür sind", async () => {
    const m = await matched();
    await proposeOption(m.b.id, m.match.id, { startsAt: day(7, 19), venueText: "Gegner-Halle" });
    const o = (await db.select().from(matchOptions).where(eq(matchOptions.matchId, m.match.id))).find((x) => x.venueText === "Gegner-Halle")!;
    await voteOption(m.a.id, m.match.id, o.id);
    const after = (await db.select().from(matches).where(eq(matches.id, m.match.id)))[0];
    expect(after.schedulingOpen).toBe(false);
    expect(after.venueText).toBe("Gegner-Halle");
    expect(after.startsAt.getTime()).toBe(o.startsAt.getTime());
  });

  it("solange offen: kein Bereit, kein Ort von Hand; nach der Frist wird abgesagt", async () => {
    const m = await matched();
    await expect(setReady(m.a.id, m.match.id, true)).rejects.toThrow(/gemeinsam wählen/);
    await expect(setVenue(m.a.id, m.match.id, "Irgendwo")).rejects.toThrow(/gemeinsam/);
    expect(await expireScheduling()).toBe(0); // Frist läuft noch
    expect(await expireScheduling(new Date(Date.now() + 25 * 3_600_000))).toBeGreaterThanOrEqual(1);
    const after = (await db.select().from(matches).where(eq(matches.id, m.match.id)))[0];
    expect(after).toMatchObject({ status: "cancelled", schedulingOpen: false });
    expect((await db.select().from(notifications).where(eq(notifications.userId, m.a.id))).some((n) => n.title === "Spiel abgesagt")).toBe(true);
  });
});
