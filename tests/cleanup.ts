import type { Pool } from "pg";

/**
 * Entfernt alle Testdaten: Nutzer mit @test.local samt Teams, Spielen, Buchungen, Zahlungen und Belegen.
 * Das Buchungsjournal ist unveränderlich; das Aufräumen nutzt die Wartungsfreigabe des Triggers, nur in dieser Transaktion.
 */
export async function cleanupTestData(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local socaz.ledger_maintenance = 'on'");
    await client.query("create temp table _tu on commit drop as select id from users where email like '%@test.local'");
    await client.query("create temp table _tt on commit drop as select id from teams where created_by in (select id from _tu)");
    await client.query(
      "create temp table _tm on commit drop as select id from matches where home_team_id in (select id from _tt) or away_team_id in (select id from _tt)",
    );
    const statements = [
      "update settings set updated_by = null where updated_by in (select id from _tu)",
      "delete from receipts where user_id in (select id from _tu) or match_id in (select id from _tm)",
      "delete from promo_redemptions where user_id in (select id from _tu)",
      "delete from expenses where match_id in (select id from _tm) or created_by in (select id from _tu)",
      "delete from ledger_entries where debit_user_id in (select id from _tu) or credit_user_id in (select id from _tu) or match_id in (select id from _tm) or actor_id in (select id from _tu)",
      "delete from payments where user_id in (select id from _tu)",
      "delete from promo_codes where created_by in (select id from _tu) or note = 'e2e'",
      "delete from matches where id in (select id from _tm)",
      "delete from venues where name like 'E2E %'",
      "delete from audit_log where actor_id in (select id from _tu)",
      "delete from teams where id in (select id from _tt)",
      "delete from users where id in (select id from _tu)",
      "update settings set value = 'false'::jsonb where key = 'payments_enabled'",
      "update settings set value = '8'::jsonb where key = 'min_paid_players'",
    ];
    for (const s of statements) await client.query(s);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
