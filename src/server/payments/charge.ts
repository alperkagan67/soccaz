// Verbuchung von Karten-Abbuchungen (Vertrag 012, M2a). Es gibt genau EINEN Weg, ein Ergebnis zu verbuchen: applyChargeInTx. Der Webhook (und ab M2b der Job)
// ruft ihn auf; er ist idempotent und bucht nur Abbuchungen, die in payment_charges stehen und zu Betrag, Kunde und Metadaten passen.
// Netzaufrufe laufen NIE innerhalb einer Datenbanktransaktion (die Gebühr wird vorher geholt oder in einem eigenen Folgeschritt gebucht).
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentChargeAttempts, paymentCharges, paymentProfiles, paymentRefunds } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { audit } from "../audit";
import { formatEuro } from "@/lib/money";
import { notifyUsers } from "../notifications";
import { issueReceipt } from "../receipts";
import { teamName } from "../names";
import { post } from "../ledger";
import type { Tx } from "../tx";
import { getPaymentProvider } from "./provider";
import { notifyChargeProblem } from "./charge-notify";
import { graceUntil, inGraceWindow } from "@/lib/grace";
import { failSubstitute } from "./substitute-fail";

export const refundKey = (chargeId: string) => `refund:${chargeId}`;

/** Legt die (einzige, volle) Erstattungszeile einer erfolgreichen Abbuchung an. Idempotent (UNIQUE charge_id). Gesendet wird sie vom Erstattungs-Ablauf (refund.ts). */
export async function ensureRefundRow(tx: Tx, charge: typeof paymentCharges.$inferSelect, reason: string, extraPaymentIntentId: string | null = null) {
  // Standard: die Erstattung des PaymentIntents der Zeile (Schluessel refund:<Abbuchung>). Mit extraPaymentIntentId: ein WEITERER erfolgreicher PaymentIntent derselben Abbuchung
  // (Doppelabbuchung), eigene Zeile und Schluessel refund:<Abbuchung>:<PaymentIntent>.
  const key = extraPaymentIntentId ? `${refundKey(charge.id)}:${extraPaymentIntentId}` : refundKey(charge.id);
  await tx.insert(paymentRefunds).values({ chargeId: charge.id, matchId: charge.matchId, userId: charge.payerUserId ?? charge.userId, amountCents: charge.amountCents, idempotencyKey: key, reason, paymentIntentId: extraPaymentIntentId }).onConflictDoNothing();
}

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

  // Sperrreihenfolge überall gleich: ERST das Spiel, DANN die Abbuchungszeile (sonst Verklemmung, wenn zwei letzte Zahlungen gleichzeitig eintreffen, weil
  // jede Buchung und jede Fremdschlüssel-Prüfung die Spielzeile mitsperrt). Darum die Zeile zuerst ohne Sperre suchen, das Spiel sperren, dann die Zeile sperren.
  const byPi = async (lock: boolean) => {
    const q = tx.select().from(paymentCharges).where(eq(paymentCharges.paymentIntentId, r.paymentIntentId));
    return (lock ? await q.for("update") : await q)[0];
  };
  // Ein ALTER, abgeschlossener Versuch (Historie, M3c-1): die Zeile gehört zu dem Versuch, der inzwischen durch einen neueren ersetzt wurde
  const byHistory = async (lock: boolean) => {
    const [h] = await tx.select({ chargeId: paymentChargeAttempts.chargeId }).from(paymentChargeAttempts).where(eq(paymentChargeAttempts.paymentIntentId, r.paymentIntentId));
    if (!h) return undefined;
    const q = tx.select().from(paymentCharges).where(eq(paymentCharges.id, h.chargeId));
    return (lock ? await q.for("update") : await q)[0];
  };
  const byMeta = async (lock: boolean) => {
    const { matchId, userId } = r.metadata;
    if (!matchId || !userId || !UUID.test(matchId) || !UUID.test(userId)) return undefined;
    const q = tx.select().from(paymentCharges).where(and(eq(paymentCharges.matchId, matchId), eq(paymentCharges.userId, userId)));
    return (lock ? await q.for("update") : await q)[0];
  };
  const probe = (await byPi(false)) ?? (await byHistory(false)) ?? (await byMeta(false));
  if (probe) await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, probe.matchId)).for("update");
  let row: typeof paymentCharges.$inferSelect | undefined = await byPi(true);
  let oldAttempt = false;
  if (!row) {
    row = await byHistory(true);
    oldAttempt = row !== undefined;
  }
  if (!row) {
    if (!r.metadata.matchId || !r.metadata.userId || !UUID.test(r.metadata.matchId) || !UUID.test(r.metadata.userId)) return ignore("unknown_payment_intent");
    row = await byMeta(true);
    if (!row) return ignore("unknown_charge");
    // Die Zeile gehört zu einem ANDEREN PaymentIntent. Derselbe PaymentIntent ist kein Fehler: ein paralleles Ereignis hat ihn gerade gebunden
    // (wir haben auf seine Sperre gewartet) und wird normal weiterverarbeitet, sonst ginge ein succeeded verloren (Geld abgebucht, nicht gebucht).
    if (row.paymentIntentId !== null && row.paymentIntentId !== r.paymentIntentId) {
      // Die Zeile ist schon erfolgreich oder ihr Platz wurde vergeben, und nun meldet Stripe einen weiteren erfolgreichen PaymentIntent: kein Fehler, sondern Geld, das
      // gebucht UND voll erstattet wird (siehe unten). Jeder andere fremde PaymentIntent wird ignoriert.
      if (!(r.outcome === "succeeded" && (row.status === "succeeded" || row.resolution === "replaced"))) return ignore("other_payment_intent");
    }
  }
  if (r.metadata.matchId !== null && r.metadata.matchId !== row.matchId) return ignore("metadata_mismatch");
  if (r.metadata.userId !== null && r.metadata.userId !== row.userId) return ignore("metadata_mismatch");
  if (r.amountCents !== row.amountCents || r.currency?.toLowerCase() !== "eur") return ignore("amount_mismatch");
  // WESSEN Kunde: bei einer Uebernahme (Variante B) der des ZAHLERS; Metadaten und Betrag gehoeren zum Platz (row.userId)
  const [profile] = await tx.select({ stripeCustomerId: paymentProfiles.stripeCustomerId }).from(paymentProfiles).where(eq(paymentProfiles.userId, row.payerUserId ?? row.userId));
  if (!profile || r.customerId !== profile.stripeCustomerId) return ignore("customer_mismatch");

  // Ereignis eines ALTEN Versuchs: ein Fehlschlag aendert nichts (der neuere Versuch zaehlt), ein Erfolg ist trotzdem Geld und wird verbucht (succeeded gewinnt immer)
  if (oldAttempt && r.outcome !== "succeeded") {
    await audit(null, "charge.old_attempt_event", "match", row.matchId, { after: { userId: row.userId, outcome: r.outcome } }, tx);
    return { status: "already" };
  }
  // Ersetzter Platz (Platz vergeben): Fehlschlaege aendern nichts mehr
  if (row.resolution === "replaced" && r.outcome !== "succeeded") return { status: "already" };
  if (r.outcome === "succeeded" && (row.status === "succeeded" || row.resolution === "replaced")) {
    // SPAETER ERFOLG nach Ersatz oder ZWEITER erfolgreicher PaymentIntent zur selben Zeile (Plan v2 Punkt 4): der Betrag liegt bei uns, also wird er gebucht (Hauptbuch
    // clearing -> revenue, Schluessel charge:<PI>) UND sofort voll auf die Karte erstattet (revenue -> clearing ueber den Erstattungsablauf) + Admin-Alarm. Nie ein stilles Behalten.
    const [booked] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `charge:${r.paymentIntentId}`));
    if (booked) return { status: "already" };
    await post(tx, {
      debit: { account: "clearing" },
      credit: { account: "revenue" },
      amountCents: row.amountCents,
      kind: "match_share",
      matchId: row.matchId,
      idempotencyKey: `charge:${r.paymentIntentId}`,
      reason: "Abbuchung Anteil (Karte), spaet eingegangen oder doppelt",
    });
    if (row.status !== "succeeded") {
      // der ersetzte Platz selbst war nie erfolgreich: die Zeile wird mit DIESEM PaymentIntent erfolgreich (und gleich erstattet)
      await tx.update(paymentCharges).set({ status: "succeeded", failureCode: null, paymentIntentId: r.paymentIntentId, updatedAt: new Date() }).where(eq(paymentCharges.id, row.id));
      await ensureRefundRow(tx, { ...row, status: "succeeded", paymentIntentId: r.paymentIntentId }, "Spät eingegangene Zahlung (Platz vergeben)");
    } else {
      await ensureRefundRow(tx, row, "Doppelte Abbuchung", r.paymentIntentId);
    }
    await audit(null, "charge.duplicate_success", "match", row.matchId, { after: { userId: row.userId, paymentIntentId: r.paymentIntentId, replaced: row.resolution === "replaced" } }, tx);
    return { status: "applied" };
  }
  if (row.status === "succeeded") return { status: "already" };
  // Rangfolge succeeded > failed > requires_action > pending: ein verspätetes, "schwächeres" Ereignis überschreibt nichts
  if (r.outcome !== "succeeded" && RANK[r.outcome] < RANK[row.status]) return { status: "already" };
  if (row.paymentIntentId === null && !oldAttempt) await tx.update(paymentCharges).set({ paymentIntentId: r.paymentIntentId }).where(eq(paymentCharges.id, row.id));

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
    // Gelingt die Abbuchung erst NACH der Absage (oder während sie läuft), wird sofort erstattet: nie Geld einer abgesagten Lobby behalten
    const [game] = await tx.select({ status: matches.status, cancelRequestedAt: matches.cancelRequestedAt }).from(matches).where(eq(matches.id, row.matchId));
    if (game && (game.cancelRequestedAt !== null || game.status === "cancelled")) {
      await ensureRefundRow(tx, { ...row, status: "succeeded" }, "Abbuchung nach Absage");
      await audit(null, "refund.auto", "match", row.matchId, { after: { userId: row.userId } }, tx);
    }
    await settleIfComplete(tx, row.matchId); // der letzte erfolgreiche Spieler bucht das Spiel, egal ob über den Job oder den Webhook
    return { status: "applied" };
  }

  // Nicht erfolgreich: nur der Status und das Audit (Nachzahlfenster, Nachrücker und Absage sind M3). Eine zweite gleiche Meldung ändert nichts.
  if (row.status === r.outcome && row.failureCode === cleanCode(r.failureCode)) return { status: "already" };
  const firstProblem = row.status !== "failed" && row.status !== "requires_action";
  const now = new Date();
  if (row.slotOf !== null) {
    // Nachruecker: sofort draussen, kein Fenster, keine Nachricht an Captain oder Dritte (AC-8/AC-20); der Platz geht an den Naechsten
    const code = cleanCode(r.failureCode) ?? (r.outcome === "requires_action" ? "authentication_required" : "card_declined");
    await tx.update(paymentCharges).set({ status: r.outcome, failureCode: code, updatedAt: now }).where(eq(paymentCharges.id, row.id));
    await audit(null, "charge.failed", "match", row.matchId, { after: { userId: row.userId, outcome: r.outcome, code } }, tx);
    if (row.resolution === null) await failSubstitute(tx, row, code);
    return { status: "applied" };
  }
  // Nachzahlfenster (AC-6): beginnt mit dem ERSTEN Fehler und wird danach nicht mehr verschoben; unter 1 h bis zum Anstoss gibt es keins (null)
  const [game] = await tx.select({ startsAt: matches.startsAt }).from(matches).where(eq(matches.id, row.matchId));
  // Nur der erste Versuch setzt das Fenster; ein fehlgeschlagener Wiederholungsversuch (current_attempt > 1) laesst es unveraendert
  const grace = firstProblem && row.currentAttempt === 1 ? graceUntil(now, game?.startsAt ?? now) : row.graceUntil; // immer gesetzt (kein Fenster = Ende ist jetzt)
  await tx.update(paymentCharges).set({ status: r.outcome, failureCode: cleanCode(r.failureCode) ?? (r.outcome === "requires_action" ? "authentication_required" : "card_declined"), graceUntil: grace, updatedAt: now }).where(eq(paymentCharges.id, row.id));
  await tx.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, row.matchId), eq(matchParticipants.userId, row.userId)));
  await audit(null, "charge.failed", "match", row.matchId, { after: { userId: row.userId, outcome: r.outcome, code: cleanCode(r.failureCode) } }, tx);
  // NUR beim ersten Wechsel in einen Problemzustand: war die Zeile schon failed oder requires_action, ändern sich Status und Code (und das Audit), aber es geht keine
  // zweite Nachricht raus (requires_action -> failed, Codewechsel). Empfänger: Betroffener + Captain/Veranstalter, nie Dritte (AC-12/AC-20)
  if (firstProblem) await notifyChargeProblem(tx, row, cleanCode(r.failureCode) ?? (r.outcome === "requires_action" ? "authentication_required" : "card_declined"), game && inGraceWindow(grace, game.startsAt, now) ? grace : null);
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

