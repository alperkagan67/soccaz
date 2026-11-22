import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEvidenceSwitchState, switchEvidence } from "@/server/evidence-admin";
import { setSetting } from "@/server/settings";
import { cleanup, makeUser } from "./helpers";

// 011 M2a: Admin 1 schaltet die Beweispflicht (Rolle, Akteur, Audit, Schutz der Einstellung). Der Zustand wird vor und nach jedem Test auf die Vorgabe (aus / js) gesetzt.
type Row = Record<string, unknown>;
const rows = async <T = Row>(q: ReturnType<typeof sql>): Promise<T[]> => {
  const r = await db.execute(q);
  return ((r as { rows?: T[] }).rows ?? (r as unknown as T[]));
};

async function reset() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await tx.execute(sql`update settings set value = to_jsonb('off'::text) where key = 'evidence_enforcement'`);
    await tx.execute(sql`update settings set value = to_jsonb('js'::text) where key = 'evidence_clock_source'`);
  });
}
// Es gibt höchstens einen Admin 1 je Datenbank: vor jedem Test alle Testkonten löschen (cleanup), dann den Zustand zurücksetzen
beforeEach(async () => {
  await cleanup();
  await reset();
});
afterAll(async () => {
  await reset();
  await cleanup();
});

const owner = () => makeUser("owner", "owner");
const value = async (key: string) => (await rows<{ v: string }>(sql`select value #>> '{}' as v from settings where key = ${key}`))[0]?.v;

describe("switchEvidence (Admin 1)", () => {
  it("Reihenfolge: Pflicht ohne Uhrenquelle Datenbank scheitert; dann Uhrenquelle, dann Pflicht; Akteur und Grund im Audit", async () => {
    const o = await owner();
    await expect(switchEvidence(o.id, "enforcement_on", "Go-live")).rejects.toThrow(/Uhrenquelle/);
    expect(await value("evidence_enforcement")).toBe("off");
    await switchEvidence(o.id, "clock_db", "App nutzt DB-Zeit");
    expect(await value("evidence_clock_source")).toBe("db");
    await switchEvidence(o.id, "enforcement_on", "Go-live");
    expect(await value("evidence_enforcement")).toBe("on");
    expect(await getEvidenceSwitchState()).toMatchObject({ enforcementOn: true, clockDb: true });
    const audit = await rows<{ actor_id: string; reason: string; v: string }>(
      sql`select actor_id, after->>'reason' as reason, after->>'value' as v from audit_log where action = 'evidence_setting' and entity_id = 'evidence_enforcement' and actor_id = ${o.id} order by at desc limit 1`,
    );
    expect(audit[0]).toMatchObject({ actor_id: o.id, reason: "Go-live", v: "on" });
  });

  it("Wirkung: nach dem Einschalten meldet die Datenbank die Durchsetzung als aktiv (die Trigger-Wirkung prüft hall-answer.test.ts)", async () => {
    const o = await owner();
    await switchEvidence(o.id, "clock_db", "Test");
    await switchEvidence(o.id, "enforcement_on", "Test");
    expect(await rows<{ e: boolean }>(sql`select evidence_enforced() as e`)).toEqual([{ e: true }]);
  });

  it("Spieler, Betreiber, Plattform-Admin ohne Owner-Recht und gesperrte Konten: abgelehnt, nichts geändert", async () => {
    const player = await makeUser("pl");
    const admin = await makeUser("ad", "admin");
    const banned = await owner();
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    for (const u of [player, admin, banned]) await expect(switchEvidence(u.id, "clock_db", "Grund")).rejects.toThrow(/Admin 1/);
    await expect(switchEvidence("00000000-0000-4000-8000-000000000000", "clock_db", "Grund")).rejects.toThrow(/Admin 1/);
    expect(await value("evidence_clock_source")).toBe("js");
  });

  it("ohne gültigen Grund und mit unbekanntem Schritt wird nichts geschrieben", async () => {
    const o = await owner();
    for (const reason of ["", "ab", "x".repeat(201)]) await expect(switchEvidence(o.id, "clock_db", reason)).rejects.toThrow(/Grund/);
    await expect(switchEvidence(o.id, "enforcement_off", "Grund")).rejects.toThrow();
    expect(await value("evidence_clock_source")).toBe("js");
  });

  it("setSetting lehnt die geschützten Schlüssel ab (kein Umweg)", async () => {
    const o = await owner();
    await expect(setSetting(o.id, "evidence_enforcement", "on")).rejects.toThrow();
    await expect(setSetting(o.id, "evidence_clock_source", "db")).rejects.toThrow();
  });

  it("Datenbankfehler wird neutral gemeldet, nie die Rohmeldung", async () => {
    const o = await owner();
    await switchEvidence(o.id, "clock_db", "Test");
    await switchEvidence(o.id, "enforcement_on", "Test");
    // Uhrenquelle zurück auf js geht bei eingeschalteter Pflicht in der Datenbank nicht; die Oberfläche bietet es gar nicht an
    await expect(db.execute(sql`select evidence_set_setting('evidence_clock_source', 'js', ${o.id}::uuid, 'x')`)).rejects.toThrow();
    expect(await value("evidence_clock_source")).toBe("db");
  });
});
