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
 * der diese Zeilen liest). Wie die echte Abbuchung (charge.ts): Hauptbuch-Zeile clearing -> revenue (Art match_share, ohne Nutzer-Bezug), dazu paid_cents/paid_at und matches.settled_at.
 * Idempotent gegen eine echte Sofortabbuchung (FakeProvider): ein Spieler mit schon bezahltem Anteil wird übersprungen, settled_at bleibt dann wie gesetzt.
 */
export async function seedCharged(matchId: string, userIds: string[], shareCents: number) {
  for (const userId of userIds) {
    const [seat] = await query<{ paid_cents: number }>("select paid_cents from match_participants where match_id = $1 and user_id = $2", [matchId, userId]);
    if (seat && seat.paid_cents > 0) continue; // schon echt abgebucht
    await testDb().query("update match_participants set paid_cents = $3, paid_at = now(), card_status = 'charged' where match_id = $1 and user_id = $2", [matchId, userId, shareCents]);
    await testDb().query(
      "insert into ledger_entries (debit_account, credit_account, amount_cents, kind, match_id, idempotency_key, reason) values ('clearing', 'revenue', $1, 'match_share', $2, $3, 'E2E Abbuchung Anteil (Karte)')",
      [shareCents, matchId, "e2e-charge:" + randomUUID()],
    );
  }
  await testDb().query("update matches set settled_at = coalesce(settled_at, now()), final_share_cents = $2 where id = $1", [matchId, shareCents]);
}
