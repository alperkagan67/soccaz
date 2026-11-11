// Testdaten für die Frontend-Analyse (nur lokale Dev-DB, nur Testdaten @test.local). Beschreibung: docs/design/analyse-seed.md
// Aufruf: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/seed-frontend.mts   (oder: npx tsx --env-file=.env.local scripts/seed-frontend.mts)
// Bricht ab bei NODE_ENV=production oder wenn DATABASE_URL nicht auf localhost:5433 mit einer Dev-/Worker-DB zeigt.
import pg from "pg";
import { assertSeedAllowed } from "./lib/seed-guard";
import { runSeed, SEED_PASSWORDLESS_NOTE } from "./lib/seed-frontend-data";

let target;
try {
  target = assertSeedAllowed({ nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
  const counts = await runSeed(pool);
  console.log(`Seed fertig auf ${target.host}:${target.port}/${target.database}. ${SEED_PASSWORDLESS_NOTE}`);
  for (const [label, n] of Object.entries(counts)) console.log(`  ${label}: ${n}`);
} finally {
  await pool.end();
}
process.exit(0);
