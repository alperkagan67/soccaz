import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { db } from "@/db";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor } from "@/db/schema-finance";
import { verifyEvidenceChain } from "@/server/evidence";
import { recordEvidence } from "@/server/evidence-write";
import { cleanup, makeMatch } from "./helpers";

// G25-009 A1 (verhaltensneutral): socaz_maintenance_allowed() bindet die Wartungsausnahme an die Rollenmitgliedschaft (session_user). Superuser (Tests/CI) bleiben implizit Mitglied.
// Die Tests arbeiten mit EIGENEN, eindeutig benannten Test-Rollen (Prozess-ID), die am Ende entfernt werden; die Rollen soccaz_* werden nur gelesen bzw. fuer Mitgliedstests kurz benutzt.
const pid = process.pid;
const NON = `soccaz_t_non_${pid}`; // kein Mitglied von soccaz_maintenance
const MEM = `soccaz_t_mem_${pid}`; // Mitglied von soccaz_maintenance
const url = process.env.DATABASE_URL as string;
let admin: pg.Client;

const q = async (c: pg.Client, text: string, params?: unknown[]) => (await c.query(text, params)).rows;
/** Einzelne Verbindung als Superuser, mit session authorization auf die Test-Rolle (session_user = Test-Rolle). */
async function asRole(role: string, fn: (c: pg.Client) => Promise<void>) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`set session authorization ${role}`);
    await fn(c);
  } finally {
    await c.end();
  }
}
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return String((e as Error).message);
  }
};

beforeAll(async () => {
  admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const maint = await q(admin, "select 1 from pg_roles where rolname = 'soccaz_maintenance'");
  if (!maint.length) throw new Error("Rolle soccaz_maintenance fehlt: zuerst node scripts/db-roles.mjs --apply (PR D)");
  for (const r of [NON, MEM]) {
    await admin.query(`drop role if exists ${r}`);
    await admin.query(`create role ${r} nologin`);
    await admin.query(`grant select, update on booking_evidence_counter to ${r}`);
  }
  await admin.query(`grant soccaz_maintenance to ${MEM}`);
});
afterAll(async () => {
  if (admin) {
    for (const r of [NON, MEM]) {
      await admin.query(`drop owned by ${r}`).catch(() => null);
      await admin.query(`drop role if exists ${r}`).catch(() => null);
    }
    await admin.end().catch(() => null);
  }
});

