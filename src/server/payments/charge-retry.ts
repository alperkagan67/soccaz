// Nachzahlen im Fenster (Vertrag 012, M3c-1, AC-7): Nach "Karte aendern" (Platz wieder card_ready) bekommt eine fehlgeschlagene Abbuchung INNERHALB des
// Fensters einen NEUEN Versuch: neuer Idempotenzschluessel (charge:<m>:<u>:<n>) und neuer PaymentIntent. Phasen, Netz nie in einer Datenbanktransaktion:
//  1  (Netz)  Die BEKANNTEN PaymentIntents (laufender + Historie) per retrieve lesen (konsistent, keine Suche): succeeded => verbuchen statt neu senden;
//             processing => Runde auslassen; offene werden abgebrochen (nie zwei offene Versuche). Scheitert das, wird diese Runde ausgelassen.
//  2  (Tx)    Spiel FOR SHARE, Zeile FOR UPDATE, Platz FOR UPDATE (Spiel -> Zeile -> Platz), alle Bedingungen erneut pruefen (Compare-and-set auf
//             current_attempt), den abgeschlossenen Versuch in die Historie schreiben und die Zeile auf einen frischen pending-Versuch zuruecksetzen.
//  3  (Netz)  den neuen Versuch sendet derselbe Weg wie der erste (runCharges: Beanspruchen mit Lease, Senden, Verbuchen ueber applyChargeInTx).
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { inGraceWindow, NON_CARD_CODES } from "@/lib/grace";
import { db } from "@/db";
import {
  matchParticipants,
  matches,
  paymentChargeAttempts,
  paymentCharges,
} from "@/db/schema";
import { audit } from "../audit";
import { cardModeActive } from "../wallet";
import { applyChargeInTx, bookChargeFee } from "./charge";
import { chargeKey, runCharges } from "./charge-run";
import { getPaymentProvider, type FoundIntent } from "./provider";

export type Candidate = {
  id: string;
  matchId: string;
  userId: string;
  attempt: number;
  amountCents: number;
};

/** Verbucht einen bei Stripe gefundenen erfolgreichen PaymentIntent ueber den normalen Weg (derselbe wie der Webhook). */
async function bookFound(c: Candidate, f: FoundIntent): Promise<void> {
  await db.transaction((tx) =>
    applyChargeInTx(tx, {
      outcome: "succeeded",
      paymentIntentId: f.id,
      amountCents: f.amountCents,
      currency: f.currency,
      customerId: f.customerId,
      metadata: { matchId: c.matchId, userId: c.userId },
      failureCode: null,
    }),
  );
  try {
    await bookChargeFee(f.id);
  } catch {
    /* nichts loggen; der Nachholer bucht die Gebuehr spaeter */
  }
}

/**
 * Phase 2: schreibt den abgeschlossenen Versuch in die Historie und setzt die Zeile auf einen frischen pending-Versuch zurueck. Compare-and-set auf current_attempt
 * (`c.attempt`) unter Spiel- (SHARE) und Zeilensperre, alle Bedingungen werden in der Transaktion erneut geprueft. Liefert false, wenn nichts zu tun ist.
 */
export async function rotateAttempt(c: Candidate, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [game] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, c.matchId))
      .for("share");
    if (
      !game ||
      !["lobby", "confirmed"].includes(game.status) ||
      game.settledAt !== null ||
      game.cancelRequestedAt !== null ||
      game.startsAt.getTime() <= now.getTime()
    )
      return false;
    if (!(await cardModeActive(tx, game))) return false;
    const [row] = await tx
      .select()
      .from(paymentCharges)
      .where(eq(paymentCharges.id, c.id))
      .for("update");
    if (
      !row ||
      !["failed", "requires_action"].includes(row.status) ||
      row.currentAttempt !== c.attempt
    )
      return false;
    if (!inGraceWindow(row.graceUntil, game.startsAt, now)) return false; // effektives Ende, Altzeilen (null) nie
    if (NON_CARD_CODES.includes(row.failureCode ?? "") || row.slotOf !== null || row.resolution !== null) return false;
    // WESSEN Karte: bei einer Uebernahme (Variante B) die des ZAHLERS (payer_user_id), sonst die des Spielers. Zuerst der Platz des Zahlers (Sperrreihenfolge: nie umgekehrt), dann der des Spielers.
    const payerId = row.payerUserId ?? c.userId;
    const [seat] = await tx
      .select({ cardStatus: matchParticipants.cardStatus, teamId: matchParticipants.teamId })
      .from(matchParticipants)
      .where(and(eq(matchParticipants.matchId, c.matchId), eq(matchParticipants.userId, payerId)))
      .for("update");
    if (!seat || seat.teamId === null || seat.cardStatus !== "card_ready") return false;

    await tx.insert(paymentChargeAttempts).values({
      chargeId: row.id,
      attemptNo: row.currentAttempt,
      idempotencyKey: row.idempotencyKey,
      paymentIntentId: row.paymentIntentId,
      status: row.status,
      failureCode: row.failureCode,
      attemptStartedAt: row.attemptStartedAt,
    });
    const next = row.currentAttempt + 1;
    await tx
      .update(paymentCharges)
      .set({
        status: "pending",
        paymentIntentId: null,
        idempotencyKey: `${chargeKey(c.matchId, c.userId)}:${next}`,
        failureCode: null,
        attemptStartedAt: null,
        currentAttempt: next,
        updatedAt: now,
      })
      .where(eq(paymentCharges.id, row.id));
    await tx
      .update(matchParticipants)
      .set({ cardStatus: "charge_pending" })
      .where(
        and(
          eq(matchParticipants.matchId, c.matchId),
          eq(matchParticipants.userId, c.userId),
        ),
      );
    await audit(
      null,
      "charge.retry",
      "match",
      c.matchId,
      { after: { userId: c.userId, attempt: next } },
      tx,
    );
    return true;
  });
}

