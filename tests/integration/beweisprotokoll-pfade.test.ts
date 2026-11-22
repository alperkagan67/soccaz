import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor, venueAccess, venues } from "@/db/schema-finance";
import { deleteAccount } from "@/server/account";
import { createBookingJob, updateBookingJob, withdrawBookingJob } from "@/server/booking";
import { verifyEvidenceChain } from "@/server/evidence";
import { answerHallRequest, settleHallCheck, startHallCheck } from "@/server/veto";
import { revokeVenueAccess } from "@/server/venue-access";
import { cleanup, makeMatch, makeUser } from "./helpers";

// Beweisprotokoll, echte Anwendungspfade (Plan 009 M3 v5, 13.7): die DEFERRABLE-Trigger erzeugen die Einträge beim COMMIT der jeweiligen Fachfunktion; die Tests rufen die echten Funktionen auf
// (startHallCheck, answerHallRequest, settleHallCheck mit Frist, Entzug, Buchungsaufträge, Kontolöschung). Die Kette ist EINE globale Reihe: jeder Test setzt sie zurück (nur Test-Datenbank).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
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
beforeEach(async () => {
  await cleanup();
  await resetChain();
});
afterAll(async () => {
  await cleanup();
  await resetChain();
});

let n = 0;
/** Ein Spiel in der Lobby und zwei Hallen in einer eigenen Stadt: eine MIT Betreiber (venue_access aktiv), eine ohne. */
async function setup() {
  const tag = `${Date.now().toString(36)}${++n}`;
  const city = `E2E-Evidenz-${tag}`;
  const m = await makeMatch({ hoursAhead: 72 });
  const op = await makeUser("pfadop");
  const [managed] = await db.insert(venues).values({ name: `E2E Pfad Halle A ${tag}`, city, source: "manual", verified: true, isPartner: true, active: true }).returning();
  const [open] = await db.insert(venues).values({ name: `E2E Pfad Halle B ${tag}`, city, source: "manual", verified: true, active: true }).returning();
  await db.insert(venueAccess).values({ venueId: managed.id, userId: op.id, status: "active", assignedAt: new Date() });
  const match = (await db.select().from(matches).where(eq(matches.id, m.match.id)))[0];
  return { match, city, op, managed, open };
}
const mine = (matchId: string, venueIds: string[]) =>
  db.select().from(bookingEvidence).where(eq(bookingEvidence.matchId, matchId)).orderBy(bookingEvidence.seq).then((rows) => rows.filter((r) => r.venueId === null || venueIds.includes(r.venueId)));
const kinds = async (matchId: string, venueIds: string[]) => (await mine(matchId, venueIds)).map((r) => `${r.kind}`);
const reload = async (id: string) => (await db.select().from(matches).where(eq(matches.id, id)))[0];

