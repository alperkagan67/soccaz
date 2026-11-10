import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { matchParticipants, matches } from "@/db/schema";
import { pendingRefunds } from "@/db/schema-finance";
import { MIN_PRIVATE_PLAYERS } from "@/lib/lobby-rules";
import { finalShareFor, formatEuro, reservationFor, shareCents } from "@/lib/money";
import { audit } from "./audit";
import { creditWallet, debitWallet } from "./ledger";
import { teamName } from "./names";
import { notifyUsers } from "./notifications";
import { priceFor } from "./pricing";
import { issueReceipt } from "./receipts";
import { minPaidPlayers, paymentsEnabled } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;

export const FREE_CANCEL_HOURS = 24; // kostenlos abmelden bis 24 Stunden vor dem Anstoß

/** Privatspiel: Ab so vielen Stunden vor dem Anstoß ist die Teilnehmerliste gesperrt (kein Austritt, kein Rauswurf). */
export const PRIVATE_LIST_LOCK_HOURS = 48;
/**
 * Schalter (Produktfrage, Stand T54): Vertragswortlaut AC-8 sperrt in den letzten 48 Stunden auch den Beitritt per Link.
 * Dann könnte ein Spiel, das kurz vor Anstoß angelegt wird, nie jemanden einladen. Deshalb gilt die Beitrittssperre erst NACH dem Fixieren
 * (und lässt dann einen Ersatz für einen Ausgestiegenen zu). Auf `true` stellen, um den Beitritt in den letzten 48 Stunden immer zu sperren.
 */
const BLOCK_PRIVATE_JOIN_BEFORE_FIX = false;

/** Ist die Teilnehmerliste dieses Privatspiels gesperrt (weniger als 48 Stunden bis Anstoß)? Teamspiel und Turnier: nie. */
export function privateListLocked(match: Pick<MatchRow, "kind" | "startsAt">): boolean {
  return match.kind === "private" && match.startsAt.getTime() - Date.now() < PRIVATE_LIST_LOCK_HOURS * 3_600_000;
}

/**
 * Darf jetzt niemand mehr neu beitreten? In der Sperrzeit (unter 48 Stunden) nach dem Fixieren nur noch ein Ersatz für einen
 * ausgestiegenen Spieler (es gibt eine offene Erstattung). Ohne Geldfluss (kostenlos, Zahlungen aus) gibt es nichts zu schützen.
 */
export async function privateJoinBlocked(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "kind" | "startsAt" | "finalShareCents" | "priceCents">): Promise<boolean> {
  if (!privateListLocked(match)) return false;
  if (match.finalShareCents === null) return BLOCK_PRIVATE_JOIN_BEFORE_FIX;
  if (!match.priceCents || !(await paymentsEnabled(tx as Tx))) return false;
  const [open] = await tx.select({ userId: pendingRefunds.userId }).from(pendingRefunds).where(eq(pendingRefunds.matchId, match.id)).limit(1);
  return !open;
}

/** Preis des Spiels, falls noch nicht festgelegt aus den Preisregeln (Halle oder Standard) ermitteln und am Spiel speichern. */
export async function ensurePrice(tx: Tx, match: MatchRow): Promise<{ priceCents: number; costCents: number; match: MatchRow }> {
  if (match.priceCents !== null && match.costCents !== null) return { priceCents: match.priceCents, costCents: match.costCents, match };
  const price = await priceFor(tx, match.venueId, match.durationMin);
  if (!price) throw new DomainError("Für diese Spieldauer ist noch kein Preis hinterlegt. Bitte wende dich an die Admins.");
  const [updated] = await tx.update(matches).set({ priceCents: price.priceCents, costCents: price.costCents }).where(eq(matches.id, match.id)).returning();
  return { ...price, match: updated };
}

