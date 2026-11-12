import { randomUUID } from "node:crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles, paymentSetupIntents, users } from "@/db/schema";
import { DomainError } from "../teams";
import { cardPaymentsEnabled } from "../settings";
import { getPaymentProvider } from "./provider";

/** Der Text, dem der Spieler beim Hinterlegen der Karte zustimmt (Mandat). Wird mit dem Zeitpunkt je SetupIntent gespeichert. */
export const MANDATE_TEXT =
  "Ich erlaube Soccaz, meine hinterlegte Karte für meinen Anteil an den Spielen, für die ich mich anmelde, zu belasten. Abgebucht wird erst, wenn der Anteil feststeht (48 Stunden vor Anstoß, bei kürzerem Vorlauf sofort). Bis dahin wird nichts abgebucht.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zeitüberschreitung beim Warten auf eine Zeilensperre (lock_timeout, SQLSTATE 55P03), auch wenn der Treiber den Fehler einpackt. */
export function isLockTimeout(error: unknown): boolean {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) if (e.code === "55P03") return true;
  return false;
}

export const BUSY_MESSAGE = "Bitte einen Moment warten, deine Karte wird gerade eingerichtet.";

/** Höchstens so viele Karten-Einrichtungen je Nutzer und Stunde (Schutz vor Missbrauch der Stripe-Schnittstelle). */
export const SETUP_LIMIT_PER_HOUR = 10;

/**
 * Startet das Hinterlegen einer Karte für den Nutzer SELBST (die Nutzer-ID kommt aus der Sitzung, nie aus der Eingabe).
 * Optional für den eigenen Platz in einem Spiel (matchId): dann wird nach Erfolg dieser Platz auf card_ready gesetzt.
 * Es wird nichts abgebucht und nichts im Hauptbuch gebucht. Liefert das clientSecret für Stripe Elements (nur an den Nutzer).
 */
export async function createCardSetup(userId: string, input: { matchId?: string; mandateAccepted: boolean }): Promise<{ setupIntentId: string; clientSecret: string }> {
  if (input.mandateAccepted !== true) throw new DomainError("Bitte stimme der Kartenzahlung zu.");
  // Serverseitig, nicht nur in der Oberfläche: bei ausgeschaltetem Kartenmodell wird weder ein Stripe-Kunde noch ein SetupIntent angelegt (mit und ohne Spiel)
  if (!(await cardPaymentsEnabled())) throw new DomainError("Die Kartenzahlung ist gerade nicht verfügbar.");

  const [user] = await db.select({ id: users.id, email: users.email, bannedAt: users.bannedAt }).from(users).where(eq(users.id, userId));
  if (!user || user.bannedAt) throw new DomainError("Nutzer nicht gefunden.");

  if (input.matchId !== undefined && !UUID.test(input.matchId)) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
  if (input.matchId !== undefined) {
    const [seat] = await db
      .select({ status: matches.status })
      .from(matchParticipants)
      .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
      .where(and(eq(matchParticipants.matchId, input.matchId), eq(matchParticipants.userId, userId)));
    if (!seat) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
    if (!["lobby", "confirmed"].includes(seat.status)) throw new DomainError("Dieses Spiel ist nicht mehr offen.");
  }

  const provider = await getPaymentProvider();
  // Je Nutzer serialisiert (Advisory-Lock bis zum Ende der Transaktion): Begrenzung prüfen und Zeile einfügen sind ein Schritt, und der Stripe-Kunde wird
  // unter derselben Sperre höchstens einmal angelegt (der Idempotenzschlüssel bei Stripe verfällt nach 24 Stunden und wäre allein kein Schutz).
  const intent = await db.transaction(async (tx) => {
    // Nie warten: eine blockierende Sperre würde unter langsamem Stripe je wartendem Aufruf eine Datenbankverbindung binden und den Pool der App erschöpfen.
    await tx.execute(sql`set local lock_timeout = '2s'`); // Sicherheitsnetz
    const [lock] = (await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${"card-setup:" + userId}, 0)) as ok`)).rows as { ok: boolean }[];
    if (!lock.ok) throw new DomainError(BUSY_MESSAGE);
    // Nach dem Lock NOCH EINMAL pruefen (Review M4b-1, Fund 3): eine Kontoloeschung (hält denselben Lock) kann zwischen dem Lesen oben und hier fertig geworden sein; dann waere der Nutzer
    // anonymisiert und gesperrt, und ein neuer Stripe-Kunde mit der alten E-Mail waere ein Datenschutzfehler.
    const [still] = await tx.select({ bannedAt: users.bannedAt }).from(users).where(eq(users.id, userId));
    if (!still || still.bannedAt) throw new DomainError("Nutzer nicht gefunden.");
    const [recent] = await tx
      .select({ n: count() })
      .from(paymentSetupIntents)
      .where(and(eq(paymentSetupIntents.userId, userId), gt(paymentSetupIntents.createdAt, new Date(Date.now() - 3_600_000))));
    if (recent.n >= SETUP_LIMIT_PER_HOUR) throw new DomainError("Zu viele Versuche. Bitte warte etwas und versuche es später noch einmal.");

    let [profile] = await tx.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
    if (!profile) {
      const customer = await provider.createCustomer({ userId, email: user.email, idempotencyKey: `customer:${userId}` });
      [profile] = await tx.insert(paymentProfiles).values({ userId, stripeCustomerId: customer.id }).returning();
    }
    const created = await provider.createSetupIntent({ customerId: profile.stripeCustomerId, userId, idempotencyKey: `setup:${userId}:${randomUUID()}` });
    await tx.insert(paymentSetupIntents).values({ id: created.id, userId, matchId: input.matchId ?? null, mandateText: MANDATE_TEXT, mandateAcceptedAt: new Date() });
    return created;
  });
  return { setupIntentId: intent.id, clientSecret: intent.clientSecret };
}

