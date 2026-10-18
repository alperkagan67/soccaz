import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { expenses, ledgerEntries } from "@/db/schema-finance";
import { euroForCsv, toCsv } from "@/lib/csv";
import { formatEuro } from "@/lib/money";
import { audit } from "./audit";
import { creditWallet, totalWalletLiability, trialBalance } from "./ledger";
import { notifyUsers } from "./notifications";
import { paymentsEnabled } from "./settings";
import { DomainError } from "./teams";

type Row = Record<string, unknown>;
const rowsOf = <T extends Row>(result: { rows: unknown[] }) => result.rows as T[];

export type Period = { from: Date; to: Date };

/** "2026-11" -> Anfang und Ende des Monats (UTC). */
export function monthPeriod(month: string): Period | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 1)) };
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function overview(period: Period) {
  await connection();
  const [r] = rowsOf<{
    revenue: number;
    venue_cost: number;
    fees: number;
    promo: number;
    topups: number;
    refunds: number;
    chargebacks: number;
  }>(
    await db.execute(sql`
      select
        (coalesce(sum(case when credit_account = 'revenue' then amount_cents else 0 end), 0) - coalesce(sum(case when debit_account = 'revenue' then amount_cents else 0 end), 0))::int as revenue,
        (coalesce(sum(case when debit_account = 'venue_cost' then amount_cents else 0 end), 0) - coalesce(sum(case when credit_account = 'venue_cost' then amount_cents else 0 end), 0))::int as venue_cost,
        (coalesce(sum(case when debit_account = 'fees' then amount_cents else 0 end), 0) - coalesce(sum(case when credit_account = 'fees' then amount_cents else 0 end), 0))::int as fees,
        (coalesce(sum(case when debit_account = 'promo' then amount_cents else 0 end), 0) - coalesce(sum(case when credit_account = 'promo' then amount_cents else 0 end), 0))::int as promo,
        coalesce(sum(case when kind = 'topup' then amount_cents else 0 end), 0)::int as topups,
        coalesce(sum(case when kind = 'refund' then amount_cents else 0 end), 0)::int as refunds,
        coalesce(sum(case when kind = 'chargeback' then amount_cents else 0 end), 0)::int as chargebacks
      from ledger_entries where at >= ${period.from} and at < ${period.to}`),
  );
  const [played] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from matches where status = 'played' and starts_at >= ${period.from} and starts_at < ${period.to}`));
  const margin = r.revenue - r.venue_cost - r.fees - r.promo;
  return {
    revenueCents: r.revenue,
    venueCostCents: r.venue_cost,
    feesCents: r.fees,
    promoCents: r.promo,
    topupsCents: r.topups,
    refundsCents: r.refunds,
    chargebacksCents: r.chargebacks,
    marginCents: margin,
    playedMatches: played.n,
    liabilityCents: await totalWalletLiability(),
  };
}

export type MatchFinanceRow = {
  id: string;
  startsAt: Date;
  status: string;
  homeName: string;
  awayName: string;
  priceCents: number | null;
  finalShareCents: number | null;
  payers: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
};

/** Einnahmen, Hallenkosten und Marge je Spiel im Zeitraum (nur Spiele mit Buchungen). */
export async function listMatchFinance(period: Period): Promise<MatchFinanceRow[]> {
  await connection();
  const rows = rowsOf<{ id: string; starts_at: Date; status: string; home: string; away: string; price_cents: number | null; final_share_cents: number | null; payers: number; revenue: number; cost: number }>(
    await db.execute(sql`
      select m.id, m.starts_at, m.status, h.name as home, a.name as away, m.price_cents, m.final_share_cents,
        (select count(*)::int from match_participants p where p.match_id = m.id and p.paid_cents > 0) as payers,
        (select coalesce(sum(case when l.credit_account = 'revenue' then l.amount_cents else 0 end) - sum(case when l.debit_account = 'revenue' then l.amount_cents else 0 end), 0)::int from ledger_entries l where l.match_id = m.id) as revenue,
        (select coalesce(sum(case when l.debit_account = 'venue_cost' then l.amount_cents else 0 end) - sum(case when l.credit_account = 'venue_cost' then l.amount_cents else 0 end), 0)::int from ledger_entries l where l.match_id = m.id) as cost
      from matches m
      join teams h on h.id = m.home_team_id
      join teams a on a.id = m.away_team_id
      where m.starts_at >= ${period.from} and m.starts_at < ${period.to}
        and exists (select 1 from ledger_entries l where l.match_id = m.id)
      order by m.starts_at desc limit 200`),
  );
  return rows.map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    status: r.status,
    homeName: r.home,
    awayName: r.away,
    priceCents: r.price_cents,
    finalShareCents: r.final_share_cents,
    payers: r.payers,
    revenueCents: r.revenue,
    costCents: r.cost,
    marginCents: r.revenue - r.cost,
  }));
}

export type PlayerFinanceRow = { userId: string; name: string; email: string; paidCents: number; refundedCents: number; netCents: number; pendingRefundCents: number; inLobby: boolean; hasPaidNow: boolean };

/** Wer hat für dieses Spiel bezahlt, wie viel kam zurück, was ist offen. */
export async function playerFinance(matchId: string): Promise<PlayerFinanceRow[]> {
  await connection();
  const rows = rowsOf<{ user_id: string; name: string; email: string; paid: number; refunded: number; pending: number | null; in_lobby: boolean; paid_now: number | null }>(
    await db.execute(sql`
      with money as (
        select coalesce(debit_user_id, credit_user_id) as user_id,
          sum(case when debit_account = 'wallet' then amount_cents else 0 end)::int as paid,
          sum(case when credit_account = 'wallet' then amount_cents else 0 end)::int as refunded
        from ledger_entries where match_id = ${matchId} and (debit_account = 'wallet' or credit_account = 'wallet')
        group by 1
      )
      select u.id as user_id, u.name, u.email, coalesce(m.paid, 0) as paid, coalesce(m.refunded, 0) as refunded,
        pr.amount_cents as pending, (p.user_id is not null) as in_lobby, p.paid_cents as paid_now
      from users u
      left join money m on m.user_id = u.id
      left join pending_refunds pr on pr.match_id = ${matchId} and pr.user_id = u.id
      left join match_participants p on p.match_id = ${matchId} and p.user_id = u.id
      where m.user_id is not null or p.user_id is not null or pr.user_id is not null
      order by u.name`),
  );
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    paidCents: r.paid,
    refundedCents: r.refunded,
    netCents: r.paid - r.refunded,
    pendingRefundCents: r.pending ?? 0,
    inLobby: r.in_lobby,
    hasPaidNow: (r.paid_now ?? 0) > 0,
  }));
}

export async function matchEntries(matchId: string) {
  await connection();
  return db
    .select({
      id: ledgerEntries.id,
      at: ledgerEntries.at,
      kind: ledgerEntries.kind,
      amountCents: ledgerEntries.amountCents,
      debit: ledgerEntries.debitAccount,
      credit: ledgerEntries.creditAccount,
      reason: ledgerEntries.reason,
      userName: sql<string | null>`(select name from users where id = coalesce(${ledgerEntries.debitUserId}, ${ledgerEntries.creditUserId}))`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.matchId, matchId))
    .orderBy(ledgerEntries.at);
}

export async function matchHeader(matchId: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  const rows = rowsOf<{ id: string; starts_at: Date; status: string; home: string; away: string; price_cents: number | null; cost_cents: number | null; final_share_cents: number | null; settled_at: Date | null }>(
    await db.execute(sql`
      select m.id, m.starts_at, m.status, h.name as home, a.name as away, m.price_cents, m.cost_cents, m.final_share_cents, m.settled_at
      from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id where m.id = ${matchId}`),
  );
  const r = rows[0];
  return r ? { id: r.id, startsAt: new Date(r.starts_at), status: r.status, home: r.home, away: r.away, priceCents: r.price_cents, costCents: r.cost_cents, finalShareCents: r.final_share_cents, settledAt: r.settled_at ? new Date(r.settled_at) : null } : null;
}

/** Ausnahme-Erstattung durch Finanz (z. B. kurzfristige Absage aus gutem Grund). Höchstens der Betrag, den die Person für dieses Spiel netto bezahlt hat. */
export async function manualRefund(actorId: string, matchId: string, userId: string, cents: number, reason: string) {
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Bitte einen Grund angeben.");
  if (!Number.isInteger(cents) || cents <= 0) throw new DomainError("Bitte einen gültigen Betrag angeben.");
  await db.transaction(async (tx) => {
    const [lock] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!lock) throw new DomainError("Nutzer nicht gefunden.");
    const [net] = rowsOf<{ net: number }>(
      await tx.execute(sql`
        select (coalesce(sum(case when debit_account = 'wallet' and debit_user_id = ${userId} then amount_cents else 0 end), 0)
              - coalesce(sum(case when credit_account = 'wallet' and credit_user_id = ${userId} then amount_cents else 0 end), 0))::int as net
        from ledger_entries where match_id = ${matchId}`),
    );
    if (cents > net.net) throw new DomainError(`Es können höchstens ${formatEuro(Math.max(net.net, 0))} erstattet werden (so viel hat die Person für dieses Spiel netto bezahlt).`);
    await creditWallet(tx, userId, { from: "revenue", amountCents: cents, kind: "refund", matchId, reason: `Ausnahme-Erstattung: ${text}`, idempotencyKey: `manual-refund:${randomUUID()}`, actorId });
    await audit(actorId, "wallet.manual_refund", "match", matchId, { after: { userId, cents, reason: text } }, tx);
    await notifyUsers([userId], { type: "payment", title: "Erstattung", body: `${formatEuro(cents)} wurden deinem Guthaben gutgeschrieben (${text}).`, url: "/app/guthaben" }, tx);
  });
}

export async function listExpenses(period: Period) {
  await connection();
  return db
    .select({
      id: expenses.id,
      paidOn: expenses.paidOn,
      kind: expenses.kind,
      amountCents: expenses.amountCents,
      note: expenses.note,
      receiptUrl: expenses.receiptUrl,
      matchId: expenses.matchId,
      homeName: sql<string | null>`(select name from teams where id = (select home_team_id from matches where id = ${expenses.matchId}))`,
      awayName: sql<string | null>`(select name from teams where id = (select away_team_id from matches where id = ${expenses.matchId}))`,
    })
    .from(expenses)
    .where(and(gte(expenses.createdAt, period.from), lt(expenses.createdAt, period.to)))
    .orderBy(desc(expenses.createdAt))
    .limit(200);
}

/** Kontenbewegungen als CSV für den Steuerberater. */
export async function exportLedgerCsv(period: Period): Promise<string> {
  const rows = rowsOf<{ at: Date; id: string; kind: string; debit_account: string; credit_account: string; amount_cents: number; match: string | null; payment_id: string | null; email: string | null; reason: string | null }>(
    await db.execute(sql`
      select l.at, l.id, l.kind, l.debit_account, l.credit_account, l.amount_cents, concat(h.name, ' gegen ', a.name) as match, l.payment_id,
        (select email from users where id = coalesce(l.debit_user_id, l.credit_user_id)) as email, l.reason
      from ledger_entries l
      left join matches m on m.id = l.match_id
      left join teams h on h.id = m.home_team_id
      left join teams a on a.id = m.away_team_id
      where l.at >= ${period.from} and l.at < ${period.to}
      order by l.at, l.id`),
  );
  return toCsv([
    ["Datum", "Buchungs-ID", "Art", "Soll", "Haben", "Betrag EUR", "Spiel", "Zahlungs-ID", "Nutzer", "Grund"],
    ...rows.map((r) => [new Date(r.at).toISOString(), r.id, r.kind, r.debit_account, r.credit_account, euroForCsv(r.amount_cents), r.match, r.payment_id, r.email, r.reason]),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Alarme
// ---------------------------------------------------------------------------------------------

export type Alert = { code: string; severity: "high" | "medium"; title: string; detail: string; href?: string };

export async function getAlerts(): Promise<Alert[]> {
  await connection();
  const alerts: Alert[] = [];
  const now = new Date();

  const tb = await trialBalance();
  if (!tb.balanced) alerts.push({ code: "unbalanced", severity: "high", title: "Saldenprobe stimmt nicht", detail: `Soll ${formatEuro(tb.totalDebit)} und Haben ${formatEuro(tb.totalCredit)} sind verschieden.`, href: "/admin/finanzen" });

  const losses = await listMatchFinance({ from: new Date(now.getTime() - 60 * 86_400_000), to: new Date(now.getTime() + 86_400_000) });
  for (const m of losses.filter((x) => x.status === "played" && x.marginCents < 0)) {
    alerts.push({ code: `loss:${m.id}`, severity: "medium", title: `Verlustspiel: ${m.homeName} gegen ${m.awayName}`, detail: `Marge ${formatEuro(m.marginCents)} (Einnahmen ${formatEuro(m.revenueCents)}, Hallenkosten ${formatEuro(m.costCents)}).`, href: `/admin/finanzen/spiel/${m.id}` });
  }

  const frequent = rowsOf<{ name: string; n: number; user_id: string }>(
    await db.execute(sql`
      select u.id as user_id, u.name, count(*)::int as n from ledger_entries l join users u on u.id = l.credit_user_id
      where l.credit_account = 'wallet' and l.kind = 'refund' and l.at > now() - interval '30 days'
      group by u.id, u.name having count(*) >= 3 order by n desc limit 10`),
  );
  for (const f of frequent) alerts.push({ code: `refunds:${f.user_id}`, severity: "medium", title: `Viele Erstattungen: ${f.name}`, detail: `${f.n} Erstattungen in 30 Tagen.`, href: "/admin/nutzer" });

  const negative = rowsOf<{ name: string; balance: number; user_id: string }>(
    await db.execute(sql`
      select u.id as user_id, u.name,
        (coalesce(sum(case when l.credit_account = 'wallet' and l.credit_user_id = u.id then l.amount_cents else 0 end), 0) - coalesce(sum(case when l.debit_account = 'wallet' and l.debit_user_id = u.id then l.amount_cents else 0 end), 0))::int as balance
      from users u join ledger_entries l on l.credit_user_id = u.id or l.debit_user_id = u.id
      group by u.id, u.name having
        (coalesce(sum(case when l.credit_account = 'wallet' and l.credit_user_id = u.id then l.amount_cents else 0 end), 0) - coalesce(sum(case when l.debit_account = 'wallet' and l.debit_user_id = u.id then l.amount_cents else 0 end), 0)) < 0
      limit 10`),
  );
  for (const n of negative) alerts.push({ code: `negative:${n.user_id}`, severity: "high", title: `Negatives Guthaben: ${n.name}`, detail: `Kontostand ${formatEuro(n.balance)}.`, href: "/admin/nutzer" });

  const unbooked = rowsOf<{ id: string; amount_cents: number }>(
    await db.execute(sql`
      select p.id, p.amount_cents from payments p
      where p.status = 'succeeded' and not exists (select 1 from ledger_entries l where l.payment_id = p.id and l.kind = 'topup') limit 10`),
  );
  for (const u of unbooked) alerts.push({ code: `unbooked:${u.id}`, severity: "high", title: "Zahlung ohne Buchung", detail: `Zahlung ${u.id.slice(0, 8)} über ${formatEuro(u.amount_cents)} ist erfolgreich, aber nicht im Ledger.`, href: "/admin/finanzen" });

  const stuck = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from payments where status = 'pending' and created_at < now() - interval '6 hours'`));
  if (stuck[0].n > 0) alerts.push({ code: "stuck-payments", severity: "medium", title: "Hängende Zahlungen", detail: `${stuck[0].n} Zahlung(en) seit über 6 Stunden offen.` });

  if (await paymentsEnabled()) {
    const unsettled = rowsOf<{ id: string; home: string; away: string }>(
      await db.execute(sql`
        select m.id, h.name as home, a.name as away from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
        where m.status = 'confirmed' and m.settled_at is null and m.starts_at < now() and exists (select 1 from match_participants p where p.match_id = m.id and p.paid_cents > 0) limit 10`),
    );
    for (const m of unsettled) alerts.push({ code: `unsettled:${m.id}`, severity: "high", title: `Nicht abgerechnet: ${m.home} gegen ${m.away}`, detail: "Das Spiel hat begonnen, aber die Anteile wurden noch nicht abgerechnet.", href: `/admin/finanzen/spiel/${m.id}` });

    const noJob = rowsOf<{ id: string; home: string; away: string }>(
      await db.execute(sql`
        select m.id, h.name as home, a.name as away from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
        where m.status = 'confirmed' and m.starts_at > now() and m.starts_at < now() + interval '48 hours'
          and not exists (select 1 from booking_jobs j where j.match_id = m.id and j.status in ('booked','confirmed','done')) limit 10`),
    );
    for (const m of noJob) alerts.push({ code: `unbooked-hall:${m.id}`, severity: "high", title: `Halle noch nicht gebucht: ${m.home} gegen ${m.away}`, detail: "Das Spiel findet in weniger als 48 Stunden statt.", href: "/admin/buchungen" });
  }
  return alerts;
}