/**
 * Bedingungen, unter denen eine fehlgeschlagene Abbuchung im Fenster neu versucht werden darf (Kandidatenliste UND erneute Pruefung vor jedem Netzaufruf):
 * Kartenfehler, laufendes effektives Fenster, Platz card_ready, Spiel offen. Altzeilen (grace_until NULL) sind AUSGESCHLOSSEN: least() ignoriert NULL in Postgres, darum
 * ausdruecklich isNotNull (Review-Fix 2).
 */
function eligibleFilters(now: Date) {
  return [
    inArray(paymentCharges.status, ["failed", "requires_action"]),
    isNotNull(paymentCharges.graceUntil),
    isNull(paymentCharges.slotOf), // Nachruecker-Zeilen werden nie nachgezahlt (sofort gescheitert)
    isNull(paymentCharges.resolution), // ersetzte Plaetze nie
    sql`least(${paymentCharges.graceUntil}, ${matches.startsAt} - interval '1 hour') > ${now}`, // effektives Ende: nie nach Anstoss minus 1 h (Punkt 7)
    eq(matchParticipants.cardStatus, "card_ready"),
    inArray(matches.status, ["lobby", "confirmed"]),
    isNull(matches.cancelRequestedAt),
    isNull(matches.settledAt),
    gt(matches.startsAt, now),
    sql`(${paymentCharges.failureCode} is null or ${paymentCharges.failureCode} not in (${sql.join(
      NON_CARD_CODES.map((c) => sql`${c}`),
      sql`, `,
    )}))`, // nur Kartenfehler (Punkt 6)
  ];
}

const eligibleFrom = () =>
  db
    .select({
      id: paymentCharges.id,
      matchId: paymentCharges.matchId,
      userId: paymentCharges.userId,
      attempt: paymentCharges.currentAttempt,
      amountCents: paymentCharges.amountCents,
      currentPi: paymentCharges.paymentIntentId,
    })
    .from(paymentCharges)
    // der Platz des ZAHLERS entscheidet (Variante B): coalesce(payer_user_id, user_id)
    .innerJoin(matchParticipants, and(eq(matchParticipants.matchId, paymentCharges.matchId), eq(matchParticipants.userId, sql`coalesce(${paymentCharges.payerUserId}, ${paymentCharges.userId})`)))
    .innerJoin(matches, eq(matches.id, paymentCharges.matchId));

/**
 * Phase 1 (Netz) fuer EINEN Kandidaten. Vor dem ersten Netzaufruf wird frisch gelesen, ob die Zeile NOCH berechtigt ist UND noch zu `c.attempt` gehoert (Review-Fix
 * 3/4): sonst wuerde ein veralteter Lauf den PaymentIntent eines inzwischen gestarteten neueren Versuchs abbrechen (3-D-Secure tot) oder einen PaymentIntent abbrechen,
 * obwohl die Zeile gar nicht mehr gedreht werden darf. Bekannter Restfall: zwischen dieser Pruefung und rotateAttempt kann sich der Zustand noch aendern (Millisekunden);
 * dann bleibt die Zeile requires_action mit abgebrochenem PaymentIntent, und der naechste Lauf klaert es (Fenster) bzw. die Zeile laeuft in M3c-2 aus.
 * Liefert "booked" (Erfolg bei Stripe gefunden und verbucht), "skip" (Runde auslassen) oder "go" (neuer Versuch darf angelegt werden).
 */
