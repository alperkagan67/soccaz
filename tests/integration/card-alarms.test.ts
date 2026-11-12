import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, paymentCharges } from "@/db/schema";
import { getRefundAlerts } from "@/server/finance";
import { audit } from "@/server/audit";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-1: technische Abbuchungszustaende ohne Nachzahlfenster landen im Admin-Alarm (kein Automat fasst sie an).

afterAll(cleanup);
beforeAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.action, "charge.duplicate_success"));
});

async function row(over: Partial<typeof paymentCharges.$inferInsert>) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const u = await addPlayer(m.match.id, m.home.id, "al");
  const [r] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, status: "failed", idempotencyKey: `al:${m.match.id}:${u.id}`, ...over }).returning();
  return { m, r };
}

describe("Admin-Alarm fuer technische Abbuchungszustaende", () => {
  it("idempotency_mismatch (kein Kartenfehler) steht im Alarm", async () => {
    const { r } = await row({ failureCode: "idempotency_mismatch" });
    const alerts = await getRefundAlerts();
    expect(alerts.idempotencyMismatches.map((a) => a.id)).toContain(r.id);
    expect(alerts.legacyFailed.map((a) => a.id)).not.toContain(r.id);
  });

  it("Altzeile (failed, grace_until NULL, Kartencode) steht im Alarm; eine Zeile MIT Fenster nicht", async () => {
    const legacy = await row({ failureCode: "card_declined", graceUntil: null });
    const windowed = await row({ failureCode: "card_declined", graceUntil: new Date(Date.now() + 3_600_000) });
    const alerts = await getRefundAlerts();
    expect(alerts.legacyFailed.map((a) => a.id)).toContain(legacy.r.id);
    expect(alerts.legacyFailed.map((a) => a.id)).not.toContain(windowed.r.id);
  });

  it("ein zweiter erfolgreicher PaymentIntent (Audit charge.duplicate_success) steht im Alarm, nach 30 Tagen nicht mehr", async () => {
    const { m } = await row({ failureCode: "card_declined", graceUntil: new Date() });
    await audit(null, "charge.duplicate_success", "match", m.match.id, { after: { paymentIntentId: "pi_dup_alarm" } });
    expect((await getRefundAlerts()).duplicateSuccesses.map((a) => a.matchId)).toContain(m.match.id);
    expect((await getRefundAlerts(new Date(Date.now() + 31 * 24 * 3_600_000))).duplicateSuccesses.map((a) => a.matchId)).not.toContain(m.match.id);
  });

  it("die Alarmliste enthaelt keine Personendaten (nur IDs, Codes)", async () => {
    const { r } = await row({ failureCode: "idempotency_mismatch" });
    const text = JSON.stringify((await getRefundAlerts()).idempotencyMismatches.filter((a) => a.id === r.id));
    expect(text).not.toMatch(/@|name/i);
  });
});

describe("Review PR #107: die Kartenalarme erscheinen in der Finanzseite (getAlerts)", () => {
  it("eine Altzeile ohne Fenster ergibt den Alarm card:legacy-failed in getAlerts", async () => {
    const { getAlerts } = await import("@/server/finance");
    await row({ failureCode: "card_declined", graceUntil: null });
    const codes = (await getAlerts()).map((a) => a.code);
    expect(codes).toContain("card:legacy-failed");
  });
});
