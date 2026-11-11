// Abbuchung eines Kartenspiels (Vertrag 012, M2b). Vier Phasen, Netzaufrufe nur außerhalb von Datenbanktransaktionen:
//  A  (Tx, Spielsperre)  Voraussetzungen prüfen und je eingeteiltem Spieler eine Zeile payment_charges (pending) anlegen und COMMITTEN, bevor Stripe etwas sieht.
//  B  (Netz)             je Zeile ohne PaymentIntent: Zeile beanspruchen (FOR UPDATE SKIP LOCKED, kurze Tx), PaymentIntent anlegen (fester Idempotenz-Schlüssel).
//  C  (Tx)               Ergebnis über applyChargeInTx verbuchen (derselbe Weg wie der Webhook); danach die Gebühr als Folgeschritt.
//  D  (Tx, Spielsperre)  sind alle Zeilen erfolgreich: Spiel gebucht (in applyChargeInTx -> settleIfComplete).
// Wiederholung ist ungefährlich: Zeilen sind eindeutig, eine an einen PaymentIntent gebundene Zeile bekommt nie einen zweiten, derselbe Schlüssel liefert bei Stripe
// denselben PaymentIntent. Nach 20 Stunden ohne Ergebnis wird nicht mehr gesendet (der Schlüssel gilt bei Stripe nur etwa 24 Stunden): Zeile failed, Audit.
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles } from "@/db/schema";
import { audit } from "../audit";
import type { Tx } from "../tx";
import { cardModeActive } from "../wallet";
import { applyChargeInTx, bookChargeFee, type ChargeOutcome } from "./charge";
import { getPaymentProvider } from "./provider";

/** Stripe verlangt mindestens 0,50 EUR je Abbuchung. Kleinere Anteile werden angehoben; der Überschuss bleibt in revenue (Entscheid des Orchestrators). */
export const MIN_CHARGE_CENTS = 50;
/** So lange darf eine Zeile ohne Ergebnis erneut gesendet werden (Idempotenz-Schlüssel bei Stripe: etwa 24 Stunden). */
export const ATTEMPT_MAX_AGE_MS = 20 * 3_600_000;
/** Eine beanspruchte Zeile gilt so lange als "in Arbeit"; ein hängender Lauf blockiert die Zeile nur kurz. */
export const CLAIM_LEASE_MS = 60_000;

export const chargeKey = (matchId: string, userId: string) => `charge:${matchId}:${userId}`;

/** Betrag der Abbuchung: der fixierte Anteil, mindestens 0,50 EUR; kostenlose Spiele (Miete oder Anteil 0) werden nicht abgebucht. */
export function chargeAmount(priceCents: number | null, finalShareCents: number | null): number | null {
  if (!priceCents || priceCents <= 0 || finalShareCents === null || finalShareCents <= 0) return null;
  return Math.max(finalShareCents, MIN_CHARGE_CENTS);
}

export type EligibilityReason = "not_open" | "not_card_mode" | "not_confirmed" | "not_fixed" | "free" | "no_players" | "cards_missing" | "uncovered" | "ready";

/**
 * Darf dieses Spiel jetzt abgebucht werden? Läuft in der Transaktion des Aufrufers unter der Spielsperre.
 * Kartenspiel (Schalter EIN, Frist-Regel, kein Guthaben-Platz), beide Captains bereit, Anteil fixiert, alle Eingeteilten mit Karte, Summe der Abbuchungen >= Miete.
 */
export async function chargeEligibility(tx: Tx, match: typeof matches.$inferSelect, now: Date): Promise<{ reason: EligibilityReason; seated: string[]; amountCents: number | null }> {
  const none = (reason: EligibilityReason) => ({ reason, seated: [] as string[], amountCents: null as number | null });
  if (!["lobby", "confirmed"].includes(match.status) || match.settledAt !== null || match.startsAt.getTime() <= now.getTime()) return none("not_open");
  if (!(await cardModeActive(tx, match))) return none("not_card_mode");
  if (!match.homeFinalAt || !match.awayFinalAt) return none("not_confirmed");
  if (match.finalShareCents === null) return none("not_fixed");
  const amount = chargeAmount(match.priceCents, match.finalShareCents);
  if (amount === null) return none("free");
  const seated = await tx.select({ userId: matchParticipants.userId, cardStatus: matchParticipants.cardStatus }).from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), isNotNull(matchParticipants.teamId)));
  if (seated.length === 0) return none("no_players");
  if (seated.some((s) => s.cardStatus !== "card_ready")) return { reason: "cards_missing", seated: seated.map((s) => s.userId), amountCents: amount };
  if (seated.length * amount < (match.priceCents ?? 0)) return { reason: "uncovered", seated: seated.map((s) => s.userId), amountCents: amount };
  return { reason: "ready", seated: seated.map((s) => s.userId), amountCents: amount };
}

