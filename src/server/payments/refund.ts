// Absage eines Kartenspiels mit Erstattung auf die Karte (Vertrag 012, M3a). Ablauf, alle Netzaufrufe außerhalb von Datenbanktransaktionen:
//  1  (Tx, Spielsperre)  Absage anfordern (cancel_requested_at): ab jetzt wird nichts mehr abgebucht (claimNext/Eignung prüfen das). Je erfolgreicher Abbuchung eine
//                        Erstattungszeile (pending) anlegen; nie gesendete Zeilen beenden.
//  2  (Netz)             Zeilen mit unbekanntem Ausgang: Stripe-Suche nach dem PaymentIntent. Treffer succeeded => verbuchen (und sofort Erstattungszeile);
//                        kein Treffer => Audit + Alarm, das Spiel bleibt "Absage angefordert".
//  3  (Netz)             Erstattung je Zeile senden (fester Schlüssel refund:<Zeile>), Ergebnis über applyRefundInTx (derselbe Weg wie der Webhook).
//  4  (Tx, Spielsperre)  Sind alle Zeilen aufgelöst und alle Erstattungen erfolgreich: Spiel abgesagt. Nie "abgesagt" ohne Erstattung.
// Regel: Eine Abbuchung, die NACH der Absage noch gelingt (Webhook), wird sofort erstattet (applyChargeInTx legt die Erstattungszeile an).
// Die Stripe-Gebühr der Abbuchung wird nicht zurückgebucht (Soccaz trägt sie). Erstattet wird der gezahlte Betrag je Spieler (inkl. Mindestbetrag-Anhebung).
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, paymentCharges, paymentProfiles, paymentRefunds, users } from "@/db/schema";
import { canUser } from "@/lib/roles";
import { audit } from "../audit";
import { post } from "../ledger";
import { chargeAccountFor } from "../commission";
import { cancelMatchTx } from "../lobby";
import { DomainError } from "../teams";
import type { Tx } from "../tx";
import { applyChargeInTx, bookChargeFee, ensureRefundRow } from "./charge";
import { UNKNOWN_OUTCOME } from "./charge-run";
import { getPaymentProvider, PaymentIdempotencyError } from "./provider";
import { OPEN_DISPUTE_STATUSES } from "./dispute";
import { matchIdOf } from "./charge-context";
import { applyTournamentRefund, runTournamentRefunds } from "./tournament-refund";

/** Marker (failure_code) einer fehlgeschlagenen Erstattung, die Admin 1 bewusst abgeschrieben hat (Backlog 192): reine Buchungsmarkierung, keine Geldbewegung. Kein neuer Status, daher keine Migration. */
export const REFUND_WRITTEN_OFF = "written_off";

/** Eine beanspruchte Erstattungszeile gilt so lange als "in Arbeit". */
export const REFUND_LEASE_MS = 60_000;
/** Der Schlüssel gilt bei Stripe etwa 24 Stunden; danach wird nicht mehr gesendet (unbekannter Ausgang, manuell zu klären). */
export const REFUND_ATTEMPT_MAX_AGE_MS = 20 * 3_600_000;
/** Stripes Suche ist verzögert konsistent: eine leere Antwort zählt erst nach dieser Zeit als "nicht gefunden". */
export const SEARCH_MIN_AGE_MS = 5 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanCode = (c: string | null) => (typeof c === "string" && /^[a-z0-9_.-]{1,64}$/i.test(c) ? c : c ? "unknown" : null);

/** Ein von Stripe gemeldetes (oder vom Anbieter zurückgegebenes) Ergebnis einer Erstattung. Alle Werte sind ungeprüfte Eingabe. */
export type RefundReport = {
  outcome: "succeeded" | "pending" | "failed";
  refundId: string | null; // bei einer sofort abgelehnten Erstattung (z. B. charge_disputed) gibt es keine ID
  amountCents: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  metadata: { matchId: string | null; tournamentId?: string | null; userId: string | null; chargeId: string | null };
  failureCode: string | null;
  direct?: true; // Ergebnis des eigenen Sendens (sendRefund), nicht eines Webhooks: nur dieses darf eine Neuversuch-Zeile mit derselben Stripe-Erstattung wieder auf failed setzen
};

export type ApplyRefundResult = { status: "applied" | "already" | "ignored"; reason?: string; matchId?: string };