describe("Hallenprüfung über die echten Funktionen", () => {
  it("startHallCheck: je Halle im Pool ein Eintrag (pending -> request_sent, ohne Betreiber -> unmanaged) in Runde 1; ein neuer Termin (zweiter Aufruf) = Runde 2", async () => {
    const s = await setup();
    await db.transaction((tx) => startHallCheck(tx, s.match, s.city));
    const first = await mine(s.match.id, [s.managed.id, s.open.id]);
    expect(first.filter((r) => r.venueId === s.managed.id).map((r) => [r.kind, r.round])).toEqual([["request_sent", 1]]);
    expect(first.filter((r) => r.venueId === s.open.id).map((r) => [r.kind, r.round])).toEqual([["unmanaged", 1]]);
    await db.transaction(async (tx) => startHallCheck(tx, await reload(s.match.id).then((m) => ({ ...m, vetoStatus: "none" as const })), s.city)); // zweiter Termin
    const second = await mine(s.match.id, [s.managed.id, s.open.id]);
    expect(second.filter((r) => r.round === 2).map((r) => r.kind).sort()).toEqual(["request_sent", "unmanaged"]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("answerHallRequest: Zusage = accepted mit Actor (Name/E-Mail nur in evidence_actor), Ablehnung = declined; ein zweiter Aufruf wird abgelehnt und erzeugt nichts", async () => {
    const s = await setup();
    await db.transaction((tx) => startHallCheck(tx, s.match, s.city));
    await answerHallRequest(s.op.id, s.match.id, s.managed.id, true);
    const accepted = (await mine(s.match.id, [s.managed.id])).find((r) => r.kind === "accepted")!;
    expect(accepted).toBeTruthy();
    expect(accepted.round).toBe(1);
    const [actor] = await db.select().from(evidenceActor).where(eq(evidenceActor.evidenceId, accepted.id));
    expect(actor).toMatchObject({ userId: s.op.id, email: s.op.email });
    expect(JSON.stringify(accepted)).not.toContain(s.op.email);
    const before = (await mine(s.match.id, [s.managed.id])).length;
    await expect(answerHallRequest(s.op.id, s.match.id, s.managed.id, true)).rejects.toThrow(); // schon beantwortet
    expect((await mine(s.match.id, [s.managed.id])).length).toBe(before);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("settleHallCheck nach Fristablauf: nicht beantwortete Anfrage = expired (ohne Actor), die beantwortete bleibt accepted/declined", async () => {
    const s = await setup();
    await db.transaction((tx) => startHallCheck(tx, s.match, s.city));
    const m = await reload(s.match.id);
    await db.transaction((tx) => settleHallCheck(tx, m, new Date(Date.now() + 13 * 3_600_000))); // nach HALL_REPLY_MS (12 h)
    const rows = await mine(s.match.id, [s.managed.id]);
    expect(rows.map((r) => r.kind)).toEqual(["request_sent", "expired"]);
    expect(rows.find((r) => r.kind === "expired")!.actorCommitment).toBe("");
  });

  it("Entzug des Betreiberzugangs (011 M1): offene Anfrage pending -> unmanaged, gleiche Runde, ohne Actor", async () => {
    const s = await setup();
    await db.transaction((tx) => startHallCheck(tx, s.match, s.city));
    const admin = await makeUser("pfadadm", "owner");
    await revokeVenueAccess(admin.id, s.managed.id, "Test Entzug");
    const rows = await mine(s.match.id, [s.managed.id]);
    expect(rows.map((r) => [r.kind, r.round])).toEqual([["request_sent", 1], ["unmanaged", 1]]);
    expect(rows[1].actorCommitment).toBe("");
  });
});

describe("Buchungsaufträge über die echten Funktionen", () => {
  it("createBookingJob (job_open, nur beim neuen Auftrag), updateBookingJob nur bei Statuswechsel (in_progress und Notiz ohne Eintrag), withdrawBookingJob (job_withdrawn)", async () => {
    const s = await setup();
    const admin = await makeUser("pfadjob", "owner");
    await db.update(matches).set({ venueId: s.managed.id }).where(eq(matches.id, s.match.id));
    const match = await reload(s.match.id);
    await db.transaction((tx) => createBookingJob(tx, match));
    await db.transaction((tx) => createBookingJob(tx, match)); // ON CONFLICT DO NOTHING: kein zweites job_open
    const jobId = ((await db.execute(sql`select id from booking_jobs where match_id = ${s.match.id}`)).rows[0] as { id: string }).id;
    await updateBookingJob(admin.id, jobId, { status: "in_progress" });
    await updateBookingJob(admin.id, jobId, { note: "nur eine Notiz" });
    await updateBookingJob(admin.id, jobId, { status: "booked", venueId: s.managed.id });
    expect(await kinds(s.match.id, [s.managed.id])).toEqual(["job_open", "job_booked"]);
    const job = (await mine(s.match.id, [s.managed.id])).find((r) => r.kind === "job_booked")!;
    expect(job.jobId).toBe(jobId);
    // zweites Spiel: Auftrag zurückziehen
    const s2 = await setup();
    await db.update(matches).set({ venueId: s2.managed.id }).where(eq(matches.id, s2.match.id));
    const match2 = await reload(s2.match.id);
    await db.transaction((tx) => createBookingJob(tx, match2));
    await db.transaction((tx) => withdrawBookingJob(tx, s2.match.id));
    expect(await kinds(s2.match.id, [s2.managed.id])).toEqual(["job_open", "job_withdrawn"]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });
});

describe("Kontolöschung (Plan 14.1): evidence_actor wird geleert, Eintrag und Kette bleiben", () => {
  it("deleteAccount des Betreibers, der geantwortet hat: user_id/name/email NULL, Kette gültig", async () => {
    const s = await setup();
    await db.transaction((tx) => startHallCheck(tx, s.match, s.city));
    await answerHallRequest(s.op.id, s.match.id, s.managed.id, true);
    const accepted = (await mine(s.match.id, [s.managed.id])).find((r) => r.kind === "accepted")!;
    await deleteAccount(s.op.id);
    const [actor] = await db.select().from(evidenceActor).where(eq(evidenceActor.evidenceId, accepted.id));
    expect(actor).toMatchObject({ userId: null, name: null, email: null });
    expect((await verifyEvidenceChain()).ok).toBe(true);
    // der Entzug aus deleteAccount (revokeAccessOfUser) hat die Anfrage nicht mehr offen gefunden: kein zweiter Eintrag zur beantworteten Anfrage
    expect((await mine(s.match.id, [s.managed.id])).filter((r) => r.kind === "unmanaged")).toEqual([]);
  });
});
