// 3-D-Secure-Freigabe (Vertrag 012, M3c-1c, AC-7): Die Bank verlangt fuer einen Versuch eine Freigabe (requires_action, Code authentication_required). Der Betroffene bekommt das
// clientSecret des LAUFENDEN Versuchs, damit sein Browser (Stripe.js handleNextAction) die Pruefung abschliessen kann. Das Ergebnis des Browsers zaehlt NIE als Zahlung: gebucht wird
// allein ueber den Webhook (applyChargeInTx). Diese Datei bucht nichts, legt nie einen PaymentIntent an und gibt das Secret nur als Ergebnis der Server-Aktion an den Betroffenen.
//
// Alle Fehler sind absichtlich NEUTRAL und gleich (kein Hinweis, ob es die Zeile gibt, wem sie gehoert oder warum abgelehnt wurde). Das Secret steht nie in Logs, Audit, Fehlern oder URLs.
// Es werden ausdrueckliche Spalten gelesen (keine Abhaengigkeit von spaeteren Migrationen).
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matches, paymentCharges, paymentProfiles } from "@/db/schema";
import { effectiveGraceEnd, graceText } from "@/lib/grace";
import { audit } from "../audit";
import { cardPaymentsEnabled } from "../settings";
import { DomainError } from "../teams";
import { getPaymentProvider } from "./provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AUTHORIZE_LIMIT_PER_HOUR = 10;
const NOT_AVAILABLE = "Für diese Zahlung ist gerade keine Freigabe möglich.";

type OpenRow = { id: string; amountCents: number; paymentIntentId: string | null; currentAttempt: number; graceUntil: Date | null; startsAt: Date; matchId: string };

/** Die offene Freigabe-Zeile des Nutzers in diesem Spiel, wenn ALLE Bedingungen stimmen; sonst null. Liest nur eigene Zeilen (Nutzer-ID aus der Sitzung). */
async function openRow(userId: string, matchId: string, now: Date): Promise<OpenRow | null> {
  const [r] = await db
    .select({
      id: paymentCharges.id,
      amountCents: paymentCharges.amountCents,
      paymentIntentId: paymentCharges.paymentIntentId,
      currentAttempt: paymentCharges.currentAttempt,
      graceUntil: paymentCharges.graceUntil,
      status: paymentCharges.status,
      failureCode: paymentCharges.failureCode,
      startsAt: matches.startsAt,
      matchStatus: matches.status,
      cancelRequestedAt: matches.cancelRequestedAt,
      settledAt: matches.settledAt,
    })
    .from(paymentCharges)
    .innerJoin(matches, eq(matches.id, paymentCharges.matchId))
    .where(and(eq(paymentCharges.matchId, matchId), eq(paymentCharges.userId, userId)));
  if (!r) return null;
  if (r.status !== "requires_action" || r.failureCode !== "authentication_required") return null;
  if (!["lobby", "confirmed"].includes(r.matchStatus) || r.cancelRequestedAt !== null || r.settledAt !== null || r.startsAt.getTime() <= now.getTime()) return null;
  const end = effectiveGraceEnd(r.graceUntil, r.startsAt);
  if (end === null || end.getTime() <= now.getTime()) return null; // Fenster abgelaufen (oder Altzeile)
  if (!r.paymentIntentId) return null;
  return { id: r.id, amountCents: r.amountCents, paymentIntentId: r.paymentIntentId, currentAttempt: r.currentAttempt, graceUntil: r.graceUntil, startsAt: r.startsAt, matchId };
}

/**
 * Liefert dem Betroffenen das clientSecret seines offenen Versuchs. NUR der Nutzer selbst (die Zeile gehoert ihm), nie Captain/Admin/Dritte. Pruefungen: Kartenmodell AN, Spiel offen,
 * Zeile requires_action mit authentication_required, Fenster laeuft, laufender Versuch; bei Stripe: der PaymentIntent ist NOCH requires_action und Betrag, EUR und Kunde passen
 * (sonst kein Secret). Legt nie einen PaymentIntent an. Rate-Limit je Nutzer und Stunde.
 */
