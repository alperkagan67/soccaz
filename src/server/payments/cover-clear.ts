// "Anteil uebernehmen" (M3c-3a, Review-Fund 2): Die Einwilligung gilt nur fuer diese Konstellation. Verlaesst oder verliert A oder B den Platz (Austritt, Rauswurf, Ersatz, Rueck-
// nahme der Einteilung, neue Einteilung), wird die Uebernahme GELOESCHT; ein Wiedereintritt braucht eine neue Zustimmung. Eigene kleine Datei ohne weitere Importe (kein Zyklus mit wallet/lobby).
import { and, eq, or } from "drizzle-orm";
import { matchParticipants } from "@/db/schema";
import type { Tx } from "../tx";

/** Loescht jede Uebernahme, an der der Nutzer beteiligt ist (als Platz oder als Uebernehmer). Laeuft in der Transaktion des Aufrufers, unter der Spielsperre. */
export async function clearCoversInvolving(tx: Pick<Tx, "update">, matchId: string, userId: string): Promise<void> {
  await tx
    .update(matchParticipants)
    .set({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null })
    .where(and(eq(matchParticipants.matchId, matchId), or(eq(matchParticipants.userId, userId), eq(matchParticipants.coveredByUserId, userId))));
}