/**
 * Verbucht das Ergebnis einer Erstattung. Läuft in der Transaktion des Aufrufers. Sperrreihenfolge wie überall: Spiel, dann Zeile.
 * Gebucht wird nur für eigene Erstattungszeilen und nur bei passendem Betrag, EUR, PaymentIntent und Metadaten; sonst NICHTS (ignoriert + Audit).
 * succeeded gewinnt und wird nie überschrieben (auch nicht von einem verspäteten failed); ein failed kann später noch succeeded werden.
 */
/** true, wenn refundId die Stripe-Erstattung eines FRUEHEREN Versuchs dieser Zeile ist (Audit refund.retry mit previousRefundId, vor einem Neuversuch durch Admin 1). */
async function isPreviousAttempt(tx: Tx, matchId: string, rowId: string, refundId: string): Promise<boolean> {
  // entity/entity_id nutzen den vorhandenen Index von audit_log (der Retry-Audit steht mit entity 'match' und der Spiel-id)
  const [hit] = (await tx.execute(sql`select 1 from audit_log where entity = 'match' and entity_id = ${matchId} and action = 'refund.retry' and after ->> 'refundRowId' = ${rowId} and after ->> 'previousRefundId' = ${refundId} limit 1`)).rows;
  return Boolean(hit);
}

