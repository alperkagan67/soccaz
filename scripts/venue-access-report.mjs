// Migrationsbericht 011 M1 (nur lesend). Aufruf: node --env-file=.env.local scripts/venue-access-report.mjs
// Zeigt, welche Hallen mit bisherigem Betreiber nach der Datenübernahme (Migration 0049) KEINEN aktiven Zugang haben (verwaist, anonymisiert, Admin-Konto) und wie viele offene
// Hallenanfragen betroffen sind. Es wird nichts geschrieben (READ ONLY) und nie eine E-Mail-Adresse ausgegeben. Vor dem Rollout ausführen (Datenbank aus DATABASE_URL), nach der
// Migration erneut: dann zeigt die Liste die Hallen, die Admin 1 neu einlädt. Logik und Test: scripts/lib/venue-access-report.mjs, tests/integration/venue-access-report.test.ts.
import pg from "pg";
import { formatReport, venueAccessReport } from "./lib/venue-access-report.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(2);
}
// Nur Host, Port und Datenbankname anzeigen, nie Benutzer oder Passwort
let target = "unbekannt";
try {
  const u = new URL(url);
  target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
} catch {
  /* bleibt "unbekannt" */
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin read only");
  const has = (await client.query("select to_regclass('public.venue_access') as t")).rows[0].t;
  console.log(`Datenbank ${target}${has ? "" : " (Tabelle venue_access fehlt noch: Vorhersage vor der Migration 0049)"}`);
  console.log(formatReport(await venueAccessReport(client, { predict: !has })));
  await client.query("rollback");
} finally {
  await client.end();
}
