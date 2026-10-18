import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, promoCodes, promoRedemptions } from "@/db/schema-finance";
import { checkPromo, normalizeCode, type PromoCheck, type PromoCodeRule } from "@/lib/promo-rules";
import { audit } from "./audit";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type Exec = Pick<typeof db, "select">;
export type PromoRow = typeof promoCodes.$inferSelect;

export function toRule(c: PromoRow): PromoCodeRule {
  return {
    kind: c.kind as "percent" | "fixed",
    value: c.value,
    minTopupCents: c.minTopupCents,
    maxBonusCents: c.maxBonusCents,
    budgetCents: c.budgetCents,
    usedCents: c.usedCents,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    newUsersOnly: c.newUsersOnly,
    maxPerUser: c.maxPerUser,
    active: c.active,
  };
}

export async function loadPromo(exec: Exec, code: string): Promise<PromoRow | null> {
  const [row] = await exec.select().from(promoCodes).where(eq(promoCodes.code, normalizeCode(code)));
  return row ?? null;
}

export async function hasPriorTopup(exec: Exec, userId: string, excludePaymentId?: string): Promise<boolean> {
  const rows = await exec
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.userId, userId), eq(payments.kind, "topup"), eq(payments.status, "succeeded"), excludePaymentId ? sql`${payments.id} <> ${excludePaymentId}` : undefined))
    .limit(1);
  return rows.length > 0;
}

export async function userRedemptions(exec: Exec, userId: string, codeId: string): Promise<number> {
  const [row] = await exec.select({ n: count() }).from(promoRedemptions).where(and(eq(promoRedemptions.userId, userId), eq(promoRedemptions.codeId, codeId)));
  return row?.n ?? 0;
}

/** Vorschau für die Oberfläche: Was bringt der Code bei diesem Betrag? */
export async function previewPromo(userId: string, rawCode: string, topupCents: number): Promise<PromoCheck & { codeId?: string }> {
  const code = await loadPromo(db, rawCode);
  if (!code) return { ok: false, reason: "Diesen Code gibt es nicht." };
  const result = checkPromo(toRule(code), {
    topupCents,
    now: new Date(),
    hasPriorTopup: await hasPriorTopup(db, userId),
    userRedemptions: await userRedemptions(db, userId, code.id),
  });
  return result.ok ? { ...result, codeId: code.id } : result;
}

/** Löst einen Code bei erfolgreicher Zahlung ein. Sperrt die Code-Zeile, damit das Budget nie überschritten wird. Gibt den Bonus oder null zurück. */
export async function redeemPromo(tx: Tx, p: { codeId: string; userId: string; paymentId: string; topupCents: number }): Promise<{ bonusCents: number } | { skipped: string }> {
  const [code] = await tx.select().from(promoCodes).where(eq(promoCodes.id, p.codeId)).for("update");
  if (!code) return { skipped: "Code existiert nicht mehr." };
  const result = checkPromo(toRule(code), {
    topupCents: p.topupCents,
    now: new Date(),
    hasPriorTopup: await hasPriorTopup(tx, p.userId, p.paymentId),
    userRedemptions: await userRedemptions(tx, p.userId, p.codeId),
  });
  if (!result.ok) return { skipped: result.reason };
  await tx.insert(promoRedemptions).values({ codeId: p.codeId, userId: p.userId, paymentId: p.paymentId, amountCents: result.bonusCents });
  await tx.update(promoCodes).set({ usedCents: sql`${promoCodes.usedCents} + ${result.bonusCents}` }).where(eq(promoCodes.id, p.codeId));
  return { bonusCents: result.bonusCents };
}

// ---------------------------------------------------------------------------------------------
// Verwaltung (Admin)
// ---------------------------------------------------------------------------------------------

export type PromoInput = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minTopupCents?: number;
  maxBonusCents?: number | null;
  budgetCents?: number | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  newUsersOnly?: boolean;
  maxPerUser?: number;
  note?: string | null;
};

export async function createPromo(actorId: string, input: PromoInput) {
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new DomainError("Der Code braucht 3 bis 24 Zeichen (Buchstaben, Zahlen, - und _).");
  if (input.kind === "percent" && !(Number.isInteger(input.value) && input.value >= 1 && input.value <= 100)) throw new DomainError("Prozent: ganze Zahl von 1 bis 100.");
  if (input.kind === "fixed" && !(Number.isInteger(input.value) && input.value >= 1 && input.value <= 20_000)) throw new DomainError("Festbetrag: 0,01 bis 200,00 Euro.");
  if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom) throw new DomainError("Das Ende muss nach dem Beginn liegen.");
  if (input.budgetCents !== undefined && input.budgetCents !== null && input.budgetCents < 1) throw new DomainError("Das Budget muss positiv sein.");
  if ((input.maxPerUser ?? 1) < 1) throw new DomainError("Pro Nutzer mindestens einmal.");

  const [existing] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, code));
  if (existing) throw new DomainError("Diesen Code gibt es schon.");

  const [row] = await db
    .insert(promoCodes)
    .values({
      code,
      kind: input.kind,
      value: input.value,
      minTopupCents: input.minTopupCents ?? 0,
      maxBonusCents: input.maxBonusCents ?? null,
      budgetCents: input.budgetCents ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      newUsersOnly: input.newUsersOnly ?? false,
      maxPerUser: input.maxPerUser ?? 1,
      note: input.note ?? null,
      createdBy: actorId,
    })
    .returning();
  await audit(actorId, "promo.create", "promo_code", row.id, { after: row });
  return row;
}

export async function setPromoActive(actorId: string, id: string, active: boolean) {
  const [row] = await db.update(promoCodes).set({ active }).where(eq(promoCodes.id, id)).returning();
  if (!row) throw new DomainError("Code nicht gefunden.");
  await audit(actorId, active ? "promo.activate" : "promo.deactivate", "promo_code", id, { after: { active } });
}

export async function listPromos() {
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)).limit(100);
}
