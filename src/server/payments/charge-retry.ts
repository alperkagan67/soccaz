// Nachzahlen im Fenster (Vertrag 012, M3c-1, AC-7): Nach "Karte aendern" (Platz wieder card_ready) bekommt eine fehlgeschlagene Abbuchung INNERHALB des
// Fensters einen NEUEN Versuch: neuer Idempotenzschluessel (charge:<m>:<u>:<n>) und neuer PaymentIntent. Phasen, Netz nie in einer Datenbanktransaktion:
//  1  (Netz)  Stripe-Suche nach den bisherigen Versuchen: Fund succeeded => verbuchen statt neu senden; offene Funde werden abgebrochen (nie zwei offene
//             Versuche). Scheitert das Abbrechen, wird diese Runde ausgelassen (die naechste versucht es erneut).
//  2  (Tx)    Spiel FOR SHARE, Zeile FOR UPDATE, Platz FOR UPDATE (Spiel -> Zeile -> Platz), alle Bedingungen erneut pruefen (Compare-and-set auf
//             current_attempt), den abgeschlossenen Versuch in die Historie schreiben und die Zeile auf einen frischen pending-Versuch zuruecksetzen.
//  3  (Netz)  den neuen Versuch sendet derselbe Weg wie der erste (runCharges: Beanspruchen mit Lease, Senden, Verbuchen ueber applyChargeInTx).
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentChargeAttempts, paymentCharges } from "@/db/schema";
import { audit } from "../audit";
import { cardModeActive } from "../wallet";
import { applyChargeInTx, bookChargeFee } from "./charge";
import { chargeKey, runCharges } from "./charge-run";
import { getPaymentProvider, type FoundIntent } from "./provider";

type Candidate = { id: string; matchId: string; userId: string; attempt: number; amountCents: number };

/** Verbucht einen bei Stripe gefundenen erfolgreichen PaymentIntent ueber den normalen Weg (derselbe wie der Webhook). */
async function bookFound(c: Candidate, f: FoundIntent): Promise<void> {
  await db.transaction((tx) =>
    applyChargeInTx(tx, { outcome: "succeeded", paymentIntentId: f.id, amountCents: f.amountCents, currency: f.currency, customerId: f.customerId, metadata: { matchId: c.matchId, userId: c.userId }, failureCode: null }),
  );
  try {
    await bookChargeFee(f.id);
  } catch {
    /* nichts loggen; der Nachholer bucht die Gebuehr spaeter */
  }
}

/**
 * Startet neue Versuche fuer alle fehlgeschlagenen Abbuchungen im Fenster, deren Platz wieder card_ready ist. Optional eingegrenzt auf einen Nutzer oder ein
 * Spiel. Liefert die Zahl der neu angelegten Versuche. Wiederholbar und parallel sicher.
 */
export async function retryChargesInWindow(opts: { userId?: string; matchId?: string; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const filters = [
    inArray(paymentCharges.status, ["failed", "requires_action"]),
    gt(paymentCharges.graceUntil, now),
    eq(matchParticipants.cardStatus, "card_ready"),
    inArray(matches.status, ["lobby", "confirmed"]),
    isNull(matches.cancelRequestedAt),
    isNull(matches.settledAt),
    gt(matches.startsAt, now),
    sql`(${paymentCharges.failureCode} is null or ${paymentCharges.failureCode} not in ('match_closed', 'after_start'))`,
  ];
  if (opts.userId) filters.push(eq(paymentCharges.userId, opts.userId));
  if (opts.matchId) filters.push(eq(paymentCharges.matchId, opts.matchId));
  const candidates: Candidate[] = await db
    .select({ id: paymentCharges.id, matchId: paymentCharges.matchId, userId: paymentCharges.userId, attempt: paymentCharges.currentAttempt, amountCents: paymentCharges.amountCents })
    .from(paymentCharges)
    .innerJoin(matchParticipants, and(eq(matchParticipants.matchId, paymentCharges.matchId), eq(matchParticipants.userId, paymentCharges.userId)))
    .innerJoin(matches, eq(matches.id, paymentCharges.matchId))
    .where(and(...filters))
    .orderBy(asc(paymentCharges.createdAt), asc(paymentCharges.id));

  let started = 0;
  const toSend = new Set<string>();
  for (const c of candidates) {
    // Phase 1 (Netz): bisherige Versuche bei Stripe pruefen
    const provider = await getPaymentProvider();
    let skip = false;
    let booked = false;
    try {
      for (const f of await provider.findPaymentIntents({ matchId: c.matchId, userId: c.userId })) {
        if (f.status === "succeeded") {
          await bookFound(c, f);
          booked = true;
          break;
        }
        const res = await provider.cancelPaymentIntent(f.id);
        if (res.status === "succeeded") {
          await bookFound(c, { ...f, status: "succeeded" });
          booked = true;
          break;
        }
        if (res.status === "other") {
          skip = true;
          break;
        }
      }
    } catch {
      skip = true; // Netzfehler: diese Runde auslassen, nie blind neu senden
    }
    if (booked || skip) continue;

    // Phase 2 (Tx): Compare-and-set auf current_attempt
    const rotated = await db.transaction(async (tx) => {
      const [game] = await tx.select().from(matches).where(eq(matches.id, c.matchId)).for("share");
      if (!game || !["lobby", "confirmed"].includes(game.status) || game.settledAt !== null || game.cancelRequestedAt !== null || game.startsAt.getTime() <= now.getTime()) return false;
      if (!(await cardModeActive(tx, game))) return false;
      const [row] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, c.id)).for("update");
      if (!row || !["failed", "requires_action"].includes(row.status) || row.currentAttempt !== c.attempt) return false;
      if (row.graceUntil === null || row.graceUntil.getTime() <= now.getTime()) return false;
      if (row.failureCode === "match_closed" || row.failureCode === "after_start") return false;
      const [seat] = await tx.select({ cardStatus: matchParticipants.cardStatus }).from(matchParticipants).where(and(eq(matchParticipants.matchId, c.matchId), eq(matchParticipants.userId, c.userId))).for("update");
      if (!seat || seat.cardStatus !== "card_ready") return false;

      await tx.insert(paymentChargeAttempts).values({
        chargeId: row.id,
        attemptNo: row.currentAttempt,
        idempotencyKey: row.idempotencyKey,
        paymentIntentId: row.paymentIntentId,
        status: row.status,
        failureCode: row.failureCode,
        attemptStartedAt: row.attemptStartedAt,
      });
      const next = row.currentAttempt + 1;
      await tx
        .update(paymentCharges)
        .set({ status: "pending", paymentIntentId: null, idempotencyKey: `${chargeKey(c.matchId, c.userId)}:${next}`, failureCode: null, attemptStartedAt: null, currentAttempt: next, updatedAt: now })
        .where(eq(paymentCharges.id, row.id));
      await tx.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, c.matchId), eq(matchParticipants.userId, c.userId)));
      await audit(null, "charge.retry", "match", c.matchId, { after: { userId: c.userId, attempt: next } }, tx);
      return true;
    });
    if (rotated) {
      started += 1;
      toSend.add(c.matchId);
    }
  }

  // Phase 3 (Netz): die neuen pending-Versuche gehen den normalen Weg (Beanspruchen mit Lease, Senden, Verbuchen)
  for (const matchId of toSend) await runCharges(matchId, now);
  return started;
}
