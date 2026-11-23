import { randomUUID } from "node:crypto";
import { run, testDb } from "./helpers";

/** Setzt den Anstoß in die Vergangenheit, damit das Spiel "läuft". */
export async function startMatchNow(matchId: string, minutesAgo = 10) {
  await testDb().query("update matches set starts_at = now() - make_interval(mins => $2) where id = $1", [matchId, minutesAgo]);
}

/** Legt einen Plattform-Admin an (ohne Login). */
export async function seedAdmin(key: string, name = `Admin ${key}`): Promise<string> {
  return seedUserRole(key, "admin", name);
}

/**
 * Legt Admin 1 an (role admin und is_owner, ohne Login). Es gibt höchstens einen je Datenbank (Teilindex users_one_owner): ein früherer Admin 1 aus einem
 * anderen Test wird zuvor zu Admin 2 (is_owner false). Nur für Tests, die Admin-1-Rechte brauchen (Finanzen, Einstellungen, Rollen; Vertrag 009 AC-1).
 */
export async function seedOwner(key: string, name = `Admin ${key}`): Promise<string> {
  await testDb().query("update users set is_owner = false where is_owner");
  const id = await seedUserRole(key, "admin", name);
  await testDb().query("update users set is_owner = true where id = $1", [id]);
  return id;
}

/** Legt einen Nutzer mit beliebiger Rolle an (ohne Login). */
export async function seedUserRole(key: string, role: string, name = `${role} ${key}`): Promise<string> {
  const { rows } = await testDb().query(
    `insert into users (email, name, role, city, position, onboarded_at, age_confirmed_at, terms_accepted_at)
     values ($1, $2, $3, 'Essen', 'Flexibel', now(), now(), now()) returning id`,
    [`${key}-${run}@test.local`, name, role],
  );
  return rows[0].id;
}

export async function setConfirmDeadline(matchId: string, hoursFromNow: number) {
  await testDb().query("update match_results set confirm_deadline = now() + make_interval(hours => $2) where match_id = $1", [matchId, hoursFromNow]);
}

/** Ruft einen Hintergrundjob über die geschützte Schnittstelle auf. */
export async function callJob(baseURL: string, name: string): Promise<unknown> {
  const response = await fetch(`${baseURL}/api/jobs/${name}`, { method: "POST", headers: { "x-job-secret": process.env.JOB_SECRET ?? "dev-job-secret" } });
  if (!response.ok) throw new Error(`Job ${name} fehlgeschlagen: ${response.status}`);
  return (await response.json()).result;
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await testDb().query(sql, params)).rows as T[];
}

/** Verschiebt Anstoß und Erstellzeit eines Spiels relativ zu jetzt (in Stunden). */
export async function setMatchTimes(matchId: string, startsInHours: number, createdHoursAgo = 1) {
  await testDb().query(
    "update matches set starts_at = now() + make_interval(secs => $2), created_at = now() - make_interval(secs => $3) where id = $1",
    [matchId, startsInHours * 3600, createdHoursAgo * 3600],
  );
}

export async function setSubmittedAgo(matchId: string, hoursAgo: number) {
  await testDb().query("update match_results set submitted_at = now() - make_interval(hours => $2) where match_id = $1", [matchId, hoursAgo]);
}

// ---------------------------------------------------------------------------------------------
// Geld (Phase 2)
// ---------------------------------------------------------------------------------------------

export async function setPlatformSetting(key: string, value: unknown) {
  await testDb().query("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(value)]);
}

export async function userIdByEmail(email: string): Promise<string> {
  return (await query<{ id: string }>("select id from users where email = $1", [email]))[0].id;
}

/** Schreibt dem Guthaben eines Nutzers Geld gut (wie eine erfolgreiche Aufladung). */
export async function fundWallet(userId: string, cents: number) {
  await testDb().query(
    "insert into ledger_entries (debit_account, credit_account, credit_user_id, amount_cents, kind, idempotency_key, reason) values ('clearing', 'wallet', $1, $2, 'topup', $3, 'E2E Aufladung')",
    [userId, cents, `e2e-topup:${randomUUID()}`],
  );
}

export async function walletBalanceOf(userId: string): Promise<number> {
  const rows = await query<{ balance: number }>(
    `select (coalesce(sum(case when credit_account = 'wallet' and credit_user_id = $1 then amount_cents else 0 end), 0)
           - coalesce(sum(case when debit_account = 'wallet' and debit_user_id = $1 then amount_cents else 0 end), 0))::int as balance
     from ledger_entries where credit_user_id = $1 or debit_user_id = $1`,
    [userId],
  );
  return rows[0].balance;
}

/** Spieler, der schon bezahlt hat (Reservierung 10,00 EUR) und bereit ist: Teammitglied, Teilnehmer, Ledger-Buchungen. */
export async function seedPaidPlayer(matchId: string, teamId: string, tag: string, reservedCents = 1000): Promise<string> {
  const userId = await seedUserRole(tag, "player", `Spieler ${tag}`);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [teamId, userId]);
  await testDb().query("insert into match_participants (match_id, user_id, team_id, ready_at, paid_cents, paid_at) values ($1, $2, $3, now(), $4, now())", [matchId, userId, teamId, reservedCents]);
  await fundWallet(userId, 2000);
  await testDb().query(
    "insert into ledger_entries (debit_account, debit_user_id, credit_account, amount_cents, kind, match_id, idempotency_key, reason) values ('wallet', $1, 'revenue', $2, 'match_share', $3, $4, 'E2E Reservierung')",
    [userId, reservedCents, matchId, `e2e-share:${randomUUID()}`],
  );
  return userId;
}