/** Betrag, den ein Spieler jetzt zahlt: vor der Abrechnung die Reservierung (höchster Anteil), danach der endgültige Anteil. */
export function amountToCharge(match: Pick<MatchRow, "settledAt" | "finalShareCents">, priceCents: number, minPaid: number): number {
  return match.settledAt && match.finalShareCents ? match.finalShareCents : reservationFor(priceCents, minPaid);
}

/**
 * Anteil im Teamspiel nach dem neuen Modell (008): Hallenpreis geteilt durch die Zahl der eingeteilten Spieler (aufgerundet, mindestens 4 wie der
 * Wertebereich der Spielerzahl), ohne Mindestzahl 8, ohne Deckel 12 und ohne Reservierung. Nach der Abrechnung gilt der feste Anteil.
 * Spiele des alten Modells (`legacyShareModel`) rechnen weiter mit `amountToCharge`.
 */
export async function teamShareNow(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "finalShareCents">, priceCents: number): Promise<number> {
  if (match.finalShareCents !== null) return match.finalShareCents; // fixiert (zweites Bereit) oder abgerechnet
  return shareCents(priceCents, Math.max(await seatedCount(tx, match.id), MIN_PRIVATE_PLAYERS));
}

/**
 * Rechnet das Spiel nach dem Modell "Preis ÷ eingeteilte Spieler" mit Neuberechnung und Fixierung? Privatspiele immer, Teamspiele (nicht Turnier)
 * nur, wenn sie nach der Umstellung angelegt wurden. Altspiele (`legacyShareModel`) behalten Reservierung und Mindestzahl.
 */
export function usesFixedShareModel(match: Pick<MatchRow, "kind" | "legacyShareModel">): boolean {
  return match.kind === "private" || (match.kind === "team" && !match.legacyShareModel);
}

/** Divisor des Anteils: eingeteilte Spieler; im Teamspiel mindestens 4 (Wertebereich der Spielerzahl). */
export function shareDivisor(match: Pick<MatchRow, "kind">, seated: number): number {
  return match.kind === "private" ? seated : Math.max(seated, MIN_PRIVATE_PLAYERS);
}

/** Betrag, den ein Spieler jetzt zahlt, je nach Modell: Privatspiel und neues Teamspiel Miete ÷ Spielerzahl, Altspiel die Reservierung. */
export async function shareToCharge(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "kind" | "finalShareCents" | "settledAt" | "legacyShareModel">, priceCents: number): Promise<number> {
  if (match.kind === "private") return privateShareNow(tx, match, priceCents);
  if (usesFixedShareModel(match)) return teamShareNow(tx, match, priceCents);
  return amountToCharge(match, priceCents, await minPaidPlayers(tx));
}

/**
 * Anteil im Privatspiel: Miete geteilt durch die Zahl der eingeteilten Spieler (aufgerundet, ohne Deckel und ohne Mindestzahl).
 * Steht der Preis schon fest (zweites Bereit), gilt der feste Anteil. Nur für Privatspiele; Teamspiel und Turnier rechnen weiter mit der Reservierung.
 */
export async function privateShareNow(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "finalShareCents">, rentCents: number): Promise<number> {
  if (match.finalShareCents !== null) return match.finalShareCents;
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), isNotNull(matchParticipants.teamId)));
  return shareCents(rentCents, Math.max(n, 1));
}

