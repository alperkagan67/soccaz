// Salden-Guard vor dem Löschen des Guthaben-Pfads (012 M6b 1c-ii-b). NUR LESEN, keine Schreibzugriffe, keine Personendaten in der Ausgabe.
// Aufruf:  node --env-file=.env.local scripts/legacy-balance-guard.mjs
// Ausgang: 0 = alle Salden/paid_cents = 0, pending_refunds leer, keine offenen Altspiele mit Guthabenzahlung. 1 = Befund != 0: KEINE Löschung, Meldung mit Zahlen. 2 = Aufruf/Verbindung.
// Anders als close-legacy-games darf das Skript auch gegen eine echte Datenbank laufen (rein lesend: `begin transaction read only`).
// Braucht zur Laufzeit `tsx` (devDependency): nach `npm ci`, nicht mit `npm ci --omit=dev`.
import pg from "pg";
import { tsImport } from "tsx/esm/api";

if (process.argv.length > 2) {
  console.error("Aufruf: node --env-file=.env.local scripts/legacy-balance-guard.mjs   (ohne Argumente, nur lesend)");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt.");
  process.exit(2);
}
const { readLegacyBalances, evaluateGuard, historyInfo, GUARD_FAIL_MESSAGE } = await tsImport("./lib/legacy-balance-guard.ts", import.meta.url);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
  const f = await readLegacyBalances(pool);
  const r = evaluateGuard(f);
  const info = historyInfo(f);
  if (info) console.log(`  ${info}`);
  if (r.ok) {
    console.log("Salden-Guard erfüllt: alle Salden = 0, keine offenen bezahlten Plätze, payments ohne pending/ohne fehlende Buchung, pending_refunds leer, keine offenen Altspiele mit Guthabenzahlung.");
  } else {
    for (const l of r.lines) console.log(`  ${l}`);
    console.error(GUARD_FAIL_MESSAGE);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 2;
} finally {
  await pool.end();
}
