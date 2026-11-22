import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { createBookingJob } from "@/server/booking";
import { notifyFinanceAlerts } from "@/server/scheduled";
import { cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 009 M1 (AC-18, Übergang bis E2): Alarme und Buchungsaufgaben gehen an alle NICHT GESPERRTEN Nutzer mit role admin, nie an Spieler und nie an gesperrte Admins.
// (Die Teilrollen finance/booking entfallen; ab E2 gehen Alarme nur an Admin 1, Test admin-alarm-empfaenger.test.ts.)
vi.mock("@/server/finance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/finance")>()),
  getAlerts: async () => [{ code: "test", severity: "high", title: "Test", detail: "Test" }],
}));

beforeEach(async () => {
  await cleanup();
  await db.delete(notifications).where(inArray(notifications.title, ["Finanz-Alarme", "Halle buchen"]));
});
afterAll(cleanup);

const titlesOf = async (userId: string) => (await db.select({ t: notifications.title }).from(notifications).where(eq(notifications.userId, userId))).map((r) => r.t);

async function staff() {
  const active = await makeUser("em-a", "admin");
  const banned = await makeUser("em-b", "admin");
  await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
  const player = await makeUser("em-p", "player");
  return { active, banned, player };
}

describe("Empfänger der Admin-Meldungen (bis E2): nicht gesperrte Admins", () => {
  it("Finanz-Alarme: aktiver Admin ja, gesperrter Admin und Spieler nein", async () => {
    const { active, banned, player } = await staff();
    await notifyFinanceAlerts();
    expect(await titlesOf(active.id)).toContain("Finanz-Alarme");
    expect(await titlesOf(banned.id)).not.toContain("Finanz-Alarme");
    expect(await titlesOf(player.id)).not.toContain("Finanz-Alarme");
  });

  it("Buchungsaufgabe „Halle buchen“: aktiver Admin ja, gesperrter Admin und Spieler nein", async () => {
    const { active, banned, player } = await staff();
    const m = await makeMatch({ hoursAhead: 100 });
    await db.transaction(async (tx) => {
      await createBookingJob(tx, m.match);
    });
    expect(await titlesOf(active.id)).toContain("Halle buchen");
    expect(await titlesOf(banned.id)).not.toContain("Halle buchen");
    expect(await titlesOf(player.id)).not.toContain("Halle buchen");
  });
});
