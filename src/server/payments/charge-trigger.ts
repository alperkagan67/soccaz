// Auslöser der Kartenabbuchung (Vertrag 012, M2b-2). runCharges selbst kennt die Frist nicht; die Prüfung "ist es Zeit" läuft hier und in Phase A unter der Spielsperre
// (runCharges mit requireDue). Zwei Aufrufer: der 5-Minuten-Job (runCardCharges) und finalConfirm (triggerChargesInBackground, Vorlauf unter 48 Stunden).
// Beide sind unabhängig von `payments_enabled`; maßgeblich ist allein das Kartenmodell (cardModeActive: Schalter card_payments_enabled EIN, Frist-Regel, kein Guthaben-Platz).
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { audit } from "../audit";
import { cardPaymentsEnabled } from "../settings";
import { bookOpenFees } from "./charge";
import { AFTER_START, runCharges, UNKNOWN_OUTCOME, type RunResult } from "./charge-run";

/** Bucht ein Kartenspiel ab, wenn es Zeit ist (Frist erreicht bzw. Vorlauf unter 48 h und beide Captains bereit). Sonst passiert nichts: kein Netz, keine Zeilen. */
export function runChargesIfDue(matchId: string, now: Date = new Date()): Promise<RunResult> {
  return runCharges(matchId, now, { requireDue: true });
}

/**
 * Für finalConfirm: nach dem Commit der Bestätigung, ohne darauf zu warten. Fehler und Hänger im Auslöser dürfen die Bestätigung und die Antwort nie verzögern oder
 * abbrechen; der 5-Minuten-Job holt nach. Der Rückgabewert ist nur für Tests (Aufrufer awaiten ihn nicht); er wird nie abgelehnt.
 */
export function triggerChargesInBackground(matchId: string): Promise<void> {
  return runChargesIfDue(matchId).then(
    () => undefined,
    (error: unknown) => {
      console.error("triggerCharges: Fehler", error instanceof Error ? error.name : "Fehler"); // keine Spiel- oder Nutzerdaten ins Log
    },
  );
}

/**
 * Nach dem Anstoß verarbeitet nichts mehr die Zeilen (der Job fasst nur Spiele vor dem Anstoß an). Alle nicht-terminalen Zeilen (pending, requires_action) werden einmal
 * markiert: failure_code after_start + Audit charge.after_start, Status bleibt, nie neu gesendet. Zeilen mit unknown_outcome behalten ihre Markierung. Betriebsrisiko:
 * Halle gebucht, aber nicht (voll) eingezogen; Auflösung per Stripe-Suche bzw. Admin-Sicht folgt mit M3/009 (siehe docs/BETRIEB.md).
 */
export async function markAfterStart(now: Date = new Date()): Promise<number> {
  const rows = await db.execute(sql`
    update payment_charges c set failure_code = ${AFTER_START}, updated_at = ${now}
    from matches m
    where m.id = c.match_id and m.starts_at <= ${now} and c.status in ('pending', 'requires_action')
 and (c.failure_code is null or c.failure_code not in (${UNKNOWN_OUTCOME}, ${AFTER_START}))
    returning c.match_id, c.user_id`);
  const perMatch = new Map<string, number>();
  for (const r of rows.rows as { match_id: string }[]) perMatch.set(r.match_id, (perMatch.get(r.match_id) ?? 0) + 1);
  for (const [matchId, rowsMarked] of perMatch) await audit(null, "charge.after_start", "match", matchId, { after: { rows: rowsMarked } });
  return rows.rows.length;
}

/**
 * Job (5-Minuten-Takt): geht alle Kartenspiele durch, bei denen beide Captains bestätigt haben (noch nicht abgerechnet, vor dem Anstoß), und ruft je Spiel den
 * Auslöser. Das holt zugleich offene Zeilen nach (Netzfehler, Lease abgelaufen). Danach bucht der Nachholer fehlende Stripe-Gebühren. Ein Fehler bei einem Spiel
 * stoppt die anderen nicht. Gibt die Zahl der Spiele zurück, für die in diesem Lauf Zeilen angelegt wurden oder gesendet wurde.
 */
export async function runCardCharges(now: Date = new Date()): Promise<number> {
  let touched = 0;
  if (await cardPaymentsEnabled()) {
    const candidates = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          inArray(matches.kind, ["private", "team"]),
          eq(matches.legacyShareModel, false),
          inArray(matches.status, ["lobby", "confirmed"]),
          sql`${matches.settledAt} is null`,
          sql`${matches.startsAt} > ${now}`,
          // Beide Captains bestätigt (neue Abbuchung) ODER schon offene Zeilen (Nachholen: Netzfehler, abgelaufene Beanspruchung, nie gesendet), auch wenn eine Bestätigung fehlt
          or(and(isNotNull(matches.homeFinalAt), isNotNull(matches.awayFinalAt)), sql`exists (select 1 from payment_charges c where c.match_id = ${matches.id} and c.status in ('pending', 'requires_action'))`),
        ),
      );
    for (const c of candidates) {
      try {
        const r = await runChargesIfDue(c.id, now);
        if (r.created > 0 || r.attempted > 0) touched += 1;
      } catch (error) {
        console.error("runCardCharges: Fehler bei Spiel", c.id, error instanceof Error ? error.name : "Fehler");
      }
    }
  }
  try {
    await markAfterStart(now);
  } catch (error) {
    console.error("runCardCharges: after_start", error instanceof Error ? error.name : "Fehler");
  }
  try {
    await bookOpenFees(); // Nachholer: unabhängig vom Schalter (Gebühren erfolgreicher Abbuchungen fehlen sonst dauerhaft)
  } catch (error) {
    console.error("runCardCharges: Gebühren", error instanceof Error ? error.name : "Fehler");
  }
  return touched;
}