/**
 * Setzt den Anteil eines BESTEHENDEN Teilnehmers wie payShare als bezahlt (paid_cents, paid_at, Abbuchung vom Guthaben im Hauptbuch). Das Guthaben muss vorher da sein (fundWallet).
 * Ersatz für den Klick auf "<Betrag> bezahlen": den Knopf gibt es seit 012 M6a nicht mehr (Vertrag 013 AC-14); die Server-Logik (payShare) prüfen die Integrationstests.
 */
export async function seedShare(matchId: string, userId: string, cents: number) {
  await testDb().query("update match_participants set paid_cents = $3, paid_at = now() where match_id = $1 and user_id = $2", [matchId, userId, cents]);
  await testDb().query(
    "insert into ledger_entries (debit_account, debit_user_id, credit_account, amount_cents, kind, match_id, idempotency_key, reason) values ('wallet', $1, 'revenue', $2, 'match_share', $3, $4, 'E2E Anteil (ersetzt Bezahlen-Knopf)')",
    [userId, cents, matchId, `e2e-share:${randomUUID()}`],
  );
}

export async function teamIdBySlugLike(namePart: string): Promise<string> {
  return (await query<{ id: string }>("select id from teams where name like $1 order by created_at desc limit 1", [`%${namePart}%`]))[0].id;
}

/** Kartenmodell (012): Spieler im Team und im Spiel, mit hinterlegter Karte (card_ready) und bereit, OHNE bezahlten Anteil (paid_cents = 0). */
export async function seedCardPlayer(matchId: string, teamId: string, tag: string): Promise<string> {
  const userId = await seedUserRole(tag, "player", `Spieler ${tag}`);
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [teamId, userId]);
  await testDb().query("insert into match_participants (match_id, user_id, team_id, ready_at, card_status) values ($1, $2, $3, now(), 'card_ready')", [matchId, userId, teamId]);
  return userId;
}

/** Kartenmodell: der bestehende Teilnehmer hat eine Karte hinterlegt (card_ready), ohne bezahlten Anteil. */
export async function seedCardReady(matchId: string, userId: string) {
  await testDb().query("update match_participants set card_status = 'card_ready' where match_id = $1 and user_id = $2", [matchId, userId]);
}

/**
 * Endzustand eines per Karte abgebuchten und abgerechneten Spiels (012 M6b; die Abbuchung selbst prüfen card-trigger/card-charge in der Integration, der Browser prüft den Admin-Bereich,
 * der diese Zeilen liest). Wie die echte Abbuchung (charge.ts): Hauptbuch-Zeile clearing -> revenue (Art match_share, ohne Nutzer-Bezug), dazu card_status charged (paid_cents bleibt 0) und matches.settled_at.
 * Idempotent gegen eine echte Sofortabbuchung (FakeProvider): ein Platz mit card_status charged wird übersprungen, settled_at bleibt dann wie gesetzt.
 */
