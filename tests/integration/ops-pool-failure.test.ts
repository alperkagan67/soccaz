import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { resetOpsPoolForTests } from "@/db/ops";
import { SWITCH_TEXTS } from "@/lib/evidence-switch";
import { getEvidenceSwitchState, switchEvidence } from "@/server/evidence-admin";
import { recordLateAttempt } from "@/server/veto";
import { cleanup, grantVenueAccess, makeUser } from "./helpers";
import { venues } from "@/db/schema-finance";

// G25-009 B, Fehlerbild: der Ops-Pool ist nicht erreichbar. Die Admin-Aktion scheitert KLAR (Betreibertext, nichts geaendert), der late_attempt wird nicht geschrieben (Antwort bleibt "zu spaet") und beides
// wird NICHT still verschluckt: Audit-Eintrag evidence.ops_unavailable (nur Stelle und Fehlercode, keine Personendaten) ueber den Hauptpool. Die URL zeigt auf einen geschlossenen lokalen Port (kein Geheimnis).
const DEAD = "postgres://soccaz_ops:nicht-echt@127.0.0.1:1/soccaz_nicht_da";
const before = process.env.DATABASE_URL_OPS;
const opsAudits = async () => await db.select().from(auditLog).where(eq(auditLog.action, "evidence.ops_unavailable"));

beforeEach(async () => {
  await cleanup();
  await db.execute(sql`delete from audit_log where action = 'evidence.ops_unavailable'`);
  process.env.DATABASE_URL_OPS = DEAD;
  await resetOpsPoolForTests();
});
afterEach(async () => {
  if (before === undefined) delete process.env.DATABASE_URL_OPS;
  else process.env.DATABASE_URL_OPS = before;
  await resetOpsPoolForTests();
});
afterAll(async () => {
  await db.execute(sql`delete from audit_log where action = 'evidence.ops_unavailable'`);
  await cleanup();
});

describe("Ops-Pool nicht erreichbar", () => {
  it("Admin-Aktion: klarer Betreibertext, Zustand unveraendert, Audit evidence.ops_unavailable (Stelle + Fehlercode, ohne Personendaten)", async () => {
    const owner = await makeUser("opsf", "owner");
    const stateBefore = await getEvidenceSwitchState();
    await expect(switchEvidence(owner.id, "clock_db", "Go-live Vorbereitung")).rejects.toThrow(SWITCH_TEXTS.opsUnavailable);
    expect(await getEvidenceSwitchState()).toEqual(stateBefore); // nichts geaendert
    const rows = await opsAudits();
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeNull();
    expect(rows[0].after).toMatchObject({ where: "switchEvidence", code: "ECONNREFUSED" });
    expect(JSON.stringify(rows[0])).not.toContain(owner.id); // keine Personendaten
    expect(JSON.stringify(rows[0])).not.toContain("nicht-echt"); // keine Zugangsdaten
  });

  it("late_attempt: wird nicht geschrieben (false = Antwort bleibt zu spaet), aber gemeldet (Audit), kein Absturz", async () => {
    const u = await makeUser("opsl");
    const [v] = await db.insert(venues).values({ name: `E2E Halle OPS ${Date.now()}`, city: "Essen" }).returning();
    await grantVenueAccess(v.id, u.id);
    const out = await recordLateAttempt(u.id, "00000000-0000-4000-8000-000000000001", v.id);
    expect(out).toBe(false);
    const rows = await opsAudits();
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ where: "recordLateAttempt", code: "ECONNREFUSED" });
    expect(JSON.stringify(rows[0])).not.toContain(u.id);
  });

  it("Gegenprobe: ohne DATABASE_URL_OPS laeuft derselbe Aufruf ueber den Hauptpool (Dev/Test/vor A2) und es gibt keinen Fehlereintrag", async () => {
    delete process.env.DATABASE_URL_OPS;
    await resetOpsPoolForTests();
    const owner = await makeUser("opsg", "owner");
    await switchEvidence(owner.id, "clock_db", "Go-live Vorbereitung"); // Uhrenquelle Datenbank (EVIDENCE_CLOCK ist db)
    expect(await opsAudits()).toHaveLength(0);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
      await tx.execute(sql`update settings set value = to_jsonb('js'::text) where key = 'evidence_clock_source'`);
    });
  });
});