/** Buchung des Anteils beim Bereitmachen. Läuft nur, wenn Zahlungen eingeschaltet sind und der Spieler noch nicht bezahlt hat. */
export async function reserveShare(tx: Tx, match: MatchRow, userId: string): Promise<void> {
  if (!(await paymentsEnabled(tx))) return;
  const [p] = await tx
    .select({ paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, userId)));
  // Privatspiel: Wer schon etwas gezahlt hat, aber weniger als den (neu gerechneten) Anteil, zahlt die Differenz nach. Sonst zahlt nur, wer noch nichts gezahlt hat.
  if (!p || (p.paidCents > 0 && !usesFixedShareModel(match))) return;

  const { priceCents, match: fresh } = await ensurePrice(tx, match);
  if (priceCents === 0) return; // kostenlos: keine Zahlung, keine Reservierung
  const amount = await shareToCharge(tx, fresh, priceCents);
  const toPay = amount - p.paidCents;
  if (toPay <= 0) return; // schon voll bezahlt (auch bei Doppelklick)
  await debitWallet(tx, userId, {
    to: "revenue",
    amountCents: toPay,
    kind: "match_share",
    matchId: match.id,
    idempotencyKey: `share:${match.id}:${userId}:${randomUUID()}`,
    reason: p.paidCents > 0 ? "Nachzahlung Anteil" : fresh.settledAt || usesFixedShareModel(fresh) ? "Startgebühr (Anteil)" : "Startgebühr (Reservierung)",
    actorId: userId,
  });
  await tx.update(matchParticipants).set({ paidCents: amount, paidAt: new Date() }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, userId)));
  await audit(userId, "wallet.share", "match", match.id, { after: { amountCents: toPay, totalPaidCents: amount } }, tx);
  if (p.paidCents === 0) await settlePendingRefunds(tx, match);
}

/**
 * Zweites Bereit im Privatspiel (beide Captains haben bestätigt): Die Spielerzahl wird festgeschrieben, der Anteil steht fest.
 * Hat jemand zu viel gezahlt, geht die Differenz sofort zurück (fester Schlüssel je Spieler); hat jemand zu wenig gezahlt, wird abgelehnt
 * (die ganze Bestätigung wird zurückgerollt; Nachfordern ist Teil der Neuberechnung). Genau einmal: Der Aufrufer hält die Zeilensperre
 * auf dem Spiel, und nur `final_share_cents IS NULL` darf fixiert werden. Die Abrechnung beim Anstoß (Beleg, Benachrichtigung, `settled_at`)
 * läuft danach unverändert weiter und übernimmt diesen Anteil.
 */
export async function fixShare(tx: Tx, match: MatchRow): Promise<void> {
  if (!usesFixedShareModel(match)) return;
  const [current] = await tx.select({ finalShareCents: matches.finalShareCents }).from(matches).where(eq(matches.id, match.id));
  if (!current || current.finalShareCents !== null) return; // schon fixiert

  const { priceCents } = await ensurePrice(tx, match);
  const seated = await tx
    .select({ userId: matchParticipants.userId, paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), isNotNull(matchParticipants.teamId)));
  if (seated.length === 0) return;
  const share = shareCents(priceCents, shareDivisor(match, seated.length));
  const pay = await paymentsEnabled(tx);
  if (pay && share > 0) {
    const short = seated.filter((p) => p.paidCents < share).length;
    if (short > 0) throw new DomainError(`Der Anteil wäre ${formatEuro(share)} pro Spieler (${seated.length} Spieler), ${short} Spieler haben weniger bezahlt. Die Spielerzahl muss sich ändern oder die betroffenen Spieler treten neu bei.`);
  }
  const [fixed] = await tx.update(matches).set({ finalShareCents: share }).where(and(eq(matches.id, match.id), isNull(matches.finalShareCents))).returning({ id: matches.id });
  if (!fixed) return;
  if (pay) {
    for (const p of seated) {
      const diff = p.paidCents - share;
      if (diff <= 0) continue;
      await refundPaid(tx, match, p.userId, diff, "Anteil nach Festlegung der Spielerzahl", `private-fix:${match.id}:${p.userId}`, null);
      await tx.update(matchParticipants).set({ paidCents: share }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, p.userId)));
    }
  }
  await audit(null, match.kind === "private" ? "wallet.private_fix" : "wallet.team_fix", "match", match.id, { after: { players: seated.length, finalShareCents: share, rentCents: priceCents } }, tx);
}

/** Zahl der einem Team zugeteilten Spieler (nur diese zählen für den Anteil im Privatspiel). */
export async function seatedCount(tx: Pick<Tx, "select">, matchId: string): Promise<number> {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), isNotNull(matchParticipants.teamId)));
  return n;
}

