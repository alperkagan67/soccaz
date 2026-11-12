import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema-finance";
import { cleanup, makeUser } from "./helpers";

// Vertrag 011 AC-7: Hallenbetreiber zuordnen/entziehen darf nur Admin 1 (vorher war die Server-Aktion mit booking geschützt, also auch Admin 2).
// Die ECHTE Server-Aktion läuft mit der echten Sitzungsprüfung (session.ts); nur die Anmeldung (auth) und die Weiterleitung sind ersetzt.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { setVenueManagerAction } from "@/server/admin-finance-actions";

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
});

async function venue() {
  const [v] = await db.insert(venues).values({ name: `Test Halle ${Math.random().toString(36).slice(2, 8)}`, city: "Essen", source: "manual" }).returning();
  return v;
}
const form = (email: string) => {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
};
const managerOf = async (id: string) => (await db.select({ m: venues.managerUserId }).from(venues).where(eq(venues.id, id)))[0].m;

describe("setVenueManagerAction: nur Admin 1", () => {
  it("Admin 2 (role admin ohne is_owner) wird abgelehnt: Weiterleitung, Zuordnung unverändert", async () => {
    const admin2 = await makeUser("vm1", "admin");
    const manager = await makeUser("vm2", "player");
    const v = await venue();
    currentUserId = admin2.id;
    await expect(setVenueManagerAction(v.id, undefined, form(manager.email))).rejects.toThrow(/REDIRECT:\/app/);
    expect(await managerOf(v.id)).toBeNull();
  });

  it("Admin 1 ordnet zu und entzieht (leere E-Mail)", async () => {
    const owner = await makeUser("vm3", "owner");
    const manager = await makeUser("vm4", "player");
    const v = await venue();
    currentUserId = owner.id;
    expect(await setVenueManagerAction(v.id, undefined, form(manager.email))).toEqual({ ok: true });
    expect(await managerOf(v.id)).toBe(manager.id);
    expect(await setVenueManagerAction(v.id, undefined, form(""))).toEqual({ ok: true });
    expect(await managerOf(v.id)).toBeNull();
  });

  it("Betreiber selbst und Spieler dürfen es nicht (Weiterleitung)", async () => {
    const manager = await makeUser("vm5", "player");
    const other = await makeUser("vm6", "player");
    const v = await venue();
    const owner = await makeUser("vm7", "owner");
    currentUserId = owner.id;
    await setVenueManagerAction(v.id, undefined, form(manager.email));
    for (const u of [manager, other]) {
      currentUserId = u.id;
      await expect(setVenueManagerAction(v.id, undefined, form(other.email))).rejects.toThrow(/REDIRECT:\/app/);
    }
    expect(await managerOf(v.id)).toBe(manager.id);
  });
});
