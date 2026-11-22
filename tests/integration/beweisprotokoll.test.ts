import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor, venues } from "@/db/schema-finance";
import { EVIDENCE_KINDS, EVIDENCE_REASON_MAX } from "@/lib/evidence";
import { evidenceReport, findOrphans, reconcileEvidence, verifyEvidenceChain } from "@/server/evidence";
import { runEvidenceHead } from "@/server/evidence-head";
import { actorCommitment, currentRound, recordEvidence } from "@/server/evidence-write";
import { cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 009 M3a (Plan docs/design/009-m3-plan.md, Abschnitte 3 und 12): Beweisprotokoll, Kette, Unveränderlichkeit, Idempotenz unter der Zählersperre.
// Die Kette ist EINE globale Reihe: jeder Test setzt sie zurück (Wartungsausnahme, nur in dieser Test-Datenbank).
const maintenance = (fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await fn(tx);
  });

async function resetChain() {
  await maintenance(async (tx) => {
    await tx.delete(evidenceActor);
    await tx.delete(bookingEvidence);
    await tx.update(bookingEvidenceCounter).set({ lastSeq: 0, lastHash: "" }).where(eq(bookingEvidenceCounter.id, 1));
    await tx.execute(sql`delete from settings where key = 'evidence_head_last'`);
  });
}

let seq = 0;
async function setup() {
  const m = await makeMatch({ hoursAhead: 72 });
  const [v] = await db.insert(venues).values({ name: `E2E Beweis Halle ${Date.now().toString(36)}${++seq}`, city: "Essen", source: "manual" }).returning();
  return { matchId: m.match.id, venueId: v.id, m };
}
const rec = (matchId: string, venueId: string | null, kind: (typeof EVIDENCE_KINDS)[number], extra: Partial<Parameters<typeof recordEvidence>[1]> = {}) =>
  db.transaction((tx) => recordEvidence(tx, { matchId, venueId, round: 1, kind, ...extra }));
const all = () => db.select().from(bookingEvidence).orderBy(bookingEvidence.seq);

beforeEach(async () => {
  await cleanup();
  await resetChain();
});
afterAll(async () => {
  await cleanup();
  await resetChain();
});