/**
 * Privatspiel vor dem Fixieren: Hat sich die Zahl der eingeteilten Spieler geändert, wird der Anteil neu gerechnet (Miete ÷ neue Zahl).
 * Zu viel Gezahltes geht sofort als Guthaben zurück (der bezahlte Betrag sinkt auf den neuen Anteil), zu wenig wird nicht automatisch
 * abgebucht, sondern vom Spieler per `payShare` nachgezahlt (die Differenz). "Bereit" beider Captains wird zurückgesetzt.
 * Der Aufrufer hält die Zeilensperre auf dem Spiel (genau einmal je Änderung). Rundungsreste (weniger als n Cent) bleiben bei der Plattform.
 * Erstattungs-Schlüssel enthalten eine Zufallskennung: derselbe Zahlungsstand kann nach mehreren Änderungen mehrfach vorkommen,
 * Doppelbuchung verhindert die Spielsperre, nicht der Schlüssel.
 */
export async function recalcShares(tx: Tx, match: MatchRow, actorId: string | null): Promise<void> {
  if (!usesFixedShareModel(match)) return;
  const [current] = await tx.select().from(matches).where(eq(matches.id, match.id));
  if (!current || current.finalShareCents !== null) return; // Preis steht fest: nichts neu rechnen
  await tx.update(matches).set({ homeFinalAt: null, awayFinalAt: null }).where(eq(matches.id, match.id));
  if (!(await paymentsEnabled(tx)) || !current.priceCents) {
    await audit(actorId, "wallet.private_recalc", "match", match.id, { after: { bereitReset: true } }, tx);
    return;
  }
  const seated = await tx
    .select({ userId: matchParticipants.userId, paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), isNotNull(matchParticipants.teamId)));
  if (seated.length === 0) return;
  const share = shareCents(current.priceCents, shareDivisor(match, seated.length));
  const owing: string[] = [];
  let refunded = 0;
  for (const p of seated) {
    if (p.paidCents > share) {
      await refundPaid(tx, current, p.userId, p.paidCents - share, "Anteil nach Änderung der Spielerzahl", `private-recalc:${match.id}:${p.userId}:${randomUUID()}`, actorId);
      await tx.update(matchParticipants).set({ paidCents: share }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, p.userId)));
      refunded += 1;
    } else if (p.paidCents > 0 && p.paidCents < share) {
      owing.push(p.userId);
    }
  }
  if (owing.length) {
    await notifyUsers(owing, { type: "payment", title: "Anteil hat sich geändert", body: `Die Spielerzahl hat sich geändert: Dein Anteil ist jetzt ${formatEuro(share)}. Bitte zahle den Rest in der Lobby nach.`, url: `/lobby/${match.id}` }, tx);
  }
  await audit(actorId, "wallet.private_recalc", "match", match.id, { after: { players: seated.length, shareCents: share, refunded, owing: owing.length } }, tx);
}

/** Erstattet den Anteil eines Spielers ans Guthaben und setzt seinen bezahlten Betrag auf 0. */
async function refundPaid(tx: Tx, match: MatchRow, userId: string, paidCents: number, reason: string, key: string, actorId: string | null) {
  if (paidCents <= 0) return;
  await creditWallet(tx, userId, { from: "revenue", amountCents: paidCents, kind: "refund", matchId: match.id, idempotencyKey: key, reason, actorId });
  await notifyUsers([userId], { type: "payment", title: "Erstattung", body: `${formatEuro(paidCents)} wurden deinem Guthaben gutgeschrieben (${reason}).`, url: "/app/guthaben" }, tx);
}

