// Zahlungsstreit (Dispute) im Kartenwebhook (Vertrag 012, M4a, AC-11), nach Plan docs/design/m4-plan.md v4. Ziele: jede Reihenfolge der Ereignisse und jede Doppelzustellung fuehrt zum selben
// Ergebnis; nichts wird gebucht, was nicht zu Betrag, Waehrung und Zahlung passt; Admin 1 erfaehrt jeden Sonderfall genau einmal.
//
// Grundsatz: gebucht wird nicht nach dem Ereignistyp, sondern nach den BALANCE-TRANSACTIONS des Streits, je Transaktion genau einmal (Schluessel dispute:<dp>:bt:<txn>, Gebuehr :fee).
//   Abzug (Betrag < 0):        Soll chargeback, Haben clearing.
//   Rueckbuchung (Betrag > 0): Soll clearing, Haben chargeback; nur, wenn die gebuchten Abzuege dieses Streits sie decken (sonst geparkt, kein negativer Stand auf chargeback).
//   Gebuehr (fee der Transaktion): Soll fees, Haben clearing, IMMER genau einmal, unabhaengig vom Status des Eintrags (die Gebuehr ist real angefallen).
// Sperrreihenfolge: Spiel -> Abbuchungszeile -> payment_refunds-Zeilen -> payment_disputes-Zeile (der Streit trifft den Zahler; die Nutzerzeile wird hier nie gesperrt).
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { matches, paymentChargeAttempts, paymentCharges, paymentDisputeEntries, paymentDisputes, paymentRefunds } from "@/db/schema";
import { audit } from "../audit";
import { post } from "../ledger";
import { notifyUsers, platformAdminIds } from "../notifications";
import type { Tx } from "../tx";
import type { DisputeBalanceTransaction, DisputeReport } from "./dispute-parse";

import { disputeRank, isDisputeOpen, OPEN_DISPUTE_STATUSES, RANK } from "./dispute-parse";
export { disputeRank, isDisputeOpen, OPEN_DISPUTE_STATUSES };

type AlertReason = "opened" | "rejected_amount" | "unknown_payment" | "lost_without_withdrawal" | "refund_conflict" | "refund_blocked" | "won_after_cancel" | "unknown_status" | "closed";
const ALERT_TEXT: Record<AlertReason, [string, string]> = {
  opened: ["Zahlungsstreit eingegangen", "Bei Stripe wurde eine Kartenzahlung angefochten. Bitte im Stripe-Dashboard Beweise einreichen (Frist beachten)."],
  rejected_amount: ["Zahlungsstreit: Betrag nicht gebucht", "Ein Betrag des Streits passt nicht zur Abbuchung (zu hoch, falsche Währung oder Summe zu groß) und wurde NICHT gebucht. Bitte manuell prüfen."],
  unknown_payment: ["Zahlungsstreit ohne bekannte Zahlung", "Zu einem Zahlungsstreit gibt es keine passende Abbuchung. Das Geld wurde trotzdem abgezogen und gebucht. Bitte prüfen."],
  lost_without_withdrawal: ["Zahlungsstreit verloren ohne Abzug", "Ein Streit ist verloren, aber es gibt keinen gebuchten Abzug. Es wurde nichts gebucht. Bitte manuell klären."],
  refund_conflict: ["Zahlungsstreit und Erstattung", "Zu einer Zahlung gibt es einen Streit UND eine schon gesendete Erstattung (Doppelverlust möglich). Bitte prüfen."],
  refund_blocked: ["Strittige Zahlung wird nicht erstattet", "Zu dieser Zahlung gibt es einen Zahlungsstreit. Sie wird bei der Absage NICHT zusätzlich erstattet; alle anderen Zahlungen des Spiels werden erstattet."],
  won_after_cancel: ["Zahlungsstreit gewonnen, Zahlung nicht erstattet", "Der Streit ist gewonnen, die Zahlung gehörte aber zu einer abgesagten Lobby und wurde nicht erstattet. Das Geld liegt bei Soccaz: bitte manuell entscheiden."],
  unknown_status: ["Zahlungsstreit mit unbekanntem Status", "Stripe meldet einen Status, den wir nicht kennen. Er wurde gespeichert; die Erstattung bleibt vorsorglich gesperrt."],
  closed: ["Zahlungsstreit abgeschlossen", "Ein Zahlungsstreit wurde entschieden. Das Ergebnis steht im Admin-Bereich."],
};

