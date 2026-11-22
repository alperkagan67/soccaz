import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor, venues } from "@/db/schema-finance";
import { verifyEvidenceChain } from "@/server/evidence";
import { cleanup, makeMatch, makeUser } from "./helpers";

// UNGETESTET gegen die Datenbank (lokal ohne Datenbank geschrieben, Plan 009 M3 v4/v5, Abschnitte 13 bis 15, Entwurf docs/design/009-m3a-umbau-entwurf.md).
// DEFERRABLE-Haken: die Einträge entstehen erst beim COMMIT. JEDE geprüfte Änderung läuft darum in einer eigenen COMMITTENDEN Transaktion (committed), gelesen wird danach in einer neuen
// Verbindung; Rollback-Tests rollen ABSICHTLICH zurück (rolledBack) und müssen keinen Eintrag finden (Plan 15.6, Selbsttest unten).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const committed = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => db.transaction(fn);
class Rollback extends Error {}
async function rolledBack(fn: (tx: Tx) => Promise<unknown>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback("absichtlich");
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
}
const maintenance = (fn: (tx: Tx) => Promise<unknown>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await fn(tx);
  });

async function resetChain() {
  await maintenance(async (tx) => {
    await tx.delete(evidenceActor);
    await tx.delete(bookingEvidence);
    await tx.update(bookingEvidenceCounter).set({ lastSeq: 0, lastHash: "" }).where(eq(bookingEvidenceCounter.id, 1));
  });
}
let n = 0;
async function setup() {
  const m = await makeMatch({ hoursAhead: 72 });
  const [v] = await db.insert(venues).values({ name: `E2E Haken Halle ${Date.now().toString(36)}${++n}`, city: "Essen", source: "manual" }).returning();
  return { matchId: m.match.id, venueId: v.id };
}
const entries = (matchId: string) => db.select().from(bookingEvidence).where(eq(bookingEvidence.matchId, matchId)).orderBy(bookingEvidence.seq);
const kinds = async (matchId: string) => (await entries(matchId)).map((e) => e.kind);
const insertHall = (tx: Tx, matchId: string, venueId: string, status: string, answered = false, answeredBy: string | null = null) =>
  tx.execute(sql`insert into match_hall_requests (match_id, venue_id, position, status, answered_at, answered_by) values (${matchId}, ${venueId}, 0, ${status}, ${answered ? sql`now()` : null}, ${answeredBy})`);
const setHall = (tx: Tx, matchId: string, venueId: string, status: string, answered = false, answeredBy: string | null = null) =>
  tx.execute(sql`update match_hall_requests set status = ${status}, answered_at = ${answered ? sql`now()` : null}, answered_by = ${answeredBy} where match_id = ${matchId} and venue_id = ${venueId}`);

beforeEach(async () => {
  await cleanup();
  await resetChain();
});
afterAll(async () => {
  await cleanup();
  await resetChain();
});

describe("Testhelfer (Plan 15.6): nach COMMIT ist der Eintrag da, nach ROLLBACK keiner", () => {
  it("Selbsttest des Helfers", async () => {
    const { matchId, venueId } = await setup();
    await rolledBack((tx) => insertHall(tx, matchId, venueId, "pending"));
    expect(await kinds(matchId)).toEqual([]);
    await committed((tx) => insertHall(tx, matchId, venueId, "pending"));
    expect(await kinds(matchId)).toEqual(["request_sent"]);
  });
});

describe("SQL-Matrix Anfragezeilen (Plan 13.2): jeder Statuswechsel direkt per SQL", () => {
  const HALL = ["pending", "confirmed", "declined", "unmanaged"] as const;
  // erwartete Einträge je (alt -> neu); Antwort = answered_at gesetzt (declined) oder nicht (Frist)
  for (const from of HALL) {
    for (const to of HALL) {
      if (from === to) continue;
      const variants = to === "declined" ? [true, false] : [false];
      for (const answered of variants) {
        const expected: string[] = from !== "pending" ? [] : to === "confirmed" ? ["accepted"] : to === "unmanaged" ? ["unmanaged"] : [answered ? "declined" : "expired"];
        it(`${from} -> ${to}${to === "declined" ? (answered ? " (Antwort)" : " (Frist)") : ""}: ${expected.length ? expected[0] : "kein Eintrag"}`, async () => {
          const { matchId, venueId } = await setup();
          const op = await makeUser("hakenop");
          await committed((tx) => insertHall(tx, matchId, venueId, from));
          const before = await kinds(matchId);
          await committed((tx) => setHall(tx, matchId, venueId, to, answered, answered ? op.id : null));
          const after = await kinds(matchId);
          expect(after.slice(before.length)).toEqual(expected);
        });
      }
    }
  }

  it("INSERT: pending -> request_sent, unmanaged -> unmanaged, confirmed/declined -> kein Eintrag", async () => {
    for (const [status, expected] of [["pending", ["request_sent"]], ["unmanaged", ["unmanaged"]], ["confirmed", []], ["declined", []]] as const) {
      const { matchId, venueId } = await setup();
      await committed((tx) => insertHall(tx, matchId, venueId, status));
      expect(await kinds(matchId), status).toEqual(expected);
    }
  });

  it("die Antwort der Halle trägt den Actor (Name/E-Mail nur in evidence_actor, aus users zum COMMIT); Frist und Entzug ohne Actor", async () => {
    const { matchId, venueId } = await setup();
    const op = await makeUser("hakenop2");
    await committed((tx) => insertHall(tx, matchId, venueId, "pending"));
    await committed((tx) => setHall(tx, matchId, venueId, "confirmed", true, op.id));
    const rows = await entries(matchId);
    const accepted = rows.find((r) => r.kind === "accepted")!;
    expect(accepted.actorCommitment).toMatch(/^[0-9a-f]{64}$/);
    const [actor] = await db.select().from(evidenceActor).where(eq(evidenceActor.evidenceId, accepted.id));
    expect(actor).toMatchObject({ userId: op.id });
    expect(actor.email).toBe(op.email);
    expect(rows.find((r) => r.kind === "request_sent")!.actorCommitment).toBe("");
    expect(JSON.stringify(rows)).not.toContain(op.email);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });
});

