import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { matchParticipants, matches } from "@/db/schema";
import { pendingRefunds } from "@/db/schema-finance";
import { finalShareFor, formatEuro, reservationFor } from "@/lib/money";
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

/** Preis des Spiels, falls noch nicht festgelegt aus den Preisregeln (Halle oder Standard) ermitteln und am Spiel speichern. */
export async function ensurePrice(tx: Tx, match: MatchRow): Promise<{ priceCents: number; costCents: number; match: MatchRow }> {
  if (match.priceCents !== null && match.costCents !== null) return { priceCents: match.priceCents, costCents: match.costCents, match };
  const price = await priceFor(tx, match.venueId, match.durationMin);
  if (!price) throw new DomainError("Für diese Spieldauer ist noch kein Preis hinterlegt. Bitte wende dich an die Admins.");
  const [updated] = await tx.update(matches).set({ priceCents: price.priceCents, costCents: price.costCents }).where(eq(matches.id, match.id)).returning();
  return { ...price, match: updated };
}

/** Betrag, den ein Spieler jetzt zahlt: vor der Abrechnung die Reservierung (höchster Anteil), danach der endgültige Anteil. */
export function amountToCharge(match: MatchRow, priceCents: number, minPaid: number): number {
  return match.settledAt && match.finalShareCents ? match.finalShareCents : reservationFor(priceCents, minPaid);
}

/** Buchung des Anteils beim Bereitmachen. Läuft nur, wenn Zahlungen eingeschaltet sind und der Spieler noch nicht bezahlt hat. */
export async function reserveShare(tx: Tx, match: MatchRow, userId: string): Promise<void> {
  if (!(await paymentsEnabled(tx))) return;
  const [p] = await tx
    .select({ paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, userId)));
  if (!p || p.paidCents > 0) return;

  const { priceCents, match: fresh } = await ensurePrice(tx, match);
  const amount = amountToCharge(fresh, priceCents, await minPaidPlayers(tx));
  await debitWallet(tx, userId, {
    to: "revenue",
    amountCents: amount,
    kind: "match_share",
    matchId: match.id,
    idempotencyKey: `share:${match.id}:${userId}:${randomUUID()}`,
    reason: fresh.settledAt ? "Startgebühr (Anteil)" : "Startgebühr (Reservierung)",
    actorId: userId,
  });
  await tx.update(matchParticipants).set({ paidCents: amount, paidAt: new Date() }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, userId)));
  await audit(userId, "wallet.share", "match", match.id, { after: { amountCents: amount } }, tx);
  await settlePendingRefunds(tx, match);
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
  if (opts.removedByAdmin || hoursLeft >= FREE_CANCEL_HOURS) {
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
    { type: "payment", title: "Abmeldung kurz vor dem Spiel", body: `Dein Anteil von ${formatEuro(p.paidCents)} wird erstattet, sobald ein Ersatzspieler bezahlt hat.`, url: "/app/guthaben" },
    tx,
  );
}

/** Ein neuer Zahler deckt die älteste offene Erstattung (je Zahler eine). */
export async function settlePendingRefunds(tx: Tx, match: MatchRow) {
  const [first] = await tx.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, match.id)).orderBy(asc(pendingRefunds.createdAt)).limit(1);
  if (!first) return;
  await creditWallet(tx, first.userId, { from: "revenue", amountCents: first.amountCents, kind: "refund", matchId: match.id, idempotencyKey: `pending:${match.id}:${first.userId}`, reason: "Ersatzspieler hat bezahlt" });
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
  const minPaid = await minPaidPlayers(tx);
  const payers = await tx
    .select({ userId: matchParticipants.userId, paidCents: matchParticipants.paidCents })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), gt(matchParticipants.paidCents, 0)));
  if (payers.length === 0) return false;

  const final = finalShareFor(priceCents, payers.length, minPaid);
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
