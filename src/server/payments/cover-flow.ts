// "Anteil übernehmen" (Vertrag 012, M3c-3b): Eintragen/Zurücknehmen MIT Benachrichtigung. Die Empfänger der Nachricht kommen nur aus dem, was die Domäne tatsächlich getan hat
// (Security-Review R-T181: ein vom Client mitgeschickter Platz darf nie zum Empfänger werden, sonst könnte jeder Übernehmer beliebigen Nutzern Nachrichten mit Namen schicken).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { chargeAmount } from "./charge-run";
import { releaseCover, takeOverShare } from "./cover";
import { notifyCoverReleased, notifyCoverTaken } from "./cover-notify";

/** B übernimmt den Anteil von A (die Domäne prüft Zugehörigkeit, Karte, Frist und Einwilligung); danach Nachricht an A, B und die Captains dieses Platzes. */
export async function takeOverAndNotify(payerId: string, matchId: string, targetUserId: string, consent: boolean): Promise<void> {
  await takeOverShare(payerId, matchId, targetUserId, consent === true); // wirft bei jedem Fehler, dann keine Nachricht
  const [m] = await db.select({ price: matches.priceCents, final: matches.finalShareCents }).from(matches).where(eq(matches.id, matchId));
  await notifyCoverTaken(matchId, payerId, targetUserId, m ? chargeAmount(m.price, m.final) : null);
}

/** B nimmt seine eigene Übernahme zurück: Nachricht nur an den Platz, den releaseCover zurückgibt (nie an einen Client-Wert), und an dessen Captains. */
export async function releaseOwnCover(payerId: string, matchId: string): Promise<string> {
  const targetUserId = await releaseCover(payerId, matchId);
  await notifyCoverReleased(matchId, payerId, targetUserId);
  return targetUserId;
}
