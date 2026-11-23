// 012 M6b 1c-ii-b, Vorbedingung (Entscheid t2q): Salden-Guard vor dem Löschen des Guthaben-Pfads. NUR LESEN (read only), keine Schreibzugriffe, keine Personendaten in der Ausgabe (nur Zahlen).
// Geprüft wird, ob im Guthabenmodell noch Geld steht:
//  1. Guthaben-Salden je Nutzer (Hauptbuch, Konto wallet): Nutzer mit Saldo != 0
//  2. match_participants.paid_cents > 0 (bezahlte Plätze im Spiel)
//  3. tournament_players.paid_cents > 0 (bezahlte Plätze im Turnier)
//  4. pending_refunds (offene Erstattungen an ausgefallene Spieler)
//  5. offene Altspiele mit Guthabenzahlung (Skript close-legacy-games, F2: Trockenlauf muss 0/0 liefern)
// Ergebnis != 0 => KEINE Löschung, klare Meldung (evaluateGuard). Das Skript scripts/legacy-balance-guard.mjs beendet sich dann mit Code 1.
import type { Pool, PoolClient } from "pg";
import { closeLegacyGames } from "./close-legacy-games";

export type GuardFindings = {
  walletUsers: number; // Nutzer mit Guthaben-Saldo != 0
  walletNetCents: number; // Summe dieser Salden (vorzeichenbehaftet)
  matchPaidRows: number; // OFFENE Plaetze (Spiel lobby/confirmed, nicht abgerechnet)
  matchPaidCents: number;
  tournamentPaidRows: number; // OFFENE Plaetze (Turnier nicht beendet/abgesagt)
  tournamentPaidCents: number;
  pendingRefundRows: number;
  pendingRefundCents: number;
  walletUnassignedCents: number; // Gesamtsumme aller wallet-Buchungen minus Summe der Nutzersalden (Buchungen ohne Nutzerbezug); muss 0 sein
  paymentsPending: number; // alte Stripe-Aufladungen im Status pending (SEPA kann Tage dauern)
  paymentsUnbooked: number; // erfolgreiche Aufladungen ohne Hauptbucheintrag (Art topup)
  matchPaidHistRows: number; // nur Info (Ausgang unabhaengig): bezahlte Plaetze abgerechneter/abgesagter Spiele
  tournamentPaidHistRows: number; // nur Info: bezahlte Plaetze beendeter/abgesagter Turniere
  legacyGames: number; // schließbare offene Altspiele mit Guthabenzahlung (F2)
  legacyManual: number; // manuell zu klärende (Abbuchung/Provision/Buchungsauftrag)
};

type Q = Pick<Pool | PoolClient, "query">;