export async function applyRefundInTx(tx: Tx, r: RefundReport): Promise<ApplyRefundResult> {
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
      // Eine Abbuchung kann mehrere Erstattungen haben (je PaymentIntent): die passende nach dem PaymentIntent waehlen (Standardzeile hat payment_intent_id NULL)
      const rows = lock ? await byMeta.for("update") : await byMeta;
      if (r.paymentIntentId !== null) {
        const exact = rows.find((x) => x.paymentIntentId === r.paymentIntentId) ?? rows.find((x) => x.paymentIntentId === null);
        if (exact) return exact;
      } else if (rows[0]) return rows.find((x) => x.paymentIntentId === null) ?? rows[0];
    }
    return undefined;
  };
  const probe = await find(false);
  if (!probe) return ignore("unknown_refund");
  if (probe.tournamentId !== null) return applyTournamentRefund(tx, r); // Turnier-Zeile: eigener Zweig (tournament-refund.ts), gleiche Regeln
  await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, matchIdOf(probe))).for("update"); // Spiel zuerst
  const row = await find(true);
  if (!row) return ignore("unknown_refund");
  // Neuversuch (Backlog 192, w1-Fund zu #341): Stripe garantiert keine Reihenfolge. Ereignisse der ALTEN Erstattung A (refund_id vor dem Neuversuch) werden in ALLEN Zweigen gleich behandelt, nicht nur bei failed:
  // pending(A) und failed(A) aendern nie Status oder refund_id der Zeile (sonst bliebe die Zeile mit refund_id = A haengen und jedes Ergebnis des neuen Versuchs B waere "other_refund"); succeeded(A) wird GEBUCHT (das Geld ist raus).
  const stale = Boolean(r.refundId) && !r.direct && r.refundId !== row.refundId && (await isPreviousAttempt(tx, matchIdOf(row), row.id, r.refundId as string));
  // Ist die Zeile schon succeeded und trifft ein Erfolg mit ANDERER Stripe-id ein (z. B. Neuversuch B nach A), geht es WEITER bis zum succeeded-Zweig (Metadaten, Betrag und PaymentIntent werden zuerst geprueft): dort nur ein Hinweis, nie eine zweite Buchung. Sonst ist die id fremd.
  if (r.refundId && row.refundId !== null && row.refundId !== r.refundId && !stale && !(row.status === "succeeded" && r.outcome === "succeeded")) {
    return ignore("other_refund");
  }
  if (r.metadata.matchId !== null && r.metadata.matchId !== row.matchId) return ignore("metadata_mismatch");
  if (r.metadata.userId !== null && r.metadata.userId !== row.userId) return ignore("metadata_mismatch");
  if (r.metadata.chargeId !== null && r.metadata.chargeId !== row.chargeId) return ignore("metadata_mismatch");
  if (r.amountCents !== row.amountCents || r.currency?.toLowerCase() !== "eur") return ignore("amount_mismatch");
  const [charge] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, row.chargeId));
  if (!charge || charge.status !== "succeeded") return ignore("charge_not_succeeded");
  if (r.paymentIntentId !== null && r.paymentIntentId !== (row.paymentIntentId ?? charge.paymentIntentId)) return ignore("payment_intent_mismatch");

  if (row.status === "succeeded") {
    // zweiter Erfolg mit ANDERER Stripe-id (alter Versuch A UND Neuversuch B): nie ein zweites Mal buchen; Hinweis an Admin 1, in Stripe auf eine moegliche Doppelerstattung zu pruefen (Stripe begrenzt die Summe der Erstattungen auf den Zahlungsbetrag)
    if (r.outcome === "succeeded" && r.refundId && row.refundId !== null && row.refundId !== r.refundId) {
      const [seen] = (await tx.execute(sql`select 1 from audit_log where entity = 'match' and entity_id = ${matchIdOf(row)} and action = 'refund.duplicate_success' and after ->> 'refundRowId' = ${row.id} and after ->> 'secondRefundId' = ${r.refundId} limit 1`)).rows;
      if (!seen) await audit(null, "refund.duplicate_success", "match", matchIdOf(row), { after: { refundRowId: row.id, firstRefundId: row.refundId, secondRefundId: r.refundId } }, tx); // je zweiter id einmal (Stripe-Wiederholungen erhoehen die Zahl nicht)
    }
    return { status: "already", matchId: matchIdOf(row) };
  }
  if (stale && r.outcome !== "succeeded") return { status: "already", matchId: matchIdOf(row) }; // pending/failed der alten Erstattung: ignoriert
  if (r.outcome === "succeeded") {
    if (!r.refundId) return ignore("missing_refund_id");
    await post(tx, {
      debit: { account: await chargeAccountFor(tx, matchIdOf(row), row.paymentIntentId ?? charge.paymentIntentId) }, // dorthin zurück, wo die Abbuchung gelandet ist (revenue oder venue_payable)
      credit: { account: "clearing" },
      amountCents: row.amountCents,
      kind: "refund",
      matchId: row.matchId,
      idempotencyKey: `refund:${r.refundId}`, // die Stripe-Gebühr der Abbuchung bleibt gebucht (fee:<PI>), sie wird nicht zurückgebucht
      reason: "Erstattung Abbuchung auf die Karte",
    });
    await tx.update(paymentRefunds).set({ status: "succeeded", refundId: r.refundId, failureCode: null, updatedAt: new Date() }).where(eq(paymentRefunds.id, row.id));
    await audit(null, "refund.succeeded", "match", matchIdOf(row), { after: { userId: row.userId, amountCents: row.amountCents } }, tx);
    if (stale) await audit(null, "refund.late_success_old_attempt", "match", matchIdOf(row), { after: { refundRowId: row.id, oldRefundId: r.refundId, newRefundId: row.refundId } }, tx); // A nachtraeglich erfolgreich, Neuversuch B lief: B darf nicht zusaetzlich erstatten
    return { status: "applied", matchId: matchIdOf(row) };
  }
  if (r.outcome === "pending") {
    if (r.refundId && row.refundId === null) await tx.update(paymentRefunds).set({ refundId: r.refundId, updatedAt: new Date() }).where(eq(paymentRefunds.id, row.id));
    return { status: "applied", matchId: matchIdOf(row) };
  }
  // failed: manuell zu klären (Admin-Alarm). Die Zeile wird nie automatisch erneut gesendet (Neuversuch oder Abschreiben nur durch Admin 1: retryFailedRefund / writeOffFailedRefund).
  // (der Filter fuer verspaetete Ereignisse der alten Erstattung steht jetzt VOR allen Zweigen, siehe stale)
  if (row.status === "failed" && (row.failureCode === cleanCode(r.failureCode) || row.failureCode === REFUND_WRITTEN_OFF)) return { status: "already", matchId: matchIdOf(row) }; // ein verspätetes failed hebt ein bewusstes Abschreiben nicht auf
  await tx
    .update(paymentRefunds)
    .set({ status: "failed", refundId: row.refundId ?? (r.refundId || null), failureCode: cleanCode(r.failureCode) ?? "refund_failed", updatedAt: new Date() })
    .where(eq(paymentRefunds.id, row.id));
  await audit(null, "refund.failed", "match", matchIdOf(row), { after: { userId: row.userId, code: cleanCode(r.failureCode) } }, tx);
  return { status: "applied", matchId: matchIdOf(row) };
}

