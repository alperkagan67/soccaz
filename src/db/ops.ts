import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { db } from "./index";

// G25-009 Etappe B (Plan docs/design/g25-009-db-rollenmodell.md Abschnitt 5, 10.6): ZWEITER Verbindungspool fuer die Rolle soccaz_ops. NUR fuer die zwei Beweisprotokoll-Funktionen
// evidence_set_setting (Admin-Schalter, src/server/evidence-admin.ts) und evidence_late_attempt (Antwort nach Fristende, src/server/veto.ts); sonst nirgends importieren (ESLint: no-restricted-imports).
// Schutz gegen SQL-Injection und Rechtefehler der App-Rolle, NICHT gegen die Uebernahme des Prozesses (die Zugangsdaten liegen im selben Prozess, Plan 10.6).
//
// Env: DATABASE_URL_OPS (Wert wird nie gelesen oder ausgegeben ausser fuer die Verbindung). Fehlt sie, laeuft der Ops-Pfad ueber den Hauptpool (Dev, Test, CI und die Zeit VOR dem Rechtewechsel A2, in der
// die App-Rolle die Funktionen noch ausfuehren darf; in Produktion mit einer Warnung im Log). Nach dem Rechtewechsel (A2: REVOKE von soccaz_app) scheitert dieser Rueckfall abgesichert: die App-Rolle
// hat dann kein EXECUTE mehr (fail closed, klare Fehlermeldung, Alarm im Audit), die Variable ist also VOR dem URL-Wechsel zu setzen (BETRIEB, GO-LIVE-AUDIT G25-009).
export const OPS_POOL_MAX = 2;
/** Eine Admin-Aktion wartet nie lange auf einen toten Ops-Pool: Verbindungsaufbau nach 5 Sekunden abbrechen (klarer Fehler statt Haenger). */
export const OPS_CONNECT_TIMEOUT_MS = 5_000;

export type OpsConnection = { kind: "ops"; url: string } | { kind: "main"; warn: boolean };

/** Welche Verbindung gilt? Rein rechnend (testbar ohne Datenbank). */
export function opsConnection(env: Record<string, string | undefined> = process.env): OpsConnection {
  const url = env.DATABASE_URL_OPS?.trim();
  if (url) return { kind: "ops", url };
  return { kind: "main", warn: env.NODE_ENV === "production" };
}

const g = globalThis as unknown as { opsPool?: Pool; opsWarned?: boolean };

type OpsDb = ReturnType<typeof drizzle>;
let cached: { key: string; db: OpsDb } | null = null;

/** Der Ops-Zugang (Drizzle ueber den Ops-Pool, sonst der Hauptpool). NICHT exportiert: nach aussen gibt es nur die zwei engen Funktionen unten (kleine Missbrauchsflaeche). */
function opsDb(env: Record<string, string | undefined> = process.env): OpsDb | typeof db {
  const c = opsConnection(env);
  if (c.kind === "main") {
    if (c.warn && !g.opsWarned) {
      g.opsWarned = true;
      console.warn("DATABASE_URL_OPS fehlt: Beweisprotokoll-Aufrufe laufen ueber den Hauptpool. Vor dem Rechtewechsel (G25-009 A2) setzen.");
    }
    return db;
  }
  if (!cached || cached.key !== c.url) {
    void g.opsPool?.end().catch(() => null); // alter Pool (andere URL): sauber schliessen
    g.opsPool = new Pool({ connectionString: c.url, max: OPS_POOL_MAX, connectionTimeoutMillis: OPS_CONNECT_TIMEOUT_MS });
    cached = { key: c.url, db: drizzle(g.opsPool) };
  }
  return cached.db;
}

/** Nur fuer Tests: den Ops-Pool schliessen und vergessen. */
export async function resetOpsPoolForTests(): Promise<void> {
  cached = null;
  g.opsWarned = false;
  const p = g.opsPool;
  g.opsPool = undefined;
  await p?.end().catch(() => null);
}

/** evidence_set_setting ueber den Ops-Pool (Admin-Schalter der Beweispflicht). Akteur = Sitzung, nie Formulardaten. Fehler werden NICHT verschluckt (der Aufrufer meldet sie). */
export async function callEvidenceSetSetting(key: string, value: string, actorId: string, reason: string): Promise<void> {
  await opsDb().execute(sql`select evidence_set_setting(${key}, ${value}, ${actorId}::uuid, ${reason})`);
}

/** evidence_late_attempt ueber den Ops-Pool in einer KURZEN EIGENEN Transaktion (haelt den globalen Zaehler nur Millisekunden). Liefert, ob der Versuch geschrieben wurde. Fehler werden NICHT verschluckt. */
export async function callEvidenceLateAttempt(matchId: string, venueId: string, userId: string): Promise<boolean> {
  const res = await opsDb().transaction((tx) => tx.execute(sql`select evidence_late_attempt(${matchId}::uuid, ${venueId}::uuid, ${userId}::uuid) as ok`));
  const rows = ((res as unknown as { rows?: { ok: boolean }[] }).rows ?? (res as unknown as { ok: boolean }[])) as { ok: boolean }[];
  return Boolean(rows[0]?.ok);
}