export async function inspectKnownAttempts(c: Candidate, now: Date): Promise<"booked" | "skip" | "go"> {
  const [cur] = await eligibleFrom().where(and(...eligibleFilters(now), eq(paymentCharges.id, c.id), eq(paymentCharges.currentAttempt, c.attempt)));
  if (!cur) return "skip";
  return reconcileKnownIntents(c, cur.currentPi);
}

/**
 * Prueft ALLE bekannten PaymentIntents einer Abbuchung (laufender + Historie) per retrieve: succeeded => verbuchen ("booked"); processing => "skip"; offene werden abgebrochen
 * (nie zwei offene Versuche, und ein ersetzter Platz laesst keinen bestaetigbaren PaymentIntent zurueck); Netzfehler => "skip". Sonst "go". Wird vom Wiederabbuchen UND vom
 * Freigeben eines Platzes (substitute.ts) benutzt. Netz, nie in einer Transaktion.
 */
export async function reconcileKnownIntents(c: Candidate, currentPi: string | null): Promise<"booked" | "skip" | "go"> {
  const provider = await getPaymentProvider();
  try {
    const hist = await db.select({ pi: paymentChargeAttempts.paymentIntentId }).from(paymentChargeAttempts).where(eq(paymentChargeAttempts.chargeId, c.id));
    const known = [...new Set([currentPi, ...hist.map((h) => h.pi)].filter((x): x is string => typeof x === "string"))];
    for (const id of known) {
      const f = await provider.retrievePaymentIntent(id);
      if (f === null) continue; // bei Stripe nicht vorhanden
      if (f.status === "succeeded") {
        await bookFound(c, f);
        return "booked";
      }
      if (f.status === "processing") return "skip"; // Ausgang noch offen: Runde auslassen, nie parallel einen zweiten Versuch starten
      const res = await provider.cancelPaymentIntent(f.id);
      if (res.status === "succeeded") {
        await bookFound(c, { ...f, status: "succeeded" });
        return "booked";
      }
      if (res.status === "other") return "skip";
    }
  } catch {
    return "skip"; // Netzfehler: diese Runde auslassen, nie blind neu senden
  }
  return "go";
}

/**
 * Startet neue Versuche fuer alle fehlgeschlagenen Abbuchungen im Fenster, deren Platz wieder card_ready ist. Optional eingegrenzt auf einen Nutzer oder ein
 * Spiel. Liefert die Zahl der neu angelegten Versuche. Wiederholbar und parallel sicher. Ausloeser: Webhook 'Karte aendern' (sofort) UND der Job card-charges
 * (runCardCharges, alle 5 Minuten; holt Fehlschlaege des Webhook-Pfads nach).
 */
export async function retryChargesInWindow(opts: { userId?: string; matchId?: string; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const filters = eligibleFilters(now);
  // ein Nutzer, der "Karte aendern" gemacht hat: seine eigenen Zeilen UND die Zeilen, die er als Zahler uebernommen hat
  if (opts.userId) filters.push(sql`coalesce(${paymentCharges.payerUserId}, ${paymentCharges.userId}) = ${opts.userId}`);
  if (opts.matchId) filters.push(eq(paymentCharges.matchId, opts.matchId));
  const candidates: Candidate[] = (await eligibleFrom().where(and(...filters)).orderBy(asc(paymentCharges.createdAt), asc(paymentCharges.id))).map((r) => ({
    id: r.id,
    matchId: r.matchId,
    userId: r.userId,
    attempt: r.attempt,
    amountCents: r.amountCents,
  }));

  let started = 0;
  const toSend = new Set<string>();
  for (const c of candidates) {
    // Ein Fehler bei EINER Zeile (Datenbankfehler, Lock-Timeout) stoppt die anderen nicht; der naechste Lauf holt sie nach
    try {
      if ((await inspectKnownAttempts(c, now)) !== "go") continue;
      // Phase 2 (Tx): Compare-and-set auf current_attempt
      if (await rotateAttempt(c, now)) {
        started += 1;
        toSend.add(c.matchId);
      }
    } catch (error) {
      console.error("retryChargesInWindow: Fehler bei Zeile", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }

  // Phase 3 (Netz): die neuen pending-Versuche gehen den normalen Weg (Beanspruchen mit Lease, Senden, Verbuchen); auch hier isoliert je Spiel
  for (const matchId of toSend) {
    try {
      await runCharges(matchId, now);
    } catch (error) {
      console.error("retryChargesInWindow: Senden fehlgeschlagen", matchId, error instanceof Error ? error.name : "Fehler");
    }
  }
  return started;
}
