// "Anteil uebernehmen" (Vertrag 012, M3c-3a, AC-13/AC-14), Variante B: Spieler B uebernimmt den Endanteil des Platzes von Spieler A (A hat noch keine Karte). Der Platz bleibt A's, die Zeile in
// payment_charges bleibt A's (user_id), aber der Anteil wird zur Frist ueber den KUNDEN von B abgebucht (payer_user_id): der PaymentIntent liegt bei B, Erstattungen gehen automatisch auf
// diesen PaymentIntent, also an B. Hier steht nur das Eintragen und Zuruecknehmen der Uebernahme; die Abbuchung laeuft ueber den normalen Weg (charge-run.ts).
//
// Regeln (Entscheide des Nutzers/Orchestrators): ein Platz je Uebernehmer, keine Kette; B nur aus demselben Team wie A, im Privatspiel jeder Eingeteilte; B braucht eine eigene Karte (card_ready);
// moeglich bis zum Ablauf des Countdowns "Lobby schliesst" (keine Abbuchungszeilen, Frist nicht erreicht); Zuruecknehmen durch B bis dahin. Wird A selbst gruen, zahlt A selbst.
// Eine Uebernahme gilt nur, solange B noch eingeteilt UND card_ready ist (sonst verfaellt sie: A bleibt rot, der normale Weg ohne Uebernahme).
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { COVER_MANDATE_KEY } from "@/lib/cover";
import { joinClosedByTime } from "@/lib/deadlines";
import { audit } from "../audit";
import { DomainError } from "../teams";
import type { Tx } from "../tx";
import { cardModeActive, hasChargeRows, leadStart } from "../wallet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_POSSIBLE = "Den Anteil kannst du gerade nicht übernehmen.";

export type CoverSeat = { userId: string; teamId: string | null; cardStatus: string; coveredByUserId: string | null };

/**
 * Gueltige Uebernahmen eines Spiels (Ziel-Platz -> Zahler): Zahler ist noch eingeteilt (team_id gesetzt), hat card_ready und ist nicht selbst uebernommen (keine Kette), und der
 * Ziel-Platz hat KEINE Karte (hat A selbst eine Karte, zahlt A selbst). Reine Funktion ueber die Plaetze des Spiels.
 */
export function validCoversOf(seats: CoverSeat[], teamGame = true): Map<string, string> {
  const by = new Map(seats.map((s) => [s.userId, s]));
  const out = new Map<string, string>();
  for (const s of seats) {
    if (!s.coveredByUserId || s.teamId === null || s.cardStatus === "card_ready") continue;
    const payer = by.get(s.coveredByUserId);
    if (!payer || payer.userId === s.userId || payer.teamId === null || payer.cardStatus !== "card_ready") continue;
    if (teamGame && payer.teamId !== s.teamId) continue; // Teamspiel: nur im selben Team (auch nach einem Teamwechsel nicht mehr gueltig) // keine Kette: ein uebernommener Platz hat keine Karte und kann damit nie selbst Zahler sein
    out.set(s.userId, payer.userId);
  }
  return out;
}

/** Gueltige Uebernahmen eines Spiels, gelesen in der Transaktion des Aufrufers. */
export async function validCovers(tx: Pick<Tx, "select">, matchId: string): Promise<Map<string, string>> {
  const [m] = await tx.select({ kind: matches.kind }).from(matches).where(eq(matches.id, matchId));
  const seats = await tx
    .select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus, coveredByUserId: matchParticipants.coveredByUserId })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));
  return validCoversOf(seats, m?.kind === "team");
}

