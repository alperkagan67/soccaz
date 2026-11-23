// Schließt offene Altspiele mit Guthabenzahlung (012 M6, Entscheid F2). Nur Test-/Seed-Daten, KEINE Geldbewegung (kein Hauptbuch-Eintrag, kein Stripe).
// Aufruf:  node --env-file=.env.local scripts/close-legacy-games.mjs            Trockenlauf (Standard): listet nur, schreibt nichts
//          node --env-file=.env.local scripts/close-legacy-games.mjs --apply    schließt die gelisteten Spiele (idempotent: Marker 'legacy.close' in audit_log)
// Schutz wie bei den Seed-Skripten (scripts/lib/seed-guard.ts): nur localhost:5433 mit soccav2 oder soccaz_w1 bis soccaz_w4, keine Query, nicht bei NODE_ENV=production.
// Braucht zur Laufzeit `tsx` (devDependency): nach `npm ci`, nicht mit `npm ci --omit=dev`.
import pg from "pg";
import { tsImport } from "tsx/esm/api";

const flags = process.argv.slice(2);
if (flags.some((f) => f !== "--apply")) {
  console.error("Aufruf: node --env-file=.env.local scripts/close-legacy-games.mjs [--apply]   (ohne --apply nur Trockenlauf)");
  process.exit(2);
}
const apply = flags.includes("--apply");

const { assertSeedAllowed } = await tsImport("./lib/seed-guard.ts", import.meta.url);
let target;
try {
  target = assertSeedAllowed({ nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL });
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
const { closeLegacyGames } = await tsImport("./lib/close-legacy-games.ts", import.meta.url);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
  const r = await closeLegacyGames(pool, { apply });
  console.log(`${apply ? "Angewendet" : "Trockenlauf"} auf ${target.host}:${target.port}/${target.database}: ${r.games.length} offene Altspiele mit Guthabenzahlung.`);
  for (const g of r.games) console.log(`  Spiel ${g.number ?? g.matchId} (${g.status}, ${g.startsAt.toISOString()}): ${g.paidParticipants}/${g.participants} Teilnehmer mit Zahlung, ${g.paidCents} Cent im Guthabenmodell`);
  for (const g of r.manual) console.log(`  MANUELL (nicht geschlossen) Spiel ${g.number ?? g.matchId} (${g.status}): ${g.manualReason}`);
  if (apply) console.log(`Geschlossen: ${r.closed}, Mitteilungen: ${r.notified}. Hauptbuch und Guthaben unverändert.`);
  else if (r.games.length) console.log("Nichts geändert. Mit --apply ausführen, um die Spiele zu schließen.");
} finally {
  await pool.end();
}
