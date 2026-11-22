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
      "delete from ledger_entries where tournament_id in (select id from tournaments where organizer_id in (select id from _tu))",
      "delete from ledger_entries where debit_user_id in (select id from _tu) or credit_user_id in (select id from _tu) or match_id in (select id from _tm) or actor_id in (select id from _tu)",
      "delete from payments where user_id in (select id from _tu)",
      "delete from promo_codes where created_by in (select id from _tu) or note = 'e2e'",
      "delete from pro_events where pro_team_id in (select id from _tt) or created_by in (select id from _tu)",
      "delete from leagues where created_by in (select id from _tu)",
      "delete from sponsors where name like 'E2E %'",
      "delete from media where owner_id in (select id from _tu)",
      "delete from payment_erasure_tasks where user_id in (select id from _tu)",
      "delete from payment_dispute_entries where dispute_row_id in (select id from payment_disputes where match_id in (select id from _tm) or payer_user_id in (select id from _tu) or dispute_id like 'dp_test%')",
      // M5 (Turnier auf Karte): Zahlungszeilen eines Turniers (Fremdschluessel ohne cascade) vor dem Loeschen des Turniers entfernen
      "delete from payment_dispute_entries where dispute_row_id in (select id from payment_disputes where tournament_id in (select id from tournaments where organizer_id in (select id from _tu)))",
      "delete from payment_disputes where tournament_id in (select id from tournaments where organizer_id in (select id from _tu))",
      "delete from payment_refunds where tournament_id in (select id from tournaments where organizer_id in (select id from _tu))",
      "delete from payment_charges where tournament_id in (select id from tournaments where organizer_id in (select id from _tu))",
      "delete from payment_setup_intents where tournament_id in (select id from tournaments where organizer_id in (select id from _tu))",
      "delete from payment_disputes where match_id in (select id from _tm) or payer_user_id in (select id from _tu) or dispute_id like 'dp_test%'",
      // Beweisprotokoll (009 M3): ohne Fremdschluessel (Plan 14.1), aber der Guard auf matches/venues verweigert das Loeschen von Spielen mit Eintraegen: Eintraege der Testspiele VOR den Spielen
      // entfernen (die Wartungsausnahme gilt in dieser Transaktion; dann schreiben die Trigger auf den Fachtabellen nichts). Nur Testspiele; Eintraege fremder Spiele und Seed-Protokolle bleiben.
      // Das Loeschen mitten aus der globalen Kette erzeugt eine seq-Luecke und bricht prev_hash: darum wird die Kette danach NEU NUMMERIERT und neu verkettet (nur in dieser Test-/Entwicklungs-
      // Datenbank, nie produktiv; verifyEvidenceChain bleibt in den Folgetests gueltig). Ist die Tabelle leer, steht der Zaehler wieder auf 0.
      "delete from booking_evidence where match_id in (select id from _tm)",
      `do $$
       declare r record; prev text := ''; i integer := 0; h text;
       begin
         for r in select * from booking_evidence order by seq loop
           i := i + 1;
           h := evidence_hash(i, r.match_id, r.venue_id, r.round, r.job_id, r.kind, r.reason, r.at, r.actor_commitment, prev);
           update booking_evidence set seq = i, prev_hash = prev, hash = h where id = r.id;  -- aufsteigend: neue seq <= alte seq, kein Konflikt mit dem Unique-Index
           prev := h;
         end loop;
         update booking_evidence_counter set last_seq = i, last_hash = prev where id = 1;
       end $$`,
      "delete from matches where id in (select id from _tm)",
      // 011 M1: Betreiber-Zugänge zuerst (Fremdschlüssel auf Nutzer ohne cascade, auf Halle restrict)
      "delete from venue_access where user_id in (select id from _tu) or assigned_by in (select id from _tu) or lower(invited_email) like '%@test.local' or venue_id in (select id from venues where name like 'E2E %' or manager_user_id in (select id from _tu))",
      "delete from venues where name like 'E2E %'",
      "delete from tournaments where organizer_id in (select id from _tu)",
      // venues.manager_user_id hat keinen Fremdschlüssel: ohne Zurücksetzen bliebe nach dem Löschen der Testnutzer ein Betreiber ohne Nutzer stehen
      // (Hallen-Anfragen liefen dann in Leere oder scheiterten an der Benachrichtigung). Die Seed-Hallen (seed-venue-*, aus dem Frontend-Seed) sind Testdaten.
      "update venues set manager_user_id = null where manager_user_id in (select id from _tu)",
      "delete from venues where osm_id like 'seed-venue-%'",
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