export async function getAuthorizationSecret(userId: string, matchId: string, now: Date = new Date()): Promise<{ clientSecret: string }> {
  if (typeof matchId !== "string" || !UUID.test(matchId)) throw new DomainError(NOT_AVAILABLE);
  if (!(await cardPaymentsEnabled())) throw new DomainError(NOT_AVAILABLE);
  const row = await openRow(userId, matchId, now);
  if (!row || !row.paymentIntentId) throw new DomainError(NOT_AVAILABLE);

  const since = new Date(now.getTime() - 3_600_000);
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.actorId, userId), eq(auditLog.action, "charge.authorization_attempt"), gt(auditLog.at, since)));
  if ((recent?.n ?? 0) >= AUTHORIZE_LIMIT_PER_HOUR) throw new DomainError("Zu viele Versuche. Bitte warte etwas und versuche es später noch einmal.");
  // Der Versuch zaehlt VOR dem Netzaufruf (auch abgelehnte Anfragen): sonst koennte ein Nutzer mit unpassendem Stripe-Stand ungebremst paymentIntents.retrieve ausloesen. Ohne Secret, ohne PaymentIntent-ID.
  await audit(userId, "charge.authorization_attempt", "match", matchId, { after: { attempt: row.currentAttempt } });

  const [profile] = await db.select({ stripeCustomerId: paymentProfiles.stripeCustomerId }).from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  if (!profile) throw new DomainError(NOT_AVAILABLE);

  // Netz, nie in einer Transaktion
  const found = await (await getPaymentProvider()).retrievePaymentIntentSecret(row.paymentIntentId);
  if (!found) throw new DomainError(NOT_AVAILABLE);
  const { intent, clientSecret } = found;
  if (intent.status !== "requires_action" || intent.amountCents !== row.amountCents || intent.currency?.toLowerCase() !== "eur" || intent.customerId !== profile.stripeCustomerId) {
    throw new DomainError(NOT_AVAILABLE); // kein Secret, wenn der Stand bei Stripe nicht passt (auch nicht bei succeeded/failed/processing)
  }

  // Die Zeile darf sich waehrend des Netzaufrufs nicht geaendert haben (neuer Versuch, Fenster vorbei, bezahlt)
  const again = await openRow(userId, matchId, new Date());
  if (!again || again.id !== row.id || again.currentAttempt !== row.currentAttempt || again.paymentIntentId !== row.paymentIntentId) throw new DomainError(NOT_AVAILABLE);

  await audit(userId, "charge.authorization_requested", "match", matchId, { after: { attempt: row.currentAttempt } }); // ohne Secret, ohne PaymentIntent-ID
  return { clientSecret };
}

/** Offene Freigaben des Nutzers (nur Spiel und Fensterende, KEIN Secret): fuer die Liste im Konto. Liest nur eigene Zeilen. */
export async function listOpenAuthorizations(userId: string, now: Date = new Date()): Promise<{ matchId: string; until: string }[]> {
  const rows = await db
    .select({ matchId: paymentCharges.matchId, graceUntil: paymentCharges.graceUntil, paymentIntentId: paymentCharges.paymentIntentId, startsAt: matches.startsAt, matchStatus: matches.status, cancelRequestedAt: matches.cancelRequestedAt, settledAt: matches.settledAt })
    .from(paymentCharges)
    .innerJoin(matches, eq(matches.id, paymentCharges.matchId))
    .where(and(eq(paymentCharges.userId, userId), eq(paymentCharges.status, "requires_action"), eq(paymentCharges.failureCode, "authentication_required")));
  const out: { matchId: string; until: string }[] = [];
  for (const r of rows) {
    // dieselben Bedingungen wie getAuthorizationSecret/openRow: Anzeige und Server stimmen ueberein
    if (!["lobby", "confirmed"].includes(r.matchStatus) || r.cancelRequestedAt !== null || r.settledAt !== null || !r.paymentIntentId || r.startsAt.getTime() <= now.getTime()) continue;
    const end = effectiveGraceEnd(r.graceUntil, r.startsAt);
    if (end === null || end.getTime() <= now.getTime()) continue;
    out.push({ matchId: r.matchId, until: graceText(end, now) });
  }
  return out;
}