describe("SQL-Matrix Buchungsaufträge (Plan 13.2): jeder Statuswechsel, Werte des Enums aus der Datenbank", () => {
  const JOB_KIND: Record<string, string | null> = { open: null, in_progress: null, booked: "job_booked", unavailable: "job_unavailable", confirmed: "job_confirmed", withdrawn: "job_withdrawn", done: "job_done" };
  it("jeder (alt, neu) aller Enum-Werte; ein neuer Enum-Wert ohne Zeile in der Matrix lässt den Test rot werden", async () => {
    const values = ((await db.execute(sql`select unnest(enum_range(null::booking_status))::text as v`)).rows as { v: string }[]).map((r) => r.v);
    expect([...values].sort()).toEqual(Object.keys(JOB_KIND).sort()); // neuer Wert ohne Matrixzeile -> rot
    for (const from of values) {
      for (const to of values) {
        if (from === to) continue;
        const { matchId, venueId } = await setup();
        await committed((tx) => tx.execute(sql`insert into booking_jobs (match_id, venue_id, status) values (${matchId}, ${venueId}, ${from})`));
        const before = await kinds(matchId);
        expect(before, `INSERT ${from}`).toEqual(["job_open"]); // jedes INSERT = job_open, egal mit welchem Status
        await committed((tx) => tx.execute(sql`update booking_jobs set status = ${to} where match_id = ${matchId}`));
        const delta = (await kinds(matchId)).slice(before.length);
        expect(delta, `${from} -> ${to}`).toEqual(JOB_KIND[to] ? [JOB_KIND[to]] : []);
      }
    }
  }, 120_000);

  it("Updates ohne Statuswechsel (Notiz, Nachweis) erzeugen keinen Eintrag", async () => {
    const { matchId, venueId } = await setup();
    await committed((tx) => tx.execute(sql`insert into booking_jobs (match_id, venue_id, status) values (${matchId}, ${venueId}, 'open')`));
    const before = await kinds(matchId);
    await committed((tx) => tx.execute(sql`update booking_jobs set note = 'Notiz', proof_url = 'https://example.invalid/x' where match_id = ${matchId}`));
    expect(await kinds(matchId)).toEqual(before);
  });

  it("job_* tragen job_id und die aktuelle Runde; ON CONFLICT DO NOTHING (bestehender Auftrag) erzeugt kein zweites job_open", async () => {
    const { matchId, venueId } = await setup();
    await committed((tx) => insertHall(tx, matchId, venueId, "pending")); // Runde 1
    await committed((tx) => tx.execute(sql`insert into booking_jobs (match_id, venue_id) values (${matchId}, ${venueId}) on conflict (match_id) do nothing`));
    await committed((tx) => tx.execute(sql`insert into booking_jobs (match_id, venue_id) values (${matchId}, ${venueId}) on conflict (match_id) do nothing`));
    const rows = await entries(matchId);
    const open = rows.filter((r) => r.kind === "job_open");
    expect(open).toHaveLength(1);
    expect(open[0].round).toBe(1);
    const jobId = ((await db.execute(sql`select id from booking_jobs where match_id = ${matchId}`)).rows[0] as { id: string }).id;
    expect(open[0].jobId).toBe(jobId);
  });
});

describe("Runde (Plan 14.4): nur INSERT-Ereignisse eröffnen eine Runde", () => {
  it("mehrere Zeilen in EINER Transaktion = eine Runde; ein neuer Termin = nächste Runde; Entzug (pending -> unmanaged) ändert die Runde nicht", async () => {
    const m = await setup();
    const [v2] = await db.insert(venues).values({ name: `E2E Haken Halle ${Date.now().toString(36)}${++n}`, city: "Essen", source: "manual" }).returning();
    await committed(async (tx) => {
      await insertHall(tx, m.matchId, m.venueId, "pending");
      await tx.execute(sql`insert into match_hall_requests (match_id, venue_id, position, status) values (${m.matchId}, ${v2.id}, 1, 'unmanaged')`);
    });
    expect((await entries(m.matchId)).map((r) => r.round)).toEqual([1, 1]);
    // neuer Termin: Zeilen weg (settleHallCheck/startHallCheck), neue Zeilen in einer neuen Transaktion
    await committed((tx) => tx.execute(sql`delete from match_hall_requests where match_id = ${m.matchId}`));
    await committed((tx) => insertHall(tx, m.matchId, m.venueId, "pending"));
    expect((await entries(m.matchId)).map((r) => r.round)).toEqual([1, 1, 2]);
    // Entzug nach der Hallenprüfung: bleibt Runde 2
    await committed((tx) => setHall(tx, m.matchId, m.venueId, "unmanaged"));
    const last = (await entries(m.matchId)).at(-1)!;
    expect(last).toMatchObject({ kind: "unmanaged", round: 2 });
  });
});

