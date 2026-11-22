// Absage eines Turniers im Kartenmodell (Vertrag 012, M5-5, Z3/Z5): Erstattungszeilen fuer alle erfolgreichen Abbuchungen, Beendigung nie gesendeter Zeilen, Storno der Provision.
// Laeuft in der Transaktion des Aufrufers unter der Turniersperre (cancelTournamentTx). Der Versand der Erstattungen folgt ueber den Job (tournament-refund.ts); "Absage" heisst hier:
// das Turnier ist abgesagt, es wird nichts mehr abgebucht, und jede erfolgreiche Abbuchung hat eine Erstattungszeile (pending). Nie Geld eines abgesagten Turniers behalten.
import { and, eq, isNull } from "drizzle-orm";
import { paymentCharges } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { audit } from "../audit";
import { reverseEntry } from "../ledger";
import type { Tx } from "../tx";
import { ensureRefundRow } from "./charge";
import { UNKNOWN_OUTCOME } from "./charge-run";

type T = typeof tournaments.$inferSelect;

/** Gibt es fuer das Turnier schon Abbuchungszeilen (Kartenmodell, Abbuchung angelaufen)? */
export async function hasTournamentChargeRows(tx: Pick<Tx, "select">, tournamentId: string): Promise<boolean> {
  const [row] = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.tournamentId, tournamentId)).limit(1);
  return Boolean(row);
}

export type CardCancelResult = { refunded: number; ended: number; unknown: number; payerIds: string[] };

/**
 * Bereitet die Absage vor: je erfolgreicher Abbuchung eine volle Erstattungszeile (Schluessel refund:<Zeile>, an den ZAHLER), nie gesendete offene Zeilen enden (tournament_cancelled, nie gesendet),
 * schon gesendete offene Zeilen werden als "unbekannter Ausgang" markiert (kein Aufruf, Alarm; eine spaete Zahlung wird vom Webhook sofort erstattet), die Provision wird storniert.
 */
export async function prepareCardCancel(tx: Tx, t: T, now: Date): Promise<CardCancelResult> {
  const rows = await tx.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, t.id)).orderBy(paymentCharges.userId).for("update");
  let refunded = 0;
  let ended = 0;
  let unknown = 0;
  const payerIds = new Set<string>();
  for (const c of rows) {
    if (c.status === "succeeded") {
      await ensureRefundRow(tx, c, "Turnier abgesagt");
      payerIds.add(c.payerUserId ?? c.userId);
      refunded += 1;
    } else if (c.status === "pending" && c.paymentIntentId === null && c.attemptStartedAt === null && c.failureCode !== UNKNOWN_OUTCOME) {
      await tx.update(paymentCharges).set({ status: "failed", failureCode: "tournament_cancelled", updatedAt: now }).where(and(eq(paymentCharges.id, c.id), eq(paymentCharges.status, "pending")));
      ended += 1;
    } else if (c.status === "pending" && c.paymentIntentId === null && c.attemptStartedAt !== null) {
      await tx.update(paymentCharges).set({ failureCode: UNKNOWN_OUTCOME, updatedAt: now }).where(and(eq(paymentCharges.id, c.id), eq(paymentCharges.status, "pending"), isNull(paymentCharges.paymentIntentId)));
      unknown += 1;
    }
  }
  // Provision: genau einmal storniert, im selben Schritt wie die Erstattungen (zweites Storno bucht nichts); ein ausgeloester 10er-Bonus gibt es fuer Turniere in M5 nicht
  const reversed = await reverseTournamentCommission(tx, t.id);
  await audit(null, "tournament.cancel_cards", "tournament", t.id, { after: { refunds: refunded, ended, unknown, commissionReversed: reversed } }, tx);
  return { refunded, ended, unknown, payerIds: [...payerIds] };
}

/** Storno der Provisionsbuchung des Turniers (Gegenbuchung, Schluessel commission-reversal:t:<Turnier>, genau einmal). */
export async function reverseTournamentCommission(tx: Tx, tournamentId: string): Promise<boolean> {
  const [e] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `commission:t:${tournamentId}`));
  if (!e) return false;
  const r = await reverseEntry(tx, e.id, { reason: "Provision storniert (Turnier abgesagt)", idempotencyKey: `commission-reversal:t:${tournamentId}` });
  return r.created;
}