/** Absage anfordern und so weit wie möglich abarbeiten. Die Berechtigung prüft der Aufrufer (Admin 1; nie der Captain nach der ersten Abbuchung). */
export async function requestMatchCancel(actorId: string | null, matchId: string, reason: string, now: Date = new Date()): Promise<{ state: "cancelled" | "pending" | "closed" }> {
  const open = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!m || !["lobby", "confirmed"].includes(m.status)) return false;
    if (m.cancelRequestedAt === null) {
      await tx.update(matches).set({ cancelRequestedAt: now, cancelReason: reason }).where(eq(matches.id, matchId));
      await audit(actorId, "match.cancel_requested", "match", matchId, { after: { reason } }, tx);
    }
    return true;
  });
  if (!open) return { state: "closed" };
  return { state: (await progressCancel(matchId, now)) ? "cancelled" : "pending" };
}

/** Absage durch Admin 1 (Plattform-Admin). Ein Captain kann nach der ersten Abbuchung nicht mehr absagen (cancelMatchTx lehnt das ab). */
export async function adminCancelMatch(actorId: string, matchId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Bitte gib einen Grund an (mindestens 3 Zeichen).");
  if (text.length > 200) throw new DomainError("Der Grund darf höchstens 200 Zeichen lang sein.");
  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId));
  if (actor?.role !== "admin") throw new DomainError("Nur ein Admin kann ein Spiel mit laufender Abbuchung absagen.");
  return requestMatchCancel(actorId, matchId, text);
}