describe("Eintrag und Kette", () => {
  it("jeder Eintrag bekommt lückenlose seq, prev_hash = Hash der Vorgängerzeile, Server-Zeit; die Kette ist gültig; der Zähler führt Stand und Kopf-Hash", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await rec(matchId, venueId, "accepted");
    await rec(matchId, null, "job_open");
    const rows = await all();
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(rows[0].prevHash).toBe("");
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(rows[2].prevHash).toBe(rows[1].hash);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.hash))).toBe(true);
    expect(Math.abs(rows[2].at.getTime() - Date.now())).toBeLessThan(60_000);
    const check = await verifyEvidenceChain();
    expect(check).toMatchObject({ ok: true, count: 3, headHash: rows[2].hash, firstBadSeq: null });
    const [c] = await db.select().from(bookingEvidenceCounter);
    expect(c).toMatchObject({ lastSeq: 3, lastHash: rows[2].hash });
  });

  it("die Anwendung kann seq, at, prev_hash und hash nicht vorgeben: ein direkter INSERT mit eigenen Werten wird vom Trigger überschrieben", async () => {
    const { matchId, venueId } = await setup();
    const [r] = await db
      .insert(bookingEvidence)
      .values({ matchId, venueId, round: 1, kind: "request_sent", seq: 999, at: new Date("2000-01-01T00:00:00Z"), prevHash: "gefaelscht", hash: "gefaelscht" })
      .returning();
    expect(r.seq).toBe(1);
    expect(r.prevHash).toBe("");
    expect(r.hash).not.toBe("gefaelscht");
    expect(r.at.getFullYear()).toBeGreaterThan(2020);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("nur anhängend: UPDATE und DELETE auf booking_evidence und jede Änderung des Zählers durch die Anwendung werden abgelehnt; die Wartungsausnahme erlaubt sie", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await expect(db.update(bookingEvidence).set({ reason: "x" })).rejects.toThrow();
    await expect(db.delete(bookingEvidence)).rejects.toThrow();
    await expect(db.update(bookingEvidenceCounter).set({ lastSeq: 0 })).rejects.toThrow();
    await expect(db.delete(bookingEvidenceCounter)).rejects.toThrow();
    await maintenance((tx) => tx.update(bookingEvidence).set({ reason: "Wartung" }));
    expect((await all())[0].reason).toBe("Wartung");
  });

  it("verifyEvidenceChain meldet die ERSTE abweichende seq: geänderter Inhalt, geänderter Hash, gelöschte Zeile (Lücke), gelöschte letzte Zeile (Zähler), manipulierter Zähler", async () => {
    const { matchId, venueId } = await setup();
    for (const kind of ["request_sent", "accepted", "job_open", "job_booked"] as const) await rec(matchId, kind.startsWith("job") ? null : venueId, kind);
    const base = await all();
    // Inhalt geändert (Zeile 2) -> Hash passt nicht mehr
    await maintenance((tx) => tx.update(bookingEvidence).set({ reason: "nachträglich" }).where(eq(bookingEvidence.seq, 2)));
    expect(await verifyEvidenceChain()).toMatchObject({ ok: false, firstBadSeq: 2, reason: "hash" });
    await maintenance((tx) => tx.update(bookingEvidence).set({ reason: base[1].reason }).where(eq(bookingEvidence.seq, 2)));
    expect((await verifyEvidenceChain()).ok).toBe(true);
    // Hash und Inhalt gleichzeitig umgeschrieben (Zeile 2): die Folgezeile hat den alten prev_hash
    await maintenance((tx) => tx.update(bookingEvidence).set({ kind: "declined", hash: "abc" }).where(eq(bookingEvidence.seq, 2)));
    expect((await verifyEvidenceChain()).firstBadSeq).toBe(2);
    await maintenance((tx) => tx.update(bookingEvidence).set({ kind: base[1].kind, hash: base[1].hash }).where(eq(bookingEvidence.seq, 2)));
    // Lücke: Zeile 2 gelöscht -> erste abweichende seq ist 3
    await maintenance((tx) => tx.delete(bookingEvidence).where(eq(bookingEvidence.seq, 2)));
    expect(await verifyEvidenceChain()).toMatchObject({ ok: false, firstBadSeq: 3, reason: "seq-luecke" });
  });

  it("gelöschte LETZTE Zeile und manipulierter Zähler werden über den Zählerstand erkannt", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await rec(matchId, venueId, "accepted");
    await maintenance((tx) => tx.delete(bookingEvidence).where(eq(bookingEvidence.seq, 2)));
    expect(await verifyEvidenceChain()).toMatchObject({ ok: false, firstBadSeq: 2, reason: "zaehler" });
    await resetChain();
    await rec(matchId, venueId, "request_sent");
    await maintenance((tx) => tx.update(bookingEvidenceCounter).set({ lastHash: "x" }));
    expect((await verifyEvidenceChain()).ok).toBe(false);
  });

  it("Hash: gleiche Eingabe = gleicher Hash (Sonderzeichen, Unicode, '|', Zeilenumbruch, leer); jedes Feld ändert den Hash; Feldgrenzen verschieben sich nicht (längenpräfixiert)", async () => {
    const { matchId, venueId } = await setup();
    const at = new Date("2026-11-12T10:00:00.123456Z");
    const h = async (o: { reason?: string | null; commitment?: string; kind?: string; round?: number; prev?: string; seq?: number }) => {
      const r = await db.execute(sql`select evidence_hash(${o.seq ?? 1}, ${matchId}::uuid, ${venueId}::uuid, ${o.round ?? 1}, null, ${o.kind ?? "accepted"}, ${o.reason ?? null}, ${at}::timestamptz, ${o.commitment ?? ""}, ${o.prev ?? ""}) as h`);
      return (r.rows[0] as { h: string }).h;
    };
    for (const reason of ["", null, "a|b", "Zeile1\nZeile2", "Ünïcödé 😀 ß", "x;1:y"]) expect(await h({ reason })).toBe(await h({ reason }));
    const base = await h({ reason: "a" });
    for (const other of [{ reason: "b" }, { kind: "declined" }, { round: 2 }, { prev: "p" }, { seq: 2 }, { commitment: "c" }]) expect(await h({ reason: "a", ...other })).not.toBe(base);
    // ohne Längenpräfix würden diese zwei Eingaben dieselbe Verkettung ergeben
    expect(await h({ kind: "x|y", reason: "z" })).not.toBe(await h({ kind: "x", reason: "y|z" })); // Nachbarfelder kind und reason
    expect(await h({ kind: "x;1:y", reason: "z" })).not.toBe(await h({ kind: "x", reason: "1:y;1:z" }));
    expect(await h({ reason: null })).toBe(await h({ reason: "" })); // NULL und leer sind dieselbe Aussage "keine Begründung"
  });

  it("die Liste der Arten im Code und der CHECK in der Datenbank stimmen überein; eine unbekannte Art wird abgelehnt", async () => {
    const { matchId, venueId } = await setup();
    const r = await db.execute(sql`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'booking_evidence_kind_check'`);
    const def = (r.rows[0] as { d: string }).d;
    for (const kind of EVIDENCE_KINDS) expect(def).toContain(`'${kind}'`);
    expect((def.match(/'[a-z_]+'/g) ?? []).length).toBe(EVIDENCE_KINDS.length);
    await expect(db.insert(bookingEvidence).values({ matchId, venueId, kind: "erfunden" })).rejects.toThrow();
  });

  it("Begründung: Fremdtext wird bereinigt (Steuerzeichen, Leerraum) und auf 300 Zeichen gekürzt; die Datenbank lehnt mehr als 300 Zeichen ab", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "declined", { reason: `  Halle\u0000 belegt‮!\n\n\n\n am  Samstag\u0007 ${"x".repeat(400)}` });
    const [row] = await all();
    expect(row.reason!.length).toBeLessThanOrEqual(EVIDENCE_REASON_MAX);
    expect(row.reason).not.toMatch(/[\u0000-\u0008‮\u0007]/);
    expect(row.reason!.startsWith("Halle belegt!")).toBe(true);
    await expect(db.insert(bookingEvidence).values({ matchId, venueId, kind: "expired", reason: "y".repeat(301) })).rejects.toThrow();
    await rec(matchId, venueId, "request_sent", { reason: "   \n  " });
    expect((await all()).find((r) => r.kind === "request_sent")!.reason).toBeNull(); // nur Leerraum = keine Begründung
  });
});

