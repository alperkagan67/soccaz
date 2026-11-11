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
import { hasLongLead, dueWithGrace, fixDeadline } from "@/lib/deadlines";
import { cardModeActive, leadStart, payAndReadyPossible } from "../wallet";
import { applyChargeInTx, bookChargeFee, type ChargeOutcome } from "./charge";
import { notifyChargeProblem } from "./charge-notify";
import { graceUntil } from "@/lib/grace";
import { getPaymentProvider, PaymentIdempotencyError } from "./provider";

/** failure_code einer pending-Zeile, deren Ausgang bei Stripe unbekannt ist (siehe markUnknown). */
export const UNKNOWN_OUTCOME = "unknown_outcome";
/** failure_code einer offenen Zeile, die nach dem Anstoß noch kein Ergebnis hatte (Betriebsrisiko, wird nie erneut gesendet). */
export const AFTER_START = "after_start";

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

/**
 * Ist der Zeitpunkt der Abbuchung erreicht? Termin und Hallen-Veto müssen durch sein. Vorlauf >= 48 Stunden: ab der Frist (48 h vor Anstoß, ggf. mit Karenz, dieselbe
 * Rechnung wie die Listensperre); kürzerer Vorlauf: sofort (beide Captains sind schon bereit, das wurde zuvor geprüft). Läuft unter der Spielsperre von Phase A.
 */
export async function chargeDue(tx: Tx, match: typeof matches.$inferSelect, now: Date): Promise<boolean> {
  if (!payAndReadyPossible(match)) return false;
  const payOpenAt = await leadStart(tx, match);
  if (!hasLongLead(match.startsAt, payOpenAt)) return true;
  return now.getTime() >= dueWithGrace(fixDeadline(match.startsAt), payOpenAt, match.startsAt, match.createdAt).getTime();
}

export type EligibilityReason = "not_open" | "not_due" | "not_card_mode" | "not_confirmed" | "not_fixed" | "free" | "no_players" | "cards_missing" | "uncovered" | "ready";

/**
 * Darf dieses Spiel jetzt abgebucht werden? Läuft in der Transaktion des Aufrufers unter der Spielsperre.
 * Kartenspiel (Schalter EIN, Frist-Regel, kein Guthaben-Platz), beide Captains bereit, Anteil fixiert, alle Eingeteilten mit Karte, Summe der Abbuchungen >= Miete.
 */
