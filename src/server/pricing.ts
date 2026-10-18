import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { priceRules } from "@/db/schema-finance";

type Exec = Pick<typeof db, "select">;

export type Price = { priceCents: number; costCents: number };

/**
 * Preis und Kosten für eine Spieldauer. Eine Regel für die konkrete Halle hat Vorrang vor dem Standard;
 * bei mehreren gültigen Regeln gilt die jüngste (valid_from).
 */
export async function priceFor(exec: Exec, venueId: string | null, durationMin: number, on: Date = new Date()): Promise<Price | null> {
  const day = on.toISOString().slice(0, 10);
  const rows = await exec
    .select({ priceCents: priceRules.priceCents, costCents: priceRules.costCents, venueId: priceRules.venueId })
    .from(priceRules)
    .where(
      and(
        eq(priceRules.durationMin, durationMin),
        lte(priceRules.validFrom, day),
        venueId ? or(eq(priceRules.venueId, venueId), isNull(priceRules.venueId)) : isNull(priceRules.venueId),
      ),
    )
    // Hallenregel zuerst (venue_id nicht NULL), dann jüngste Gültigkeit
    .orderBy(sql`(${priceRules.venueId} is null)`, desc(priceRules.validFrom))
    .limit(1);
  return rows[0] ? { priceCents: rows[0].priceCents, costCents: rows[0].costCents } : null;
}
