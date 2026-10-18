import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { formatEuro } from "@/lib/money";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type Exec = Pick<typeof db, "insert" | "select">;

export type Account = "wallet" | "clearing" | "bank" | "revenue" | "venue_cost" | "fees" | "promo" | "chargeback" | "tournament";
export type LedgerKind = "topup" | "fee" | "promo_credit" | "match_share" | "refund" | "venue_cost" | "adjustment" | "chargeback" | "tournament_entry" | "tournament_refund" | "tournament_payout" | "tournament_commission";

export type Posting = {
  debit: { account: Account; userId?: string };
  credit: { account: Account; userId?: string };
  amountCents: number;
  kind: LedgerKind;
  idempotencyKey: string;
  matchId?: string | null;
  paymentId?: string | null;
  tournamentId?: string | null;
  reversesEntryId?: string | null;
  reason?: string | null;
  actorId?: string | null;
};

export class InsufficientFunds extends DomainError {
  constructor(
    public readonly neededCents: number,
    public readonly balanceCents: number,
  ) {
    super(`Dein Guthaben reicht nicht: ${formatEuro(balanceCents)} vorhanden, ${formatEuro(neededCents)} nötig.`);
  }
}

/**
 * Bucht einen Vorgang. Jeder Schlüssel wirkt höchstens einmal: Wird derselbe `idempotencyKey` erneut gebucht
 * (Webhook-Wiederholung, Job-Neustart), passiert nichts und die ursprüngliche Buchung wird zurückgegeben.
 */
export async function post(exec: Exec, p: Posting): Promise<{ id: string; created: boolean }> {
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) throw new Error(`Ungültiger Buchungsbetrag: ${p.amountCents}`);
  if (p.debit.account === "wallet" && !p.debit.userId) throw new Error("Guthaben-Konto braucht einen Nutzer (Soll).");
  if (p.credit.account === "wallet" && !p.credit.userId) throw new Error("Guthaben-Konto braucht einen Nutzer (Haben).");

  const [row] = await exec
    .insert(ledgerEntries)
    .values({
      debitAccount: p.debit.account,
      debitUserId: p.debit.userId ?? null,
      creditAccount: p.credit.account,
      creditUserId: p.credit.userId ?? null,
      amountCents: p.amountCents,
      kind: p.kind,
      matchId: p.matchId ?? null,
      paymentId: p.paymentId ?? null,
      tournamentId: p.tournamentId ?? null,
      reversesEntryId: p.reversesEntryId ?? null,
      reason: p.reason ?? null,
      idempotencyKey: p.idempotencyKey,
      actorId: p.actorId ?? null,
    })
    .onConflictDoNothing({ target: ledgerEntries.idempotencyKey })
    .returning({ id: ledgerEntries.id });
  if (row) return { id: row.id, created: true };

  const [existing] = await exec.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, p.idempotencyKey));
  return { id: existing.id, created: false };
}

/** Kontostand des Guthabens in Cent (Haben minus Soll auf dem Guthaben-Konto des Nutzers). */
export async function walletBalance(exec: Pick<typeof db, "select">, userId: string): Promise<number> {
  const [row] = await exec
    .select({
      balance: sql<number>`coalesce(sum(case when ${ledgerEntries.creditAccount} = 'wallet' and ${ledgerEntries.creditUserId} = ${userId} then ${ledgerEntries.amountCents} else 0 end), 0)
        - coalesce(sum(case when ${ledgerEntries.debitAccount} = 'wallet' and ${ledgerEntries.debitUserId} = ${userId} then ${ledgerEntries.amountCents} else 0 end), 0)`.mapWith(Number),
    })
    .from(ledgerEntries)
    .where(or(eq(ledgerEntries.creditUserId, userId), eq(ledgerEntries.debitUserId, userId)));
  return row?.balance ?? 0;
}

/** Sperrt die Nutzerzeile. Wer Guthaben abbucht, muss das tun, sonst könnten zwei gleichzeitige Abbuchungen dasselbe Guthaben ausgeben. */
export async function lockUser(tx: Tx, userId: string) {
  const rows = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
  if (rows.length === 0) throw new DomainError("Nutzer nicht gefunden.");
}