export async function seedCharged(matchId: string, userIds: string[], shareCents: number): Promise<number> {
  let set = 0;
  // nie still nichts tun: der Ausgangszustand muss "noch nicht abgebucht" sein (sonst verdoppelt der Seed eine echte Abbuchung)
  const rows = await query<{ n: number }>("select count(*)::int as n from payment_charges where match_id = $1", [matchId]);
  if (rows[0].n > 0) throw new Error("seedCharged: für dieses Spiel gibt es schon Abbuchungszeilen (echte Abbuchung gelaufen?)");
  for (const userId of userIds) {
    // wie die echte Abbuchung: der Platz wird charged, paid_cents bleibt 0 ("nur Guthaben"; sonst kippt das Spiel ins Guthabenmodell, siehe card-charge.test.ts)
    await testDb().query("update match_participants set card_status = 'charged' where match_id = $1 and user_id = $2", [matchId, userId]);
    await testDb().query(
      "insert into payment_charges (match_id, user_id, amount_cents, status, payment_intent_id, idempotency_key) values ($1, $2, $3, 'succeeded', $4, $5)",
      [matchId, userId, shareCents, "pi_e2e_" + randomUUID(), `charge:${matchId}:${userId}`],
    );
    await testDb().query(
      "insert into ledger_entries (debit_account, credit_account, amount_cents, kind, match_id, idempotency_key, reason) values ('clearing', 'revenue', $1, 'match_share', $2, $3, 'E2E Abbuchung Anteil (Karte)')",
      [shareCents, matchId, "e2e-charge:" + randomUUID()],
    );
    set += 1;
  }
  if (set === 0) throw new Error("seedCharged: kein Platz gesetzt");
  await testDb().query("update matches set settled_at = now(), final_share_cents = $2 where id = $1", [matchId, shareCents]);
  return set;
}

/** Nur Test: stellt ein Spiel auf das Altspiel-Modell (ledger_model legacy, ohne Provision). Die Spalte ist unveränderlich außer mit der Wartungsausnahme (socaz.ledger_maintenance, nur in dieser Transaktion). */
export async function setLedgerModelLegacy(matchId: string) {
  const client = await testDb().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('socaz.ledger_maintenance', 'on', true)");
    await client.query("update matches set ledger_model = 'legacy' where id = $1", [matchId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Kartenmodell: aktive Partnerhalle für Turniere (Auswahl und Abbuchung gehen an diese Halle), ohne Betreiber-Zugang (keine Zusage nötig). */
export async function seedPartnerVenue(name: string): Promise<string> {
  const rows = await query<{ id: string }>("insert into venues (name, city, is_partner, active) values ($1, 'Essen', true, true) returning id", [name]);
  return rows[0].id;
}

/** Kartenmodell: der Nutzer hat eine Karte hinterlegt (Zahlungsprofil mit Zahlungsmethode); der FakeProvider bucht damit ab. */
export async function seedCardProfile(userId: string) {
  await testDb().query("insert into payment_profiles (user_id, stripe_customer_id, payment_method_id) values ($1, $2, $3) on conflict (user_id) do nothing", [userId, `cus_e2e_${userId}`, `pm_e2e_${userId}`]);
}

/**
 * Diagnose für Turnier-Abbuchungen (CI-Anhang, ohne Personendaten): Turnierzeile (Status, Halle, Snapshots, Preis, Zeiten), Teams (bereit), Spieler (mit/ohne Karte), Abbuchungszeilen nach Status und Fehlercode,
 * Audit tournament.* und charge.* sowie die Schalter. Zeigt, welche Bedingung der Abbuchung fehlt (chargeEligibility: not_open, no_venue, not_fixed, no_zusage, teams_missing, not_ready, not_due, cards_missing).
 */
export async function diagnoseTournamentCharges(tournamentId: string) {
  try {
    return await diagnoseTournamentChargesUnsafe(tournamentId);
  } catch (error) {
    return { diagnoseFehler: error instanceof Error ? error.message : String(error) }; // die Diagnose darf den eigentlichen Fehler nie überdecken
  }
}

async function diagnoseTournamentChargesUnsafe(tournamentId: string) {
  const [t] = await query("select status, venue_id is not null as has_venue, venue_access_required_snapshot, commission_percent_snapshot, venue_confirmed_at is not null as confirmed, final_share_cents, total_cents, max_teams, starts_at, created_at, registration_deadline, settled_at is not null as settled, bracket_generated_at is not null as bracket, price_round from tournaments where id = $1", [tournamentId]);
  const teams = await query("select (ready_at is not null) as ready, (paid_ready_at is not null) as paid_ready, count(*)::int as n from tournament_teams where tournament_id = $1 group by 1, 2", [tournamentId]);
  const players = await query("select (pp.payment_method_id is not null) as has_card, (p.paid_cents > 0) as legacy_paid, count(*)::int as n from tournament_players p left join payment_profiles pp on pp.user_id = p.user_id where p.tournament_id = $1 group by 1, 2", [tournamentId]);
  const charges = await query("select status, failure_code, count(*)::int as n from payment_charges where tournament_id = $1 group by 1, 2", [tournamentId]);
  const audits = await query("select action, count(*)::int as n from audit_log where entity = 'tournament' and entity_id = $1 and (action like 'tournament.%' or action like 'charge.%') group by 1 order by 1", [tournamentId]);
  const settings = await query("select key, value from settings where key in ('payments_enabled', 'card_payments_enabled')");
  return { tournament: t, teams, players, charges, audits, settings };
}
