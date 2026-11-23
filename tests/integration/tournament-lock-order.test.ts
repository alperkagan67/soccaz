import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tournamentMatches, tournamentPlayers, tournaments } from "@/db/schema-league";
import { deleteAccount } from "@/server/account";
import { auditLog, users } from "@/db/schema";
import { cancelTournament, TournamentBusyError } from "@/server/tournaments";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// 012-Rest PR C (Backlog 144): Sperrreihenfolge Turnier -> Spiel. Deterministisch mit einer ROHEN zweiten Verbindung als Barriere (kein Warten auf Zeit): vor der Aenderung endete jede dieser Abfolgen in
// einem Deadlock (40P01); jetzt wartet die Absage nie unter der Turniersperre (NOWAIT, Wiederholung, dann TournamentBusyError), und die Kontoloeschung sperrt Turniere vor Spielen.
afterAll(cleanup);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

async function fixture(status: "running" | "cancelled" = "running") {
  const org = await makeUser("org");
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const player = await addPlayer(m.match.id, m.home.id, "tp");
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id, name: `Lock-Cup ${Date.now().toString(36)}`, city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: 2, totalCents: 0, hourlyCents: 0, durationMin: 60,
      status, registrationDeadline: new Date(Date.now() + 4 * DAY), startsAt: new Date(Date.now() + 6 * DAY), isPrivate: false, bracketGeneratedAt: new Date(),
    } as typeof tournaments.$inferInsert)
    .returning();
  await db.insert(tournamentMatches).values({ tournamentId: t.id, stage: "ko:2", round: 1, slot: 0, teamA: m.home.id, teamB: m.away.id, matchId: m.match.id });
  await db.insert(tournamentPlayers).values({ tournamentId: t.id, userId: player.id, teamId: m.home.id });
  return { org, m, player, t };
}
async function raw() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}
const is40P01 = (e: unknown) => (e as { code?: string })?.code === "40P01" || (e as { cause?: { code?: string } })?.cause?.code === "40P01";

