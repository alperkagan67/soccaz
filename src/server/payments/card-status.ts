import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentProfiles, type CardStatus } from "@/db/schema";

// Der Typ gehört dem Schema (eine Quelle); hier nur zum Weiterreichen für bestehende Importe
export type { CardStatus };

/** Kartenstatus aller Plätze eines Spiels (nur Anzeige: kein Kartenwert, nur ob eine Karte hinterlegt ist). */
export async function getCardStatuses(matchId: string): Promise<Record<string, CardStatus>> {
  const rows = await db.select({ userId: matchParticipants.userId, cardStatus: matchParticipants.cardStatus }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  return Object.fromEntries(rows.map((r) => [r.userId, r.cardStatus]));
}

/** Nur Anzeigedaten der gespeicherten Karte des Nutzers (Marke, letzte vier Ziffern), sonst null. Nie die Zahlungsmittel-ID. */
export async function getStoredCardDisplay(userId: string): Promise<{ brand: string | null; last4: string } | null> {
  const [p] = await db.select({ brand: paymentProfiles.cardBrand, last4: paymentProfiles.cardLast4, pm: paymentProfiles.paymentMethodId }).from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  return p?.pm && p.last4 ? { brand: p.brand, last4: p.last4 } : null;
}
