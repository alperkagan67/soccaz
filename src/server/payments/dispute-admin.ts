// Zahlungsstreit im Admin (Vertrag 012, M4a-2, AC-11): Liste, Detail mit Beweis-Ansicht und die Markierung am Spieler. NUR LESEN: Entscheide t9: keine automatische Sperre, Beweise werden manuell im
// Stripe-Dashboard eingereicht (Export ist Backlog). Aufrufer prueft die Berechtigung (Admin); diese Datei prueft sie NICHT. Es werden nur Daten angezeigt, die Admins ohnehin sehen duerfen;
// keine Karteninhaberdaten, keine Zahlungsmittel-ID, kein client_secret.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentDisputeEntries, paymentDisputes, paymentSetupIntents, users } from "@/db/schema";
import { receipts } from "@/db/schema-finance";
import { disputeRank, isDisputeOpen, KNOWN_DISPUTE_STATUSES, OPEN_DISPUTE_STATUSES } from "./dispute-parse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;

/** SQL-Entsprechung von isDisputeOpen: offener Status ODER ein unbekannter (alles ausser den bekannten Statuswerten). Gleiche Regel wie in der Erstattungssperre (refund.ts). */
const openCondition = sql`(${paymentDisputes.status} in (${sql.join(OPEN_DISPUTE_STATUSES.map((s) => sql`${s}`), sql`, `)}) or ${paymentDisputes.status} not in (${sql.join(KNOWN_DISPUTE_STATUSES.map((s) => sql`${s}`), sql`, `)}))`;

export type DisputeListRow = {
  id: string;
  disputeId: string;
  status: string;
  open: boolean;
  amountCents: number;
  reason: string;
  evidenceDueBy: Date | null;
  createdAt: Date;
  payerUserId: string | null;
  payerName: string | null;
  matchId: string | null;
  matchLabel: string | null;
  refundConflict: boolean;
  doubleLossCents: number;
  rejectedEntries: number;
};

/** Liste der Zahlungsstreite (neueste zuerst). `onlyOpen`: nur offene (inkl. unbekannter Status). */
export async function listDisputes(opts: { onlyOpen?: boolean; page?: number } = {}): Promise<{ rows: DisputeListRow[]; hasMore: boolean }> {
  await connection();
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db
    .select({
      id: paymentDisputes.id,
      disputeId: paymentDisputes.disputeId,
      status: paymentDisputes.status,
      amountCents: paymentDisputes.amountCents,
      reason: paymentDisputes.reason,
      evidenceDueBy: paymentDisputes.evidenceDueBy,
      createdAt: paymentDisputes.createdAt,
      payerUserId: paymentDisputes.payerUserId,
      payerName: users.name,
      matchId: paymentDisputes.matchId,
      refundConflict: paymentDisputes.refundConflict,
      doubleLossCents: paymentDisputes.doubleLossCents,
      rejectedEntries: sql<number>`(select count(*)::int from payment_dispute_entries e where e.dispute_row_id = ${paymentDisputes.id} and e.status = 'rejected')`,
      matchLabel: sql<string | null>`(select h.name || ' gegen ' || a.name from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id where m.id = ${paymentDisputes.matchId})`,
    })
    .from(paymentDisputes)
    .leftJoin(users, eq(users.id, paymentDisputes.payerUserId))
    // Filter und Seiten in SQL (keine Obergrenze, die ein altes offenes Verfahren hinter vielen neuen abgeschlossenen verstecken wuerde)
    .where(opts.onlyOpen ? openCondition : undefined)
    .orderBy(desc(paymentDisputes.createdAt), desc(paymentDisputes.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, open: isDisputeOpen(r.status) })), hasMore: rows.length > PAGE_SIZE };
}

export type DisputeDetail = {
  dispute: typeof paymentDisputes.$inferSelect & { open: boolean; final: boolean };
  payer: { id: string; name: string; deleted: boolean } | null;
  seatUser: { id: string; name: string } | null;
  match: { id: string; label: string; startsAt: Date; status: string } | null;
  charge: { id: string; amountCents: number; status: string; createdAt: Date; coveredShare: boolean } | null;
  entries: (typeof paymentDisputeEntries.$inferSelect)[];
  evidence: {
    mandateText: string | null;
    mandateAcceptedAt: Date | null;
    coverMandate: string | null;
    coverAcceptedAt: Date | null;
    readyAt: Date | null;
    joinedAt: Date | null;
    receiptNumber: string | null;
    receiptIssuedAt: Date | null;
  };
};

