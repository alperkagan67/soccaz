import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges, paymentProfiles, type CardStatus } from "@/db/schema";
import { cardDisplayFor, type Audience, type CardDisplay } from "@/lib/card-visibility";

// Der Typ gehört dem Schema (eine Quelle); hier nur zum Weiterreichen für bestehende Importe
export type { CardStatus };

/**
 * Kartenstatus je Platz FÜR EINEN BETRACHTER (Vertrag 012, AC-12/AC-20): die Sichtbarkeit wird hier auf dem Server entschieden. Der Aufrufer sagt nur, welche
 * Rolle der Betrachter zu jedem Platz hat; Gäste bekommen keinen Eintrag, Mitspieler nur die neutrale Anzeige, nur der Betroffene und der Captain/Veranstalter
 * den echten Status samt Grund. Der Rohstatus und der Fehlercode verlassen diese Funktion nie in Richtung Seite oder Client.
 */
export async function getCardDisplays(matchId: string, audienceOf: (p: { userId: string; teamId: string | null }) => Audience): Promise<Record<string, CardDisplay>> {
  const rows = await db
    .select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus, failureCode: paymentCharges.failureCode })
    .from(matchParticipants)
    .leftJoin(paymentCharges, and(eq(paymentCharges.matchId, matchParticipants.matchId), eq(paymentCharges.userId, matchParticipants.userId)))
    .where(eq(matchParticipants.matchId, matchId));
  const out: Record<string, CardDisplay> = {};
  for (const r of rows) {
    const d = cardDisplayFor(audienceOf({ userId: r.userId, teamId: r.teamId }), r.cardStatus, r.failureCode);
    if (d) out[r.userId] = d;
  }
  return out;
}

/** Nur Anzeigedaten der gespeicherten Karte des Nutzers (Marke, letzte vier Ziffern), sonst null. Nie die Zahlungsmittel-ID. */
export async function getStoredCardDisplay(userId: string): Promise<{ brand: string | null; last4: string } | null> {
  const [p] = await db.select({ brand: paymentProfiles.cardBrand, last4: paymentProfiles.cardLast4, pm: paymentProfiles.paymentMethodId }).from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  return p?.pm && p.last4 ? { brand: p.brand, last4: p.last4 } : null;
}