/** Job: bringt alle angeforderten Absagen weiter (Wiederholung, Suche, Erstattung, Abschluss) und holt Erstattungen nach, die nach der Absage nötig wurden. */
export async function runRefunds(now: Date = new Date()): Promise<number> {
  const rows = await db.execute(sql`
    select m.id from matches m
    where m.cancel_requested_at is not null
      and (m.status in ('lobby', 'confirmed') or exists (select 1 from payment_refunds r where r.match_id = m.id and r.status = 'pending' and r.refund_id is null and r.failure_code is distinct from ${UNKNOWN_OUTCOME}))`);
  let done = 0;
  for (const r of rows.rows as { id: string }[]) {
    try {
      if (await progressCancel(r.id, now)) done += 1;
    } catch (error) {
      console.error("runRefunds: Fehler bei Spiel", r.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  // Einzelne Erstattungen OHNE Absage (spaeter Erfolg eines ersetzten Platzes, Doppelabbuchung; M3c-2b): nur senden (Phase 3), das Spiel bleibt unberuehrt
  const standalone = await db.execute(sql`
    select distinct r.match_id as id from payment_refunds r join matches m on m.id = r.match_id
    where m.cancel_requested_at is null and r.status = 'pending' and r.refund_id is null and r.failure_code is distinct from ${UNKNOWN_OUTCOME}`);
  for (const r of standalone.rows as { id: string }[]) {
    try {
      await sendPendingRefunds(r.id, now);
    } catch (error) {
      console.error("runRefunds: Fehler bei Erstattungen", r.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  // Turniere (M5-5): offene Erstattungen abgesagter Turniere senden
  try {
    await runTournamentRefunds(now);
  } catch (error) {
    console.error("runRefunds: Fehler bei Turnier-Erstattungen", error instanceof Error ? error.name : "Fehler");
  }
  return done;
}

/** Sendet die offenen Erstattungen eines Spiels (Phase 3), ohne eine Absage anzufassen. */
export async function sendPendingRefunds(matchId: string, now: Date = new Date()): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    const claimed = await claimRefund(matchId, now);
    if (!claimed) break;
    await sendRefund(claimed);
  }
}

/** Ein Durchlauf der Phasen 1 bis 4 für ein Spiel mit angeforderter Absage. true = das Spiel ist jetzt abgesagt. Idempotent und nachholbar. */
export async function progressCancel(matchId: string, now: Date = new Date()): Promise<boolean> {
  // 1: Vorbereiten
  const prepared = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!m || m.cancelRequestedAt === null) return false;
    const charges = await tx.select().from(paymentCharges).where(eq(paymentCharges.matchId, matchId)).for("update");
    for (const c of charges) {
      if (c.status === "succeeded") await ensureRefundRow(tx, c, "Absage");
      else if (c.status === "pending" && c.paymentIntentId === null && c.attemptStartedAt === null && c.failureCode !== UNKNOWN_OUTCOME) {
        await tx.update(paymentCharges).set({ status: "failed", failureCode: "match_cancelled", updatedAt: now }).where(and(eq(paymentCharges.id, c.id), eq(paymentCharges.status, "pending")));
        await audit(null, "charge.failed", "match", matchId, { after: { userId: c.userId, outcome: "failed", code: "match_cancelled" } }, tx);
      }
    }
    return true;
  });
  if (!prepared) return false;

  // 2: unbekannte Ausgänge bei Stripe suchen
  await resolveUnknown(matchId, now);

  // 3: Erstattungen senden
  for (let guard = 0; guard < 200; guard++) {
    const claimed = await claimRefund(matchId, now);
    if (!claimed) break;
    await sendRefund(claimed);
  }

  // 4: abschließen
  return finalizeCancel(matchId);
}

type ClaimedRefund = { id: string; chargeId: string; matchId: string; userId: string; amountCents: number; idempotencyKey: string; paymentIntentId: string };

async function claimRefund(matchId: string, now: Date): Promise<ClaimedRefund | null> {
  return db.transaction(async (tx) => {
    await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId)).for("share"); // Spiel vor Zeile
    const rows = await tx.execute(sql`
      select r.id, r.charge_id, r.match_id, r.user_id, r.amount_cents, r.idempotency_key, r.attempt_started_at, r.updated_at, coalesce(r.payment_intent_id, c.payment_intent_id) as payment_intent_id
      from payment_refunds r join payment_charges c on c.id = r.charge_id
      where r.match_id = ${matchId} and r.status = 'pending' and r.refund_id is null and r.failure_code is distinct from ${UNKNOWN_OUTCOME}
        and not exists (select 1 from payment_disputes d where (d.charge_id = r.charge_id or d.payment_intent_id = coalesce(r.payment_intent_id, c.payment_intent_id)) and (d.status in (${sql.join(OPEN_DISPUTE_STATUSES.map((s) => sql`${s}`), sql`, `)}) or d.status not in ('won', 'lost', 'warning_closed', 'prevented')))
      order by r.created_at, r.id
      for update of r skip locked`);
    for (const row of rows.rows as { id: string; charge_id: string; match_id: string; user_id: string; amount_cents: number; idempotency_key: string; attempt_started_at: Date | null; updated_at: Date; payment_intent_id: string | null }[]) {
      const started = row.attempt_started_at ? new Date(row.attempt_started_at).getTime() : null;
      if (started !== null && now.getTime() - started > REFUND_ATTEMPT_MAX_AGE_MS) {
        // Schlüssel bei Stripe nicht mehr gültig, Ausgang unbekannt: nicht erneut senden (Gefahr einer doppelten Erstattung), manuell klären
        await tx.update(paymentRefunds).set({ failureCode: UNKNOWN_OUTCOME, updatedAt: now }).where(eq(paymentRefunds.id, row.id));
        await audit(null, "refund.unknown_outcome", "match", row.match_id, { after: { userId: row.user_id } }, tx);
        continue;
      }
      if (started !== null && now.getTime() - new Date(row.updated_at).getTime() < REFUND_LEASE_MS) continue;
      if (!row.payment_intent_id) continue; // Abbuchung ohne PaymentIntent kann es nicht geben (succeeded); defensiv
      await tx.update(paymentRefunds).set({ attemptStartedAt: started === null ? now : new Date(started), updatedAt: now }).where(eq(paymentRefunds.id, row.id));
      return { id: row.id, chargeId: row.charge_id, matchId: row.match_id, userId: row.user_id, amountCents: row.amount_cents, idempotencyKey: row.idempotency_key, paymentIntentId: row.payment_intent_id };
    }
    return null;
  });
}