/**
 * Phase D: Haben ALLE eingeteilten Spieler erfolgreich gezahlt, ist das Spiel gebucht: settledAt (finalShareCents bleibt), Beleg je Spieler,
 * Benachrichtigung "Abrechnung". Läuft unter der Spielsperre (zwei gleichzeitig erfolgreiche letzte Zahlungen verpassen sich sonst gegenseitig) und ist
 * idempotent (settledAt, Beleg je Spieler und Spiel). Teil-Erfolg: nichts passiert, erfolgreiche Zahlungen bleiben bestehen (Nachzahlfenster = M3).
 */
export async function settleIfComplete(tx: Tx, matchId: string): Promise<boolean> {
  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
  if (!match || match.settledAt !== null || !["lobby", "confirmed"].includes(match.status) || match.cancelRequestedAt !== null) return false; // Absage angefordert: nie abrechnen
  // Ersetzte Zeilen (resolution=replaced: Platz vergeben, gescheiterter Nachruecker) zaehlen nicht mit
  const all = await tx.select().from(paymentCharges).where(eq(paymentCharges.matchId, matchId));
  // Ein vergebener Platz (Ursprungszeile resolution=replaced) muss durch einen ERFOLGREICHEN Nachruecker besetzt sein; ist er noch offen, fehlt ein Anteil und es wird NICHT abgerechnet
  for (const root of all.filter((r) => r.slotOf === null && r.resolution === "replaced")) if (!all.some((k) => k.slotOf === root.id && k.status === "succeeded" && k.resolution === null)) return false; // ein ERSETZTER Nachruecker (auch mit spaetem Erfolg) besetzt den Platz nicht
  const rows = all.filter((r) => r.resolution === null);
  if (rows.length === 0 || rows.some((r) => r.status !== "succeeded")) return false;
  const seated = await tx.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), isNotNull(matchParticipants.teamId)));
  const paid = new Set(rows.map((r) => r.userId));
  if (seated.length === 0 || seated.some((s) => !paid.has(s.userId))) return false; // jemand ist eingeteilt, aber wurde nie belastet

  await tx.update(matches).set({ settledAt: new Date() }).where(and(eq(matches.id, matchId), isNull(matches.settledAt)));
  const [home, away] = [await teamName(tx, match.homeTeamId), await teamName(tx, match.awayTeamId)];
  // Beleg und Nachricht gehen an den, dessen Karte belastet wurde (Zahler); uebernimmt B einen Anteil, bekommt B EINEN Beleg ueber die Summe beider Posten
  const byPayer = new Map<string, number>();
  for (const r of rows) byPayer.set(r.payerUserId ?? r.userId, (byPayer.get(r.payerUserId ?? r.userId) ?? 0) + r.amountCents);
  for (const [payer, cents] of byPayer) {
    await issueReceipt(tx, { userId: payer, kind: "match", matchId, amountCents: cents });
    await notifyUsers([payer], { type: "payment", title: "Abrechnung", body: `${home} gegen ${away}: ${formatEuro(cents)} wurden von deiner Karte abgebucht.`, url: `/lobby/${matchId}` }, tx);
  }
  await audit(null, "charge.settled", "match", matchId, { after: { payers: rows.length, totalCents: rows.reduce((s, r) => s + r.amountCents, 0) } }, tx);
  return true;
}