export type RunResult = { reason: EligibilityReason | "rows_exist"; created: number; attempted: number; settled: boolean };

/**
 * Bucht ein Kartenspiel ab (alle Phasen). Idempotent und nachholbar: ein zweiter oder paralleler Lauf legt nichts doppelt an und sendet nichts doppelt.
 * Existieren schon Abbuchungszeilen, wird nur noch Phase B bis D für offene Zeilen ausgeführt (die Zeilen und damit die Spielerliste bleiben, wie sie sind).
 */
export async function runCharges(matchId: string, now: Date = new Date()): Promise<RunResult> {
  // Phase A
  const phaseA = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match) return { reason: "not_open" as const, created: 0 };
    const existing = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.matchId, matchId)).limit(1);
    if (existing.length > 0) return { reason: "rows_exist" as const, created: 0 };
    const e = await chargeEligibility(tx, match, now);
    if (e.reason !== "ready" || e.amountCents === null) return { reason: e.reason, created: 0 };
    for (const userId of e.seated) {
      await tx.insert(paymentCharges).values({ matchId, userId, amountCents: e.amountCents, idempotencyKey: chargeKey(matchId, userId) }).onConflictDoNothing();
      await tx.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
    }
    await audit(null, "charge.created", "match", matchId, { after: { players: e.seated.length, amountCents: e.amountCents } }, tx);
    return { reason: "ready" as const, created: e.seated.length };
  }); // <- Commit: die Zeilen stehen, bevor Stripe etwas sieht

  // Phase B und C
  let attempted = 0;
  for (let guard = 0; guard < 200; guard++) {
    const claimed = await claimNext(matchId, now);
    if (!claimed) break;
    attempted += 1;
    await sendCharge(claimed);
  }
  const [after] = await db.select({ settledAt: matches.settledAt }).from(matches).where(eq(matches.id, matchId));
  return { reason: phaseA.reason, created: phaseA.created, attempted, settled: Boolean(after?.settledAt) };
}

type Claimed = { id: string; matchId: string; userId: string; amountCents: number; idempotencyKey: string };

/**
 * Beansprucht die nächste sendefähige Zeile (pending, ohne PaymentIntent, nicht gerade in Arbeit) in einer kurzen Transaktion.
 * FOR UPDATE SKIP LOCKED: Zeilen, die ein anderer Lauf gerade beansprucht, werden übersprungen. Zu alte Zeilen werden failed (attempt_expired), nie gesendet.
 * Der Spielzustand wird bei JEDEM Versuch neu geprüft (Wiederholungen laufen bis zu 20 Stunden): Ist das Spiel abgesagt, abgerechnet, gestartet oder das
 * Kartenmodell nicht mehr aktiv (Schalter AUS, Guthaben-Platz), wird nichts gesendet; die offenen Zeilen werden failed (match_closed).
 * Sperrwahl: die Spielzeile wird kurz mit FOR SHARE gelesen, und zwar VOR den Abbuchungszeilen (Reihenfolge Spiel -> Zeile wie überall, kein Verklemmen).
 * FOR SHARE hält Absage, Abrechnung und Moduswechsel (alle FOR UPDATE auf dem Spiel) für die Dauer der Beanspruchung fern. Offen bleibt das Fenster zwischen
 * Beanspruchung und Stripe-Aufruf (Netz darf nicht unter Sperre laufen); es wird in M2b-2 dadurch geschlossen, dass Absage und Listenänderung bei
 * vorhandenen Abbuchungszeilen gesperrt sind.
 */