/** Ist der Countdown "Lobby schliesst" abgelaufen oder sind schon Abbuchungszeilen angelegt? Dann ist keine Uebernahme mehr moeglich. Unter der Spielsperre. */
async function coverClosed(tx: Tx, match: typeof matches.$inferSelect, now: Date): Promise<boolean> {
  if (!["lobby", "confirmed"].includes(match.status) || match.settledAt !== null || match.cancelRequestedAt !== null || match.startsAt.getTime() <= now.getTime()) return true;
  if (await hasChargeRows(tx, match.id)) return true;
  return joinClosedByTime(match.startsAt, await leadStart(tx, match), now, match.createdAt);
}

/** B uebernimmt den Anteil des Platzes von A. Nur fuer den angemeldeten Nutzer selbst (payerId). Jeder Fehler ist eine DomainError ohne Fremddaten. */
export async function takeOverShare(payerId: string, matchId: string, targetUserId: string, mandateAccepted: boolean, now: Date = new Date()): Promise<void> {
  if (typeof matchId !== "string" || !UUID.test(matchId) || typeof targetUserId !== "string" || !UUID.test(targetUserId)) throw new DomainError(NOT_POSSIBLE);
  if (mandateAccepted !== true) throw new DomainError("Bitte bestätige zuerst den Zusatz zum Lastschrift-Mandat.");
  if (payerId === targetUserId) throw new DomainError(NOT_POSSIBLE);
  await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match || !(await cardModeActive(tx, match)) || (await coverClosed(tx, match, now))) throw new DomainError(NOT_POSSIBLE);
    const seats = await tx
      .select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus, coveredByUserId: matchParticipants.coveredByUserId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId))
      .for("update");
    const payer = seats.find((s) => s.userId === payerId);
    const target = seats.find((s) => s.userId === targetUserId);
    if (!payer || !target || payer.teamId === null || target.teamId === null) throw new DomainError(NOT_POSSIBLE);
    if (payer.cardStatus !== "card_ready") throw new DomainError("Zum Übernehmen brauchst du selbst eine hinterlegte Karte.");
    if (["card_ready", "charge_pending", "charged"].includes(target.cardStatus)) throw new DomainError(NOT_POSSIBLE); // nur ein roter Platz (ohne Karte oder Abbuchung fehlgeschlagen)
    if (match.kind === "team" && payer.teamId !== target.teamId) throw new DomainError(NOT_POSSIBLE); // im Teamspiel nur aus demselben Team
    const valid = validCoversOf(seats, match.kind === "team");
    if (valid.has(targetUserId)) throw new DomainError("Dieser Anteil ist schon übernommen.");
    if ([...valid.values()].includes(payerId)) throw new DomainError("Du übernimmst in diesem Spiel schon einen Anteil."); // ein Platz je Uebernehmer
    // veraltete (nicht mehr gueltige) Uebernahmen dieses Zahlers aufraeumen, damit der eindeutige Index nicht blockiert
    await tx.update(matchParticipants).set({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.coveredByUserId, payerId)));
    await tx.update(matchParticipants).set({ coveredByUserId: payerId, coverMandateText: COVER_MANDATE_KEY, coverAcceptedAt: now }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, targetUserId)));
    await audit(payerId, "cover.taken", "match", matchId, { after: { targetUserId } }, tx);
  });
}

/** B nimmt seine Uebernahme zurueck (bis zum Ablauf des Countdowns). A faellt dann auf rot zurueck. */
export async function releaseCover(payerId: string, matchId: string, now: Date = new Date()): Promise<void> {
  if (typeof matchId !== "string" || !UUID.test(matchId)) throw new DomainError(NOT_POSSIBLE);
  await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match || (await coverClosed(tx, match, now))) throw new DomainError("Die Übernahme kann nicht mehr zurückgenommen werden.");
    const released = await tx
      .update(matchParticipants)
      .set({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null })
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.coveredByUserId, payerId)))
      .returning({ userId: matchParticipants.userId });
    if (released.length === 0) throw new DomainError("Du übernimmst in diesem Spiel keinen Anteil.");
    await audit(payerId, "cover.released", "match", matchId, { after: { targetUserId: released[0].userId } }, tx);
  });
}
