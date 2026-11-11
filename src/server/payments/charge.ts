// Verbuchung von Karten-Abbuchungen (Vertrag 012, M2a). Es gibt genau EINEN Weg, ein Ergebnis zu verbuchen: applyChargeInTx. Der Webhook (und ab M2b der Job)
// ruft ihn auf; er ist idempotent und bucht nur Abbuchungen, die in payment_charges stehen und zu Betrag, Kunde und Metadaten passen.
// Netzaufrufe laufen NIE innerhalb einer Datenbanktransaktion (die Gebühr wird vorher geholt oder in einem eigenen Folgeschritt gebucht).
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges, paymentProfiles } from "@/db/schema";
import { audit } from "../audit";
import { post } from "../ledger";
import type { Tx } from "../tx";
import { getPaymentProvider } from "./provider";

export type ChargeOutcome = "succeeded" | "requires_action" | "failed";

/** Ein von Stripe gemeldetes (oder vom Anbieter zurückgegebenes) Ergebnis einer Abbuchung. Alle Werte sind ungeprüfte Eingabe. */
export type ChargeReport = {
  outcome: ChargeOutcome;
  paymentIntentId: string;
  amountCents: number | null;
  currency: string | null;
  customerId: string | null;
  metadata: { matchId: string | null; userId: string | null };
  failureCode: string | null;
};

export type ApplyResult = { status: "applied" | "already" | "ignored"; reason?: string };

const RANK: Record<string, number> = { pending: 0, requires_action: 1, failed: 2, succeeded: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanCode = (c: string | null) => (typeof c === "string" && /^[a-z0-9_.-]{1,64}$/i.test(c) ? c : c ? "unknown" : null);

/**
 * Verbucht ein Abbuchungs-Ergebnis. Läuft in der Transaktion des Aufrufers.
 * - Die Zeile wird über payment_intent_id gefunden, sonst (Ereignis vor der Antwort des Auftrags) über Spiel und Nutzer aus den Metadaten und dann gebunden.
 * - Betrag, Währung (EUR) und Kunde müssen zur Zeile und zum Profil des Nutzers passen; sonst wird NICHTS gebucht (ignoriert + Audit).
 * - succeeded gewinnt immer und wird nie überschrieben; failed/requires_action überschreiben nur nicht-erfolgreiche Zeilen.
 * - Bei succeeded: Anteil clearing -> revenue (Schlüssel charge:<PaymentIntent>), Platz auf charged. Die Gebühr wird NICHT hier gebucht (bookChargeFee).
 */
export async function applyChargeInTx(tx: Tx, r: ChargeReport): Promise<ApplyResult> {
  const ignore = async (reason: string): Promise<ApplyResult> => {
    await audit(null, "charge.ignored", "payment_intent", r.paymentIntentId, { after: { reason } }, tx);
    return { status: "ignored", reason };
  };

  let [row] = await tx.select().from(paymentCharges).where(eq(paymentCharges.paymentIntentId, r.paymentIntentId)).for("update");
  if (!row) {
    const { matchId, userId } = r.metadata;
    if (!matchId || !userId || !UUID.test(matchId) || !UUID.test(userId)) return ignore("unknown_payment_intent");
    [row] = await tx.select().from(paymentCharges).where(and(eq(paymentCharges.matchId, matchId), eq(paymentCharges.userId, userId))).for("update");
    if (!row) return ignore("unknown_charge");
    // Die Zeile gehört zu einem ANDEREN PaymentIntent. Derselbe PaymentIntent ist kein Fehler: ein paralleles Ereignis hat ihn gerade gebunden
    // (wir haben auf seine Sperre gewartet) und wird normal weiterverarbeitet, sonst ginge ein succeeded verloren (Geld abgebucht, nicht gebucht).
    if (row.paymentIntentId !== null && row.paymentIntentId !== r.paymentIntentId) return ignore("other_payment_intent");
  }
  if (r.metadata.matchId !== null && r.metadata.matchId !== row.matchId) return ignore("metadata_mismatch");
  if (r.metadata.userId !== null && r.metadata.userId !== row.userId) return ignore("metadata_mismatch");
  if (r.amountCents !== row.amountCents || r.currency?.toLowerCase() !== "eur") return ignore("amount_mismatch");
  const [profile] = await tx.select({ stripeCustomerId: paymentProfiles.stripeCustomerId }).from(paymentProfiles).where(eq(paymentProfiles.userId, row.userId));
  if (!profile || r.customerId !== profile.stripeCustomerId) return ignore("customer_mismatch");

  if (row.status === "succeeded") return { status: "already" };
  // Rangfolge succeeded > failed > requires_action > pending: ein verspätetes, "schwächeres" Ereignis überschreibt nichts
  if (r.outcome !== "succeeded" && RANK[r.outcome] < RANK[row.status]) return { status: "already" };
  if (row.paymentIntentId === null) await tx.update(paymentCharges).set({ paymentIntentId: r.paymentIntentId }).where(eq(paymentCharges.id, row.id));

  if (r.outcome === "succeeded") {
    await post(tx, {
      debit: { account: "clearing" },
      credit: { account: "revenue" },
      amountCents: row.amountCents,
      kind: "match_share",
      matchId: row.matchId,
      idempotencyKey: `charge:${r.paymentIntentId}`,
      reason: "Abbuchung Anteil (Karte)",
    });
    await tx.update(paymentCharges).set({ status: "succeeded", failureCode: null, updatedAt: new Date() }).where(eq(paymentCharges.id, row.id));
    await tx.update(matchParticipants).set({ cardStatus: "charged" }).where(and(eq(matchParticipants.matchId, row.matchId), eq(matchParticipants.userId, row.userId)));
    await audit(null, "charge.succeeded", "match", row.matchId, { after: { userId: row.userId, amountCents: row.amountCents } }, tx);
    return { status: "applied" };
  }

  // Nicht erfolgreich: nur der Status und das Audit (Nachzahlfenster, Nachrücker und Absage sind M3). Eine zweite gleiche Meldung ändert nichts.
  if (row.status === r.outcome && row.failureCode === cleanCode(r.failureCode)) return { status: "already" };
  await tx.update(paymentCharges).set({ status: r.outcome, failureCode: cleanCode(r.failureCode) ?? (r.outcome === "requires_action" ? "authentication_required" : "card_declined"), updatedAt: new Date() }).where(eq(paymentCharges.id, row.id));
  await tx.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, row.matchId), eq(matchParticipants.userId, row.userId)));
  await audit(null, "charge.failed", "match", row.matchId, { after: { userId: row.userId, outcome: r.outcome, code: cleanCode(r.failureCode) } }, tx);
  return { status: "applied" };
}

