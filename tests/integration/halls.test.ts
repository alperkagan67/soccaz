import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, notifications, teams } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { matchHallRequests, matchOptions, matchVetoHalls } from "@/db/schema-matchmaking";
import { acceptChallenge, challengeTeam } from "@/server/challenges";
import { proposeOption, voteOption } from "@/server/scheduling";
import { advanceVetos, answerHallRequest, pendingHallInquiries } from "@/server/veto";
import { setVenueManager } from "@/server/venues";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(async () => {
  await db.delete(venues).where(sql`${venues.name} like 'E2E Hallenort%'`);
  await cleanup();
});

/** Zwei Teams in "Hallenort" mit zwei Hallen mit Betreiber-Konto und einer ohne; der Termin steht, die Hallen sind angefragt. */
async function agreedDuel() {
  const a = await makeUser("ha");
  const b = await makeUser("hb");
  const manager = await makeUser("hm");
  const ta = await makeTeam(a.id, "Hallen A");
  const tb = await makeTeam(b.id, "Hallen B");
  await db.update(teams).set({ city: "Hallenort" }).where(inArray(teams.id, [ta.id, tb.id]));
  const rows = await db
    .insert(venues)
    .values([1, 2, 3].map((i) => ({ name: `E2E Hallenort ${i} ${manager.id.slice(0, 6)}`, city: "Hallenort", isPartner: i < 3 })))
    .returning();
  await setVenueManager(a.id, rows[0].id, manager.email);
  await setVenueManager(a.id, rows[1].id, manager.email);
  const id = await challengeTeam(a.id, ta.id, tb.id);
  await acceptChallenge(b.id, id);
  await proposeOption(a.id, id, { startsAt: new Date(Date.now() + 5 * 86_400_000) });
  const [opt] = await db.select().from(matchOptions).where(eq(matchOptions.matchId, id));
  await voteOption(b.id, id, opt.id);
  return { a, b, manager, id, rows };
}

describe("Hallen-Anfrage nach dem Termin", () => {
  it("Hallen mit Betreiber müssen bestätigen, das Veto beginnt erst nach allen Antworten, belegte Hallen fliegen raus", async () => {
    const d = await agreedDuel();
    const [m] = await db.select().from(matches).where(eq(matches.id, d.id));
    expect(m).toMatchObject({ vetoStatus: "halls", schedulingOpen: false });
    expect(m.vetoTurnDeadline!.getTime()).toBeGreaterThan(Date.now() + 11 * 3_600_000);
    const reqs = await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, d.id));
    expect(reqs.find((r) => r.venueId === d.rows[0].id)?.status).toBe("pending");
    expect(reqs.find((r) => r.venueId === d.rows[2].id)?.status).toBe("unmanaged");
    expect((await db.select().from(notifications).where(eq(notifications.userId, d.manager.id))).some((n) => n.type === "hall.request" && n.url === "/halle")).toBe(true);
    expect((await pendingHallInquiries(d.manager.id)).map((q) => q.venueId).sort()).toEqual([d.rows[0].id, d.rows[1].id].sort());
    expect(await pendingHallInquiries(d.a.id)).toHaveLength(0);

    // nur der eigene Betreiber darf antworten
    await expect(answerHallRequest(d.a.id, d.id, d.rows[0].id, true)).rejects.toThrow(/nicht zu deinem Konto/);
    await answerHallRequest(d.manager.id, d.id, d.rows[0].id, true);
    await expect(answerHallRequest(d.manager.id, d.id, d.rows[0].id, false)).rejects.toThrow(/schon beantwortet/);
    expect((await db.select().from(matches).where(eq(matches.id, d.id)))[0].vetoStatus).toBe("halls"); // eine Antwort fehlt noch
    await answerHallRequest(d.manager.id, d.id, d.rows[1].id, false); // belegt

    const [after] = await db.select().from(matches).where(eq(matches.id, d.id));
    expect(after.vetoStatus).toBe("running");
    const pool = await db.select().from(matchVetoHalls).where(eq(matchVetoHalls.matchId, d.id));
    expect(pool.some((h) => h.venueId === d.rows[0].id)).toBe(true);
    expect(pool.some((h) => h.venueId === d.rows[1].id)).toBe(false); // belegte Halle steht nicht im Veto
    expect(pool.some((h) => h.venueId === d.rows[2].id)).toBe(true); // Halle ohne Konto bleibt im Rennen
    await expect(answerHallRequest(d.manager.id, d.id, d.rows[0].id, true)).rejects.toThrow(/nicht mehr offen/);
  });

  it("keine Antwort bis zur Frist zählt als belegt", async () => {
    const d = await agreedDuel();
    expect(await advanceVetos()).toBe(0);
    await advanceVetos(new Date(Date.now() + 13 * 3_600_000));
    const reqs = await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, d.id));
    expect(reqs.filter((r) => r.status === "declined" && d.rows.some((v) => v.id === r.venueId)).map((r) => r.venueId).sort()).toEqual([d.rows[0].id, d.rows[1].id].sort());
    expect((await db.select().from(matches).where(eq(matches.id, d.id)))[0].vetoStatus).toBe("running");
  });

  it("ist zu dem Termin keine Halle frei, wählen die Teams einen neuen Termin", async () => {
    const d = await agreedDuel();
    // alle anderen Hallen sperren, damit nur unsere beiden Betreiber-Hallen zur Wahl stehen (danach wieder freigeben)
    const others = (await db.select({ id: venues.id }).from(venues).where(and(eq(venues.active, true), sql`${venues.id} <> all(${sql.raw(`array['${d.rows.map((r) => r.id).join("','")}']::uuid[]`)})`))).map((v) => v.id);
    try {
      await db.update(venues).set({ active: false }).where(inArray(venues.id, [...others, d.rows[2].id]));
      const m2 = await agreedDuelAgain(d);
      await answerHallRequest(d.manager.id, m2, d.rows[0].id, false);
      await answerHallRequest(d.manager.id, m2, d.rows[1].id, false);
      const [m] = await db.select().from(matches).where(eq(matches.id, m2));
      expect(m).toMatchObject({ vetoStatus: "none", schedulingOpen: true });
      expect(await db.select().from(matchOptions).where(eq(matchOptions.matchId, m2))).toHaveLength(0);
      expect(await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, m2))).toHaveLength(0);
      expect((await db.select().from(notifications).where(eq(notifications.userId, d.a.id))).some((n) => n.title === "Keine Halle frei")).toBe(true);
    } finally {
      await db.update(venues).set({ active: true }).where(inArray(venues.id, [...others, d.rows[2].id]));
    }
  });
});

/** Neue Herausforderung zwischen denselben Teams (Hallen sind dann schon gesperrt). */
async function agreedDuelAgain(d: Awaited<ReturnType<typeof agreedDuel>>) {
  const [old] = await db.select().from(matches).where(eq(matches.id, d.id));
  await db.update(matches).set({ status: "cancelled", challengeStatus: "accepted" }).where(eq(matches.id, d.id));
  const id = await challengeTeam(d.a.id, old.homeTeamId, old.awayTeamId);
  await acceptChallenge(d.b.id, id);
  await proposeOption(d.a.id, id, { startsAt: new Date(Date.now() + 6 * 86_400_000) });
  const [opt] = await db.select().from(matchOptions).where(eq(matchOptions.matchId, id));
  await voteOption(d.b.id, id, opt.id);
  expect((await db.select().from(matches).where(eq(matches.id, id)))[0].vetoStatus).toBe("halls");
  return id;
}