/** Liest die Befunde. Läuft in einer Transaktion `read only`, wenn ein Pool übergeben wird; ändert nie etwas. */
export async function readLegacyBalances(pool: Pool): Promise<GuardFindings> {
  const client = await pool.connect();
  try {
    await client.query("begin transaction read only");
    const q: Q = client;
    const wallet = await q.query<{ users: number; net: number }>(
      `select count(*)::int as users, coalesce(sum(net), 0)::int as net from (
         select u.id,
                coalesce(sum(case when l.credit_account = 'wallet' and l.credit_user_id = u.id then l.amount_cents else 0 end), 0)
              - coalesce(sum(case when l.debit_account = 'wallet' and l.debit_user_id = u.id then l.amount_cents else 0 end), 0) as net
           from users u join ledger_entries l on l.credit_user_id = u.id or l.debit_user_id = u.id
          group by u.id
         having coalesce(sum(case when l.credit_account = 'wallet' and l.credit_user_id = u.id then l.amount_cents else 0 end), 0)
              - coalesce(sum(case when l.debit_account = 'wallet' and l.debit_user_id = u.id then l.amount_cents else 0 end), 0) <> 0
       ) t`,
    );
    const total = await q.query<{ net: number }>(
      `select coalesce(sum(case when credit_account = 'wallet' then amount_cents else 0 end), 0)::int - coalesce(sum(case when debit_account = 'wallet' then amount_cents else 0 end), 0)::int as net from ledger_entries`,
    );
    const pay = await q.query<{ pending: number; unbooked: number }>(
      `select count(*) filter (where p.status = 'pending')::int as pending,
              count(*) filter (where p.status = 'succeeded' and not exists (select 1 from ledger_entries l where l.payment_id = p.id and l.kind = 'topup'))::int as unbooked
         from payments p`,
    );
    const mp = await q.query<{ n: number; c: number; h: number }>(
      `select count(*) filter (where m.status in ('lobby', 'confirmed') and m.settled_at is null)::int as n,
              coalesce(sum(p.paid_cents) filter (where m.status in ('lobby', 'confirmed') and m.settled_at is null), 0)::int as c,
              count(*) filter (where not (m.status in ('lobby', 'confirmed') and m.settled_at is null))::int as h
         from match_participants p join matches m on m.id = p.match_id where p.paid_cents > 0`,
    );
    const tp = await q.query<{ n: number; c: number; h: number }>(
      `select count(*) filter (where t.status not in ('finished', 'cancelled'))::int as n,
              coalesce(sum(p.paid_cents) filter (where t.status not in ('finished', 'cancelled')), 0)::int as c,
              count(*) filter (where t.status in ('finished', 'cancelled'))::int as h
         from tournament_players p join tournaments t on t.id = p.tournament_id where p.paid_cents > 0`,
    );
    const pr = await q.query<{ n: number; c: number }>("select count(*)::int as n, coalesce(sum(amount_cents), 0)::int as c from pending_refunds");
    await q.query("commit");
    const legacy = await closeLegacyGames(pool, { apply: false }); // Trockenlauf: schreibt nichts
    return {
      walletUsers: wallet.rows[0].users,
      walletNetCents: wallet.rows[0].net,
      walletUnassignedCents: total.rows[0].net - wallet.rows[0].net,
      paymentsPending: pay.rows[0].pending,
      paymentsUnbooked: pay.rows[0].unbooked,
      matchPaidHistRows: mp.rows[0].h,
      tournamentPaidHistRows: tp.rows[0].h,
      matchPaidRows: mp.rows[0].n,
      matchPaidCents: mp.rows[0].c,
      tournamentPaidRows: tp.rows[0].n,
      tournamentPaidCents: tp.rows[0].c,
      pendingRefundRows: pr.rows[0].n,
      pendingRefundCents: pr.rows[0].c,
      legacyGames: legacy.games.length,
      legacyManual: legacy.manual.length,
    };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Entscheidung: ok nur, wenn ALLES 0 ist. Sonst die Zeilen für die Meldung (nur Zahlen, keine Personendaten). */
export function evaluateGuard(f: GuardFindings): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  if (f.walletUsers !== 0 || f.walletNetCents !== 0) lines.push(`Guthaben-Salden: ${f.walletUsers} Nutzer mit Saldo != 0 (Summe ${f.walletNetCents} Cent)`);
  if (f.walletUnassignedCents !== 0) lines.push(`Guthaben-Buchungen ohne Nutzerbezug: ${f.walletUnassignedCents} Cent (Gesamtsumme der wallet-Konten weicht von der Summe der Nutzersalden ab)`);
  if (f.paymentsPending !== 0) lines.push(`Alte Aufladungen im Status pending (payments): ${f.paymentsPending}`);
  if (f.paymentsUnbooked !== 0) lines.push(`Erfolgreiche Aufladungen ohne Hauptbucheintrag (payments): ${f.paymentsUnbooked}`);
  if (f.matchPaidRows !== 0 || f.matchPaidCents !== 0) lines.push(`Offene bezahlte Spielplätze (paid_cents > 0): ${f.matchPaidRows} Plätze, ${f.matchPaidCents} Cent`);
  if (f.tournamentPaidRows !== 0 || f.tournamentPaidCents !== 0) lines.push(`Offene bezahlte Turnierplätze (paid_cents > 0): ${f.tournamentPaidRows} Plätze, ${f.tournamentPaidCents} Cent`);
  if (f.pendingRefundRows !== 0 || f.pendingRefundCents !== 0) lines.push(`Offene Erstattungen (pending_refunds): ${f.pendingRefundRows} Zeilen, ${f.pendingRefundCents} Cent`);
  if (f.legacyGames !== 0 || f.legacyManual !== 0) lines.push(`Offene Altspiele mit Guthabenzahlung (F2): ${f.legacyGames} schließbar, ${f.legacyManual} manuell`);
  return { ok: lines.length === 0, lines };
}

/** Nur Information (beeinflusst den Ausgang nicht): historische Zeilen mit paid_cents > 0 in abgerechneten/abgesagten Spielen und beendeten/abgesagten Turnieren (settle laesst paid_cents stehen). */
export function historyInfo(f: GuardFindings): string | null {
  return f.matchPaidHistRows !== 0 || f.tournamentPaidHistRows !== 0 ? `Info (kein Befund): historische Zeilen mit paid_cents > 0: ${f.matchPaidHistRows} in abgeschlossenen Spielen, ${f.tournamentPaidHistRows} in beendeten Turnieren` : null;
}

export const GUARD_FAIL_MESSAGE = "Salden-Guard NICHT erfüllt: KEINE Löschung des Guthaben-Pfads. Erst klären (Skript close-legacy-games, Erstattung/Auflösung), dann erneut prüfen.";