describe("Idempotenz und Parallelität (Zähler zuerst sperren, dann Existenz prüfen, dann einfügen)", () => {
  it("derselbe Wechsel parallel aufgerufen (Promise.all): genau ein Eintrag, kein Fehler, seq lückenlos", async () => {
    const { matchId, venueId } = await setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => rec(matchId, venueId, "accepted")));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect((await all()).map((r) => r.seq)).toEqual([1]);
    await rec(matchId, venueId, "declined"); // die nächste Art bekommt direkt die seq 2 (keine verbrauchte Nummer)
    expect((await all()).map((r) => r.seq)).toEqual([1, 2]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("Gate: läuft der erste Aufruf noch (Zähler gesperrt, nicht committet), wartet der zweite und liefert danach 'schon vorhanden', ohne Fehler und ohne seq", async () => {
    const { matchId, venueId } = await setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let firstDone: () => void = () => {};
    const firstIn = new Promise<void>((r) => (firstDone = r));
    const first = db.transaction(async (tx) => {
      const r = await recordEvidence(tx, { matchId, venueId, round: 1, kind: "request_sent" });
      firstDone();
      await gate; // Transaktion bleibt offen
      return r;
    });
    await firstIn;
    const second = rec(matchId, venueId, "request_sent");
    await new Promise((r) => setTimeout(r, 300));
    release();
    expect(await first).toMatchObject({ created: true, seq: 1 });
    expect(await second).toEqual({ created: false, seq: null });
    expect((await all()).map((r) => r.seq)).toEqual([1]);
  });

  it("parallele Einträge verschiedener Spiele: eindeutige, lückenlose seq und gültige Kette", async () => {
    const a = await setup();
    const b = await setup();
    await Promise.all([
      ...["request_sent", "accepted", "expired"].map((k) => rec(a.matchId, a.venueId, k as (typeof EVIDENCE_KINDS)[number])),
      ...["request_sent", "declined", "unmanaged"].map((k) => rec(b.matchId, b.venueId, k as (typeof EVIDENCE_KINDS)[number])),
    ]);
    expect((await all()).map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("Abbruch der Transaktion verbraucht keine seq und hinterlässt keinen Eintrag", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await expect(
      db.transaction(async (tx) => {
        await recordEvidence(tx, { matchId, venueId, round: 1, kind: "accepted" });
        throw new Error("Geschäftsaktion scheitert");
      }),
    ).rejects.toThrow("scheitert");
    await rec(matchId, venueId, "declined");
    expect((await all()).map((r) => [r.seq, r.kind])).toEqual([[1, "request_sent"], [2, "declined"]]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("mehrere Runden desselben Spiels (neuer Termin) erzeugen getrennte Einträge; die job_*-Arten dürfen sich wiederholen", async () => {
    const { matchId, venueId } = await setup();
    expect(await db.transaction((tx) => currentRound(tx, matchId))).toBe(0);
    await db.transaction((tx) => recordEvidence(tx, { matchId, venueId, round: 1, kind: "request_sent" }));
    await db.transaction((tx) => recordEvidence(tx, { matchId, venueId, round: 2, kind: "request_sent" }));
    expect(await db.transaction((tx) => currentRound(tx, matchId))).toBe(2);
    await rec(matchId, null, "job_booked");
    await rec(matchId, null, "job_unavailable");
    await rec(matchId, null, "job_booked");
    expect((await all()).map((r) => r.kind)).toEqual(["request_sent", "request_sent", "job_booked", "job_unavailable", "job_booked"]);
  });
});

describe("Review-Fixes M3a (Security/Code-Review)", () => {
  it("TRUNCATE auf booking_evidence und booking_evidence_counter wird ohne Wartungsausnahme abgelehnt (Zeilen-Trigger greifen bei TRUNCATE nicht), mit Wartungsausnahme erlaubt", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await expect(db.execute(sql`truncate booking_evidence`)).rejects.toThrow();
    await expect(db.execute(sql`truncate booking_evidence_counter`)).rejects.toThrow();
    await expect(db.execute(sql`truncate booking_evidence cascade`)).rejects.toThrow();
    expect(await all()).toHaveLength(1);
    // mit Wartungsausnahme erlaubt (der Cleanup nutzt DELETE, nicht TRUNCATE)
    await maintenance((tx) => tx.execute(sql`truncate booking_evidence cascade`));
    expect(await all()).toHaveLength(0);
  });

  it("zwei parallele DIREKTE INSERTs (ohne recordEvidence) bekommen verschiedene, lueckenlose seq: die Trigger-Sperre allein reicht", async () => {
    const { matchId, venueId } = await setup();
    await Promise.all(
      (["request_sent", "accepted", "expired", "declined"] as const).map((kind) => db.insert(bookingEvidence).values({ matchId, venueId, round: 1, kind })),
    );
    expect((await all()).map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("verifyEvidenceChain liefert unter gleichzeitigen Eintraegen nie einen Fehlalarm (Zeilen und Zaehlerstand aus einer Anweisung)", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    const writers = Array.from({ length: 25 }, (_, i) => db.insert(bookingEvidence).values({ matchId, venueId: null, round: 1, kind: "job_booked", jobId: null, reason: `w${i}` }));
    const readers = Array.from({ length: 25 }, () => verifyEvidenceChain());
    const results = await Promise.all([...writers, ...readers]);
    const checks = results.filter((r): r is Awaited<ReturnType<typeof verifyEvidenceChain>> => typeof r === "object" && r !== null && "ok" in r);
    expect(checks).toHaveLength(25);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect((await verifyEvidenceChain())).toMatchObject({ ok: true, count: 26 });
  });

  it("Zaehler-Guard: ein direktes UPDATE des Zaehlers ist auch innerhalb eines anderen Triggers/einer Funktion nicht erlaubt (nur der INSERT-Trigger setzt die Sitzungsvariable kurz)", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await expect(db.update(bookingEvidenceCounter).set({ lastSeq: 99 })).rejects.toThrow();
    // ECHT verschachtelt (Trigger-Tiefe 2): ein fremder Trigger auf einer TEMP-Tabelle aendert den Zaehler. Die alte Regel pg_trigger_depth() > 1 haette das erlaubt, die Sitzungsvariable nicht.
    // DDL und Anweisung laufen in einer Transaktion, die durch den erwarteten Fehler zurueckgerollt wird (nichts bleibt zurueck).
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`create temp table evil_nested (x int)`);
        await tx.execute(sql`create function pg_temp.evil_nested_fn() returns trigger as $$ begin update booking_evidence_counter set last_seq = 99 where id = 1; return new; end; $$ language plpgsql`);
        await tx.execute(sql`create trigger evil_nested_trg after insert on evil_nested for each row execute function pg_temp.evil_nested_fn()`);
        await tx.execute(sql`insert into evil_nested values (1)`);
      }),
    ).rejects.toThrow();
    expect((await db.select().from(bookingEvidenceCounter))[0].lastSeq).toBe(1);
    // die Sitzungsvariable bleibt nach einem Eintrag auf 'off'
    const r = await db.execute(sql`select current_setting('socaz.evidence_insert', true) as v`);
    expect(["off", "", null]).toContain((r.rows[0] as { v: string | null }).v);
  });

  it("Begruendung: Zero-Width- und Richtungszeichen werden entfernt (Wirkung im PDF, M3c)", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "declined", { reason: "Hal\u200Ble\u200F \uFEFFbelegt\u2060" });
    expect((await all())[0].reason).toBe("Halle belegt");
  });
});

