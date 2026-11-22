import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { armConfirmationForNewAccess } from "@/server/tournament-confirm";
import { setSetting } from "@/server/settings";
import { cleanup, makeUser } from "./helpers";

// 012 M5-7b (R-T251 8): ein Fehler bei EINEM Turnier laesst die Transaktion des Einloesens intakt (Savepoint je Turnier). notifyHolderOnFix wirft hier einen echten SQL-Fehler in der Savepoint-Transaktion.
vi.mock("@/server/tournament-holders", async (orig) => {
  const real = await orig<typeof import("@/server/tournament-holders")>();
  return { ...real, notifyHolderOnFix: async (tx: { execute: (q: unknown) => Promise<unknown> }) => { await tx.execute(sql`select 1 / 0`); } };
});

beforeAll(() => setSetting(null, "card_payments_enabled", true));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

describe("arm: Fehler bei einem Turnier", () => {
  it("Savepoint: Snapshot zurueckgerollt, Transaktion benutzbar, Audit arm_failed ohne Details", async () => {
    const org = await makeUser("org");
    const boss = await makeUser("op");
    const [v] = await db.insert(venues).values({ name: `E2E Halle ARM ${Date.now().toString(36)}`, city: "Essen", isPartner: true, active: true }).returning();
    await db.insert(venueAccess).values({ venueId: v.id, userId: boss.id, status: "active", assignedAt: new Date() });
    const [t] = await db
      .insert(tournaments)
      .values({
        organizerId: org.id, name: `Arm-Cup ${Date.now().toString(36)}`, city: "Essen", startsOn: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10), format: "knockout", maxTeams: 4, totalCents: 16000, hourlyCents: 8000,
        durationMin: 120, status: "payment", registrationDeadline: new Date(Date.now() + 4 * 86_400_000), startsAt: new Date(Date.now() + 6 * 86_400_000), isPrivate: false, venueId: v.id, venueAccessRequiredSnapshot: false,
        commissionPercentSnapshot: "10.00", finalShareCents: 1000,
      } as typeof tournaments.$inferInsert)
      .returning();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await db.transaction(async (tx) => {
      const armed = await armConfirmationForNewAccess(tx, [v.id]);
      const stillUsable = await tx.execute(sql`select 1 as ok`); // ohne Savepoint: 25P02, die Transaktion ist abgebrochen
      return { armed, ok: (stillUsable.rows as { ok: number }[])[0].ok };
    });
    err.mockRestore();
    expect(result).toEqual({ armed: 0, ok: 1 });
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].venueAccessRequiredSnapshot).toBe(false); // zurueckgerollt
    expect((await db.select().from(auditLog).where(and(eq(auditLog.action, "tournament.venue_access_arm_failed"), eq(auditLog.entityId, t.id)))).length).toBe(1);
  });
});