export async function chargeEligibility(tx: Tx, match: typeof matches.$inferSelect, now: Date, requireDue = false): Promise<{ reason: EligibilityReason; seated: string[]; amountCents: number | null }> {
  const none = (reason: EligibilityReason) => ({ reason, seated: [] as string[], amountCents: null as number | null });
  if (!["lobby", "confirmed"].includes(match.status) || match.settledAt !== null || match.cancelRequestedAt !== null || match.startsAt.getTime() <= now.getTime()) return none("not_open");
  if (!(await cardModeActive(tx, match))) return none("not_card_mode");
  if (!match.homeFinalAt || !match.awayFinalAt) return none("not_confirmed");
  if (match.finalShareCents === null) return none("not_fixed");
  if (requireDue && !(await chargeDue(tx, match, now))) return none("not_due");
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
export async function runCharges(matchId: string, now: Date = new Date(), opts: { requireDue?: boolean } = {}): Promise<RunResult> {
  // Phase A
  const phaseA = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match) return { reason: "not_open" as const, created: 0 };
    const existing = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.matchId, matchId)).limit(1);
    if (existing.length > 0) return { reason: "rows_exist" as const, created: 0 };
    const e = await chargeEligibility(tx, match, now, opts.requireDue === true);
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
    const open = Boolean(match) && ["lobby", "confirmed"].includes(match.status) && match.settledAt === null && match.cancelRequestedAt === null && match.startsAt.getTime() > now.getTime() && (await cardModeActive(tx, match));
    const rows = await tx.execute(sql`
      select id, match_id, user_id, amount_cents, idempotency_key, attempt_started_at, updated_at
      from payment_charges
      where match_id = ${matchId} and status = 'pending' and payment_intent_id is null and (failure_code is null or failure_code not in (${UNKNOWN_OUTCOME}, ${AFTER_START}))
      order by created_at, id
      for update skip locked`);
    for (const row of rows.rows as { id: string; match_id: string; user_id: string; amount_cents: number; idempotency_key: string; attempt_started_at: Date | null; updated_at: Date }[]) {
      if (!open) {
        // Wurde schon einmal gesendet (attempt_started_at), kann bei Stripe ein PaymentIntent existieren: nicht auf failed setzen, sondern markieren (M3 sucht bei Stripe).
        if (row.attempt_started_at) await markUnknown(tx, row.id, row.match_id, row.user_id, "match_closed");
        else await failRow(tx, row.id, row.match_id, row.user_id, "match_closed"); // nie gesendet: kein Stripe-Aufruf
        continue;
      }
      const started = row.attempt_started_at ? new Date(row.attempt_started_at).getTime() : null;
      if (started !== null && now.getTime() - started > ATTEMPT_MAX_AGE_MS) {
        // Der Schlüssel gilt bei Stripe nicht mehr; ob dort ein PaymentIntent existiert, wissen wir nicht. Nie automatisch failed, nie erneut senden: M3 löst es per Stripe-Suche.
        await markUnknown(tx, row.id, row.match_id, row.user_id, "attempt_expired");
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
  // Ein Problem des Spielers (keine Karte, Schluessel geaendert) beginnt wie ein abgelehnter Versuch das Nachzahlfenster und benachrichtigt; "match_closed" ist kein Problem des Spielers
  const userProblem = code !== "match_closed";
  const [game] = userProblem ? await tx.select({ startsAt: matches.startsAt }).from(matches).where(eq(matches.id, matchId)) : [];
  const [current] = userProblem ? await tx.select({ attempt: paymentCharges.currentAttempt, grace: paymentCharges.graceUntil }).from(paymentCharges).where(eq(paymentCharges.id, rowId)) : [];
  const grace = current && current.attempt > 1 ? current.grace : game ? graceUntil(new Date(), game.startsAt) : null; // nur der erste Versuch setzt das Fenster
  const [row] = await tx.update(paymentCharges).set({ status: "failed", failureCode: code, ...(userProblem ? { graceUntil: grace } : {}), updatedAt: new Date() }).where(and(eq(paymentCharges.id, rowId), eq(paymentCharges.status, "pending"))).returning();
  await tx.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
  await audit(null, "charge.failed", "match", matchId, { after: { userId, outcome: "failed", code } }, tx);
  if (userProblem && row) await notifyChargeProblem(tx, row, code, grace);
}

/**
 * Ausgang unbekannt: Die Zeile wurde schon gesendet (oder könnte es sein), ein PaymentIntent kann bei Stripe existieren. Status bleibt pending, die Zeile wird
 * markiert (failure_code) und auditiert; sie wird nie erneut gesendet und nie abgerechnet. Ein später eintreffender Webhook bindet und verbucht sie normal.
 * Auflösung per Stripe-Suche folgt in M3.
 */
async function markUnknown(tx: Tx, rowId: string, matchId: string, userId: string, reason: string) {
  const updated = await tx
    .update(paymentCharges)
    .set({ failureCode: UNKNOWN_OUTCOME, updatedAt: new Date() })
    .where(and(eq(paymentCharges.id, rowId), eq(paymentCharges.status, "pending"), isNull(paymentCharges.paymentIntentId)))
    .returning({ id: paymentCharges.id });
  if (updated.length > 0) await audit(null, "charge.unknown_outcome", "match", matchId, { after: { userId, reason } }, tx);
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
  } catch (error) {
    if (error instanceof PaymentIdempotencyError) {
      // Parameter zwischen Wiederholungen geändert (Zahlungsmittel/Kunde): mit diesem Schlüssel geht nichts mehr. Nicht schlucken: failed + Audit.
      // Ein früherer Versuch kann bei Stripe einen PaymentIntent erzeugt haben; kommt dessen Webhook, gewinnt succeeded (Rangregel) und wird gebucht.
      await db.transaction((tx) => failRow(tx, c.id, c.matchId, c.userId, "idempotency_mismatch"));
      return;
    }
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