describe("Sperrreihenfolge Turnier -> Spiel", () => {
  it("R-T284 N1: Konto loeschen x Ergebnis-Finalizer im LAUFENDEN Turnier: kein Deadlock; das Loeschen wird abgelehnt, ohne ein Spiel zu sperren", async () => {
    const { player, m, t } = await fixture("running");
    const f = await raw();
    try {
      await f.query("begin");
      await f.query("select id from matches where id = $1 for update", [m.match.id]); // wie der Finalizer: das Spiel ist schon gesperrt
      const del = deleteAccount(player.id).then(() => "ok" as const, (e: unknown) => e);
      await sleep(100);
      let deadlock = false;
      try {
        await f.query("select id from tournaments where id = $1 for update", [t.id]); // der Finalizer will das Turnier
      } catch (e) {
        deadlock = is40P01(e);
        if (!deadlock) throw e;
      }
      await f.query("commit").catch(() => {});
      const res = await del;
      expect(deadlock).toBe(false);
      expect(is40P01(res)).toBe(false);
      expect((res as Error).message).toMatch(/Turnier/);
      expect(res).not.toBeInstanceOf(TournamentBusyError); // fachliche Ablehnung VOR den Spielen, kein Warten
    } finally {
      await f.query("rollback").catch(() => {});
      await f.end();
    }
  });

  it("R-T284 N1: Konto loeschen x Finalizer bei einem ABGESAGTEN Turnier (Turnierspiel offen): NOWAIT statt Warten, kein Deadlock, Konto bleibt unveraendert", async () => {
    const { player, m, t } = await fixture("cancelled");
    const f = await raw();
    try {
      await f.query("begin");
      await f.query("select id from matches where id = $1 for update", [m.match.id]);
      const del = deleteAccount(player.id).then(() => "ok" as const, (e: unknown) => e);
      await sleep(100);
      let deadlock = false;
      try {
        await f.query("select id from tournaments where id = $1 for update", [t.id]);
      } catch (e) {
        deadlock = is40P01(e);
        if (!deadlock) throw e;
      }
      await f.query("commit").catch(() => {});
      const res = await del;
      expect(deadlock).toBe(false);
      expect(is40P01(res)).toBe(false);
      expect(res).toBeInstanceOf(TournamentBusyError);
    } finally {
      await f.query("rollback").catch(() => {});
      await f.end();
    }
    expect((await db.select({ email: users.email }).from(users).where(eq(users.id, player.id)))[0].email).toContain("@test.local"); // nicht anonymisiert
  });

  it("R-T284 K2: das Protokoll tournament.cancel_busy steht NACH dem Rollback (ohne Personendaten)", async () => {
    const { org, m, t } = await fixture("running");
    const f = await raw();
    try {
      await f.query("begin");
      await f.query("select id from matches where id = $1 for update", [m.match.id]);
      const res = await cancelTournament(org.id, t.id).then(() => "ok" as const, (e: unknown) => e);
      expect(res).toBeInstanceOf(TournamentBusyError);
    } finally {
      await f.query("rollback").catch(() => {});
      await f.end();
    }
    const rows = await db.select().from(auditLog).where(and(eq(auditLog.action, "tournament.cancel_busy"), eq(auditLog.entityId, t.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeNull();
    expect(rows[0].after).toBeNull();
  });

  it.each([1, 2, 3])("Ergebnis-Finalizer (haelt das Spiel) x Absage (Lauf %s): kein Deadlock; die Absage meldet 'bitte gleich noch einmal', danach gelingt sie", async () => {
    const { org, m, t } = await fixture();
    const f = await raw();
    try {
      await f.query("begin");
      await f.query("select id from matches where id = $1 for update", [m.match.id]); // wie der Finalizer: das Spiel ist schon gesperrt
      const cancel = cancelTournament(org.id, t.id).then(() => "ok" as const, (e: unknown) => e); // haelt das Turnier, braucht die Spiele
      await sleep(100);
      let deadlock = false;
      try {
        await f.query("select id from tournaments where id = $1 for update", [t.id]); // der Finalizer will das Turnier: alt = Zyklus, neu = wartet nur bis die Absage aufgibt
      } catch (e) {
        deadlock = is40P01(e);
        if (!deadlock) throw e;
      }
      await f.query("commit").catch(() => {});
      const res = await cancel;
      expect(deadlock).toBe(false);
      expect(is40P01(res)).toBe(false);
      expect(res).toBeInstanceOf(TournamentBusyError);
    } finally {
      await f.query("rollback").catch(() => {});
      await f.end();
    }
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe("running"); // nichts halb abgesagt
    await cancelTournament(org.id, t.id); // ohne Konkurrenz
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe("cancelled");
  });

  it.each([1, 2, 3])("Konto loeschen x Absage (Lauf %s): kein Deadlock; das Loeschen wird fachlich abgelehnt (laufendes Turnier)", async () => {
    const { player, m, t } = await fixture();
    const x = await raw();
    try {
      await x.query("begin");
      await x.query("select id from tournaments where id = $1 for update", [t.id]); // wie die Absage: das Turnier ist gesperrt
      const del = deleteAccount(player.id).then(() => "ok" as const, (e: unknown) => e);
      await sleep(150);
      let deadlock = false;
      try {
        await x.query("select id from matches where id = $1 for update", [m.match.id]); // die Absage will die Spiele: alt = Zyklus (das Loeschen hielt schon das Spiel), neu = frei
      } catch (e) {
        deadlock = is40P01(e);
        if (!deadlock) throw e;
      }
      await x.query("commit").catch(() => {});
      const res = await del;
      expect(deadlock).toBe(false);
      expect(is40P01(res)).toBe(false);
      expect(res).toBeInstanceOf(Error);
      expect((res as Error).message).toMatch(/Turnier/);
    } finally {
      await x.query("rollback").catch(() => {});
      await x.end();
    }
  });

  it("Absage ohne Konkurrenz bleibt unveraendert: Spiele abgesagt, Turnier abgesagt", async () => {
    const { org, m, t } = await fixture();
    await cancelTournament(org.id, t.id);
    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.status).toBe("cancelled");
    const { matches } = await import("@/db/schema");
    expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].status).toBe("cancelled");
  });
});