describe("socaz_maintenance_allowed()", () => {
  it("Superuser: nur der Wert zaehlt (implizit Mitglied)", async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      expect((await q(c, "select socaz_maintenance_allowed() as a"))[0].a).toBe(false);
      await c.query("begin");
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      expect((await q(c, "select socaz_maintenance_allowed() as a"))[0].a).toBe(true);
      await c.query("rollback");
    } finally {
      await c.end();
    }
  });

  it("Nicht-Mitglied: der gesetzte Wert ist wirkungslos; Mitglied: wirksam", async () => {
    await asRole(NON, async (c) => {
      await c.query("begin");
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      expect((await q(c, "select socaz_maintenance_allowed() as a"))[0].a).toBe(false);
      await c.query("rollback");
    });
    await asRole(MEM, async (c) => {
      await c.query("begin");
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      expect((await q(c, "select socaz_maintenance_allowed() as a"))[0].a).toBe(true);
      await c.query("rollback");
    });
  });

  it("Guard als Nicht-Mitglied: Zaehler-Update trotz gesetztem Wert abgelehnt, als Mitglied erlaubt (Rollback)", async () => {
    await asRole(NON, async (c) => {
      await c.query("begin");
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      expect(await fails(c.query("update booking_evidence_counter set last_seq = last_seq"))).toMatch(/darf nur der Beweisprotokoll-Trigger/);
      await c.query("rollback");
    });
    await asRole(MEM, async (c) => {
      await c.query("begin");
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      await c.query("update booking_evidence_counter set last_seq = last_seq");
      await c.query("rollback");
    });
  });

  it("Definer-Bypass: eine von einem Mitglied besessene SECURITY-DEFINER-Funktion verschafft dem Aufrufer KEINE Ausnahme (session_user bleibt der Aufrufer)", async () => {
    await admin.query(`create or replace function public.t_bypass_${pid}() returns void language plpgsql security definer set search_path = pg_catalog, public as $$
      begin
        perform set_config('socaz.ledger_maintenance', 'on', true);
        update public.booking_evidence_counter set last_seq = last_seq;
      end $$`);
    await admin.query(`alter function public.t_bypass_${pid}() owner to ${MEM}`);
    try {
      await asRole(NON, async (c) => {
        expect(await fails(c.query(`select public.t_bypass_${pid}()`))).toMatch(/darf nur der Beweisprotokoll-Trigger/);
      });
      await asRole(MEM, async (c) => {
        await c.query("begin");
        await c.query(`select public.t_bypass_${pid}()`); // das Mitglied selbst darf
        await c.query("rollback");
      });
    } finally {
      await admin.query(`drop function if exists public.t_bypass_${pid}()`);
    }
  });

  it("Zwischenzustand ohne die Rolle soccaz_maintenance: es gilt wie heute nur der Wert (transaktionslokal umbenannt, Rollback)", async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await c.query("begin");
      await c.query("alter role soccaz_maintenance rename to soccaz_maintenance_weg");
      await c.query(`set local session authorization ${NON}`);
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      expect((await q(c, "select socaz_maintenance_allowed() as a"))[0].a).toBe(true);
      await c.query("rollback");
    } finally {
      await c.end();
    }
    expect((await q(admin, "select 1 from pg_roles where rolname = 'soccaz_maintenance'")).length).toBe(1); // zurueckgerollt
  });

  it("Katalog-Gate: keine Funktion ausser socaz_maintenance_allowed enthaelt die Rohpruefung des Wertes; die Marker stehen bis A2 noch", async () => {
    const rows = await q(admin, "select p.proname, p.prosrc, p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'");
    const raw = rows.filter((r) => r.prosrc.includes("ledger_maintenance") && r.proname !== "socaz_maintenance_allowed").map((r) => r.proname);
    expect(raw).toEqual([]);
    const withMarker = rows.filter((r) => /evidence_insert|evidence_setting_write/.test(r.prosrc)).map((r) => r.proname).sort();
    expect(withMarker).toEqual(["booking_evidence_before_insert", "booking_evidence_counter_guard", "evidence_set_setting", "evidence_settings_guard"]);
    expect(rows.filter((r) => r.prosecdef).map((r) => r.proname)).toEqual([]); // A1 aendert keine Definer-Zuordnung
  });
});

