// 012 M6 (Entscheid F2): Offene Altspiele mit Guthabenzahlung schließen. Betrifft nur Test-/Seed-Daten (Soccaz ist nicht live, Entscheid F1).
// Auswahl: Spiele im Altmodell (legacy_share_model = true), noch offen (lobby/confirmed), mit mindestens einem Teilnehmer mit paid_cents > 0, die noch keinen Eintrag 'legacy.close' haben.
// Wirkung (nur mit apply): Spiel -> cancelled mit Grund, Eintrag 'legacy.close' in audit_log, Mitteilung an die Teilnehmer OHNE Geldversprechen.
// KEINE Ledger-Buchung, KEIN Stripe-Aufruf, keine Änderung an paid_cents: Salden bleiben, wie sie sind (sie werden mit der M6b-Migration im Hauptbuch auf 0 gesetzt, Entscheid F1).
import type { Pool, PoolClient } from "pg";

export const CLOSE_REASON = "Das Spiel wurde wegen der Umstellung der Zahlung geschlossen.";
export const CLOSE_ACTION = "legacy.close";

export type LegacyGame = { matchId: string; number: number | null; status: string; startsAt: Date; participants: number; paidParticipants: number; paidCents: number; manualReason: string | null };
export type CloseResult = { apply: boolean; games: LegacyGame[]; manual: LegacyGame[]; closed: number; notified: number };

type Q = Pick<Pool | PoolClient, "query">;

/**
 * Kandidaten: offene Altspiele (kind team/private) mit Guthabenzahlung, ohne Marker legacy.close.
 * manualReason (Review R-F2): Spiele, die cancelMatchTx nicht still absagen wuerde, werden NICHT geschlossen, sondern nur gelistet:
 * Abbuchungszeilen (payment_charges: Absage nur mit Stripe-Erstattung), Provisionsbuchung (reverseCommission schreibt ins Hauptbuch), offener Buchungsauftrag (withdrawBookingJob).
 */
async function candidates(q: Q, only?: string[]): Promise<LegacyGame[]> {
  const { rows } = await q.query<{ id: string; number: number | null; status: string; starts_at: Date; participants: number; paid_participants: number; paid_cents: number; manual_reason: string | null }>(
    `select m.id, m.number, m.status, m.starts_at,
            count(p.user_id)::int as participants,
            count(*) filter (where p.paid_cents > 0)::int as paid_participants,
            coalesce(sum(p.paid_cents), 0)::int as paid_cents,
            case when exists (select 1 from payment_charges c where c.match_id = m.id) then 'Abbuchungszeilen (Stripe-Erstattung noetig)'
                 when exists (select 1 from match_commissions mc where mc.match_id = m.id and mc.ledger_entry_id is not null) then 'Provisionsbuchung im Hauptbuch'
                 when exists (select 1 from booking_jobs b where b.match_id = m.id and b.status not in ('withdrawn', 'done')) then 'offener Buchungsauftrag'
            end as manual_reason
       from matches m
       join match_participants p on p.match_id = m.id
      where m.legacy_share_model = true
        and m.kind in ('team', 'private')
        and m.status in ('lobby', 'confirmed')
        and ($1::uuid[] is null or m.id = any($1::uuid[]))
        and not exists (select 1 from audit_log a where a.action = '${CLOSE_ACTION}' and a.entity = 'match' and a.entity_id = m.id::text)
      group by m.id
     having count(*) filter (where p.paid_cents > 0) > 0
      order by m.starts_at, m.id`,
    [only ?? null],
  );
  return rows.map((r) => ({ matchId: r.id, number: r.number, status: r.status, startsAt: r.starts_at, participants: r.participants, paidParticipants: r.paid_participants, paidCents: r.paid_cents, manualReason: r.manual_reason }));
}

/** Schliessbare Altspiele (ohne die manuell zu klaerenden). */
export async function selectLegacyGames(q: Q, only?: string[]): Promise<LegacyGame[]> {
  return (await candidates(q, only)).filter((g) => !g.manualReason);
}

/** Trockenlauf (apply = false, Standard): nur Auswahl, keine Schreibzugriffe. apply = true: je Spiel eine Transaktion (Spiel sperren, erneut prüfen, schließen, markieren, mitteilen). */
export async function closeLegacyGames(pool: Pool, opts: { apply?: boolean; /** nur diese Spiele (Tests); ohne Angabe alle passenden */ only?: string[]; /** nur Tests: laeuft nach der Auswahl, vor den Transaktionen (Wettlauf nachstellen) */ afterSelect?: () => Promise<void> } = {}): Promise<CloseResult> {
  const apply = opts.apply === true;
  const all = await candidates(pool, opts.only);
  const games = all.filter((g) => !g.manualReason);
  const manual = all.filter((g) => g.manualReason);
  if (!apply) return { apply, games, manual, closed: 0, notified: 0 };

  await opts.afterSelect?.();
  let closed = 0;
  let notified = 0;
  for (const g of games) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select 1 from matches where id = $1 for update", [g.matchId]);
      // erneute Pruefung NACH der Sperre (Status, Marker, Abbuchung/Provision/Buchungsauftrag, Summen): dieselbe Abfrage wie die Auswahl
      const [now] = (await candidates(client, [g.matchId])).filter((c) => !c.manualReason);
      if (!now) {
        await client.query("rollback");
        continue;
      }
      await client.query("update matches set status = 'cancelled', cancel_reason = $2 where id = $1", [g.matchId, CLOSE_REASON]);
      await client.query("insert into audit_log (actor_id, action, entity, entity_id, before, after) values (null, $1, 'match', $2, $3, $4)", [
        CLOSE_ACTION,
        g.matchId,
        JSON.stringify({ status: now.status }),
        JSON.stringify({ status: "cancelled", reason: CLOSE_REASON, participants: now.participants, paidParticipants: now.paidParticipants, paidCents: now.paidCents, ledger: "unchanged" }),
      ]);
      const ins = await client.query(
        `insert into notifications (user_id, type, title, body, url)
         select p.user_id, 'match.cancelled', 'Spiel geschlossen', $2, $3 from match_participants p where p.match_id = $1`,
        [g.matchId, `${CLOSE_REASON} Bei Fragen melde dich beim Support.`, `/lobby/${g.matchId}`],
      );
      await client.query("commit");
      closed += 1;
      notified += ins.rowCount ?? 0;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return { apply, games, manual, closed, notified };
}
