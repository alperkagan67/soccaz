import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matchRequests, matches, notifications } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { acceptChallenge, challengeTeam, convertLegacyChallenges, declineChallenge, pendingChallengeMatches } from "@/server/challenges";
import { expireScheduling, proposeOption } from "@/server/scheduling";
import { cleanup, makeTeam, makeUser } from "./helpers";

beforeAll(async () => {
  await db.delete(venues).where(sql`${venues.name} like 'E2E Duell-Halle%'`);
  await db.insert(venues).values([1, 2, 3].map((i) => ({ name: `E2E Duell-Halle ${i}`, city: "Essen" })));
});
afterAll(async () => {
  await db.delete(venues).where(sql`${venues.name} like 'E2E Duell-Halle%'`);
  await cleanup();
});

async function duel() {
  const a = await makeUser("ca");
  const b = await makeUser("cb");
  return { a, b, ta: await makeTeam(a.id, "Duell A"), tb: await makeTeam(b.id, "Duell B") };
}

describe("Direkt-Herausforderung", () => {
  it("ein Klick erzeugt sofort die Lobby mit beiden Kadern; das Zielteam wird benachrichtigt", async () => {
    const d = await duel();
    const stranger = await makeUser("stranger");
    await expect(challengeTeam(stranger.id, d.ta.id, d.tb.id)).rejects.toThrow(/Team-Admins/);
    await expect(challengeTeam(d.a.id, d.ta.id, d.ta.id)).rejects.toThrow(/eigenes Team/);

    const id = await challengeTeam(d.a.id, d.ta.id, d.tb.id);
    const [m] = await db.select().from(matches).where(eq(matches.id, id));
    expect(m).toMatchObject({ homeTeamId: d.ta.id, awayTeamId: d.tb.id, status: "lobby", visibility: "public", challengeStatus: "pending", schedulingOpen: true, vetoStatus: "none" });
    expect(m.number).toBeGreaterThan(1000);
    const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, id));
    expect(parts.map((p) => p.userId).sort()).toEqual([d.a.id, d.b.id].sort());
    expect((await db.select().from(notifications).where(eq(notifications.userId, d.b.id))).some((n) => n.title === "Ihr wurdet herausgefordert" && n.url === `/lobby/${id}`)).toBe(true);
    // nur eine offene Herausforderung pro Paar, in beide Richtungen
    await expect(challengeTeam(d.a.id, d.ta.id, d.tb.id)).rejects.toThrow(/schon eine Herausforderung/);
    await expect(challengeTeam(d.b.id, d.tb.id, d.ta.id)).rejects.toThrow(/schon eine Herausforderung/);
    expect((await pendingChallengeMatches(d.b.id)).map((x) => x.id)).toContain(id);
  });

  it("solange nicht angenommen: keine Terminwahl; nur das Zielteam nimmt an, dann beginnt das Hallen-Veto", async () => {
    const d = await duel();
    const id = await challengeTeam(d.a.id, d.ta.id, d.tb.id);
    await expect(proposeOption(d.a.id, id, { startsAt: new Date(Date.now() + 5 * 86_400_000), venueText: "X" })).rejects.toThrow(/herausgeforderte Team annehmen/);
    await expect(acceptChallenge(d.a.id, id)).rejects.toThrow(/herausgeforderten Teams/); // der Absender kann nicht selbst annehmen
    await expect(acceptChallenge((await makeUser("fremd")).id, id)).rejects.toThrow(/herausgeforderten Teams/);

    await acceptChallenge(d.b.id, id);
    const [m] = await db.select().from(matches).where(eq(matches.id, id));
    expect(m).toMatchObject({ challengeStatus: "accepted", vetoStatus: "running" });
    expect([d.ta.id, d.tb.id]).toContain(m.vetoTurnTeamId);
    expect((await db.select().from(notifications).where(eq(notifications.userId, d.a.id))).some((n) => n.title === "Herausforderung angenommen")).toBe(true);
    await expect(acceptChallenge(d.b.id, id)).rejects.toThrow(/nicht mehr offen/);
  });

  it("Ablehnen und Zurückziehen sagen die Lobby ab", async () => {
    const d = await duel();
    const declined = await challengeTeam(d.a.id, d.ta.id, d.tb.id);
    await declineChallenge(d.b.id, declined);
    expect((await db.select().from(matches).where(eq(matches.id, declined)))[0]).toMatchObject({ status: "cancelled", schedulingOpen: false });
    expect((await db.select().from(notifications).where(eq(notifications.userId, d.a.id))).some((n) => n.body.includes("abgelehnt"))).toBe(true);

    const withdrawn = await challengeTeam(d.a.id, d.ta.id, d.tb.id); // nach der Absage ist eine neue möglich
    await declineChallenge(d.a.id, withdrawn);
    expect((await db.select().from(matches).where(eq(matches.id, withdrawn)))[0].status).toBe("cancelled");
    expect((await db.select().from(notifications).where(eq(notifications.userId, d.b.id))).some((n) => n.body.includes("zurückgezogen"))).toBe(true);
    await expect(declineChallenge(d.a.id, withdrawn)).rejects.toThrow(/nicht mehr offen/);
  });

  it("ohne Antwort innerhalb von 48 Stunden wird die Lobby abgesagt", async () => {
    const d = await duel();
    const id = await challengeTeam(d.a.id, d.ta.id, d.tb.id);
    await db.update(matches).set({ schedulingDeadline: new Date(Date.now() - 1000) }).where(eq(matches.id, id)); // nur die eigene Lobby ablaufen lassen, nicht echte Daten
    expect(await expireScheduling()).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(matches).where(eq(matches.id, id)))[0].status).toBe("cancelled");
    expect((await db.select().from(notifications).where(eq(notifications.userId, d.a.id))).some((n) => n.body.includes("nicht rechtzeitig angenommen"))).toBe(true);
  });

  it("alte Herausforderungen (Spielsuche mit Zielteam) werden zur Lobby mit gleicher Nummer, einmalig", async () => {
    const d = await duel();
    const [r] = await db.insert(matchRequests).values({ teamId: d.ta.id, targetTeamId: d.tb.id, city: "Essen", startsAt: new Date(Date.now() + 5 * 86_400_000) }).returning();
    expect(await convertLegacyChallenges()).toBeGreaterThanOrEqual(1);
    const [m] = await db.select().from(matches).where(eq(matches.requestId, r.id));
    expect(m).toMatchObject({ number: r.number, homeTeamId: d.ta.id, awayTeamId: d.tb.id, challengeStatus: "pending", visibility: "public" });
    expect((await db.select().from(matchRequests).where(eq(matchRequests.id, r.id)))[0].status).toBe("matched");
    expect(await convertLegacyChallenges()).toBe(0);
    await acceptChallenge(d.b.id, m.id);
    expect((await db.select().from(matches).where(eq(matches.id, m.id)))[0].vetoStatus).toBe("running");
  });
});
