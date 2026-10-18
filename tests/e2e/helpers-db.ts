import { run, testDb } from "./helpers";

/** Setzt den Anstoß in die Vergangenheit, damit das Spiel "läuft". */
export async function startMatchNow(matchId: string, minutesAgo = 10) {
  await testDb().query("update matches set starts_at = now() - make_interval(mins => $2) where id = $1", [matchId, minutesAgo]);
}

/** Legt einen Plattform-Admin an (ohne Login). */
export async function seedAdmin(key: string, name = `Admin ${key}`): Promise<string> {
  const { rows } = await testDb().query(
    `insert into users (email, name, role, city, position, onboarded_at, age_confirmed_at, terms_accepted_at)
     values ($1, $2, 'admin', 'Essen', 'Flexibel', now(), now(), now()) returning id`,
    [`${key}-${run}@test.local`, name],
  );
  return rows[0].id;
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