/** Wird aufgerufen, wenn jemand die Lobby verlässt oder entfernt wird. Vor dem Anstoß minus 24 Stunden gibt es alles zurück, danach nur gegen Ersatz. */
export async function onParticipantLeaves(tx: Tx, match: MatchRow, userId: string, opts: { removedByAdmin: boolean; actorId: string }) {
  if (!(await paymentsEnabled(tx))) return;
  const [p] = await tx
    .select({ paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, userId)));
  if (!p || p.paidCents <= 0) return;

  const hoursLeft = (match.startsAt.getTime() - Date.now()) / 3_600_000;
  // Privatspiel nach dem Fixieren: Anteil und Spielerzahl stehen fest. Der Aussteiger bleibt gebucht, sein Geld kommt erst zurück,
  // wenn ein Ersatz den gleichen Anteil bezahlt hat (Austritt und Rauswurf sind nur bis 48 Stunden vor Anstoß möglich, siehe lobby.ts).
  const waitForSubstitute = match.kind === "private" && match.finalShareCents !== null;
  // Teamspiel im neuen Modell: das Geld ist geparkt, Austritt und Entfernen erstatten sofort (die Festschreibung hebt `mutateLobby` auf)
  const immediate = match.kind === "team" && usesFixedShareModel(match);
  if (immediate || (!waitForSubstitute && (opts.removedByAdmin || hoursLeft >= FREE_CANCEL_HOURS))) {
    await refundPaid(tx, match, userId, p.paidCents, opts.removedByAdmin ? "Aus der Lobby entfernt" : "Rechtzeitig abgemeldet", `leave:${match.id}:${userId}:${randomUUID()}`, opts.actorId);
    return;
  }
  // zu spät: Erstattung erst, wenn ein Ersatz seinen Anteil bezahlt hat
  await tx
    .insert(pendingRefunds)
    .values({ matchId: match.id, userId, amountCents: p.paidCents })
    .onConflictDoUpdate({ target: [pendingRefunds.matchId, pendingRefunds.userId], set: { amountCents: sql`${pendingRefunds.amountCents} + ${p.paidCents}` } });
  await audit(opts.actorId, "wallet.refund_pending", "match", match.id, { after: { userId, amountCents: p.paidCents } }, tx);
  await notifyUsers(
    [userId],
    { type: "payment", title: waitForSubstitute ? "Austritt nach Festlegung des Preises" : "Abmeldung kurz vor dem Spiel", body: `Dein Anteil von ${formatEuro(p.paidCents)} wird erstattet, sobald ein Ersatzspieler bezahlt hat.`, url: "/app/guthaben" },
    tx,
  );
}

/** Ein neuer Zahler deckt die älteste offene Erstattung (je Zahler eine). */
export async function settlePendingRefunds(tx: Tx, match: MatchRow) {
  const [first] = await tx.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, match.id)).orderBy(asc(pendingRefunds.createdAt)).limit(1);
  if (!first) return;
  await creditWallet(tx, first.userId, { from: "revenue", amountCents: first.amountCents, kind: "refund", matchId: match.id, idempotencyKey: `pending:${match.id}:${first.userId}:${first.createdAt.getTime()}`, reason: "Ersatzspieler hat bezahlt" });
  await tx.delete(pendingRefunds).where(and(eq(pendingRefunds.matchId, match.id), eq(pendingRefunds.userId, first.userId)));
  await notifyUsers([first.userId], { type: "payment", title: "Erstattung", body: `Ein Ersatz hat bezahlt: ${formatEuro(first.amountCents)} sind wieder in deinem Guthaben.`, url: "/app/guthaben" }, tx);
}

