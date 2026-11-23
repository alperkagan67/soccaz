import { and, desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { priceRules, venues } from "@/db/schema-finance";
import { venueIdsOf } from "./venue-access-rules";

// Vorbelegung der erneuten Hallen-Anfrage (013 v3 M2d): NUR die eigene, abgelehnte Halle des Kontos. Der Kontakt wird bewusst NICHT vorbelegt (personenbezogen, steht nicht im Entwurf),
// die Zustimmung auch nicht (sie wird jedes Mal neu gegeben). Preise aus den zuletzt gueltigen Regeln fuer 60 und 90 Minuten.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export type ResubmitForm = { id: string; name: string; values: Record<string, string> };

export async function rejectedVenueForm(userId: string, venueId: string): Promise<ResubmitForm | null> {
  await connection();
  if (!UUID.test(venueId)) return null;
  if (!(await venueIdsOf(userId)).includes(venueId)) return null;
  const [v] = await db.select().from(venues).where(and(eq(venues.id, venueId), eq(venues.approvalStatus, "rejected")));
  if (!v) return null;
  const rules = await db.select().from(priceRules).where(eq(priceRules.venueId, venueId)).orderBy(desc(priceRules.validFrom), desc(priceRules.createdAt));
  const price = (d: number) => rules.find((r) => r.durationMin === d)?.priceCents;
  const p60 = price(60);
  const p90 = price(90);
  return {
    id: v.id,
    name: v.name,
    values: {
      name: v.name,
      city: v.city ?? "",
      address: v.address ?? "",
      courts: v.courtCount === null ? "" : String(v.courtCount),
      surface: v.surface ?? "",
      hasShowers: v.hasShowers ? "on" : "",
      hasParking: v.hasParking ? "on" : "",
      price60: p60 === undefined ? "" : euro(p60),
      price90: p90 === undefined ? "" : euro(p90),
    },
  };
}