export type DisputeApplyResult = { cancelCheckMatchId: string | null };

const EUR = "eur";

/**
 * Verbucht ein Streit-Ereignis (oder einen Abruf). Laeuft in der Transaktion des Aufrufers. `eventAt` = Zeitpunkt des Ereignisses bei Stripe (fuer die Reihenfolge der Statusfelder).
 * Idempotent und reihenfolge-unabhaengig (siehe Kopf).
 */
export async function applyDisputeInTx(tx: Tx, d: DisputeReport, eventAt: Date | null): Promise<DisputeApplyResult> {
  const result: DisputeApplyResult = { cancelCheckMatchId: null };
  if (d.amountCents === null || d.amountCents <= 0) {
    await audit(null, "dispute.ignored", "payment_dispute", d.disputeId, { after: { reason: "amount" } }, tx);
    return result;
  }

  // 1. Zuordnung: PaymentIntent der Abbuchung, sonst ein alter Versuch (Historie). Ohne Sperre suchen, dann in der festen Reihenfolge sperren.
  const findCharge = async (lock: boolean) => {
    if (!d.paymentIntentId) return undefined;
    const q = tx.select().from(paymentCharges).where(eq(paymentCharges.paymentIntentId, d.paymentIntentId));
    const direct = (lock ? await q.for("update") : await q)[0];
    if (direct) return direct;
    const [h] = await tx.select({ chargeId: paymentChargeAttempts.chargeId }).from(paymentChargeAttempts).where(eq(paymentChargeAttempts.paymentIntentId, d.paymentIntentId));
    if (!h) return undefined;
    const q2 = tx.select().from(paymentCharges).where(eq(paymentCharges.id, h.chargeId));
    return (lock ? await q2.for("update") : await q2)[0];
  };
  const probe = await findCharge(false);
  if (probe) await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, probe.matchId)).for("update"); // Spiel zuerst
  const charge = probe ? await findCharge(true) : undefined; // dann die Abbuchungszeile
  const refunds = charge ? await tx.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id)).orderBy(asc(paymentRefunds.id)).for("update") : []; // dann die Erstattungszeilen

  // 2. Streitzeile anlegen (falls neu) und sperren
  const inserted = await tx
    .insert(paymentDisputes)
    .values({
      disputeId: d.disputeId,
      chargeId: charge?.id ?? null,
      paymentIntentId: d.paymentIntentId,
      matchId: charge?.matchId ?? null,
      payerUserId: charge ? (charge.payerUserId ?? charge.userId) : null,
      amountCents: d.amountCents,
      currency: d.currency ?? "unknown",
      reason: d.reason,
      status: d.status,
      evidenceDueBy: d.evidenceDueBy,
      lastEventAt: eventAt,
      closedAt: disputeRank(d.status) === 3 ? (eventAt ?? new Date()) : null,
    })
    .onConflictDoNothing({ target: paymentDisputes.disputeId })
    .returning({ id: paymentDisputes.id });
  const isNew = inserted.length > 0;
  let [row] = await tx.select().from(paymentDisputes).where(eq(paymentDisputes.disputeId, d.disputeId)).for("update");
  const alerts: AlertReason[] = [];
  const want = (reason: AlertReason) => {
    if (!row.alertedReasons.includes(reason) && !alerts.includes(reason)) alerts.push(reason);
  };

  // 3. Status und Zuordnung nachziehen
  if (!isNew) {
    const patch: Partial<typeof paymentDisputes.$inferInsert> = { updatedAt: new Date() };
    if (!row.chargeId && charge) Object.assign(patch, { chargeId: charge.id, matchId: charge.matchId, payerUserId: charge.payerUserId ?? charge.userId });
    const stale = eventAt !== null && row.lastEventAt !== null && eventAt.getTime() < row.lastEventAt.getTime();
    const terminalChange = disputeRank(row.status) === 3 && d.status !== row.status;
    if (!stale && !terminalChange && disputeRank(d.status) >= disputeRank(row.status)) {
      Object.assign(patch, { status: d.status, evidenceDueBy: d.evidenceDueBy ?? row.evidenceDueBy, lastEventAt: eventAt ?? row.lastEventAt, reason: d.reason });
      if (disputeRank(d.status) === 3 && !row.closedAt) Object.assign(patch, { closedAt: eventAt ?? new Date() });
    } else if (d.status !== row.status) {
      await audit(null, "dispute.event_dropped", "payment_dispute", d.disputeId, { after: { status: d.status, stale } }, tx);
    }
    [row] = await tx.update(paymentDisputes).set(patch).where(eq(paymentDisputes.id, row.id)).returning();
  }
  if (isNew) want("opened");
  if (!(d.status in RANK)) want("unknown_status");
  if (!charge) want("unknown_payment");

  // 4. Balance-Transactions: neue Eintraege anlegen, Gebuehren buchen
  const known = await tx.select().from(paymentDisputeEntries).where(eq(paymentDisputeEntries.disputeRowId, row.id));
  const knownIds = new Set(known.map((e) => e.balanceTransactionId));
  for (const bt of d.balanceTransactions ?? []) {
    const kind = classify(bt);
    if (kind === "other") continue;
    // Gebuehr: immer genau einmal (eigener Schluessel), unabhaengig vom Status des Eintrags
    if (bt.feeCents !== 0 && bt.currency === EUR) {
      // positiv: Aufwand (Soll fees); negativ: Gebuehrenrueckerstattung bei gewonnenem Streit (Gegenbuchung, Soll clearing / Haben fees). Immer genau der Betrag der Balance-Transaction.
      await post(tx, {
        debit: { account: bt.feeCents > 0 ? "fees" : "clearing" },
        credit: { account: bt.feeCents > 0 ? "clearing" : "fees" },
        amountCents: Math.abs(bt.feeCents),
        kind: "fee",
        matchId: row.matchId,
        idempotencyKey: `dispute:${d.disputeId}:bt:${bt.id}:fee`,
        reason: bt.feeCents > 0 ? "Stripe-Gebühr Zahlungsstreit" : "Stripe-Gebühr Zahlungsstreit zurückerstattet",
      });
    } else if (bt.feeCents !== 0) {
      want("rejected_amount"); // Gebuehr in fremder Waehrung: nicht gebucht
    }
    if (knownIds.has(bt.id)) continue;
    if (kind === "invalid" || bt.amountCents === 0) {
      want("rejected_amount"); // Betrag 0 oder falsches Vorzeichen: kein Eintrag, nichts gebucht
      continue;
    }
    const currencyOk = bt.currency === EUR;
    const [entry] = await tx
      .insert(paymentDisputeEntries)
      .values({
        disputeRowId: row.id,
        balanceTransactionId: bt.id,
        kind,
        amountCents: Math.abs(bt.amountCents),
        feeCents: Math.abs(bt.feeCents),
        status: currencyOk ? "parked" : "rejected",
        rejectReason: currencyOk ? null : "currency",
      })
      .onConflictDoNothing({ target: paymentDisputeEntries.balanceTransactionId })
      .returning();
    if (entry) knownIds.add(bt.id);
    if (entry && !currencyOk) want("rejected_amount");
  }

  // 5. Abzuege entscheiden (nie warten, sofort gebucht oder abgelehnt), danach Rueckbuchungen
  const entries = await tx.select().from(paymentDisputeEntries).where(eq(paymentDisputeEntries.disputeRowId, row.id)).orderBy(asc(paymentDisputeEntries.createdAt), asc(paymentDisputeEntries.id));
  for (const e of entries.filter((x) => x.kind === "withdrawal" && x.status === "parked")) {
    const reason = await withdrawalProblem(tx, row, charge, e.amountCents);
    if (reason) {
      await tx.update(paymentDisputeEntries).set({ status: "rejected", rejectReason: reason }).where(eq(paymentDisputeEntries.id, e.id));
      e.status = "rejected";
      want("rejected_amount");
      continue;
    }
    await post(tx, {
      debit: { account: "chargeback" },
      credit: { account: "clearing" },
      amountCents: e.amountCents,
      kind: "chargeback",
      matchId: row.matchId,
      idempotencyKey: `dispute:${d.disputeId}:bt:${e.balanceTransactionId}`,
      reason: "Zahlungsstreit: Abzug durch Stripe",
    });
    await tx.update(paymentDisputeEntries).set({ status: "booked", bookedAt: new Date() }).where(eq(paymentDisputeEntries.id, e.id));
    e.status = "booked";
  }
  const withdrawn = entries.filter((x) => x.kind === "withdrawal" && x.status === "booked").reduce((s, x) => s + x.amountCents, 0);
  let reversed = entries.filter((x) => x.kind === "reversal" && x.status === "booked").reduce((s, x) => s + x.amountCents, 0);
  const anyRejectedWithdrawal = entries.some((x) => x.kind === "withdrawal" && x.status === "rejected");
  for (const e of entries.filter((x) => x.kind === "reversal" && x.status === "parked")) {
    if (withdrawn - reversed >= e.amountCents) {
      await post(tx, {
        debit: { account: "clearing" },
        credit: { account: "chargeback" },
        amountCents: e.amountCents,
        kind: "chargeback",
        matchId: row.matchId,
        idempotencyKey: `dispute:${d.disputeId}:bt:${e.balanceTransactionId}`,
        reason: "Zahlungsstreit: Rückbuchung durch Stripe",
      });
      await tx.update(paymentDisputeEntries).set({ status: "booked", bookedAt: new Date() }).where(eq(paymentDisputeEntries.id, e.id));
      e.status = "booked";
      reversed += e.amountCents;
    } else if (anyRejectedWithdrawal) {
      // Summenregel: die gebuchten Abzuege decken sie nicht, und ein abgelehnter Abzug macht das endgueltig (auf keinen ausstehenden Abzug wird mehr gewartet): abgelehnt, ein Alarm
      await tx.update(paymentDisputeEntries).set({ status: "rejected", rejectReason: "uncovered_reversal" }).where(eq(paymentDisputeEntries.id, e.id));
      e.status = "rejected";
      want("rejected_amount");
    } // sonst: bleibt geparkt, bis der Abzug eintrifft
  }

  // 6. Verloren ohne gebuchten Abzug: nichts erfinden, Alarm
  if (row.status === "lost" && !entries.some((x) => x.kind === "withdrawal" && x.status === "booked")) want("lost_without_withdrawal");

  // 7. Erstattungen
  if (charge) {
    const sent = (r: (typeof refunds)[number]) => r.status === "succeeded" || r.refundId !== null || r.attemptStartedAt !== null;
    const unsent = refunds.filter((r) => r.status === "pending" && !sent(r));
    // Entscheid t9: die Absage wird NICHT blockiert. Die strittige Zahlung wird nicht zusaetzlich erstattet: ungesendete Erstattungszeilen enden sofort als cancelled_dispute (offen ODER verloren),
    // alle anderen Zahlungen werden normal erstattet. Gewonnen: eine schon beendete Erstattung bleibt beendet (Hinweis an Admin 1).
    if ((isDisputeOpen(row.status) || row.status === "lost") && unsent.length > 0) {
      await tx.update(paymentRefunds).set({ status: "cancelled_dispute", updatedAt: new Date() }).where(inArray(paymentRefunds.id, unsent.map((r) => r.id)));
      await audit(null, "refund.cancelled_dispute", "match", charge.matchId, { after: { refunds: unsent.length } }, tx);
      want("refund_blocked");
      result.cancelCheckMatchId = charge.matchId; // eine angeforderte Absage kann jetzt abgeschlossen werden
    }
    if (row.status === "won" && refunds.some((r) => r.status === "cancelled_dispute")) want("won_after_cancel");
    const sentRefunds = refunds.filter((r) => r.status !== "cancelled_dispute" && r.status !== "failed" && sent(r));
    if ((isDisputeOpen(row.status) || row.status === "lost") && sentRefunds.length > 0) {
      want("refund_conflict");
      const loss = row.status === "lost" ? sentRefunds.reduce((s, r) => s + r.amountCents, 0) : row.doubleLossCents;
      if (!row.refundConflict || loss !== row.doubleLossCents) [row] = await tx.update(paymentDisputes).set({ refundConflict: true, doubleLossCents: loss, updatedAt: new Date() }).where(eq(paymentDisputes.id, row.id)).returning();
    }
  }
  if (disputeRank(row.status) === 3 && row.status !== "prevented") want("closed");

  await audit(null, "dispute.event", "payment_dispute", d.disputeId, { after: { status: row.status, entries: entries.length } }, tx);

  // 8. Alarme: je Streit und Grund hoechstens EINE Nachricht (Entprellung unter der Zeilensperre)
  if (alerts.length > 0) {
    const admins = await platformAdminIds(tx);
    for (const reason of alerts) {
      const [title, body] = ALERT_TEXT[reason];
      await notifyUsers(admins, { type: "admin.task", title, body, url: "/admin/finanzen" }, tx);
    }
    await tx.update(paymentDisputes).set({ alertedReasons: sql`${paymentDisputes.alertedReasons} || ARRAY[${sql.join(alerts.map((x) => sql`${x}`), sql`, `)}]::text[]` }).where(eq(paymentDisputes.id, row.id));
  }
  return result;
}

