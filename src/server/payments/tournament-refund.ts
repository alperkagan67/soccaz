// Erstattung der Abbuchungen eines abgesagten Turniers auf die Karte (Vertrag 012, M5-5): Versand (Job) und Verbuchung (Antwort und Webhook, ein Weg: applyTournamentRefund).
// Die Erstattungszeilen legt die Absage an (tournament-cancel.ts, ensureRefundRow). Netzaufrufe nur ausserhalb von Transaktionen. Die Stripe-Gebuehr der Abbuchung wird nicht zurueckgebucht (Soccaz traegt sie).
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentRefunds } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { audit } from "../audit";
import { post } from "../ledger";
import type { Tx } from "../tx";
import { UNKNOWN_OUTCOME } from "./charge-run";
import { OPEN_DISPUTE_STATUSES } from "./dispute";
import { getPaymentProvider, PaymentIdempotencyError } from "./provider";
import type { ApplyRefundResult, RefundReport } from "./refund";
import { REFUND_ATTEMPT_MAX_AGE_MS, REFUND_LEASE_MS } from "./refund";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanCode = (c: string | null) => (typeof c === "string" && /^[a-z0-9_.-]{1,64}$/i.test(c) ? c : c ? "unknown" : null);

type Claimed = { id: string; chargeId: string; tournamentId: string; userId: string; amountCents: number; idempotencyKey: string; paymentIntentId: string };

