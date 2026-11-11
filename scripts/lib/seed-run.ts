// Führt den Seed erst nach bestandenem Schutz aus: bei nicht erlaubter Umgebung wird weder eine Verbindung aufgebaut noch gesät.
import type { Pool } from "pg";
import { runSeed, type SeedCounts } from "./seed-frontend-data";
import { assertSeedAllowed, type SeedEnv } from "./seed-guard";

export async function runGuardedSeed(env: SeedEnv, makePool: () => Pool): Promise<{ target: { host: string; port: string; database: string }; counts: SeedCounts }> {
  const target = assertSeedAllowed(env);
  const pool = makePool();
  try {
    return { target, counts: await runSeed(pool) };
  } finally {
    await pool.end();
  }
}
