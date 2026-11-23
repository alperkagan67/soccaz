import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { priceRules, venueAccess, venues } from "@/db/schema-finance";
import { rejectedVenueForm } from "@/server/venue-resubmit-data";
import { cleanup, makeUser } from "./helpers";

// 013 v3 M2d (R-T335b): die Vorbelegung der erneuten Anfrage geht an den Client. Nur die EIGENE, ABGELEHNTE Halle; sonst null. Kontakt und Zustimmung stehen nie in den Werten.
let n = 0;
const nm = () => `E2E Vorbelegung ${Date.now().toString(36)}${++n}`;
afterAll(async () => {
  await db.execute(sql`delete from venue_access where venue_id in (select id from venues where name like 'E2E Vorbelegung%')`);
  await db.execute(sql`delete from venues where name like 'E2E Vorbelegung%'`);
  await cleanup();
});

async function hall(owner: { id: string }, status: "requested" | "approved" | "rejected") {
  const [v] = await db
    .insert(venues)
    .values({ name: nm(), city: "Essen", address: "Hallenweg 1", contact: "geheim@example.test", surface: "Kunstrasen", courtCount: 3, hasShowers: true, approvalStatus: status, active: status === "approved" })
    .returning();
  await db.insert(venueAccess).values({ venueId: v.id, userId: owner.id, status: "active", assignedAt: new Date() });
  await db.insert(priceRules).values([
    { venueId: v.id, durationMin: 60, priceCents: 5000, costCents: 4200 }, // Preis weicht von den Kosten ab: vorbelegt wird die Hallenmiete (costCents)
    { venueId: v.id, durationMin: 90, priceCents: 7000, costCents: 6000 },
  ]);
  return v;
}

describe("rejectedVenueForm", () => {
  it("eigene abgelehnte Halle: Werte aus der Halle, Preise aus den Kosten (Hallenmiete), KEIN Kontakt und keine Zustimmung", async () => {
    const o = await makeUser("rvf1");
    const v = await hall(o, "rejected");
    const r = await rejectedVenueForm(o.id, v.id);
    expect(r?.id).toBe(v.id);
    expect(r?.values).toEqual({ name: v.name, city: "Essen", address: "Hallenweg 1", courts: "3", surface: "Kunstrasen", hasShowers: "on", hasParking: "", price60: "42,00", price90: "60,00" });
    expect(Object.keys(r!.values)).not.toContain("contact");
    expect(Object.keys(r!.values)).not.toContain("terms");
    expect(JSON.stringify(r)).not.toContain("geheim@example.test");
  });

  it("fremde Halle (Zugang eines anderen Kontos): null", async () => {
    const o = await makeUser("rvf2");
    const other = await makeUser("rvf2b");
    const v = await hall(o, "rejected");
    expect(await rejectedVenueForm(other.id, v.id)).toBeNull();
  });

  it("Halle nicht abgelehnt (angefragt oder freigegeben): null", async () => {
    const o = await makeUser("rvf3");
    expect(await rejectedVenueForm(o.id, (await hall(o, "requested")).id)).toBeNull();
    expect(await rejectedVenueForm(o.id, (await hall(o, "approved")).id)).toBeNull();
  });

  it("keine UUID oder unbekannte UUID: null (kein Datenbankfehler)", async () => {
    const o = await makeUser("rvf4");
    expect(await rejectedVenueForm(o.id, "nicht-eine-uuid")).toBeNull();
    expect(await rejectedVenueForm(o.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await rejectedVenueForm(o.id, "")).toBeNull();
  });
});
