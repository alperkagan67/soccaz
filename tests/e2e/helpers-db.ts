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

export async function seedPromo(code: string, kind: "percent" | "fixed", value: number, extra: { budgetCents?: number } = {}) {
  await testDb().query("insert into promo_codes (code, kind, value, budget_cents, note) values ($1, $2, $3, $4, 'e2e')", [code, kind, value, extra.budgetCents ?? null]);
}

export async function teamIdBySlugLike(namePart: string): Promise<string> {
  return (await query<{ id: string }>("select id from teams where name like $1 order by created_at desc limit 1", [`%${namePart}%`]))[0].id;
}