/** Ein Streit mit Beweis-Ansicht; null bei unbekannter oder ungueltiger ID. */
export async function getDispute(id: string): Promise<DisputeDetail | null> {
  await connection();
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const [d] = await db.select().from(paymentDisputes).where(eq(paymentDisputes.id, id));
  if (!d) return null;
  const [payer] = d.payerUserId ? await db.select({ id: users.id, name: users.name, bannedAt: users.bannedAt, email: users.email }).from(users).where(eq(users.id, d.payerUserId)) : [];
  const [charge] = d.chargeId ? await db.select().from(paymentCharges).where(eq(paymentCharges.id, d.chargeId)) : [];
  const [seatUser] = charge && charge.payerUserId ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, charge.userId)) : [];
  const [m] = d.matchId
    ? await db
        .select({ id: matches.id, startsAt: matches.startsAt, status: matches.status, home: sql<string>`(select name from teams where id = ${matches.homeTeamId})`, away: sql<string>`(select name from teams where id = ${matches.awayTeamId})` })
        .from(matches)
        .where(eq(matches.id, d.matchId))
    : [];
  const entries = await db.select().from(paymentDisputeEntries).where(eq(paymentDisputeEntries.disputeRowId, d.id)).orderBy(asc(paymentDisputeEntries.createdAt), asc(paymentDisputeEntries.id));

  // Beweis-Ansicht: was Admin 1 im Stripe-Dashboard einreichen kann (Mandat, Zeitpunkt, Teilnahme, Beleg)
  const [setup] = d.payerUserId
    ? await db
        .select({ text: paymentSetupIntents.mandateText, at: paymentSetupIntents.mandateAcceptedAt })
        .from(paymentSetupIntents)
        .where(and(eq(paymentSetupIntents.userId, d.payerUserId), eq(paymentSetupIntents.status, "succeeded")))
        .orderBy(desc(paymentSetupIntents.createdAt))
        .limit(1)
    : [];
  const seatId = charge?.userId ?? d.payerUserId;
  const [part] = seatId && d.matchId ? await db.select({ readyAt: matchParticipants.readyAt, joinedAt: matchParticipants.joinedAt, coverText: matchParticipants.coverMandateText, coverAt: matchParticipants.coverAcceptedAt }).from(matchParticipants).where(and(eq(matchParticipants.matchId, d.matchId), eq(matchParticipants.userId, seatId))) : [];
  const [receipt] = d.payerUserId && d.matchId ? await db.select({ number: receipts.number, issuedAt: receipts.issuedAt }).from(receipts).where(and(eq(receipts.userId, d.payerUserId), eq(receipts.matchId, d.matchId))).limit(1) : [];

  return {
    dispute: { ...d, open: isDisputeOpen(d.status), final: disputeRank(d.status) === 3 },
    payer: payer ? { id: payer.id, name: payer.name, deleted: payer.email.endsWith("@geloescht.invalid") } : null,
    seatUser: seatUser ?? null,
    match: m ? { id: m.id, label: `${m.home} gegen ${m.away}`, startsAt: m.startsAt, status: m.status } : null,
    charge: charge ? { id: charge.id, amountCents: charge.amountCents, status: charge.status, createdAt: charge.createdAt, coveredShare: charge.payerUserId !== null } : null,
    entries,
    evidence: {
      mandateText: setup?.text ?? null,
      mandateAcceptedAt: setup?.at ?? null,
      coverMandate: part?.coverText ?? null,
      coverAcceptedAt: part?.coverAt ?? null,
      readyAt: part?.readyAt ?? null,
      joinedAt: part?.joinedAt ?? null,
      receiptNumber: receipt?.number ?? null,
      receiptIssuedAt: receipt?.issuedAt ?? null,
    },
  };
}

export type DisputeMark = { open: number; lost: number };

/**
 * Markierung am Spieler (Entscheid t9: nur Markierung, keine Sperre): je Zahler Anzahl offener und verlorener Streite. Nur Nutzer mit mindestens einem Streit stehen im Ergebnis.
 */
export async function disputeMarks(userIds: string[]): Promise<Map<string, DisputeMark>> {
  const out = new Map<string, DisputeMark>();
  const ids = [...new Set(userIds.filter((u) => UUID.test(u)))];
  if (ids.length === 0) return out;
  await connection();
  const rows = await db.select({ payer: paymentDisputes.payerUserId, status: paymentDisputes.status }).from(paymentDisputes).where(inArray(paymentDisputes.payerUserId, ids));
  for (const r of rows) {
    if (!r.payer) continue;
    const m = out.get(r.payer) ?? { open: 0, lost: 0 };
    if (isDisputeOpen(r.status)) m.open += 1;
    else if (r.status === "lost") m.lost += 1;
    out.set(r.payer, m);
  }
  return out;
}

/** Anzahl offener Streite (fuer den Hinweis in der Navigation / Uebersicht). */
export async function countOpenDisputes(): Promise<number> {
  await connection();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(paymentDisputes).where(openCondition);
  return r?.n ?? 0;
}