/** Bucht vom Guthaben ab, sofern es reicht. Muss innerhalb einer Transaktion laufen. */
export async function debitWallet(tx: Tx, userId: string, p: Omit<Posting, "debit" | "credit"> & { to: Account }) {
  await lockUser(tx, userId);
  const balance = await walletBalance(tx, userId);
  if (balance < p.amountCents) throw new InsufficientFunds(p.amountCents, balance);
  const { to, ...rest } = p;
  return post(tx, { ...rest, debit: { account: "wallet", userId }, credit: { account: to } });
}

/** Schreibt dem Guthaben etwas gut (Quelle ist ein Systemkonto). */
export function creditWallet(exec: Exec, userId: string, p: Omit<Posting, "debit" | "credit"> & { from: Account }) {
  const { from, ...rest } = p;
  return post(exec, { ...rest, debit: { account: from }, credit: { account: "wallet", userId } });
}

/** Gegenbuchung: dreht eine bestehende Buchung um (gleicher Betrag, vertauschte Konten). Original bleibt unverändert. */
export async function reverseEntry(tx: Tx, entryId: string, opts: { reason: string; idempotencyKey: string; actorId?: string | null }) {
  const [orig] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.id, entryId));
  if (!orig) throw new DomainError("Buchung nicht gefunden.");
  return post(tx, {
    debit: { account: orig.creditAccount, userId: orig.creditUserId ?? undefined },
    credit: { account: orig.debitAccount, userId: orig.debitUserId ?? undefined },
    amountCents: orig.amountCents,
    kind: "adjustment",
    matchId: orig.matchId,
    paymentId: orig.paymentId,
    reversesEntryId: orig.id,
    reason: opts.reason,
    idempotencyKey: opts.idempotencyKey,
    actorId: opts.actorId ?? null,
  });
}

/** Alle Bewegungen auf dem Guthaben eines Nutzers, neueste zuerst, mit Vorzeichen (+ Gutschrift, − Abbuchung). */
export async function walletStatement(userId: string, limit = 100) {
  const rows = await db
    .select({
      id: ledgerEntries.id,
      at: ledgerEntries.at,
      kind: ledgerEntries.kind,
      amountCents: ledgerEntries.amountCents,
      isCredit: sql<boolean>`${ledgerEntries.creditAccount} = 'wallet' and ${ledgerEntries.creditUserId} = ${userId}`,
      matchId: ledgerEntries.matchId,
      reason: ledgerEntries.reason,
    })
    .from(ledgerEntries)
    .where(or(and(eq(ledgerEntries.creditAccount, "wallet"), eq(ledgerEntries.creditUserId, userId)), and(eq(ledgerEntries.debitAccount, "wallet"), eq(ledgerEntries.debitUserId, userId))))
    .orderBy(desc(ledgerEntries.at), desc(ledgerEntries.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, signedCents: r.isCredit ? r.amountCents : -r.amountCents }));
}

/** Saldenprobe: Soll und Haben je Konto. Insgesamt müssen beide Summen gleich sein (jede Buchung hat beide Seiten). */
export async function trialBalance(exec: Pick<typeof db, "select"> = db) {
  const debits = await exec
    .select({ account: ledgerEntries.debitAccount, total: sql<number>`sum(${ledgerEntries.amountCents})`.mapWith(Number) })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.debitAccount);
  const credits = await exec
    .select({ account: ledgerEntries.creditAccount, total: sql<number>`sum(${ledgerEntries.amountCents})`.mapWith(Number) })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.creditAccount);
  const accounts = new Map<string, { debit: number; credit: number }>();
  for (const d of debits) accounts.set(d.account, { debit: d.total, credit: 0 });
  for (const c of credits) accounts.set(c.account, { debit: accounts.get(c.account)?.debit ?? 0, credit: c.total });
  const rows = [...accounts.entries()].map(([account, v]) => ({ account, ...v, balance: v.credit - v.debit }));
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/** Summe aller Guthaben: das, was die Plattform den Spielern schuldet. */
export async function totalWalletLiability(exec: Pick<typeof db, "select"> = db): Promise<number> {
  const [row] = await exec
    .select({
      credit: sql<number>`coalesce(sum(case when ${ledgerEntries.creditAccount} = 'wallet' then ${ledgerEntries.amountCents} else 0 end), 0)`.mapWith(Number),
      debit: sql<number>`coalesce(sum(case when ${ledgerEntries.debitAccount} = 'wallet' then ${ledgerEntries.amountCents} else 0 end), 0)`.mapWith(Number),
    })
    .from(ledgerEntries);
  return (row?.credit ?? 0) - (row?.debit ?? 0);
}