describe("Restore-Wartungsmodus (logischer Restore der Beweiskette)", () => {
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

  async function chain() {
    const m = await makeMatch({ hoursAhead: 72 });
    for (const [round, kind] of [[1, "request_sent"], [1, "accepted"], [2, "request_sent"]] as const) {
      await db.transaction((tx) => recordEvidence(tx, { matchId: m.match.id, venueId: null, round, kind }));
      await new Promise((r) => setTimeout(r, 5));
    }
    const rows = (await db.execute(sql`select coalesce(jsonb_agg(to_jsonb(e) order by e.seq), '[]'::jsonb) as j from booking_evidence e`)) as unknown as { rows: { j: Record<string, unknown>[] }[] };
    const head = (await db.select().from(bookingEvidenceCounter))[0];
    return { rows: rows.rows[0].j, head: head.lastHash, count: head.lastSeq };
  }
  const wipe = () => maintenance(async (tx) => {
    await tx.delete(evidenceActor);
    await tx.delete(bookingEvidence);
    await tx.update(bookingEvidenceCounter).set({ lastSeq: 0, lastHash: "" }).where(eq(bookingEvidenceCounter.id, 1));
  });
  const restore = (rows: Record<string, unknown>[], expected: string | null, opts: { begin?: boolean } = {}) =>
    maintenance(async (tx) => {
      if (opts.begin !== false) await tx.execute(sql`select evidence_restore_begin()`);
      await tx.execute(sql`insert into booking_evidence select * from jsonb_populate_recordset(null::booking_evidence, ${JSON.stringify(rows)}::jsonb)`);
      if (expected !== null) await tx.execute(sql`select evidence_restore_finish(${expected})`);
    });
  const msg = async (p: Promise<unknown>) => {
    try {
      await p;
      return "";
    } catch (e) {
      const x = e as { message?: string; cause?: { message?: string } };
      return x.cause?.message ?? x.message ?? "?";
    }
  };

  it("Restore-Kopie hat denselben Kopf-Hash: seq/prev_hash/at/hash bleiben unveraendert, Kette gueltig", async () => {
    const orig = await chain();
    expect(orig.count).toBe(3);
    await wipe();
    await restore(orig.rows, orig.head);
    const now = (await db.select().from(bookingEvidenceCounter))[0];
    expect(now.lastHash).toBe(orig.head);
    expect(now.lastSeq).toBe(3);
    expect((await verifyEvidenceChain()).ok).toBe(true);
    const back = (await db.execute(sql`select seq, hash, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as at from booking_evidence order by seq`)) as unknown as { rows: { seq: number; hash: string; at: string }[] };
    expect(back.rows.map((r) => r.hash)).toEqual(orig.rows.map((r) => r.hash as string));
  });

  it("abgelehnt: nicht leere Zieltabelle, fehlender/falscher Kopf-Hash, Luecke, falscher Hash, zurueckdatiertes at, ohne Begin", async () => {
    const orig = await chain();
    expect(await msg(maintenance((tx) => tx.execute(sql`select evidence_restore_begin()`)))).toMatch(/nicht leer/);
    await wipe();
    expect(await msg(restore(orig.rows, "falsch"))).toMatch(/Kopf-Hash weicht ab/);
    await wipe();
    expect(await msg(restore(orig.rows, ""))).toMatch(/Pflicht/);
    await wipe();
    expect(await msg(restore([orig.rows[0], orig.rows[2]], orig.head))).toMatch(/seq 3 erwartet 2|seq/);
    await wipe();
    const bad = JSON.parse(JSON.stringify(orig.rows));
    bad[1].hash = "0".repeat(64);
    expect(await msg(restore(bad, orig.head))).toMatch(/Hash stimmt nicht/);
    await wipe();
    // zurueckdatiert: at der Zeile 2 vor Zeile 1, Hash passend neu berechnet (sonst greift schon die Hash-Pruefung)
    const early = JSON.parse(JSON.stringify(orig.rows));
    early[1].at = new Date(new Date(early[0].at as string).getTime() - 3_600_000).toISOString();
    const h = (await db.execute(sql`select evidence_hash_of(jsonb_populate_record(null::booking_evidence, ${JSON.stringify(early[1])}::jsonb)) as h`)) as unknown as { rows: { h: string }[] };
    early[1].hash = h.rows[0].h;
    expect(await msg(restore(early, null))).toMatch(/at nicht monoton/);
    await wipe();
    // ohne evidence_restore_begin: normales Verhalten (Werte werden neu vergeben, die Kopie waere eine andere Kette)
    await restore(orig.rows, null, { begin: false });
    const re = (await db.select().from(bookingEvidenceCounter))[0];
    expect(re.lastHash).not.toBe(orig.head);
  });

  it("Nicht-Mitglied kann den Restore-Modus nicht starten (Wert allein genuegt nicht)", async () => {
    await asRole(NON, async (c) => {
      await c.query("begin");
      await c.query("select set_config('socaz.ledger_maintenance', 'on', true)");
      expect(await fails(c.query("select evidence_restore_begin()"))).toMatch(/nur fuer die Wartungsrolle/);
      await c.query("rollback");
    });
  });
});
