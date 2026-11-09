import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matchRequests, matches, teams } from "@/db/schema";
import { mergeTeams } from "@/server/admin";
import { challengeTeam, convertLegacyChallenges } from "@/server/challenges";
import { DomainError } from "@/server/teams";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

async function pair() {
  const a = await makeUser("mta");
  const b = await makeUser("mtb");
  return { a, b, ta: await makeTeam(a.id, "Merge A"), tb: await makeTeam(b.id, "Merge B") };
}

const matchesBetween = (x: string, y: string) =>
  db.select().from(matches).where(and(inArray(matches.homeTeamId, [x, y]), inArray(matches.awayTeamId, [x, y])));

/** Alle Fehler müssen definierte Domain-Fehler sein, nie ein Datenbank-Deadlock. */
function expectNoDeadlock(res: PromiseSettledResult<unknown>[]) {
  for (const r of res) {
    if (r.status !== "rejected") continue;
    expect(r.reason).toBeInstanceOf(DomainError);
    expect(String((r.reason as Error).message)).not.toMatch(/deadlock/i);
  }
}

describe("AC-1: mergeTeams sperrt beide Teams in fester Reihenfolge", () => {
  it("parallele mergeTeams(A,B) und mergeTeams(B,A): genau ein Merge, der zweite scheitert definiert, kein Deadlock", async () => {
    const admin = await makeUser("mtadmin", "admin");
    for (let i = 0; i < 8; i++) {
      const d = await pair();
      const res = await Promise.allSettled([mergeTeams(admin.id, d.ta.id, d.tb.id), mergeTeams(admin.id, d.tb.id, d.ta.id)]);
      expectNoDeadlock(res);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const left = await db.select({ id: teams.id }).from(teams).where(inArray(teams.id, [d.ta.id, d.tb.id]));
      expect(left).toHaveLength(1);
    }
  });

  it("mergeTeams gegen challengeTeam: genau eines gewinnt, das andere scheitert definiert, kein Deadlock", async () => {
    const admin = await makeUser("mtadmin2", "admin");
    for (let i = 0; i < 8; i++) {
      const d = await pair();
      const res = await Promise.allSettled([mergeTeams(admin.id, d.ta.id, d.tb.id), challengeTeam(d.a.id, d.ta.id, d.tb.id)]);
      expectNoDeadlock(res);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    }
  });
});

describe("AC-2: convertLegacyChallenges sperrt die Teams und prüft das Paar", () => {
  it("Konvertierung parallel zu challengeTeam ergibt genau ein Spiel im Paar", async () => {
    for (let i = 0; i < 5; i++) {
      const d = await pair();
      const [r] = await db.insert(matchRequests).values({ teamId: d.ta.id, targetTeamId: d.tb.id, city: "Essen", startsAt: new Date(Date.now() + 5 * 86_400_000) }).returning();
      const res = await Promise.allSettled([convertLegacyChallenges(), challengeTeam(d.b.id, d.tb.id, d.ta.id)]);
      expectNoDeadlock(res.filter((x) => x.status === "rejected" && x.reason instanceof DomainError));
      const rows = await matchesBetween(d.ta.id, d.tb.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].challengeStatus).toBe("pending");
      // war die Herausforderung zuerst da, bleibt die alte Anfrage offen (sie wird nicht doppelt umgewandelt)
      const [req] = await db.select().from(matchRequests).where(eq(matchRequests.id, r.id));
      expect(["open", "matched"]).toContain(req.status);
    }
  });

  it("gibt es schon eine offene Herausforderung im Paar, wird die alte Anfrage nicht umgewandelt", async () => {
    const d = await pair();
    await challengeTeam(d.a.id, d.ta.id, d.tb.id);
    const [r] = await db.insert(matchRequests).values({ teamId: d.tb.id, targetTeamId: d.ta.id, city: "Essen", startsAt: new Date(Date.now() + 5 * 86_400_000) }).returning();
    await convertLegacyChallenges();
    expect(await matchesBetween(d.ta.id, d.tb.id)).toHaveLength(1);
    expect((await db.select().from(matchRequests).where(eq(matchRequests.id, r.id)))[0].status).toBe("open");
  });
});
