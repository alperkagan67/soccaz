import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema-finance";
import type { Tx } from "./tx";

type Kind = "topup" | "match";

/** Stellt einen Beleg mit fortlaufender Nummer (SOC-JJJJ-000001) aus. Pro Zahlung bzw. Spiel und Person nur einer. */
export async function issueReceipt(
  tx: Tx,
  r: { userId: string; kind: Kind; amountCents: number; paymentId?: string | null; matchId?: string | null },
) {
  const [existing] = await tx
    .select()
    .from(receipts)
    .where(
      r.kind === "topup" && r.paymentId
        ? and(eq(receipts.kind, "topup"), eq(receipts.paymentId, r.paymentId))
        : and(eq(receipts.kind, r.kind), eq(receipts.userId, r.userId), r.matchId ? eq(receipts.matchId, r.matchId) : sql`true`),
    );
  if (existing) return existing;

  const seq = await tx.execute(sql`select nextval('receipt_number_seq')::int as n`);
  const n = (seq.rows[0] as { n: number }).n;
  const number = `SOC-${new Date().getUTCFullYear()}-${String(n).padStart(6, "0")}`;
  const [row] = await tx
    .insert(receipts)
    .values({ number, userId: r.userId, kind: r.kind, amountCents: r.amountCents, paymentId: r.paymentId ?? null, matchId: r.matchId ?? null })
    .returning();
  return row;
}

export async function listReceipts(userId: string, limit = 50) {
  return db.select().from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.issuedAt)).limit(limit);
}

export async function getReceipt(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(receipts).where(eq(receipts.id, id));
  return row ?? null;
}