async function claimNext(matchId: string, now: Date): Promise<Claimed | null> {
  return db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("share");
    const open = Boolean(match) && ["lobby", "confirmed"].includes(match.status) && match.settledAt === null && match.startsAt.getTime() > now.getTime() && (await cardModeActive(tx, match));
    const rows = await tx.execute(sql`
      select id, match_id, user_id, amount_cents, idempotency_key, attempt_started_at, updated_at
      from payment_charges
      where match_id = ${matchId} and status = 'pending' and payment_intent_id is null
      order by created_at, id
      for update skip locked`);
    for (const row of rows.rows as { id: string; match_id: string; user_id: string; amount_cents: number; idempotency_key: string; attempt_started_at: Date | null; updated_at: Date }[]) {
      if (!open) {
        await failRow(tx, row.id, row.match_id, row.user_id, "match_closed"); // kein Stripe-Aufruf
        continue;
      }
      const started = row.attempt_started_at ? new Date(row.attempt_started_at).getTime() : null;
      if (started !== null && now.getTime() - started > ATTEMPT_MAX_AGE_MS) {
        await failRow(tx, row.id, row.match_id, row.user_id, "attempt_expired");
        continue;
      }
      // Eine Zeile, die gerade ein anderer Lauf bearbeitet (Lease), wird übersprungen; nach Ablauf der Lease darf sie erneut gesendet werden (gleicher Schlüssel)
      if (started !== null && now.getTime() - new Date(row.updated_at).getTime() < CLAIM_LEASE_MS) continue;
      await tx.update(paymentCharges).set({ attemptStartedAt: started === null ? now : new Date(started), updatedAt: now }).where(eq(paymentCharges.id, row.id));
      return { id: row.id, matchId: row.match_id, userId: row.user_id, amountCents: row.amount_cents, idempotencyKey: row.idempotency_key };
    }
    return null;
  });
}

async function failRow(tx: Tx, rowId: string, matchId: string, userId: string, code: string) {
  await tx.update(paymentCharges).set({ status: "failed", failureCode: code, updatedAt: new Date() }).where(and(eq(paymentCharges.id, rowId), eq(paymentCharges.status, "pending")));
  await tx.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
  await audit(null, "charge.failed", "match", matchId, { after: { userId, outcome: "failed", code } }, tx);
}

/** Phase B (Netz) und C (Verbuchung) für eine beanspruchte Zeile. */
async function sendCharge(c: Claimed): Promise<void> {
  const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, c.userId));
  if (!profile?.paymentMethodId) {
    await db.transaction((tx) => failRow(tx, c.id, c.matchId, c.userId, "no_payment_method"));
    return;
  }
  const provider = await getPaymentProvider();
  let res;
  try {
    res = await provider.createPaymentIntent({ customerId: profile.stripeCustomerId, paymentMethodId: profile.paymentMethodId, amountCents: c.amountCents, idempotencyKey: c.idempotencyKey, metadata: { matchId: c.matchId, userId: c.userId } });
  } catch {
    return; // Ergebnis unbekannt: Zeile bleibt pending, der nächste Lauf sendet mit demselben Schlüssel erneut (bis zur 20-Stunden-Grenze)
  }
  const outcome: ChargeOutcome | null = res.status === "succeeded" ? "succeeded" : res.status === "requires_action" ? "requires_action" : res.status === "failed" ? "failed" : null;
  await db.transaction(async (tx) => {
    if (outcome === null) {
      // processing: PaymentIntent nur binden, das Ergebnis meldet der Webhook
      await tx.update(paymentCharges).set({ paymentIntentId: res.id, updatedAt: new Date() }).where(and(eq(paymentCharges.id, c.id), isNull(paymentCharges.paymentIntentId)));
      return;
    }
    await applyChargeInTx(tx, { outcome, paymentIntentId: res.id, amountCents: c.amountCents, currency: "eur", customerId: profile.stripeCustomerId, metadata: { matchId: c.matchId, userId: c.userId }, failureCode: res.failureCode });
  });
  if (outcome === "succeeded") {
    try {
      await bookChargeFee(res.id); // Folgeschritt, Netz außerhalb der Transaktion; nicht verfügbar => der Nachholer bucht später
    } catch {
      /* nichts loggen */
    }
  }
}

/** Offene Zeilen eines Spiels (für Tests und den Job). */
export async function openChargeRows(matchId: string) {
  return db.select().from(paymentCharges).where(eq(paymentCharges.matchId, matchId)).orderBy(asc(paymentCharges.createdAt));
}