async function sendRefund(c: ClaimedRefund): Promise<void> {
  const provider = await getPaymentProvider();
  let res;
  try {
    res = await provider.createRefund({ paymentIntentId: c.paymentIntentId, amountCents: c.amountCents, idempotencyKey: c.idempotencyKey, metadata: { matchId: c.matchId, userId: c.userId, chargeId: c.chargeId } });
  } catch (error) {
    if (error instanceof PaymentIdempotencyError) {
      await db.transaction((tx) => applyRefundInTx(tx, { outcome: "failed", refundId: null, amountCents: c.amountCents, currency: "eur", paymentIntentId: c.paymentIntentId, metadata: { matchId: c.matchId, userId: c.userId, chargeId: c.chargeId }, failureCode: "idempotency_mismatch" }));
      return;
    }
    return; // Ergebnis unbekannt: Zeile bleibt pending, der nächste Lauf sendet mit demselben Schlüssel erneut (bis zur 20-Stunden-Grenze)
  }
  await db.transaction((tx) =>
    applyRefundInTx(tx, { outcome: res.status, direct: true, refundId: res.id || null, amountCents: c.amountCents, currency: "eur", paymentIntentId: c.paymentIntentId, metadata: { matchId: c.matchId, userId: c.userId, chargeId: c.chargeId }, failureCode: res.failureCode }),
  );
}

/** Phase 2: Abbuchungen mit unbekanntem Ausgang (gesendet, aber ohne PaymentIntent) bei Stripe suchen und das Ergebnis verbuchen. */
async function resolveUnknown(matchId: string, now: Date): Promise<void> {
  const unknown = await db
    .select()
    .from(paymentCharges)
    .where(and(eq(paymentCharges.matchId, matchId), eq(paymentCharges.status, "pending"), isNull(paymentCharges.paymentIntentId), isNotNull(paymentCharges.attemptStartedAt)));
  if (unknown.length === 0) return;
  const provider = await getPaymentProvider();
  for (const c of unknown) {
    // Variante B: der Kunde des ZAHLERS (payer_user_id), nicht der des Platzes
    const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, c.payerUserId ?? c.userId));
    let found;
    try {
      found = await provider.findPaymentIntents({ matchId: matchIdOf(c), userId: c.userId });
    } catch {
      continue; // Stripe nicht erreichbar: der nächste Lauf versucht es erneut
    }
    if (found.length === 0) {
      // leere Antwort: erst nach einiger Zeit aussagekräftig (verzögerte Suche); dann einmal Audit + Alarm, die Zeile bleibt ungelöst
      if (now.getTime() - (c.attemptStartedAt as Date).getTime() < SEARCH_MIN_AGE_MS) continue;
      const [seen] = await db.execute(sql`select 1 from audit_log where entity = 'match' and entity_id = ${c.matchId} and action = 'charge.search_empty' and after ->> 'userId' = ${c.userId} limit 1`).then((r) => r.rows);
      if (!seen) await audit(null, "charge.search_empty", "match", matchIdOf(c), { after: { userId: c.userId } });
      continue;
    }
    // Erfolgreiche zuerst: ein Erfolg gewinnt immer
    const ordered = [...found].sort((a, b) => Number(b.status === "succeeded") - Number(a.status === "succeeded"));
    for (const f of ordered) {
      if (f.status !== "succeeded" && f.status !== "requires_action" && f.status !== "failed") continue;
      const outcome = f.status;
      await db.transaction((tx) =>
        applyChargeInTx(tx, { outcome, paymentIntentId: f.id, amountCents: f.amountCents, currency: f.currency, customerId: f.customerId ?? profile?.stripeCustomerId ?? null, metadata: { matchId: c.matchId, userId: c.userId }, failureCode: f.failureCode }),
      );
      if (f.status === "succeeded") {
        try {
          await bookChargeFee(f.id);
        } catch {
          /* der Nachholer bucht die Gebühr später */
        }
      }
    }
  }
}

