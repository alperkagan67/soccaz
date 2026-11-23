// 012 M6 (Entscheid F2): Offene Altspiele mit Guthabenzahlung schließen. Betrifft nur Test-/Seed-Daten (Soccaz ist nicht live, Entscheid F1).
// Auswahl: Spiele im Altmodell (legacy_share_model = true), noch offen (lobby/confirmed), mit mindestens einem Teilnehmer mit paid_cents > 0, die noch keinen Eintrag 'legacy.close' haben.
// Wirkung (nur mit apply): Spiel -> cancelled mit Grund, Eintrag 'legacy.close' in audit_log, Mitteilung an die Teilnehmer OHNE Geldversprechen.
// KEINE Ledger-Buchung, KEIN Stripe-Aufruf, keine Änderung an paid_cents: Salden bleiben, wie sie sind (sie werden mit der M6b-Migration im Hauptbuch auf 0 gesetzt, Entscheid F1).
import type { Pool, PoolClient } from "pg";

export const CLOSE_REASON = "Das Spiel wurde wegen der Umstellung der Zahlung geschlossen.";
export const CLOSE_ACTION = "legacy.close";

export type LegacyGame = { matchId: string; number: number | null; status: string; startsAt: Date; participants: number; paidParticipants: number; paidCents: number };
export type CloseResult = { apply: boolean; games: LegacyGame[]; closed: number; notified: number };

type Q = Pick<Pool | PoolClient, "query">;

/** Offene Altspiele mit Guthabenzahlung, ohne bereits geschlossene (Marker legacy.close). */
export async function selectLegacyGames(q: Q, only?: string[]): Promise<LegacyGame[]> {
  const { rows } = await q.query<{ id: string; number: number | null; status: string; starts_at: Date; participants: number; paid_participants: number; paid_cents: number }>(
    `select m.id, m.number, m.status, m.starts_at,
            count(p.user_id)::int as participants,
            count(*) filter (where p.paid_cents > 0)::int as paid_participants,
            coalesce(sum(p.paid_cents), 0)::int as paid_cents
       from matches m
       join match_participants p on p.match_id = m.id
      where m.legacy_share_model = true
        and m.status in ('lobby', 'confirmed')
        and ($1::uuid[] is null or m.id = any($1::uuid[]))
        and not exists (select 1 from audit_log a where a.action = '${CLOSE_ACTION}' and a.entity = 'match' and a.entity_id = m.id::text)
      group by m.id
     having count(*) filter (where p.paid_cents > 0) > 0
      order by m.starts_at, m.id`,
    [only ?? null],
  );
  return rows.map((r) => ({ matchId: r.id, number: r.number, status: r.status, startsAt: r.starts_at, participants: r.participants, paidParticipants: r.paid_participants, paidCents: r.paid_cents }));
}

/** Trockenlauf (apply = false, Standard): nur Auswahl, keine Schreibzugriffe. apply = true: je Spiel eine Transaktion (Spiel sperren, erneut prüfen, schließen, markieren, mitteilen). */
export async function closeLegacyGames(pool: Pool, opts: { apply?: boolean; /** nur diese Spiele (Tests); ohne Angabe alle passenden */ only?: string[] } = {}): Promise<CloseResult> {
  const apply = opts.apply === true;
  const games = await selectLegacyGames(pool, opts.only);
  if (!apply) return { apply, games, closed: 0, notified: 0 };

  let closed = 0;
  let notified = 0;
  for (const g of games) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows: locked } = await client.query<{ status: string }>("select status from matches where id = $1 for update", [g.matchId]);
      const stillOpen = locked[0] && ["lobby", "confirmed"].includes(locked[0].status);
      const { rows: marked } = await client.query("select 1 from audit_log where action = $1 and entity = 'match' and entity_id = $2", [CLOSE_ACTION, g.matchId]);
      if (!stillOpen || marked.length > 0) {
        await client.query("rollback");
        continue;
      }
      await client.query("update matches set status = 'cancelled', cancel_reason = $2 where id = $1", [g.matchId, CLOSE_REASON]);
      await client.query("insert into audit_log (actor_id, action, entity, entity_id, before, after) values (null, $1, 'match', $2, $3, $4)", [
        CLOSE_ACTION,
        g.matchId,
        JSON.stringify({ status: g.status }),
        JSON.stringify({ status: "cancelled", reason: CLOSE_REASON, participants: g.participants, paidParticipants: g.paidParticipants, paidCents: g.paidCents, ledger: "unchanged" }),
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
  return { apply, games, closed, notified };
}
