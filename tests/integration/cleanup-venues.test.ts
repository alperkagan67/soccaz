import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { venues } from "@/db/schema-finance";
import { cleanup, makeUser } from "./helpers";

// Reihenfolge-Rest (R-T145): seed-frontend.test legt Seed-Hallen mit Betreiber an; das Aufräumen löschte die Testnutzer, ließ aber venues.manager_user_id
// (kein Fremdschlüssel) stehen. Jede spätere Hallen-Anfrage lief dann in Leere (Veto kam nie) oder scheiterte an der Benachrichtigung.
// Das Aufräumen muss den Betreiber zurücksetzen und die Seed-Hallen (osm_id seed-venue-*) entfernen, echte Hallen aber stehen lassen.

const TAG = `cv${Date.now().toString(36)}`;

beforeAll(async () => {
  await db.delete(venues).where(like(venues.osmId, `seed-venue-${TAG}%`));
  await db.delete(venues).where(like(venues.name, `Aufraeum-Test ${TAG}%`));
});
afterAll(async () => {
  await db.delete(venues).where(like(venues.name, `Aufraeum-Test ${TAG}%`));
  await cleanup();
});

describe("Aufräumen: Hallen", () => {
  it("setzt den Betreiber eines Testnutzers zurück und löscht Seed-Hallen; eine echte Halle bleibt (ohne Betreiber)", async () => {
    const manager = await makeUser("cvm");
    const [seed] = await db.insert(venues).values({ name: `Aufraeum-Test ${TAG} Seed`, city: "Essen", osmId: `seed-venue-${TAG}-1`, managerUserId: manager.id }).returning();
    const [real] = await db.insert(venues).values({ name: `Aufraeum-Test ${TAG} Echt`, city: "Essen", managerUserId: manager.id }).returning();

    await cleanup();

    expect(await db.select().from(venues).where(eq(venues.id, seed.id))).toHaveLength(0);
    const [after] = await db.select().from(venues).where(eq(venues.id, real.id));
    expect(after).toBeDefined();
    expect(after.managerUserId).toBeNull(); // kein Betreiber ohne Nutzer
  });

  it("ein Betreiber, der KEIN Testnutzer ist, bleibt unberührt", async () => {
    const [real] = await db.insert(venues).values({ name: `Aufraeum-Test ${TAG} Fremd`, city: "Essen", managerUserId: "00000000-0000-4000-8000-000000000001" }).returning();
    await cleanup();
    const [after] = await db.select().from(venues).where(eq(venues.id, real.id));
    expect(after.managerUserId).toBe("00000000-0000-4000-8000-000000000001");
  });
});