/** Phase 4: Spiel absagen, wenn nichts mehr offen ist: keine ungelöste Abbuchung, jede erfolgreiche Abbuchung erstattet. Nie ohne Erstattung. */
export async function finalizeCancel(matchId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!m || m.cancelRequestedAt === null || !["lobby", "confirmed"].includes(m.status)) return false;
    const charges = await tx.select().from(paymentCharges).where(eq(paymentCharges.matchId, matchId));
    if (charges.some((c) => c.status === "pending")) return false; // unterwegs (processing) oder unbekannt: erst klären
    const refunds = await tx.select().from(paymentRefunds).where(eq(paymentRefunds.matchId, matchId));
    const settled = (r: (typeof refunds)[number]) => r.status === "succeeded" || r.status === "cancelled_dispute" || (r.status === "failed" && r.failureCode === REFUND_WRITTEN_OFF); // cancelled_dispute: Streit verloren, nichts mehr zu erstatten (M4a); abgeschrieben: Admin 1 hat die fehlgeschlagene Erstattung bewusst aufgelöst (Backlog 192)
    const refunded = new Set(refunds.filter(settled).map((r) => r.chargeId));
    if (charges.some((c) => c.status === "succeeded" && !refunded.has(c.id))) return false;
    if (refunds.some((r) => !settled(r))) return false; // auch weitere Erstattungen (Doppelabbuchung / spaeter Erfolg) muessen durch sein
    await cancelMatchTx(tx, m, null, m.cancelReason ?? "Das Spiel wurde abgesagt.", { afterRefund: true });
    await audit(null, "match.cancel_completed", "match", matchId, { after: { refunds: refunds.length } }, tx);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
    return true;
  });
}


async function requireOwner(actorId: string) {
  const [actor] = await db.select({ role: users.role, isOwner: users.isOwner }).from(users).where(eq(users.id, actorId));
  if (!canUser(actor, "finance")) throw new DomainError("Nur Admin 1 darf eine fehlgeschlagene Erstattung neu versuchen oder abschreiben.");
}

/** Sperrt Spiel und Zeile (Reihenfolge wie überall) und prüft: Spiel-Erstattung, Status failed, nicht abgeschrieben. */
async function lockFailedRefund(tx: Tx, refundRowId: string) {
  const [probe] = await tx.select({ matchId: paymentRefunds.matchId, tournamentId: paymentRefunds.tournamentId }).from(paymentRefunds).where(eq(paymentRefunds.id, refundRowId));
  if (!probe) throw new DomainError("Erstattung nicht gefunden.");
  if (probe.tournamentId !== null || probe.matchId === null) throw new DomainError("Das ist eine Turnier-Erstattung: sie wird nicht hier, sondern im Turnier geklärt.");
  await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, probe.matchId)).for("update");
  const [row] = await tx.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundRowId)).for("update");
  if (!row || row.status !== "failed") throw new DomainError("Diese Erstattung ist nicht (mehr) fehlgeschlagen: sie wurde schon neu versucht, erledigt oder von jemand anderem entschieden.");
  if (row.failureCode === REFUND_WRITTEN_OFF) throw new DomainError("Diese Erstattung wurde bereits abgeschrieben.");
  return { row, matchId: probe.matchId };
}

/** Neuer Stripe-Idempotenzschluessel je Neuversuch (<alt>:r1, :r2, ...): Stripe liefert bei GLEICHEM Schluessel 24 Stunden lang die ALTE Antwort ohne neue Erstattung (Review R-T376, P1). */
export const nextRetryKey = (key: string) => {
  const m = /^(.*):r([0-9]+)$/.exec(key);
  return m ? `${m[1]}:r${Number(m[2]) + 1}` : `${key}:r1`;
};

/**
 * Backlog 192: Admin 1 versucht eine fehlgeschlagene Ausnahme-Erstattung erneut. Dieselbe Zeile, aber ein NEUER Idempotenzschlüssel (nextRetryKey; nie eine zweite Zeile: UNIQUE je Abbuchung; die alte Erstattung ist von Stripe als failed bestätigt),
 * der Versand läuft über den bestehenden Weg (claimRefund/sendRefund, Ergebnis über applyRefundInTx wie der Webhook). Ein bedingtes UPDATE (status = failed) macht zwei gleichzeitige
 * Neuversuche zu einem; Stripe selbst lehnt eine zweite Erstattung über den Abbuchungsbetrag ab. Ein Neuversuch bei einem Zahlungsstreit (charge_disputed) ist gesperrt.
 */
