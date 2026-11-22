import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles, type CardStatus } from "@/db/schema";
import { effectiveGraceEnd } from "@/lib/grace";
import { cardDisplayFor, type Audience, type CardDisplay } from "@/lib/card-visibility";
import { cardView } from "@/lib/card-view";
import { validCoversOf } from "./cover";

// Der Typ gehört dem Schema (eine Quelle); hier nur zum Weiterreichen für bestehende Importe
export type { CardStatus };

/**
 * Kartenstatus je Platz FÜR EINEN BETRACHTER (Vertrag 012, AC-12/AC-20): die Sichtbarkeit wird hier auf dem Server entschieden. Der Aufrufer sagt nur, welche
 * Rolle der Betrachter zu jedem Platz hat; Gäste bekommen keinen Eintrag, Mitspieler nur die neutrale Anzeige, nur der Betroffene und der Captain/Veranstalter
 * den echten Status samt Grund. Der Rohstatus und der Fehlercode verlassen diese Funktion nie in Richtung Seite oder Client.
 */
export async function getCardDisplays(matchId: string, audienceOf: (p: { userId: string; teamId: string | null }) => Audience): Promise<Record<string, CardDisplay>> {
  const rows = await db
    .select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus, coveredBy: matchParticipants.coveredByUserId, payer: paymentCharges.payerUserId, failureCode: paymentCharges.failureCode, chargeStatus: paymentCharges.status, chargePi: paymentCharges.paymentIntentId, graceUntil: paymentCharges.graceUntil, startsAt: matches.startsAt, matchStatus: matches.status, matchKind: matches.kind, cancelRequestedAt: matches.cancelRequestedAt, settledAt: matches.settledAt })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .leftJoin(paymentCharges, and(eq(paymentCharges.matchId, matchParticipants.matchId), eq(paymentCharges.userId, matchParticipants.userId)))
    .where(eq(matchParticipants.matchId, matchId));
  const out: Record<string, CardDisplay> = {};
  const valid = validCoversOf(rows.map((r) => ({ userId: r.userId, teamId: r.teamId, cardStatus: r.cardStatus, coveredByUserId: r.coveredBy })), rows[0]?.matchKind === "team");
  for (const r of rows) {
    const end = effectiveGraceEnd(r.graceUntil, r.startsAt);
    // dieselben Bedingungen wie der Server (authorize.ts openRow): offenes Spiel, keine angeforderte Absage, nicht abgerechnet, PaymentIntent vorhanden, Anstoss in der Zukunft
    const awaiting =
      r.payer === null && // Zeile mit Zahler (Variante B): die Freigabe gehoert dem Zahler, nicht dem Platz
      r.chargeStatus === "requires_action" &&
      r.failureCode === "authentication_required" &&
      !!r.chargePi &&
      ["lobby", "confirmed"].includes(r.matchStatus) &&
      r.cancelRequestedAt === null &&
      r.settledAt === null &&
      r.startsAt.getTime() > Date.now() &&
      end !== null &&
      end.getTime() > Date.now();
    // Anteil uebernommen (Variante B): vor der Abbuchung gedeckt (gueltige Uebernahme, noch keine Zeile); danach zaehlt die Zeile mit Zahler: gescheitert => wieder rot, sonst normal
    const cover = r.payer !== null ? (r.cardStatus === "failed" ? ("failed" as const) : null) : r.chargeStatus === null && valid.has(r.userId) ? ("active" as const) : null;
    const d = cardDisplayFor(audienceOf({ userId: r.userId, teamId: r.teamId }), r.cardStatus, r.failureCode, end, awaiting, cover);
    if (d) out[r.userId] = d;
  }
  return out;
}

/**
 * Hat in jedem Team jeder eingeteilte Platz eine Karte (oder ist schon abgebucht)? Aus dem ROHSTATUS auf dem Server, nur Ja/Nein je Team: unabhängig
 * davon, was der Betrachter je Person sehen darf. Ein leeres Team ist nicht vollständig.
 */
export async function getTeamCardsReady(matchId: string): Promise<Record<string, boolean>> {
  const rows = await db.select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus, coveredBy: matchParticipants.coveredByUserId }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  const [m] = await db.select({ kind: matches.kind }).from(matches).where(eq(matches.id, matchId));
  const valid = validCoversOf(rows.map((r) => ({ userId: r.userId, teamId: r.teamId, cardStatus: r.cardStatus, coveredByUserId: r.coveredBy })), m?.kind === "team");
  const out: Record<string, boolean> = {};
  for (const r of rows) {
    if (r.teamId === null) continue;
    out[r.teamId] = (out[r.teamId] ?? true) && (cardView(r.cardStatus).hasCard || valid.has(r.userId)); // gueltig uebernommene Plaetze zaehlen als gedeckt
  }
  return out;
}

/** Nur Anzeigedaten der gespeicherten Karte des Nutzers (Marke, letzte vier Ziffern), sonst null. Nie die Zahlungsmittel-ID. */
export async function getStoredCardDisplay(userId: string): Promise<{ brand: string | null; last4: string } | null> {
  const [p] = await db.select({ brand: paymentProfiles.cardBrand, last4: paymentProfiles.cardLast4, pm: paymentProfiles.paymentMethodId }).from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  return p?.pm && p.last4 ? { brand: p.brand, last4: p.last4 } : null;
}