describe("Personenfelder getrennt (evidence_actor, außerhalb des Hashes; Entwurf, Frage R3)", () => {
  it("Name und E-Mail landen nur in evidence_actor; im Hash steht nur der gesalzene Verpflichtungswert; Löschen/Anonymisieren des Actors lässt die Kette gültig", async () => {
    const { matchId, venueId } = await setup();
    const op = await makeUser("beweisop");
    await rec(matchId, venueId, "accepted", { actor: { userId: op.id, name: "Hallen Betreiber", email: "betreiber@test.invalid" } });
    await rec(matchId, venueId, "declined", { actor: { userId: op.id, name: "Hallen Betreiber", email: "betreiber@test.invalid" } });
    const rows = await all();
    const actors = await db.select().from(evidenceActor);
    expect(actors).toHaveLength(2);
    expect(actors[0].salt).not.toBe(actors[1].salt); // Salz je Zeile
    const a0 = actors.find((a) => a.evidenceId === rows[0].id)!;
    expect(rows[0].actorCommitment).toBe(actorCommitment(a0.salt, op.id));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("betreiber@test.invalid");
    expect(dump).not.toContain(op.id);
    expect(dump).not.toContain("Hallen Betreiber");
    const before = await verifyEvidenceChain();
    expect(before.ok).toBe(true);
    // Anonymisieren (Felder leeren) und Löschen: die Kette bleibt gültig, der Kopf-Hash unverändert
    await db.update(evidenceActor).set({ name: null, email: null, userId: null }).where(eq(evidenceActor.evidenceId, rows[0].id));
    await db.delete(evidenceActor).where(eq(evidenceActor.evidenceId, rows[1].id));
    expect(await verifyEvidenceChain()).toEqual(before);
    expect(await db.select().from(evidenceActor)).toHaveLength(1);
  });

  it("ohne Actor: kein evidence_actor, leerer Verpflichtungswert", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "expired");
    expect((await all())[0].actorCommitment).toBe("");
    expect(await db.select().from(evidenceActor)).toHaveLength(0);
  });
});

