// Testdaten für die Frontend-Analyse (nur lokale Dev-DB, nur Testdaten @test.local). Beschreibung: docs/design/analyse-seed.md
// Aufruf: npx tsx --env-file=.env.local scripts/seed-frontend.mts
// Bricht ab bei NODE_ENV=production oder wenn DATABASE_URL nicht auf localhost:5433 mit einer Dev-/Worker-DB zeigt (keine Query-Parameter erlaubt).
import pg from "pg";
import { SEED_PASSWORDLESS_NOTE } from "./lib/seed-frontend-data";
import { runGuardedSeed } from "./lib/seed-run";

try {
  const { target, counts } = await runGuardedSeed(
    { nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL },
    () => new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }),
  );
  console.log(`Seed fertig auf ${target.host}:${target.port}/${target.database}. ${SEED_PASSWORDLESS_NOTE}`);
  for (const [label, n] of Object.entries(counts)) console.log(`  ${label}: ${n}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
process.exit(0);