describe("Rollback, Savepoint, Wartungsausnahme, gelöschte Zeilen (Plan 13.7, 14.6, 14.7)", () => {
  it("Rollback der Transaktion: kein Eintrag, keine seq verbraucht", async () => {
    const { matchId, venueId } = await setup();
    await committed((tx) => insertHall(tx, matchId, venueId, "pending"));
    await rolledBack((tx) => setHall(tx, matchId, venueId, "confirmed", true));
    expect(await kinds(matchId)).toEqual(["request_sent"]);
    await committed((tx) => setHall(tx, matchId, venueId, "declined", true));
    expect((await entries(matchId)).map((e) => e.seq)).toEqual([1, 2]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("Savepoint-Rollback verwirft die in der Teiltransaktion eingereihten Ereignisse", async () => {
    const { matchId, venueId } = await setup();
    await committed(async (tx) => {
      await insertHall(tx, matchId, venueId, "pending");
      await tx.execute(sql`savepoint sp1`);
      await setHall(tx, matchId, venueId, "confirmed", true);
      await tx.execute(sql`rollback to savepoint sp1`);
    });
    expect(await kinds(matchId)).toEqual(["request_sent"]);
  });

  it("Wartungsausnahme: Änderungen unter socaz.ledger_maintenance erzeugen keinen Eintrag (nur Test-Cleanup)", async () => {
    const { matchId, venueId } = await setup();
    await maintenance((tx) => insertHall(tx, matchId, venueId, "pending"));
    expect(await kinds(matchId)).toEqual([]);
  });

  it("SPIKE (Plan 14.7): INSERT + DELETE derselben Zeile in einer Transaktion: das eingereihte INSERT-Ereignis läuft beim COMMIT trotzdem (SnapshotAny, trigger.c REL_17); weicht PostgreSQL ab -> Plan v6", async () => {
    const { matchId, venueId } = await setup();
    await committed(async (tx) => {
      await insertHall(tx, matchId, venueId, "pending");
      await tx.execute(sql`delete from match_hall_requests where match_id = ${matchId}`);
    });
    expect(await kinds(matchId)).toEqual(["request_sent"]);
  });

  it("DELETE der Anfragezeilen allein erzeugt keinen Eintrag (Ergebnis steht in den Einträgen davor)", async () => {
    const { matchId, venueId } = await setup();
    await committed((tx) => insertHall(tx, matchId, venueId, "pending"));
    await committed((tx) => tx.execute(sql`delete from match_hall_requests where match_id = ${matchId}`));
    expect(await kinds(matchId)).toEqual(["request_sent"]);
  });
});

describe("Deadlock-Tests (Plan 14.1): echte parallele Transaktionen, Zähler nur beim COMMIT", () => {
  it("parallele Statuswechsel mit gleichzeitigen Sperren auf venues/matches/users: alle Einträge vorhanden, keine Verklemmung, Kette gültig", async () => {
    const rounds = 6;
    const ctx = await Promise.all(Array.from({ length: rounds }, () => setup()));
    for (const c of ctx) await committed((tx) => insertHall(tx, c.matchId, c.venueId, "pending"));
    const op = await makeUser("hakendl");
    await Promise.all(
      ctx.flatMap((c) => [
        // Antwort (Spielzeile unter UPDATE) …
        committed(async (tx) => {
          await tx.execute(sql`select id from matches where id = ${c.matchId} for update`);
          await setHall(tx, c.matchId, c.venueId, "confirmed", true, op.id);
        }),
        // … gleichzeitig Halle FOR UPDATE (wie bookCommission/lockVenues) und Nutzer FOR UPDATE (wie admin/deleteAccount) mit eigenem Statuswechsel
        committed(async (tx) => {
          await tx.execute(sql`select id from venues where id = ${c.venueId} for update`);
          await tx.execute(sql`select id from users where id = ${op.id} for update`);
          await tx.execute(sql`insert into booking_jobs (match_id, venue_id) values (${c.matchId}, ${c.venueId}) on conflict (match_id) do nothing`);
        }),
      ]),
    );
    for (const c of ctx) expect((await kinds(c.matchId)).sort()).toEqual(["accepted", "job_open", "request_sent"]);
    const chain = await verifyEvidenceChain();
    expect(chain).toMatchObject({ ok: true, count: rounds * 3 });
  }, 120_000);
});
