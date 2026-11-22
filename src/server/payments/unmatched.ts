// Ereignisse ohne Zuordnung (Backlog 118, 012 M5-7a, Entscheid t2q P-M57-6): das Ignorieren einer Zahlungsmeldung steht im Audit (charge.ignored); hier kommt die Alarmlogik dazu.
//  - Eine ERFOLGREICHE Zahlung (succeeded) ohne Zuordnung ist echtes Geld ohne Buchung: SOFORT eine Mitteilung an Admin 1 (Owner), ohne Personendaten (nur PaymentIntent-ID, Betrag, Zeit),
//    entprellt: je PaymentIntent genau einmal (enger als "je Ereignis-ID": auch die Wiederholung mit neuer Ereignis-ID loest nichts aus; parallele Zustellungen serialisiert eine Advisory-Sperre) (das Audit "charge.unmatched_success" ist der Marker).
//  - Alle anderen unbekannten Ereignisse zaehlen nur (Audit); der Alarm in der Alarmliste (finance.ts) kommt erst bei mehr als UNMATCHED_THRESHOLD in 24 Stunden.
import { and, eq, sql } from "drizzle-orm";
import { auditLog, users } from "@/db/schema";
import { audit } from "../audit";
import { notifyUsers } from "../notifications";
import { formatEuro } from "@/lib/money";
import type { Tx } from "../tx";

/** Gruende, die "keine Zuordnung" bedeuten (alles andere, z. B. amount_mismatch, ist ein bekannter Fall mit Zeile). */
export const UNMATCHED_REASONS = ["unknown_payment_intent", "unknown_charge"] as const;
export const UNMATCHED_THRESHOLD = 5;

export const isUnmatchedReason = (reason: string): boolean => (UNMATCHED_REASONS as readonly string[]).includes(reason);

/**
 * Schreibt das Audit "charge.ignored" (mit Ergebnis der Meldung) und loest bei einer erfolgreichen Zahlung ohne Zuordnung einmal je PaymentIntent die Mitteilung an Admin 1 aus.
 * In der Transaktion des Aufrufers; wirft nie wegen der Mitteilung (der Webhook darf daran nicht scheitern).
 */
export async function noteIgnoredCharge(tx: Tx, r: { paymentIntentId: string; outcome: string; amountCents: number | null }, reason: string): Promise<void> {
  await audit(null, "charge.ignored", "payment_intent", r.paymentIntentId, { after: { reason, outcome: r.outcome } }, tx);
  if (r.outcome !== "succeeded" || !isUnmatchedReason(reason)) return;
  // Parallele Zustellungen derselben Zahlung (Stripe-Wiederholung) serialisieren: Pruefung und Marker sind sonst nicht atomar (doppelte Mitteilung)
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"unmatched:" + r.paymentIntentId}, 0))`);
  const [done] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, "charge.unmatched_success"), eq(auditLog.entityId, r.paymentIntentId))).limit(1);
  if (done) return;
  await audit(null, "charge.unmatched_success", "payment_intent", r.paymentIntentId, { after: { amountCents: r.amountCents } }, tx);
  try {
    // Savepoint: ein SQL-Fehler in der Mitteilung bricht nur den Savepoint ab, nicht die Transaktion des Webhooks (sonst 25P02, Webhook 500, Marker zurueckgerollt, kein Alarm)
    await tx.transaction(async (sp) => {
      const owners = await sp.select({ id: users.id }).from(users).where(eq(users.isOwner, true));
      const amount = r.amountCents !== null && Number.isInteger(r.amountCents) ? ` über ${formatEuro(r.amountCents)}` : "";
      await notifyUsers(owners.map((o) => o.id), { type: "system", title: "Zahlung ohne Buchung", body: `Eine erfolgreiche Zahlung${amount} (${r.paymentIntentId}) konnte keiner Abbuchung zugeordnet werden. Bitte im Stripe-Dashboard prüfen und gegebenenfalls erstatten.`, url: "/admin/finanzen" }, sp);
    });
  } catch {
    /* die Mitteilung darf die Verbuchung des Webhooks nie verhindern; der Marker (Audit) bleibt, der Alarm in der Alarmliste auch */
  }
}

/** Fuer die Alarmliste: erfolgreiche Zahlungen ohne Zuordnung der letzten 30 Tage (je PaymentIntent einmal) und andere unbekannte Ereignisse der letzten 24 Stunden (Zaehler). */
export async function unmatchedAlertData(exec: Pick<Tx, "execute">, now: Date): Promise<{ succeeded: string[]; others24h: number }> {
  const s = await exec.execute(sql`select distinct entity_id as id from audit_log where action = 'charge.unmatched_success' and at > ${new Date(now.getTime() - 30 * 24 * 3_600_000)}`);
  const o = await exec.execute(sql`select count(distinct entity_id)::int as n from audit_log
    where action = 'charge.ignored' and at > ${new Date(now.getTime() - 24 * 3_600_000)}
      and (after->>'reason') in (${sql.join(UNMATCHED_REASONS.map((x) => sql`${x}`), sql`, `)}) and coalesce(after->>'outcome', '') <> 'succeeded'`);
  return { succeeded: (s.rows as { id: string }[]).map((x) => x.id), others24h: Number((o.rows as { n: number }[])[0]?.n ?? 0) };
}