/** Der 5-Minuten-Job: sendet alle offenen Erstattungen von Turnieren. Ein Fehler bei einem Turnier stoppt die anderen nicht. */
export async function runTournamentRefunds(now: Date = new Date()): Promise<number> {
  await cancelOpenIntentsOfCancelledTournaments();
  const ids = await db.execute(sql`
    select distinct r.tournament_id as id from payment_refunds r
    where r.tournament_id is not null and r.status = 'pending' and r.refund_id is null and r.failure_code is distinct from ${UNKNOWN_OUTCOME}`);
  let sent = 0;
  for (const t of ids.rows as { id: string }[]) {
    try {
      sent += await sendPendingTournamentRefunds(t.id, now);
    } catch (error) {
      console.error("runTournamentRefunds: Fehler bei Turnier", t.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return sent;
}

/**
 * Nach der Absage: Zeilen mit offenem PaymentIntent (pending, requires_action, processing) werden bei Stripe abgebrochen (nie ein offener Versuch eines abgesagten Turniers). Gelingt der Abbruch, endet die
 * Zeile als tournament_cancelled (nie gesendet). War die Zahlung schon erfolgreich (Rennen), meldet der Webhook sie, applyTournamentCharge bucht und erstattet sofort (Alarm "spaete Zahlung nach Absage").
 * Netzfehler: die Zeile bleibt, der naechste Lauf versucht es erneut.
 */
export async function cancelOpenIntentsOfCancelledTournaments(): Promise<number> {
  const rows = await db.execute(sql`
    select c.id, c.payment_intent_id from payment_charges c join tournaments t on t.id = c.tournament_id
    where t.status = 'cancelled' and c.status in ('pending', 'requires_action') and c.payment_intent_id is not null`);
  let ended = 0;
  for (const r of rows.rows as { id: string; payment_intent_id: string }[]) {
    try {
      const provider = await getPaymentProvider();
      const res = await provider.cancelPaymentIntent(r.payment_intent_id);
      if (res.status === "canceled") {
        await db.update(paymentCharges).set({ status: "failed", failureCode: "tournament_cancelled", updatedAt: new Date() }).where(and(eq(paymentCharges.id, r.id), sql`${paymentCharges.status} in ('pending', 'requires_action')`));
        ended += 1;
      }
    } catch {
      /* Netzfehler: naechster Lauf */
    }
  }
  return ended;
}

/** Sendet die offenen Erstattungen eines Turniers. Idempotent: fester Schluessel je Zeile, Lease gegen parallele Laeufe. */
export async function sendPendingTournamentRefunds(tournamentId: string, now: Date = new Date()): Promise<number> {
  let sent = 0;
  for (let guard = 0; guard < 400; guard++) {
    const claimed = await claimRefund(tournamentId, now);
    if (!claimed) break;
    await sendRefund(claimed);
    sent += 1;
  }
  return sent;
}

/** Beansprucht die naechste sendefaehige Erstattungszeile (Turniersperre FOR SHARE VOR der Zeile). Zeilen mit offenem Zahlungsstreit werden nie gesendet (cancelled_dispute, M4a). */
async function claimRefund(tournamentId: string, now: Date): Promise<Claimed | null> {
  return db.transaction(async (tx) => {
    await tx.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, tournamentId)).for("share"); // Turnier vor Zeile
    const rows = await tx.execute(sql`
      select r.id, r.charge_id, r.tournament_id, r.user_id, r.amount_cents, r.idempotency_key, r.attempt_started_at, r.updated_at, coalesce(r.payment_intent_id, c.payment_intent_id) as payment_intent_id
      from payment_refunds r join payment_charges c on c.id = r.charge_id
      where r.tournament_id = ${tournamentId} and r.status = 'pending' and r.refund_id is null and r.failure_code is distinct from ${UNKNOWN_OUTCOME}
        and not exists (select 1 from payment_disputes d where (d.charge_id = r.charge_id or d.payment_intent_id = coalesce(r.payment_intent_id, c.payment_intent_id)) and (d.status in (${sql.join(OPEN_DISPUTE_STATUSES.map((s) => sql`${s}`), sql`, `)}) or d.status not in ('won', 'lost', 'warning_closed', 'prevented')))
      order by r.created_at, r.id
      for update of r skip locked`);
    for (const row of rows.rows as { id: string; charge_id: string; tournament_id: string; user_id: string; amount_cents: number; idempotency_key: string; attempt_started_at: Date | null; updated_at: Date; payment_intent_id: string | null }[]) {
      const started = row.attempt_started_at ? new Date(row.attempt_started_at).getTime() : null;
      if (started !== null && now.getTime() - started > REFUND_ATTEMPT_MAX_AGE_MS) {
        // Schluessel bei Stripe nicht mehr gueltig, Ausgang unbekannt: nicht erneut senden (Gefahr einer doppelten Erstattung), manuell klaeren
        await tx.update(paymentRefunds).set({ failureCode: UNKNOWN_OUTCOME, updatedAt: now }).where(eq(paymentRefunds.id, row.id));
        await audit(null, "refund.unknown_outcome", "tournament", row.tournament_id, { after: { userId: row.user_id } }, tx);
        continue;
      }
      if (started !== null && now.getTime() - new Date(row.updated_at).getTime() < REFUND_LEASE_MS) continue;
      if (!row.payment_intent_id) continue; // eine erfolgreiche Abbuchung hat immer einen PaymentIntent; defensiv
      await tx.update(paymentRefunds).set({ attemptStartedAt: started === null ? now : new Date(started), updatedAt: now }).where(eq(paymentRefunds.id, row.id));
      return { id: row.id, chargeId: row.charge_id, tournamentId: row.tournament_id, userId: row.user_id, amountCents: row.amount_cents, idempotencyKey: row.idempotency_key, paymentIntentId: row.payment_intent_id };
    }
    return null;
  });
}

async function sendRefund(c: Claimed): Promise<void> {
  const provider = await getPaymentProvider();
  const report = (over: Partial<RefundReport>): RefundReport => ({ outcome: "failed", refundId: null, amountCents: c.amountCents, currency: "eur", paymentIntentId: c.paymentIntentId, metadata: { matchId: null, tournamentId: c.tournamentId, userId: c.userId, chargeId: c.chargeId }, failureCode: null, ...over });
  let res;
  try {
    res = await provider.createRefund({ paymentIntentId: c.paymentIntentId, amountCents: c.amountCents, idempotencyKey: c.idempotencyKey, metadata: { tournamentId: c.tournamentId, userId: c.userId, chargeId: c.chargeId } });
  } catch (error) {
    if (error instanceof PaymentIdempotencyError) {
      await db.transaction((tx) => applyTournamentRefund(tx, report({ outcome: "failed", failureCode: "idempotency_mismatch" })));
      return;
    }
    return; // Ergebnis unbekannt: Zeile bleibt pending, der naechste Lauf sendet mit demselben Schluessel erneut (bis zur 20-Stunden-Grenze)
  }
  await db.transaction((tx) => applyTournamentRefund(tx, report({ outcome: res.status, refundId: res.id || null, failureCode: res.failureCode ?? null })));
}

/**
 * Verbucht das Ergebnis einer Erstattung zu einer TURNIER-Zeile (Zweig von applyRefundInTx). Sperrreihenfolge: Turnier, dann Zeile. Gebucht wird nur fuer eigene Erstattungszeilen und nur bei
 * passendem Betrag, EUR, PaymentIntent und Metadaten (tournamentId, nie matchId); sonst NICHTS (ignoriert + Audit). succeeded gewinnt und wird nie ueberschrieben.
 * Buchung: Konto der Abbuchung (aus dem Hauptbuch) -> clearing (Art refund, Schluessel refund:<Stripe-ID>); die Stripe-Gebuehr bleibt gebucht.
 */
export async function applyTournamentRefund(tx: Tx, r: RefundReport): Promise<ApplyRefundResult> {
  const ignore = async (reason: string): Promise<ApplyRefundResult> => {
    await audit(null, "refund.ignored", "refund", r.refundId ?? "none", { after: { reason } }, tx);
    return { status: "ignored", reason };
  };
  const find = async (lock: boolean) => {
    const byId = r.refundId ? tx.select().from(paymentRefunds).where(eq(paymentRefunds.refundId, r.refundId)) : null;
    const chargeId = r.metadata.chargeId;
    const byMeta = chargeId && UUID.test(chargeId) ? tx.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, chargeId)) : null;
    if (byId) {
      const [row] = lock ? await byId.for("update") : await byId;
      if (row) return row;
    }
    if (byMeta) {
      const rows = lock ? await byMeta.for("update") : await byMeta;
      if (r.paymentIntentId !== null) {
        const exact = rows.find((x) => x.paymentIntentId === r.paymentIntentId) ?? rows.find((x) => x.paymentIntentId === null);
        if (exact) return exact;
      } else if (rows[0]) return rows.find((x) => x.paymentIntentId === null) ?? rows[0];
    }
    return undefined;
  };
  const probe = await find(false);
  if (!probe || probe.tournamentId === null) return ignore("unknown_refund");
  await tx.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, probe.tournamentId)).for("update"); // Turnier zuerst
  const row = await find(true);
  if (!row || row.tournamentId === null) return ignore("unknown_refund");
  if (r.refundId && row.refundId !== null && row.refundId !== r.refundId) return ignore("other_refund");
  if (r.metadata.matchId) return ignore("metadata_mismatch"); // genau eines von beiden
  if ((r.metadata.tournamentId ?? null) !== null && r.metadata.tournamentId !== row.tournamentId) return ignore("metadata_mismatch");
  if (r.metadata.userId !== null && r.metadata.userId !== row.userId) return ignore("metadata_mismatch");
  if (r.metadata.chargeId !== null && r.metadata.chargeId !== row.chargeId) return ignore("metadata_mismatch");
  if (r.amountCents !== row.amountCents || r.currency?.toLowerCase() !== "eur") return ignore("amount_mismatch");
  const [charge] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, row.chargeId));
  if (!charge || charge.status !== "succeeded") return ignore("charge_not_succeeded");
  const pi = row.paymentIntentId ?? charge.paymentIntentId;
  if (r.paymentIntentId !== null && r.paymentIntentId !== pi) return ignore("payment_intent_mismatch");
  const tid = row.tournamentId;

  if (row.status === "succeeded") return { status: "already" };
  if (r.outcome === "succeeded") {
    if (!r.refundId) return ignore("missing_refund_id");
    // dorthin zurueck, wo die Abbuchung gelandet ist (Konto aus dem Hauptbuch; Standard venue_payable)
    const [orig] = pi ? await tx.select({ account: ledgerEntries.creditAccount }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `charge:${pi}`)) : [];
    await post(tx, { debit: { account: (orig?.account as "venue_payable" | "revenue" | undefined) ?? "venue_payable" }, credit: { account: "clearing" }, amountCents: row.amountCents, kind: "refund", tournamentId: tid, idempotencyKey: `refund:${r.refundId}`, reason: "Erstattung Abbuchung auf die Karte (Turnier)" });
    await tx.update(paymentRefunds).set({ status: "succeeded", refundId: r.refundId, failureCode: null, updatedAt: new Date() }).where(eq(paymentRefunds.id, row.id));
    await audit(null, "refund.succeeded", "tournament", tid, { after: { userId: row.userId, amountCents: row.amountCents } }, tx);
    return { status: "applied" };
  }
  if (r.outcome === "pending") {
    if (r.refundId && row.refundId === null) await tx.update(paymentRefunds).set({ refundId: r.refundId, updatedAt: new Date() }).where(eq(paymentRefunds.id, row.id));
    return { status: "applied" };
  }
  // failed: manuell zu klaeren (Admin-Alarm). Die Zeile wird nie automatisch erneut gesendet.
  if (row.status === "failed" && row.failureCode === cleanCode(r.failureCode)) return { status: "already" };
  await tx
    .update(paymentRefunds)
    .set({ status: "failed", refundId: row.refundId ?? (r.refundId || null), failureCode: cleanCode(r.failureCode) ?? "refund_failed", updatedAt: new Date() })
    .where(and(eq(paymentRefunds.id, row.id)));
  await audit(null, "refund.failed", "tournament", tid, { after: { userId: row.userId, code: cleanCode(r.failureCode) } }, tx);
  return { status: "applied" };
}
