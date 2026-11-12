import { existsSync } from "node:fs";
import { Pool } from "pg";
import { cleanupTestData } from "../cleanup";
import { dbUrlAllowed } from "../integration/db-guard";

/** Entfernt nach den E2E-Tests alle Testdaten. Läuft nur gegen eine lokale Datenbank. */
export default async function globalTeardown() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) return;
  if (!dbUrlAllowed(url)) {
    console.warn("E2E-Aufräumen übersprungen: Datenbank-URL ist nicht lokal (oder hat Query/Fragment).");
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    await cleanupTestData(pool);
  } finally {
    await pool.end();
  }
}