/**
 * Bucht die ECHTE Stripe-Gebühr einer erfolgreichen Abbuchung (Soll fees, Haben clearing, Schlüssel fee:<PaymentIntent>) als eigenen Folgeschritt.
 * Der Netzaufruf (balance_transaction) läuft vor der Transaktion. Ist die Gebühr noch nicht verfügbar, passiert nichts (ein späterer Lauf versucht es
 * erneut); es wird nie eine Schätzung gebucht. Idempotent: ist fee_cents gesetzt, bleibt alles unverändert.
 */
export async function bookChargeFee(paymentIntentId: string): Promise<"booked" | "already" | "unavailable" | "unknown"> {
  const [row] = await db.select().from(paymentCharges).where(eq(paymentCharges.paymentIntentId, paymentIntentId));
  if (!row || row.status !== "succeeded") return "unknown";
  if (row.feeCents !== null) return "already";

  let fee: number | null = null;
  try {
    fee = await (await getPaymentProvider()).retrieveChargeFee(paymentIntentId);
  } catch {
    fee = null; // Stripe nicht erreichbar: später noch einmal
  }
  if (fee === null || !Number.isInteger(fee) || fee < 0) return "unavailable";

  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(paymentCharges).where(and(eq(paymentCharges.paymentIntentId, paymentIntentId), isNull(paymentCharges.feeCents))).for("update");
    if (!fresh || fresh.status !== "succeeded") return "already" as const;
    if (fee > 0) {
      await post(tx, {
        debit: { account: "fees" },
        credit: { account: "clearing" },
        amountCents: fee,
        kind: "fee",
        matchId: fresh.matchId,
        idempotencyKey: `fee:${paymentIntentId}`,
        reason: "Stripe-Gebühr (echt)",
      });
    }
    await tx.update(paymentCharges).set({ feeCents: fee, updatedAt: new Date() }).where(eq(paymentCharges.id, fresh.id));
    return "booked" as const;
  });
}

/** Nachholer: bucht die Gebühren aller erfolgreichen Abbuchungen, bei denen sie noch fehlt (ab M2b vom Job aufgerufen). */
export async function bookOpenFees(limit = 50): Promise<number> {
  const open = await db.select({ pi: paymentCharges.paymentIntentId }).from(paymentCharges).where(and(eq(paymentCharges.status, "succeeded"), isNull(paymentCharges.feeCents))).limit(limit);
  let booked = 0;
  for (const o of open) if (o.pi && (await bookChargeFee(o.pi)) === "booked") booked += 1;
  return booked;
}