export async function retryFailedRefund(actorId: string, refundRowId: string): Promise<void> {
  await requireOwner(actorId);
  const matchId = await db.transaction(async (tx) => {
    const { row, matchId: mId } = await lockFailedRefund(tx, refundRowId);
    if (row.failureCode === "charge_disputed") throw new DomainError("Zu dieser Zahlung läuft oder lief ein Zahlungsstreit: ein Neuversuch ist nicht möglich. Bitte den Streit klären oder die Erstattung abschreiben.");
    const [charge] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, row.chargeId));
    if (!charge || charge.status !== "succeeded") throw new DomainError("Die zugehörige Abbuchung ist nicht (mehr) erfolgreich: kein Neuversuch.");
    const changed = await tx
      .update(paymentRefunds)
      .set({ status: "pending", refundId: null, failureCode: null, attemptStartedAt: null, idempotencyKey: nextRetryKey(row.idempotencyKey), updatedAt: new Date() })
      .where(and(eq(paymentRefunds.id, row.id), eq(paymentRefunds.status, "failed")))
      .returning({ id: paymentRefunds.id });
    if (changed.length !== 1) throw new DomainError("Diese Erstattung wurde gerade von jemand anderem bearbeitet.");
    await audit(actorId, "refund.retry", "match", mId, { after: { refundRowId: row.id, previousCode: row.failureCode, previousRefundId: row.refundId, previousKey: row.idempotencyKey, amountCents: row.amountCents } }, tx);
    return mId;
  });
  // Nach dem Commit senden (nie ein Stripe-Aufruf in der Transaktion); scheitert der Versand, holt der Job runRefunds es nach
  await sendPendingRefunds(matchId).catch(() => undefined);
  const [after] = await db.select({ status: paymentRefunds.status, code: paymentRefunds.failureCode }).from(paymentRefunds).where(eq(paymentRefunds.id, refundRowId));
  if (after?.status === "failed") throw new DomainError("Stripe hat die Erstattung wieder abgelehnt (Code " + (after.code ?? "unbekannt") + "). Der Alarm bleibt bestehen.");
  await finalizeCancel(matchId).catch(() => undefined); // wartete eine angeforderte Absage nur auf diese Zeile, jetzt abschliessen (sonst holt es der Job nach)
}

/**
 * Backlog 192: Admin 1 schreibt eine fehlgeschlagene Erstattung bewusst ab. NUR eine Buchungsmarkierung (failure_code = written_off): es bewegt sich kein Geld, es wird nichts an Stripe gesendet
 * und nichts im Hauptbuch gebucht; es ist keine Entscheidung zu Recht oder Steuer. Pflicht-Grund und Protokoll; danach ist die Zeile aufgelöst (kein Alarm, die Absage darf durch).
 */
export async function writeOffFailedRefund(actorId: string, refundRowId: string, reason: string): Promise<void> {
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Bitte einen Grund angeben (mindestens 3 Zeichen).");
  if (text.length > 200) throw new DomainError("Der Grund darf höchstens 200 Zeichen lang sein.");
  await requireOwner(actorId);
  const matchId = await db.transaction(async (tx) => {
    const { row, matchId: mId } = await lockFailedRefund(tx, refundRowId);
    const changed = await tx
      .update(paymentRefunds)
      .set({ failureCode: REFUND_WRITTEN_OFF, updatedAt: new Date() })
      .where(and(eq(paymentRefunds.id, row.id), eq(paymentRefunds.status, "failed"), sql`${paymentRefunds.failureCode} is distinct from ${REFUND_WRITTEN_OFF}`))
      .returning({ id: paymentRefunds.id });
    if (changed.length !== 1) throw new DomainError("Diese Erstattung wurde gerade von jemand anderem bearbeitet.");
    await audit(actorId, "refund.written_off", "match", mId, { after: { refundRowId: row.id, previousCode: row.failureCode, amountCents: row.amountCents, reason: text } }, tx);
    return mId;
  });
  // Eine Absage, die nur auf diese Zeile wartete, jetzt abschließen (ohne Netzaufruf; finalizeCancel ist idempotent)
  await finalizeCancel(matchId).catch(() => undefined);
}

/** Fehlgeschlagene (nicht abgeschriebene) Erstattungen eines Spiels für Admin 1: nur IDs, Betrag, Code; keine Personendaten. */
export async function listFailedRefundsOfMatch(matchId: string) {
  return db
    .select({ id: paymentRefunds.id, amountCents: paymentRefunds.amountCents, code: paymentRefunds.failureCode })
    .from(paymentRefunds)
    .where(and(eq(paymentRefunds.matchId, matchId), eq(paymentRefunds.status, "failed"), sql`${paymentRefunds.failureCode} is distinct from ${REFUND_WRITTEN_OFF}`));
}