describe("Guard statt Fremdschlüssel, Verwaiste, Abgleich (Plan 14.1/14.2/14.3) – UNGETESTET gegen die Datenbank", () => {
  it("ein Spiel und eine Halle mit Protokolleinträgen lassen sich nicht löschen (Guard-Trigger statt RESTRICT); mit Wartungsausnahme geht es", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await expect(db.execute(sql`delete from matches where id = ${matchId}`)).rejects.toThrow(/Beweisprotokoll/);
    await expect(db.execute(sql`delete from venues where id = ${venueId}`)).rejects.toThrow(/Beweisprotokoll/);
  });

  it("keine Fremdschlüssel an booking_evidence und evidence_actor.user_id (nur evidence_actor.evidence_id bleibt)", async () => {
    const r = await db.execute(sql`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.conrelid::regclass::text in ('booking_evidence', 'evidence_actor')`);
    expect((r.rows as { tbl: string; col: string }[]).map((x) => `${x.tbl}.${x.col}`).sort()).toEqual(["evidence_actor.evidence_id"]);
  });

  it("Verwaiste: ein Eintrag zu einem (per Wartungsausnahme) gelöschten Spiel/Halle wird gemeldet, die Kette bleibt gültig", async () => {
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    expect(await findOrphans()).toEqual({ matchIds: [], venueIds: [] });
    await maintenance(async (tx) => {
      await tx.execute(sql`delete from matches where id = ${matchId}`);
      await tx.execute(sql`delete from venues where id = ${venueId}`);
    });
    expect(await findOrphans()).toEqual({ matchIds: [matchId], venueIds: [venueId] });
    expect((await verifyEvidenceChain()).ok).toBe(true);
    expect((await evidenceReport()).ok).toBe(false);
  });

  it("Abgleich: eine Anfragezeile OHNE Eintrag (Wartungsausnahme unterdrückt den Haken) wird gemeldet; mit Eintrag der AKTUELLEN Runde nicht; ein Altrunden-Eintrag zählt nicht", async () => {
    const { matchId, venueId } = await setup();
    // Zeile unter Wartungsausnahme anlegen: der Trigger schreibt nichts
    await maintenance((tx) => tx.execute(sql`insert into match_hall_requests (match_id, venue_id, position, status) values (${matchId}, ${venueId}, 0, 'pending')`));
    expect((await reconcileEvidence()).map((m) => [m.source, m.matchId, m.status])).toContainEqual(["hall", matchId, "pending"]);
    // Eintrag der Runde 1 nachtragen: gemeldet wird nichts mehr
    await rec(matchId, venueId, "request_sent");
    expect((await reconcileEvidence()).filter((m) => m.matchId === matchId)).toEqual([]);
    // neuer Termin: Runde 2 existiert (anderer Eintrag), die Zeile hat aber nur den Eintrag der Runde 1 -> fehlt in der aktuellen Runde
    await db.transaction((tx) => recordEvidence(tx, { matchId, venueId: null, round: 2, kind: "job_open" }));
    expect((await reconcileEvidence()).filter((m) => m.matchId === matchId).map((m) => m.status)).toEqual(["pending"]);
  });

  it("Abgleich: Aufträge in jedem Status außer in_progress brauchen den Eintrag job_<Status>", async () => {
    const { matchId, venueId } = await setup();
    await maintenance((tx) => tx.execute(sql`insert into booking_jobs (match_id, venue_id, status) values (${matchId}, ${venueId}, 'booked')`));
    expect((await reconcileEvidence()).some((m) => m.source === "job" && m.matchId === matchId && m.status === "booked")).toBe(true);
    const id = ((await db.execute(sql`select id from booking_jobs where match_id = ${matchId}`)).rows[0] as { id: string }).id;
    await db.transaction((tx) => recordEvidence(tx, { matchId, venueId, round: 0, kind: "job_booked", jobId: id }));
    expect((await reconcileEvidence()).some((m) => m.source === "job" && m.matchId === matchId)).toBe(false);
  });

  it("Tagesjob evidence-head: gibt Anzahl und Kopf-Hash aus, merkt sich den Stand und schlägt Alarm, wenn die Anzahl kleiner wird oder der frühere Kopf-Hash fehlt", async () => {
    const owner = await makeUser("beweishead", "owner");
    void owner;
    const { matchId, venueId } = await setup();
    await rec(matchId, venueId, "request_sent");
    await rec(matchId, venueId, "accepted");
    const first = await runEvidenceHead();
    expect(first).toMatchObject({ count: 2, ok: true });
    expect(first.headHash).toMatch(/^[0-9a-f]{64}$/);
    // Zeile 2 per Wartung löschen: Anzahl kleiner als beim letzten Lauf, Kette (Zähler) passt nicht mehr
    await maintenance((tx) => tx.delete(bookingEvidence).where(eq(bookingEvidence.seq, 2)));
    const second = await runEvidenceHead();
    expect(second.ok).toBe(false);
    expect(second.alarms.join(" ")).toMatch(/Anzahl kleiner|Kette ungültig/);
    expect(second.alarms.join(" ")).toMatch(/früherer Kopf-Hash|frühere Kopf-Hash/);
  });

  it("Abgleich: Stichtag – Zeilen von VOR dem Stichtag (Altbestand ohne Einträge) werden nicht gemeldet; Zeilen danach schon", async () => {
    const { matchId, venueId } = await setup();
    await maintenance((tx) => tx.execute(sql`insert into match_hall_requests (match_id, venue_id, position, status, created_at) values (${matchId}, ${venueId}, 0, 'confirmed', '2000-01-01T00:00:00Z')`));
    expect((await reconcileEvidence()).filter((m) => m.matchId === matchId)).toEqual([]); // Altbestand
    await maintenance((tx) => tx.execute(sql`update match_hall_requests set created_at = now() where match_id = ${matchId}`));
    expect((await reconcileEvidence()).filter((m) => m.matchId === matchId).map((m) => m.status)).toEqual(["confirmed"]);
  });

  it("Abgleich: eine Zeile declined MIT answered_at, zu der die Runde nur accepted kennt (confirmed -> declined ohne Eintrag), gilt als erwartet; ohne answered_at wird sie gemeldet", async () => {
    const { matchId, venueId } = await setup();
    await maintenance((tx) => tx.execute(sql`insert into match_hall_requests (match_id, venue_id, position, status, answered_at) values (${matchId}, ${venueId}, 0, 'declined', now())`));
    await rec(matchId, venueId, "accepted");
    expect((await reconcileEvidence()).filter((m) => m.matchId === matchId)).toEqual([]);
    await maintenance((tx) => tx.execute(sql`update match_hall_requests set answered_at = null where match_id = ${matchId}`));
    expect((await reconcileEvidence()).filter((m) => m.matchId === matchId).map((m) => m.status)).toEqual(["declined"]);
  });

  it("Tagesjob leert evidence_actor-Zeilen gelöschter oder anonymisierter Konten (zweite Anonymisierung, Race mit deleteAccount); Zeile und Kette bleiben", async () => {
    const { matchId, venueId } = await setup();
    const alive = await makeUser("beweisalive");
    const gone = await makeUser("beweisgone");
    await rec(matchId, venueId, "accepted", { actor: { userId: alive.id, name: alive.name, email: alive.email } });
    await rec(matchId, venueId, "declined", { actor: { userId: gone.id, name: gone.name, email: gone.email } });
    await db.execute(sql`update users set email = ${`geloescht-${gone.id}@geloescht.invalid`}, name = 'Gelöscht' where id = ${gone.id}`);
    const r = await runEvidenceHead();
    expect(r.actorsCleared).toBe(1);
    const actors = await db.select().from(evidenceActor);
    expect(actors).toHaveLength(2);
    const goneRow = actors.find((a) => a.userId === null)!;
    expect(goneRow).toMatchObject({ userId: null, name: null, email: null });
    expect(actors.find((a) => a.userId === alive.id)!.email).toBe(alive.email);
    expect((await verifyEvidenceChain()).ok).toBe(true);
    expect((await runEvidenceHead()).actorsCleared).toBe(0); // idempotent
  });
});
