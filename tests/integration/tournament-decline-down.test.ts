import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { db } from "@/db";
import { venueAccess, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { setSetting } from "@/server/settings";
import { declineTournamentVenue } from "@/server/tournament-confirm";
import { dbUrlAllowed } from "../../scripts/db-roles.mjs";
import { cleanup, makeUser } from "./helpers";

// Rueckfall 0059 (Turnier-Ablehnen): booking_evidence ist append-only. (a) OHNE declined-Zeile baut der Rueckfall alles zurueck, zweimal hintereinander ausfuehrbar (frische Wegwerf-Datenbank mit allen
// Migrationen, Prozess-ID im Namen); (b) MIT declined-Zeile bricht er ab und aendert nichts (in der Arbeits-Datenbank: eine echte Ablehnung anlegen, den Rueckfall in einer Transaktion mit ROLLBACK
// ausfuehren, danach aufraeumen).
const base = new URL(process.env.DATABASE_URL ?? "postgres://x@127.0.0.1/x");
const name = `soccaz_down0059_test_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const scratchUrl = new URL(base);
scratchUrl.pathname = "/" + name;
let admin: pg.Client;
let scratch: pg.Client;

const downStatements = readFileSync("drizzle/down/0059_down.sql", "utf8").split("--> statement-breakpoint");
const runDown = async (c: pg.Client) => {
  for (const s of downStatements) await c.query(s);
};
const state = async (c: pg.Client) =>
  (
    await c.query(`select
      (select count(*)::int from information_schema.columns where table_name = 'tournaments' and column_name like 'venue_decline%') as cols,
      (select count(*)::int from pg_trigger where tgname like 'tournaments_evidence_decline%') as triggers,
      (select count(*)::int from pg_proc where proname = 'evidence_tournament_decline_event') as fn,
      (select prosrc like '%declined_count%' from pg_proc where proname = 'evidence_emit') as emit_new,
      (select prosrc like '%venue_declined_at%' from pg_proc where proname = 'tournaments_reset_confirmation') as reset_new,
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'booking_evidence_tournament_kind_check') as kind_check`)
  ).rows[0];

beforeAll(async () => {
  if (!dbUrlAllowed(base.toString())) throw new Error("nur lokale Datenbank");
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  const r = spawnSync("node", ["node_modules/drizzle-kit/bin.cjs", "migrate"], { env: { ...process.env, DATABASE_URL: scratchUrl.toString() }, encoding: "utf8", timeout: 200_000 });
  if (r.status !== 0) throw new Error("Migration der Wegwerf-Datenbank fehlgeschlagen: " + (r.stdout + r.stderr).slice(-300));
  scratch = new pg.Client({ connectionString: scratchUrl.toString() });
  await scratch.connect();
}, 280_000);
afterAll(async () => {
  if (scratch) await scratch.end().catch(() => null);
  if (admin) {
    await admin.query(`drop database if exists "${name}" with (force)`).catch(() => null);
    await admin.end().catch(() => null);
  }
});

describe("Rueckfall 0059", () => {
  it("Vorzustand: Spalten, Trigger, neue Funktionsfassungen und der erweiterte CHECK sind da", async () => {
    expect(await state(scratch)).toMatchObject({ cols: 3, triggers: 2, fn: 1, emit_new: true, reset_new: true });
    expect((await state(scratch)).kind_check).toMatch(/'declined'/);
  });

  it("ohne declined-Zeile: alles zurueckgebaut (Spalten, Trigger, Funktion, alte Fassungen, CHECK nur accepted), ZWEIMAL hintereinander ausfuehrbar", async () => {
    await runDown(scratch);
    const first = await state(scratch);
    expect(first).toMatchObject({ cols: 0, triggers: 0, fn: 0, emit_new: false, reset_new: false });
    expect(first.kind_check).not.toMatch(/declined/);
    expect(first.kind_check).toMatch(/'accepted'/);
    await runDown(scratch);
    expect(await state(scratch)).toEqual(first);
  });

  it("mit declined-Zeile (Arbeits-Datenbank): bricht ab, nichts wird geaendert (Transaktion mit ROLLBACK)", async () => {
    await setSetting(null, "card_payments_enabled", true);
    const org = await makeUser("org");
    const boss = await makeUser("boss");
    const [v] = await db.insert(venues).values({ name: `E2E Halle DWN ${Date.now().toString(36)}`, city: "Essen", isPartner: true, active: true }).returning();
    await db.insert(venueAccess).values({ venueId: v.id, userId: boss.id, status: "active", assignedAt: new Date() });
    const day = 86_400_000;
    const [t] = await db
      .insert(tournaments)
      .values({ organizerId: org.id, name: "Down-Cup", city: "Essen", startsOn: new Date(Date.now() + 6 * day).toISOString().slice(0, 10), format: "knockout", maxTeams: 4, totalCents: 16000, hourlyCents: 8000, durationMin: 120, status: "payment", registrationDeadline: new Date(Date.now() + 4 * day), startsAt: new Date(Date.now() + 6 * day), isPrivate: false, venueId: v.id, venueAccessRequiredSnapshot: true, commissionPercentSnapshot: "10.00", finalShareCents: 1000 } as typeof tournaments.$inferInsert)
      .returning();
    await declineTournamentVenue(boss.id, t.id, { code: "belegt" });
    const work = new pg.Client({ connectionString: base.toString() });
    await work.connect();
    try {
      const has = await work.query(`select count(*)::int as n from booking_evidence where tournament_id = $1 and kind = 'declined'`, [t.id]);
      expect(has.rows[0].n).toBe(1);
      const before = await state(work);
      await work.query("begin");
      let message = "";
      try {
        await runDown(work);
      } catch (e) {
        message = (e as Error).message;
      }
      await work.query("rollback");
      expect(message).toMatch(/Rueckfall 0059 abgebrochen/);
      expect(await state(work)).toEqual(before);
    } finally {
      await work.end();
      await setSetting(null, "card_payments_enabled", false);
      await cleanup();
    }
  });
});