/** Absage des ganzen Spiels: alle bekommen alles zurück, auch wer kurz vorher ausgestiegen war. */
export async function refundOnCancel(tx: Tx, match: MatchRow, actorId: string | null) {
  const participants = await tx
    .select({ userId: matchParticipants.userId, paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), gt(matchParticipants.paidCents, 0)));
  for (const p of participants) {
    await refundPaid(tx, match, p.userId, p.paidCents, "Spiel abgesagt", `cancel:${match.id}:${p.userId}`, actorId);
    await tx.update(matchParticipants).set({ paidCents: 0 }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, p.userId)));
  }
  const pending = await tx.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, match.id));
  for (const r of pending) {
    await creditWallet(tx, r.userId, { from: "revenue", amountCents: r.amountCents, kind: "refund", matchId: match.id, idempotencyKey: `cancel-pending:${match.id}:${r.userId}`, reason: "Spiel abgesagt", actorId });
    await notifyUsers([r.userId], { type: "payment", title: "Erstattung", body: `${formatEuro(r.amountCents)} wurden erstattet: Das Spiel wurde abgesagt.`, url: "/app/guthaben" }, tx);
  }
  if (pending.length) await tx.delete(pendingRefunds).where(eq(pendingRefunds.matchId, match.id));
}

/**
 * Abrechnung: Der Hallenpreis wird durch die Zahl der zahlenden Spieler geteilt. Wer mehr reserviert hatte, bekommt die Differenz zurück.
 * Idempotent (settledAt und feste Buchungsschlüssel).
 */
export async function settleMatch(tx: Tx, match: MatchRow): Promise<boolean> {
  if (!(await paymentsEnabled(tx)) || match.settledAt || match.status !== "confirmed") return false;
  const { priceCents, match: m } = await ensurePrice(tx, match);
  const payers = await tx
    .select({ userId: matchParticipants.userId, paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), gt(matchParticipants.paidCents, 0)));
  if (payers.length === 0) return false;

  // Privatspiel: nie finalShareFor (Mindestzahl 8, Deckel 12). Es gilt der feste Anteil (zweites Bereit) oder, solange keiner gesetzt ist,
  // derselbe Anteil wie beim Bezahlen: Miete geteilt durch die eingeteilten Spieler.
  const final = m.kind === "private" ? await privateShareNow(tx, m, priceCents) : m.legacyShareModel ? finalShareFor(priceCents, payers.length, await minPaidPlayers(tx)) : await teamShareNow(tx, m, priceCents);
  // Teamspiel im neuen Modell: Nie weniger einnehmen als der Preis. Reicht die Summe der Anteile nicht (Nichtzahler), wird nicht abgerechnet.
  if (m.kind === "team" && !m.legacyShareModel && priceCents > 0 && payers.reduce((sum, p) => sum + Math.min(p.paidCents, final), 0) < priceCents) {
    await audit(null, "wallet.settle_uncovered", "match", m.id, { after: { payers: payers.length, finalShareCents: final, priceCents } }, tx);
    return false;
  }
  const [home, away] = [await teamName(tx, m.homeTeamId), await teamName(tx, m.awayTeamId)];
  for (const p of payers) {
    const diff = p.paidCents - final;
    if (diff > 0) await creditWallet(tx, p.userId, { from: "revenue", amountCents: diff, kind: "refund", matchId: m.id, idempotencyKey: `settle:${m.id}:${p.userId}`, reason: "Abrechnung: Anteil nach tatsächlicher Spielerzahl" });
    await tx.update(matchParticipants).set({ paidCents: Math.min(p.paidCents, final) }).where(and(eq(matchParticipants.matchId, m.id), eq(matchParticipants.userId, p.userId)));
    await issueReceipt(tx, { userId: p.userId, kind: "match", matchId: m.id, amountCents: Math.min(p.paidCents, final) });
    await notifyUsers(
      [p.userId],
      { type: "payment", title: "Abrechnung", body: `${home} gegen ${away}: dein Anteil beträgt ${formatEuro(final)}${diff > 0 ? `, ${formatEuro(diff)} gehen zurück aufs Guthaben` : ""}.`, url: `/lobby/${m.id}` },
      tx,
    );
  }
  await tx.update(matches).set({ settledAt: new Date(), finalShareCents: final }).where(eq(matches.id, m.id));
  await audit(null, "wallet.settle", "match", m.id, { after: { payers: payers.length, finalShareCents: final, priceCents } }, tx);
  return true;
}