/** Abzug (negativ, Kategorie dispute), Rueckbuchung (positiv, dispute_reversal), "invalid" (falsches Vorzeichen) oder "other" (gehoert nicht zum Streit). */
function classify(bt: DisputeBalanceTransaction): "withdrawal" | "reversal" | "invalid" | "other" {
  if (bt.category === "dispute") return bt.amountCents <= 0 ? "withdrawal" : "invalid";
  if (bt.category === "dispute_reversal") return bt.amountCents >= 0 ? "reversal" : "invalid";
  return "other";
}

/**
 * Pruefung eines Abzugs: Betrag > 0 (Waehrung ist beim Anlegen geprueft), bei bekannter Zahlung hoechstens der Betrag der Abbuchung UND die Summe (netto) ueber ALLE Streite
 * derselben Zahlung hoechstens der Betrag der Abbuchung. Bei unbekannter Zahlung entfaellt der Vergleich. Liefert den Ablehnungsgrund oder null.
 */
async function withdrawalProblem(tx: Tx, row: typeof paymentDisputes.$inferSelect, charge: typeof paymentCharges.$inferSelect | undefined, amountCents: number): Promise<string | null> {
  if (amountCents <= 0) return "amount";
  if (!charge) return null;
  if (amountCents > charge.amountCents) return "amount_exceeds_charge";
  if (!row.paymentIntentId) return null;
  const booked = await tx
    .select({ kind: paymentDisputeEntries.kind, amountCents: paymentDisputeEntries.amountCents })
    .from(paymentDisputeEntries)
    .innerJoin(paymentDisputes, eq(paymentDisputes.id, paymentDisputeEntries.disputeRowId))
    .where(and(eq(paymentDisputes.paymentIntentId, row.paymentIntentId), eq(paymentDisputeEntries.status, "booked")));
  const net = booked.reduce((s, e) => s + (e.kind === "withdrawal" ? e.amountCents : -e.amountCents), 0);
  if (net + amountCents > charge.amountCents) return "sum_exceeds_charge";
  return null;
}

/**
 * Gibt es zu dieser Zahlung einen Streit, der die Erstattung entfallen laesst (offen, unbekannt oder verloren)? Dann wird die Erstattungszeile gleich als cancelled_dispute angelegt
 * (Entscheid t9: die strittige Zahlung wird nicht zusaetzlich erstattet, die Absage bleibt unblockiert). Ein gewonnener Streit laesst die Erstattung normal laufen.
 */
export async function refundVoidedByDispute(tx: Pick<Tx, "select">, charge: { id: string; paymentIntentId: string | null }, paymentIntentId: string | null): Promise<boolean> {
  const pi = paymentIntentId ?? charge.paymentIntentId;
  const rows = await tx
    .select({ status: paymentDisputes.status })
    .from(paymentDisputes)
    .where(paymentIntentId ? eq(paymentDisputes.paymentIntentId, paymentIntentId) : pi ? sql`(${paymentDisputes.chargeId} = ${charge.id} or ${paymentDisputes.paymentIntentId} = ${pi})` : eq(paymentDisputes.chargeId, charge.id));
  return rows.some((r) => isDisputeOpen(r.status) || r.status === "lost");
}
