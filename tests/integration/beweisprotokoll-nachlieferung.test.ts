import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor, venueAccess, venues } from "@/db/schema-finance";
import { cleanReason } from "@/lib/evidence";
import { reconcileEvidence, verifyEvidenceChain } from "@/server/evidence";
import { evidenceHash2 } from "../../scripts/lib/evidence-chain.mjs";
import { cleanup, makeMatch, makeUser } from "./helpers";

// Nachlieferung 009 M3 (Migration 0054, Plan 16b bis 16h): Sofort-Trigger, Spalten, Schalter, late_attempt, Turnier-Zusage, Einstellungsschutz, Hash Version 2.
// Die Kette ist EINE globale Reihe: jeder Test setzt sie zurück (nur Test-Datenbank). Schalter und Uhrenquelle werden nach JEDEM Test auf off/js zurückgestellt (gemeinsame DB, Plan 16h.2).
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
const setSettings = (enforcement: "off" | "on", clock: "js" | "db") =>
  maintenance(async (tx) => {
    await tx.execute(sql`insert into settings (key, value) values ('evidence_enforcement', to_jsonb(${enforcement}::text)) on conflict (key) do update set value = excluded.value`);
    await tx.execute(sql`insert into settings (key, value) values ('evidence_clock_source', to_jsonb(${clock}::text)) on conflict (key) do update set value = excluded.value`);
  });
/** Test mit eingeschalteter Durchsetzung; die Rückstellung steht in afterEach (auch bei Fehler). */
const enforceOn = () => setSettings("on", "db");
beforeEach(async () => {
  await cleanup();
  await resetChain();
  await setSettings("off", "js");
});
afterEach(async () => {
  await setSettings("off", "js"); // Wächter (Plan 16h.2): der Zustand ist nach jedem Test off/js
});
afterAll(async () => {
  await cleanup();
  await resetChain();
  await setSettings("off", "js");
});

let n = 0;
const rows = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));
const ev = async (matchId: string) => db.select().from(bookingEvidence).where(eq(bookingEvidence.matchId, matchId)).orderBy(bookingEvidence.seq);

/** Spiel mit Frist, Halle mit Betreiber (venue_access aktiv) und einer offenen Anfragezeile (pending, Runde 1). */
async function setup(opts: { deadlineOffsetMs?: number } = {}) {
  const tag = `${Date.now().toString(36)}${++n}`;
  const m = await makeMatch({ hoursAhead: 72 });
  const op = await makeUser("nlop");
  const [venue] = await db.insert(venues).values({ name: `E2E NL Halle ${tag}`, city: `E2E-NL-${tag}`, source: "manual", verified: true, isPartner: true, active: true }).returning();
  await db.insert(venueAccess).values({ venueId: venue.id, userId: op.id, status: "active", assignedAt: new Date() });
  const deadline = new Date(Date.now() + (opts.deadlineOffsetMs ?? 3_600_000));
  await db.update(matches).set({ vetoTurnDeadline: deadline }).where(eq(matches.id, m.match.id));
  await db.execute(sql`insert into match_hall_requests (match_id, venue_id, position, status) values (${m.match.id}, ${venue.id}, 1, 'pending')`);
  return { matchId: m.match.id, op, venue, deadline };
}
const answer = (s: { matchId: string; venue: { id: string }; op: { id: string } }, status: "confirmed" | "declined", extra: { code?: string; text?: string; answeredAt?: boolean; forged?: boolean } = {}) =>
  db.transaction(async (tx) => {
    if (extra.code) await tx.execute(sql`select set_config(${"socaz.evidence_reason_code.r" + (await md5(tx, s))}, ${extra.code}, true)`);
    if (extra.text) await tx.execute(sql`select set_config(${"socaz.evidence_reason.r" + (await md5(tx, s))}, ${extra.text}, true)`);
    const answered = extra.answeredAt === false ? sql`null` : sql`now()`;
    const by = extra.answeredAt === false ? sql`null` : sql`${s.op.id}::uuid`;
    const forged = extra.forged ? sql`, reply_deadline = '2000-01-01', decision_statement_at = '2000-01-01', decision_enforced = true` : sql``;
    await tx.execute(sql`update match_hall_requests set status = ${status}, answered_at = ${answered}, answered_by = ${by} ${forged} where match_id = ${s.matchId} and venue_id = ${s.venue.id}`);
  });
