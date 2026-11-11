import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles, paymentSetupIntents, users } from "@/db/schema";
import { DomainError } from "../teams";
import { cardModeActive } from "../wallet";
import { BUSY_MESSAGE, MANDATE_TEXT, SETUP_LIMIT_PER_HOUR } from "./card-setup";
import { getPaymentProvider } from "./provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Die gespeicherte Karte ist nicht (mehr) nutzbar: der Nutzer hinterlegt eine neue (createCardSetup). */
export class StoredCardInvalidError extends DomainError {
  constructor(message = "Bitte Karte neu hinterlegen.") {
    super(message);
    this.name = "StoredCardInvalidError";
  }
}

/** Schlüssel der Mandats-Zeile je Platz: genau eine je Spieler und Spiel (macht den zweiten Aufruf zu einem No-op). */
export const storedMandateId = (matchId: string, userId: string) => `stored:${matchId}:${userId}`;

/**
 * Entscheid B (Vertrag 012, M1c): Der Nutzer setzt für SEINEN Platz in DIESER Lobby ausdrücklich das Mandat mit seiner schon gespeicherten Karte.
 * - Nur im Kartenmodell (cardModeActive: Schalter EIN, Frist-Regel-Spiel, kein bezahlter Platz) und nur für den eigenen Platz (userId aus der Sitzung).
 * - Die Karte wird bei Stripe geprüft (gehört noch zum Kunden, nicht abgelaufen), BEVOR die kurze Transaktion beginnt (kein Netzaufruf unter Sperre).
 *   Ist sie nicht nutzbar: StoredCardInvalidError, der Platz bleibt auf none, der Nutzer geht den Weg über createCardSetup.
 * - Mandatstext (Konstante aus M1a) und Zeitpunkt werden je Platz als payment_setup_intents-Zeile gespeichert (Status succeeded, id stored:<Spiel>:<Nutzer>),
 *   ohne Migration. Dann card_status = card_ready. Kein neues SetupIntent, keine Buchung, kein Ledger.
 * - Rate-Limit wie createCardSetup und nie blockierend (pg_try_advisory_xact_lock mit demselben Schlüssel). Idempotent: ein zweiter Aufruf ändert nichts.
 */
export async function applyStoredCard(userId: string, matchId: string): Promise<{ alreadyReady: boolean }> {
  if (typeof matchId !== "string" || !UUID.test(matchId)) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
  const [user] = await db.select({ id: users.id, bannedAt: users.bannedAt }).from(users).where(eq(users.id, userId));
  if (!user || user.bannedAt) throw new DomainError("Nutzer nicht gefunden.");

  // Vorprüfung ohne Sperre: eigener Platz, Spiel offen, Karte vorhanden
  const [seat] = await db
    .select({ status: matches.status, startsAt: matches.startsAt, cardStatus: matchParticipants.cardStatus })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
  if (!seat) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
  if (!["lobby", "confirmed"].includes(seat.status) || seat.startsAt.getTime() <= Date.now()) throw new DomainError("Dieses Spiel ist nicht mehr offen.");
  if (seat.cardStatus === "card_ready") return { alreadyReady: true };
  const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  if (!profile?.paymentMethodId) throw new StoredCardInvalidError("Du hast noch keine Karte hinterlegt. Bitte hinterlege eine Karte.");

  // Netzaufruf außerhalb der Transaktion
  const checkedMethod = profile.paymentMethodId;
  const provider = await getPaymentProvider();
  let usable = false;
  try {
    usable = await provider.isPaymentMethodUsable(checkedMethod, profile.stripeCustomerId);
  } catch {
    usable = false; // Stripe nicht erreichbar oder Karte unbekannt: nicht als bereit werten
  }
  if (!usable) throw new StoredCardInvalidError();

  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '2s'`);
    const [lock] = (await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${"card-setup:" + userId}, 0)) as ok`)).rows as { ok: boolean }[];
    if (!lock.ok) throw new DomainError(BUSY_MESSAGE);

    // Spiel kurz sperren (wie mutateLobby), dann Modus und Platz in dieser Transaktion lesen
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match || !["lobby", "confirmed"].includes(match.status) || match.startsAt.getTime() <= Date.now()) throw new DomainError("Dieses Spiel ist nicht mehr offen.");
    if (!(await cardModeActive(tx, match))) throw new DomainError("In diesem Spiel wird nicht per Karte bezahlt.");
    const [mine] = await tx
      .select({ cardStatus: matchParticipants.cardStatus })
      .from(matchParticipants)
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)))
      .for("update");
    if (!mine) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
    if (mine.cardStatus === "card_ready") return { alreadyReady: true };

    // Die Karte darf sich seit der Prüfung nicht geändert haben
    const [current] = await tx.select({ paymentMethodId: paymentProfiles.paymentMethodId }).from(paymentProfiles).where(eq(paymentProfiles.userId, userId)).for("share");
    if (current?.paymentMethodId !== checkedMethod) throw new DomainError("Deine Karte hat sich geändert. Bitte versuche es noch einmal.");

    const [recent] = await tx
      .select({ n: count() })
      .from(paymentSetupIntents)
      .where(and(eq(paymentSetupIntents.userId, userId), gt(paymentSetupIntents.createdAt, new Date(Date.now() - 3_600_000))));
    if (recent.n >= SETUP_LIMIT_PER_HOUR) throw new DomainError("Zu viele Versuche. Bitte warte etwas und versuche es später noch einmal.");

    await tx
      .insert(paymentSetupIntents)
      .values({ id: storedMandateId(matchId, userId), userId, matchId, status: "succeeded", mandateText: MANDATE_TEXT, mandateAcceptedAt: new Date() })
      .onConflictDoNothing();
    await tx.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
    return { alreadyReady: false };
  });
}
