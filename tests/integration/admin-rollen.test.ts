import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { deleteAccount } from "@/server/account";
import { setBanned, setRole } from "@/server/admin";
import { cleanup, makeUser } from "./helpers";

// Vertrag 009 M1, E1b (docs/design/009-m1-plan.md 3.1, 3.2): Rollen vergibt nur Admin 1; Admin 1 ist geschützt (nicht sperrbar, Rolle nicht änderbar, nicht löschbar).
beforeEach(cleanup);
afterAll(cleanup);

const roleOf = async (id: string) => (await db.select({ role: users.role, isOwner: users.isOwner, bannedAt: users.bannedAt }).from(users).where(eq(users.id, id)))[0];

describe("setRole: nur Admin 1", () => {
  it("Admin 1 vergibt eine Rolle", async () => {
    const owner = await makeUser("rl1", "owner");
    const p = await makeUser("rl2", "player");
    await setRole(owner.id, p.id, "moderator");
    expect((await roleOf(p.id)).role).toBe("moderator");
  });

  it("Admin 2 (role admin ohne is_owner) wird abgelehnt, nichts geändert", async () => {
    await makeUser("rl3", "owner");
    const admin2 = await makeUser("rl4", "admin");
    const p = await makeUser("rl5", "player");
    await expect(setRole(admin2.id, p.id, "admin")).rejects.toThrow(/Nur Admin 1/);
    expect((await roleOf(p.id)).role).toBe("player");
  });

  it("Rolle von Admin 1 lässt sich nicht ändern (auch nicht von einem anderen Admin 1-Konto: es gibt nur eines)", async () => {
    const owner = await makeUser("rl6", "owner");
    const admin2 = await makeUser("rl7", "admin");
    await expect(setRole(admin2.id, owner.id, "player")).rejects.toThrow(/Nur Admin 1/);
    await expect(setRole(owner.id, owner.id, "player")).rejects.toThrow(/eigene Rolle/);
    expect(await roleOf(owner.id)).toMatchObject({ role: "admin", isOwner: true });
  });
});

describe("Schutz von Admin 1", () => {
  it("nicht sperrbar", async () => {
    const owner = await makeUser("rl8", "owner");
    const admin2 = await makeUser("rl9", "admin");
    await expect(setBanned(admin2.id, owner.id, true, "Test")).rejects.toThrow(/Plattform-Admins/);
    expect((await roleOf(owner.id)).bannedAt).toBeNull();
  });

  it("Konto-Löschung wird abgelehnt (Admin-Rolle)", async () => {
    const owner = await makeUser("rl10", "owner");
    await expect(deleteAccount(owner.id)).rejects.toThrow(/Admin-Rolle/);
    expect(await roleOf(owner.id)).toMatchObject({ role: "admin", isOwner: true });
  });
});