async function md5(tx: Tx, s: { matchId: string; venue: { id: string } }): Promise<string> {
  return rows<{ k: string }>(await tx.execute(sql`select md5('m:' || ${s.matchId}::text || ':' || ${s.venue.id}::text) as k`))[0].k;
}
const msgOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "";
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return err.cause?.message ?? err.message ?? "?";
  }
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code ?? "?";
  }
};

describe("Sofort-Trigger und Spalten (Plan 16g.3/16g.4)", () => {
  it("Antwort bei off: Spalten vom Trigger gesetzt (App-Werte verworfen), Eintrag Version 2 mit Frist, Entscheidungszeit, Anweisungszeit und enforced=false; Kette gültig", async () => {
    const s = await setup();
    await answer(s, "confirmed", { forged: true });
    const [h] = rows<{ reply_deadline: Date; decision_enforced: boolean; decision_statement_at: Date }>(await db.execute(sql`select * from match_hall_requests where match_id = ${s.matchId}`));
    expect(new Date(h.reply_deadline).getTime()).toBe(s.deadline.getTime()); // gefälschter Wert verworfen
    expect(h.decision_enforced).toBe(false);
    expect(new Date(h.decision_statement_at).getFullYear()).toBeGreaterThan(2020);
    const acc = (await ev(s.matchId)).find((e) => e.kind === "accepted")!;
    expect(acc).toMatchObject({ hashVersion: 2, subject: "match", enforced: false, reason: null });
    expect(acc.deadlineAt!.getTime()).toBe(s.deadline.getTime());
    expect(acc.decidedAt!.getTime()).toBeLessThanOrEqual(acc.deadlineAt!.getTime());
    expect(acc.statementAt).not.toBeNull();
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("die Spalten sind nach dem Setzen unveränderlich (späteres UPDATE ändert sie nicht)", async () => {
    const s = await setup();
    await answer(s, "confirmed");
    const before = rows<{ reply_deadline: Date; decision_statement_at: Date }>(await db.execute(sql`select reply_deadline, decision_statement_at from match_hall_requests where match_id = ${s.matchId}`))[0];
    await db.execute(sql`update match_hall_requests set reply_deadline = null, decision_statement_at = null, decision_enforced = null, answered_by = null where match_id = ${s.matchId}`);
    const after = rows<{ reply_deadline: Date; decision_statement_at: Date; decision_enforced: boolean }>(await db.execute(sql`select reply_deadline, decision_statement_at, decision_enforced from match_hall_requests where match_id = ${s.matchId}`))[0];
    expect(new Date(after.reply_deadline).getTime()).toBe(new Date(before.reply_deadline).getTime());
    expect(new Date(after.decision_statement_at).getTime()).toBe(new Date(before.decision_statement_at).getTime());
    expect(after.decision_enforced).toBe(false);
  });

  it("Ablehnung bei off ohne Code ist erlaubt (Bestandsverhalten), Eintrag mit leerem Code und enforced=false", async () => {
    const s = await setup();
    await answer(s, "declined");
    const d = (await ev(s.matchId)).find((e) => e.kind === "declined")!;
    expect(d).toMatchObject({ reasonCode: "", enforced: false });
  });

  it("Ablehnung bei ON: ohne Code Fehler EV002; mit Code und Text: Commitment im Datensatz, Klartext nur in der Nebentabelle, enforced=true; Rollback ohne Eintrag", async () => {
    await enforceOn();
    const s = await setup();
    expect(await code(answer(s, "declined"))).toBe("EV002");
    expect(await code(answer(s, "declined", { code: "sonstiges" }))).toBe("EV002"); // sonstiges braucht Text
    expect(await code(answer(s, "declined", { code: "belegt", text: "ab" }))).toBe("EV002"); // zu kurz
    expect((await ev(s.matchId)).filter((e) => e.kind === "declined")).toHaveLength(0);
    await answer(s, "declined", { code: "belegt", text: "  Halle\u0001 belegt ‮ am Samstag  " });
    const d = (await ev(s.matchId)).find((e) => e.kind === "declined")!;
    expect(d).toMatchObject({ reasonCode: "belegt", enforced: true, reason: null });
    expect(d.reasonCommitment).toMatch(/^[0-9a-f]{64}$/);
    const t = rows<{ reason: string }>(await db.execute(sql`select reason from booking_evidence_reason_text where evidence_id = ${d.id}`))[0];
    expect(t.reason).toBe("Halle belegt am Samstag");
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("Antwort nach Fristende bei ON: Fehler EV001 (in der Anweisung); der Ablauf (declined OHNE answered_at) läuft bei ON durch und hält die Frist fest (Plan 16g.3)", async () => {
    await enforceOn();
    const s = await setup({ deadlineOffsetMs: -60_000 });
    expect(await code(answer(s, "confirmed"))).toBe("EV001");
    await answer(s, "declined", { answeredAt: false });
    const x = (await ev(s.matchId)).find((e) => e.kind === "expired")!;
    expect(x).toMatchObject({ enforced: true, reasonCode: "" });
    expect(x.deadlineAt!.getTime()).toBe(s.deadline.getTime());
    expect(x.decidedAt!.getTime()).toBeGreaterThan(x.deadlineAt!.getTime());
  });

  it("Antwort bei off nach Fristende wird gespeichert (Bestandsverhalten, kein Fehler); expired mit Zeit VOR dem Fristende erscheint im Abgleich als early_expiry (kein harter CHECK)", async () => {
    const s = await setup({ deadlineOffsetMs: -60_000 });
    await answer(s, "confirmed");
    expect((await ev(s.matchId)).some((e) => e.kind === "accepted")).toBe(true);
    const s2 = await setup({ deadlineOffsetMs: 3_600_000 });
    await answer(s2, "declined", { answeredAt: false }); // Ablauf VOR dem Fristende (App-Uhr läuft vor)
    const early = (await reconcileEvidence()).filter((m) => m.source === "early_expiry" && m.matchId === s2.matchId);
    expect(early).toHaveLength(1);
  });
});

describe("evidence_late_attempt (Plan 16b.4, 16e.1)", () => {
  const late = (s: { matchId: string; venue: { id: string } }, actor: string) => db.execute(sql`select evidence_late_attempt(${s.matchId}::uuid, ${s.venue.id}::uuid, ${actor}::uuid) as r`).then((r) => rows<{ r: boolean }>(r)[0].r);

  it("nach Fristende: Eintrag late_attempt mit Actor (true), zweiter Aufruf false ohne neue seq; vor Fristende Fehler; ohne Zugang EV004", async () => {
    const s = await setup({ deadlineOffsetMs: -60_000 });
    const stranger = await makeUser("nlfremd");
    expect(await code(late(s, stranger.id))).toBe("EV004");
    expect(await late(s, s.op.id)).toBe(true);
    const seq1 = (await verifyEvidenceChain()).count;
    expect(await late(s, s.op.id)).toBe(false);
    expect((await verifyEvidenceChain()).count).toBe(seq1);
    const l = (await ev(s.matchId)).find((e) => e.kind === "late_attempt")!;
    expect(l.decidedAt!.getTime()).toBeGreaterThan(l.deadlineAt!.getTime());
    expect(l.actorCommitment).toMatch(/^[0-9a-f]{64}$/);
    const early = await setup({ deadlineOffsetMs: 3_600_000 });
    expect(await msgOf(late(early, early.op.id))).toMatch(/noch nicht abgelaufen/); // Frist nicht abgelaufen (Fehlertext, nicht ein Folge-CHECK)
  });

  it("nach dem Ablaufjob (declined ohne answered_at) bleibt der Versuch zulässig; eine vom Betreiber beantwortete Zeile nicht", async () => {
    const s = await setup({ deadlineOffsetMs: -60_000 });
    await answer(s, "declined", { answeredAt: false });
    expect(await late(s, s.op.id)).toBe(true);
    const s2 = await setup({ deadlineOffsetMs: -60_000 });
    await answer(s2, "confirmed");
    expect(await code(late(s2, s2.op.id))).not.toBeNull();
  });

  it("parallele Aufrufe: genau ein Eintrag", async () => {
    const s = await setup({ deadlineOffsetMs: -60_000 });
    const res = await Promise.all(Array.from({ length: 8 }, () => late(s, s.op.id)));
    expect(res.filter(Boolean)).toHaveLength(1);
    expect((await ev(s.matchId)).filter((e) => e.kind === "late_attempt")).toHaveLength(1);
  });
});

describe("Turnier-Zusage (Plan 16c.2, 16d.7, 16e.9, 16f.8/16f.9)", () => {
  async function tournament(venueId: string | null) {
    const org = await makeUser("nlorg");
    const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: "NL Turnier", city: "E2E-NL", startsOn: "2027-01-10", format: "knockout", maxTeams: 4, venueId }).returning();
    return t;
  }
  const entries = (tid: string) => db.select().from(bookingEvidence).where(eq(bookingEvidence.tournamentId, tid)).orderBy(bookingEvidence.seq);

  it("Zusage (venue_confirmed_at NULL -> Wert) schreibt genau einen accepted-Eintrag (Betreff tournament, Runde 1, Actor bei Zugang, Zeit = Transaktionsbeginn, keine Frist)", async () => {
    const s = await setup();
    const t = await tournament(s.venue.id);
    await db.execute(sql`update tournaments set venue_confirmed_at = now(), venue_confirmed_by = ${s.op.id} where id = ${t.id}`);
    const e = await entries(t.id);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ subject: "tournament", kind: "accepted", round: 1, matchId: null, deadlineAt: null, enforced: null, hashVersion: 2 });
    expect(e[0].statementAt!.getTime()).toBe(e[0].decidedAt!.getTime());
    expect(e[0].actorCommitment).toMatch(/^[0-9a-f]{64}$/);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("Bestätiger ohne aktiven Hallenzugang: Eintrag ohne Actor (kein Fehler)", async () => {
    const s = await setup();
    const t = await tournament(s.venue.id);
    const stranger = await makeUser("nlfremd2");
    await db.execute(sql`update tournaments set venue_confirmed_at = now(), venue_confirmed_by = ${stranger.id} where id = ${t.id}`);
    expect((await entries(t.id))[0].actorCommitment).toBe("");
  });

  it("Hallenwechsel setzt Zusage und Bestätiger zurück (kein Eintrag); erneute Zusage = Runde 2; Zusage ohne Halle scheitert am CHECK", async () => {
    const s = await setup();
    const t = await tournament(s.venue.id);
    await db.execute(sql`update tournaments set venue_confirmed_at = now(), venue_confirmed_by = ${s.op.id} where id = ${t.id}`);
    await db.execute(sql`update tournaments set venue_id = ${s.venue.id}, venue_confirmed_at = now() where id = ${t.id}`); // gleiche Halle, Zusage bleibt (kein Wechsel)
    const other = (await db.insert(venues).values({ name: "E2E NL Halle B", city: "E2E-NL", source: "manual", verified: true, active: true }).returning())[0];
    await db.execute(sql`update tournaments set venue_id = ${other.id} where id = ${t.id}`);
    const r = (await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0];
    expect(r.venueConfirmedAt).toBeNull();
    expect(r.venueConfirmedBy).toBeNull();
    expect(await entries(t.id)).toHaveLength(1);
    await db.execute(sql`update tournaments set venue_confirmed_at = now() where id = ${t.id}`);
    const e = await entries(t.id);
    expect(e.map((x) => [x.round, x.venueId])).toEqual([[1, s.venue.id], [2, other.id]]);
    const noVenue = await tournament(null);
    expect(await code(db.execute(sql`update tournaments set venue_confirmed_at = now() where id = ${noVenue.id}`))).toBe("23514");
  });

  it("verschiedene Schreibwege je genau ein Eintrag: Ganzzeilen-Update und INSERT mit Zusage; Löschschutz lehnt ab (ohne Wartungsausnahme erlaubt)", async () => {
    const s = await setup();
    const t = await tournament(s.venue.id);
    await db.update(tournaments).set({ venueConfirmedAt: new Date(), name: "NL Turnier 2" }).where(eq(tournaments.id, t.id));
    expect(await entries(t.id)).toHaveLength(1);
    const org = await makeUser("nlorg2");
    const [t2] = await db.insert(tournaments).values({ organizerId: org.id, name: "NL Turnier ins", city: "E2E-NL", startsOn: "2027-01-11", format: "knockout", maxTeams: 4, venueId: s.venue.id, venueConfirmedAt: new Date() }).returning();
    expect(await entries(t2.id)).toHaveLength(1);
    expect(await code(db.delete(tournaments).where(eq(tournaments.id, t.id)))).not.toBeNull(); // Guard
    await maintenance((tx) => tx.delete(tournaments).where(eq(tournaments.id, t.id)));
  });

  it("Abgleich: Turnier mit Zusage ohne Eintrag (unter Wartungsausnahme geschrieben) wird gemeldet", async () => {
    const s = await setup();
    const t = await tournament(s.venue.id);
    await maintenance((tx) => tx.execute(sql`update tournaments set venue_confirmed_at = now() where id = ${t.id}`));
    expect((await reconcileEvidence()).some((m) => m.source === "tournament" && m.tournamentId === t.id)).toBe(true);
  });
});

describe("Einstellungen und Schalter (Plan 16g.1/16g.5)", () => {
  it("direkte Änderung der evidence_*-Einstellungen wird abgelehnt; evidence_set_setting braucht einen Akteur, schreibt audit_log; 'on' erst bei clock_source = db", async () => {
    const admin = await makeUser("nladmin", "owner");
    expect(await code(db.execute(sql`update settings set value = to_jsonb('on'::text) where key = 'evidence_enforcement'`))).not.toBeNull();
    expect(await msgOf(db.execute(sql`select evidence_set_setting('evidence_reason_retention_days', '5', null, 'x')`))).toMatch(/Akteur/);
    expect(await code(db.execute(sql`select evidence_set_setting('evidence_enforcement', 'on', ${admin.id}::uuid, 'zu frueh')`))).not.toBeNull(); // clock_source = js
    await db.execute(sql`select evidence_set_setting('evidence_clock_source', 'db', ${admin.id}::uuid, 'M2a umgestellt')`);
    await db.execute(sql`select evidence_set_setting('evidence_enforcement', 'on', ${admin.id}::uuid, 'Go-live')`);
    const a = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from audit_log where action = 'evidence_setting' and actor_id = ${admin.id}`));
    expect(a[0].n).toBe(2);
    expect(await code(db.execute(sql`select evidence_set_setting('evidence_enforcement', 'vielleicht', ${admin.id}::uuid, 'x')`))).not.toBeNull();
    expect(await code(db.execute(sql`select evidence_set_setting('evidence_unbekannt', '1', ${admin.id}::uuid, 'x')`))).not.toBeNull();
  });

  it("fail-closed: fehlt die Zeile des Schalters, gilt 'on'", async () => {
    await maintenance((tx) => tx.execute(sql`delete from settings where key = 'evidence_enforcement'`));
    const r = rows<{ e: boolean }>(await db.execute(sql`select evidence_enforced() as e`))[0];
    expect(r.e).toBe(true);
  });
});

describe("Hash Version 2, Bereinigung, Einschränkungen (Plan 16d.6, 16e.4, 16f.5/16f.10)", () => {
  it("SQL evidence_hash2 = JS evidenceHash2 (alle Felder, NULL = leerer Teil, enforced 1/0/leer)", async () => {
    const at = "2026-03-04T05:06:07.123456Z";
    const v = "11111111-1111-4111-8111-111111111111";
    const cases = [
      { subject: "match", seq: 7, matchId: v, tournamentId: null, venueId: null, round: 2, jobId: null, kind: "declined", reasonCode: "belegt", reasonCommitment: "ab".repeat(32), at, actorCommitment: "", prevHash: "p", deadlineAt: "2026-03-04T06:00:00.000001Z", decidedAt: "2026-03-04T05:06:07.000000Z", statementAt: "2026-03-04T05:06:07.500000Z", enforced: true },
      { subject: "tournament", seq: 8, matchId: null, tournamentId: v, venueId: v, round: 1, jobId: null, kind: "accepted", reasonCode: "", reasonCommitment: "", at, actorCommitment: "x", prevHash: "", deadlineAt: null, decidedAt: "2026-03-04T05:06:07.000000Z", statementAt: "2026-03-04T05:06:07.000000Z", enforced: null },
      { subject: "match", seq: 9, matchId: v, tournamentId: null, venueId: v, round: 1, jobId: v, kind: "job_open", reasonCode: "", reasonCommitment: "", at, actorCommitment: "", prevHash: "q", deadlineAt: null, decidedAt: null, statementAt: null, enforced: false },
    ];
    for (const c of cases) {
      const r = rows<{ h: string }>(
        await db.execute(sql`select evidence_hash2(${c.subject}, ${c.seq}, ${c.matchId}::uuid, ${c.tournamentId}::uuid, ${c.venueId}::uuid, ${c.round}, ${c.jobId}::uuid, ${c.kind}, ${c.reasonCode}, ${c.reasonCommitment},
          ${c.at}::timestamptz, ${c.actorCommitment}, ${c.prevHash}, ${c.deadlineAt}::timestamptz, ${c.decidedAt}::timestamptz, ${c.statementAt}::timestamptz, ${c.enforced}::boolean) as h`),
      )[0].h;
      expect(r).toBe(evidenceHash2(c));
    }
  });

  it("direkter INSERT Version 1 ohne Wartungsausnahme wird abgelehnt, unbekannte Version abgelehnt; Version 2 mit Klartext reason abgelehnt", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    expect(await code(db.insert(bookingEvidence).values({ matchId: m.match.id, kind: "request_sent", hashVersion: 1 }))).not.toBeNull();
    expect(await code(db.insert(bookingEvidence).values({ matchId: m.match.id, kind: "request_sent", hashVersion: 3 }))).not.toBeNull();
    expect(await code(db.insert(bookingEvidence).values({ matchId: m.match.id, kind: "request_sent", reason: "Klartext" }))).not.toBeNull();
    await maintenance((tx) => tx.insert(bookingEvidence).values({ matchId: m.match.id, kind: "request_sent", hashVersion: 1, reason: "Altklartext" }));
    expect((await verifyEvidenceChain()).ok).toBe(true); // Mischkette
  });

  it("Prüfer erkennt NULL-Hash und unbekannte Version als 'hash'", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    await db.insert(bookingEvidence).values({ matchId: m.match.id, kind: "request_sent" });
    await maintenance((tx) => tx.execute(sql`alter table booking_evidence disable trigger booking_evidence_append_only`));
    try {
      await maintenance((tx) => tx.execute(sql`update booking_evidence set hash = null where seq = 1`).catch(() => null));
    } finally {
      await maintenance((tx) => tx.execute(sql`alter table booking_evidence enable trigger booking_evidence_append_only`));
    }
    // hash ist NOT NULL: ein NULL-Hash ist gar nicht speicherbar; die Prüfung stützt sich auf IS DISTINCT FROM (siehe Quelltext-Test); hier: unbekannte Version
    await maintenance((tx) => tx.execute(sql`alter table booking_evidence disable trigger all`));
    try {
      await maintenance((tx) => tx.execute(sql`alter table booking_evidence drop constraint booking_evidence_hash_version_check`));
      await maintenance((tx) => tx.execute(sql`update booking_evidence set hash_version = 3 where seq = 1`));
      expect(await verifyEvidenceChain()).toMatchObject({ ok: false, firstBadSeq: 1, reason: "hash" });
      await maintenance((tx) => tx.execute(sql`update booking_evidence set hash_version = 2 where seq = 1`));
      await maintenance((tx) => tx.execute(sql`alter table booking_evidence add constraint booking_evidence_hash_version_check check (hash_version in (1, 2))`));
    } finally {
      await maintenance((tx) => tx.execute(sql`alter table booking_evidence enable trigger all`));
    }
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("evidence_hash_of: unbekannte Version und Version 1 ohne match_id sind Fehler (kein stilles Zurückfallen)", async () => {
    const v = "11111111-1111-4111-8111-111111111111";
    expect(await msgOf(db.execute(sql`select evidence_hash_of(jsonb_populate_record(null::booking_evidence, jsonb_build_object('id', ${v}::text, 'hash_version', 3, 'seq', 1, 'match_id', ${v}::text, 'kind', 'request_sent')))`))).toMatch(/unbekannte hash_version/);
    expect(await msgOf(db.execute(sql`select evidence_hash_of(jsonb_populate_record(null::booking_evidence, jsonb_build_object('id', ${v}::text, 'hash_version', 1, 'seq', 1, 'kind', 'request_sent')))`))).toMatch(/verlangt match_id/);
  });

  it("evidence_clean_reason = cleanReason (Gleichhaltung: Steuer-/Bidi-/Zero-Width-Zeichen, Leerraum, Emoji, Zeilenumbrüche)", async () => {
    const inputs = ["  Halle belegt  ", "a\u0001b\u0007c", "Hal​le‏ ﻿belegt⁠", "x\n\n\n\ny", "a \t\t b", "Emoji 😀🏟 ok", "‮umgekehrt‬", "   \n  ", "Zeile1\nZeile2", "a\r\nb", "\u00A0 nbsp \u00A0", "\tTab\tmitte\t", "x".repeat(250), "😀".repeat(5), "\u2028x\u2029"];
    for (const i of inputs) {
      const sqlOut = rows<{ r: string }>(await db.execute(sql`select evidence_clean_reason(${i}) as r`))[0].r;
      expect(sqlOut, JSON.stringify(i)).toBe(cleanReason(i));
    }
  });

  it("Quelltext-Regel: Funktionen unter der Zählersperre sperren außer dem Zähler nichts (kein FOR UPDATE/SHARE auf matches, Nutzern, Fachzeilen)", async () => {
    const src = rows<{ proname: string; prosrc: string }>(await db.execute(sql`select proname, prosrc from pg_proc where proname like 'evidence\\_%' or proname like 'tournaments\\_%'`));
    for (const f of src) {
      const locks = f.prosrc.match(/for\s+(no\s+key\s+)?(update|share)/gi) ?? [];
      const onCounter = (f.prosrc.match(/booking_evidence_counter[^;]*for\s+update/gi) ?? []).length;
      expect(locks.length, f.proname).toBe(onCounter);
    }
  });
});

describe("Review R-T243 (w4): Einstellungsschutz, expired ohne Frist, Turnier-Idempotenz, Frist-Lesepfade", () => {
  it("evidence-Einstellungen: Umbenennen, Löschen und Ändern ohne Marker werden abgelehnt (OLD.key UND NEW.key); fremde Schlüssel bleiben frei", async () => {
    expect(await code(db.execute(sql`update settings set key = 'evidence_frei' where key = 'evidence_enforcement'`))).not.toBeNull();
    expect(await code(db.execute(sql`update settings set key = 'evidence_enforcement' where key = 'evidence_clock_source'`))).not.toBeNull();
    expect(await code(db.execute(sql`delete from settings where key = 'evidence_enforcement'`))).not.toBeNull();
    expect(await code(db.execute(sql`insert into settings (key, value) values ('evidence_cutover_at', to_jsonb('2000-01-01T00:00:00Z'::text)) on conflict (key) do update set value = excluded.value`))).not.toBeNull();
    await db.execute(sql`insert into settings (key, value) values ('evidence_head_test_frei', to_jsonb('x'::text)) on conflict (key) do update set value = excluded.value`);
    await db.execute(sql`delete from settings where key = 'evidence_head_test_frei'`);
  });

  it("expired mit fehlender Frist (reply_deadline NULL): Eintrag mit deadline_at NULL, kein Fehler (auch bei ON)", async () => {
    await enforceOn();
    const s = await setup();
    await db.update(matches).set({ vetoTurnDeadline: null }).where(eq(matches.id, s.matchId));
    await answer(s, "declined", { answeredAt: false });
    const x = (await ev(s.matchId)).find((e) => e.kind === "expired")!;
    expect(x.deadlineAt).toBeNull();
    expect(x.enforced).toBe(true);
  });

  it("Turnier-Idempotenz nur über das WHEN: eine spätere Änderung von venue_confirmed_at (Wert -> anderer Wert) erzeugt keinen zweiten Eintrag; Zusage, Rücknahme, Zusage = zwei Einträge (gewollt)", async () => {
    const s = await setup();
    const org = await makeUser("nlorg3");
    const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: "NL Idem", city: "E2E-NL", startsOn: "2027-02-01", format: "knockout", maxTeams: 4, venueId: s.venue.id }).returning();
    const count = async () => (await db.select().from(bookingEvidence).where(eq(bookingEvidence.tournamentId, t.id))).length;
    await db.execute(sql`update tournaments set venue_confirmed_at = now() where id = ${t.id}`);
    await db.execute(sql`update tournaments set venue_confirmed_at = now() + interval '1 minute' where id = ${t.id}`);
    await db.execute(sql`update tournaments set name = 'NL Idem 2' where id = ${t.id}`);
    expect(await count()).toBe(1);
    await db.execute(sql`update tournaments set venue_confirmed_at = null where id = ${t.id}`);
    await db.execute(sql`update tournaments set venue_confirmed_at = now() where id = ${t.id}`);
    expect(await count()).toBe(2);
  });

  it("Frist-Lesepfade: answerHallRequest-Muster (Zeile unter dem FOR UPDATE des Spiels) und Ablauf VOR dem Zurücksetzen von matches halten die Frist fest; ein späteres Zurücksetzen ändert den Eintrag nicht", async () => {
    await enforceOn();
    const s = await setup({ deadlineOffsetMs: 3_600_000 });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from matches where id = ${s.matchId} for update`);
      await tx.execute(sql`update match_hall_requests set status = 'confirmed', answered_at = now(), answered_by = ${s.op.id} where match_id = ${s.matchId} and venue_id = ${s.venue.id}`);
      await tx.execute(sql`update matches set veto_turn_deadline = null where id = ${s.matchId}`); // settleHallCheck setzt die Frist danach zurück
    });
    const a = (await ev(s.matchId)).find((e) => e.kind === "accepted")!;
    expect(a.deadlineAt!.getTime()).toBe(s.deadline.getTime());
    const s2 = await setup({ deadlineOffsetMs: -60_000 });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from matches where id = ${s2.matchId} for update`);
      await tx.execute(sql`update match_hall_requests set status = 'declined' where match_id = ${s2.matchId} and venue_id = ${s2.venue.id}`); // Ablauf (ohne answered_at)
      await tx.execute(sql`update matches set veto_turn_deadline = null where id = ${s2.matchId}`);
    });
    const x = (await ev(s2.matchId)).find((e) => e.kind === "expired")!;
    expect(x.deadlineAt!.getTime()).toBe(s2.deadline.getTime());
  });
});
