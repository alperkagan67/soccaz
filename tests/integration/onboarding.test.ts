import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureStaffOnboarded } from "@/server/onboarding";
import { cleanup, makeUser } from "./helpers";

afterAll(cleanup);

describe("Onboarding für Betreiber", () => {
  it("Admin 1 und Admin 2 brauchen kein Spieler-Onboarding, Spieler schon (Teilrollen entfallen, Vertrag 009 v4)", async () => {
    for (const role of ["admin", "owner"] as const) {
      const u = await makeUser("staff", role);
      await db.update(users).set({ onboardedAt: null }).where(eq(users.id, u.id));
      const [fresh] = await db.select().from(users).where(eq(users.id, u.id));
      const done = await ensureStaffOnboarded(fresh);
      expect(done.onboardedAt).not.toBeNull();
      expect((await db.select().from(users).where(eq(users.id, u.id)))[0].onboardedAt).not.toBeNull();
    }
    const p = await makeUser("player");
    await db.update(users).set({ onboardedAt: null }).where(eq(users.id, p.id));
    const [row] = await db.select().from(users).where(eq(users.id, p.id));
    expect((await ensureStaffOnboarded(row)).onboardedAt).toBeNull(); // Spieler müssen durch das Onboarding
  });
});
