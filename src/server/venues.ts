import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { priceRules, venues } from "@/db/schema-finance";
import { audit } from "./audit";
import { DomainError } from "./teams";

export type VenueInput = {
  name: string;
  city: string;
  address?: string | null;
  contact?: string | null;
  surface?: string | null;
  hasShowers?: boolean;
  hasParking?: boolean;
  isPartner?: boolean;
};

function clean(input: VenueInput): VenueInput {
  const name = input.name.trim();
  const city = input.city.trim();
  if (name.length < 2 || name.length > 80) throw new DomainError("Der Name braucht 2 bis 80 Zeichen.");
  if (city.length < 2 || city.length > 60) throw new DomainError("Bitte eine Stadt angeben.");
  return { ...input, name, city, address: input.address?.trim() || null, contact: input.contact?.trim() || null, surface: input.surface?.trim() || null };
}

export async function listVenues(includeInactive = true) {
  await connection();
  return db.select().from(venues).where(includeInactive ? undefined : eq(venues.active, true)).orderBy(asc(venues.city), asc(venues.name));
}

/** Weist einer Halle ein Betreiber-Konto zu (leer = entfernen). Das Konto muss existieren. */
export async function setVenueManager(actorId: string, venueId: string, email: string) {
  let userId: string | null = null;
  if (email.trim()) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!u) throw new DomainError("Zu dieser E-Mail gibt es kein Konto. Der Betreiber muss sich zuerst anmelden.");
    userId = u.id;
  }
  await db.update(venues).set({ managerUserId: userId }).where(eq(venues.id, venueId));
  await audit(actorId, "venue.manager", "venue", venueId, { after: { managerUserId: userId } });
}

export async function createVenue(actorId: string, input: VenueInput) {
  const v = clean(input);
  const [row] = await db
    .insert(venues)
    .values({ name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers ?? false, hasParking: v.hasParking ?? false, isPartner: v.isPartner ?? false })
    .returning();
  await audit(actorId, "venue.create", "venue", row.id, { after: row });
  return row;
}

export async function updateVenue(actorId: string, id: string, input: VenueInput & { active?: boolean }) {
  const v = clean(input);
  const [before] = await db.select().from(venues).where(eq(venues.id, id));
  if (!before) throw new DomainError("Halle nicht gefunden.");
  const [row] = await db
    .update(venues)
    .set({ name: v.name, city: v.city, address: v.address, contact: v.contact, surface: v.surface, hasShowers: v.hasShowers ?? false, hasParking: v.hasParking ?? false, isPartner: v.isPartner ?? false, active: input.active ?? before.active })
    .where(eq(venues.id, id))
    .returning();
  await audit(actorId, "venue.update", "venue", id, { before, after: row });
  return row;
}

/** Admin hat die Angaben einer Halle (Buchbarkeit, Adresse, Preis) geprüft. Ungeprüfte Hallen kommen im Veto nach den geprüften. */
export async function setVenueVerified(actorId: string, id: string, verified: boolean) {
  const [row] = await db.update(venues).set({ verified }).where(eq(venues.id, id)).returning({ id: venues.id });
  if (!row) throw new DomainError("Halle nicht gefunden.");
  await audit(actorId, verified ? "venue.verify" : "venue.unverify", "venue", id, {});
}

/** Aktuelle Preisregeln: je Dauer die jüngste gültige. venueId null = Standardpreise. */
export async function listPriceRules(venueId: string | null) {
  await connection();
  const rows = await db
    .select()
    .from(priceRules)
    .where(venueId ? eq(priceRules.venueId, venueId) : isNull(priceRules.venueId))
    .orderBy(asc(priceRules.durationMin), desc(priceRules.validFrom));
  return rows;
}

export async function addPriceRule(actorId: string, input: { venueId: string | null; durationMin: number; priceCents: number; costCents: number; validFrom?: string }) {
  if (input.durationMin !== 60 && input.durationMin !== 90) throw new DomainError("Die Dauer ist 60 oder 90 Minuten.");
  for (const [label, cents] of [["Preis", input.priceCents], ["Kosten", input.costCents]] as const) {
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100_000) throw new DomainError(`${label}: bitte einen Betrag zwischen 0,01 und 1.000,00 Euro angeben.`);
  }
  const validFrom = input.validFrom && /^\d{4}-\d{2}-\d{2}$/.test(input.validFrom) ? input.validFrom : new Date().toISOString().slice(0, 10);
  if (input.venueId) {
    const [v] = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, input.venueId));
    if (!v) throw new DomainError("Halle nicht gefunden.");
  }
  const [row] = await db.insert(priceRules).values({ venueId: input.venueId, durationMin: input.durationMin, priceCents: input.priceCents, costCents: input.costCents, validFrom }).returning();
  await audit(actorId, "price.add", input.venueId ? "venue" : "price_default", input.venueId ?? "default", { after: row });
  return row;
}

/** Öffentliche Hallenliste mit Durchschnittsbewertung (nur sichtbare Bewertungen). */
export async function listPublicVenues(city?: string) {
  await connection();
  const rows = await db.execute<{ id: string; name: string; city: string; address: string | null; surface: string | null; has_showers: boolean; has_parking: boolean; is_partner: boolean; avg: string | null; n: number }>(
    sql`select v.id, v.name, v.city, v.address, v.surface, v.has_showers, v.has_parking, v.is_partner,
          (select round(avg(c.rating)::numeric, 1)::text from comments c where c.target_type = 'venue' and c.target_id = v.id and c.status = 'visible') as avg,
          (select count(*)::int from comments c where c.target_type = 'venue' and c.target_id = v.id and c.status = 'visible') as n
        from venues v where v.active ${city ? sql`and v.city = ${city}` : sql``} order by v.is_partner desc, v.city, v.name`,
  );
  return rows.rows;
}

export async function getPublicVenue(id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [v] = await db.select().from(venues).where(and(eq(venues.id, id), eq(venues.active, true)));
  if (!v) return null;
  const [r] = (await db.execute<{ avg: string | null; n: number }>(sql`select round(avg(rating)::numeric, 1)::text as avg, count(*)::int as n from comments where target_type = 'venue' and target_id = ${id} and status = 'visible'`)).rows;
  return { venue: { id: v.id, name: v.name, city: v.city, address: v.address, surface: v.surface, hasShowers: v.hasShowers, hasParking: v.hasParking, isPartner: v.isPartner }, avg: r.avg, n: r.n };
}
