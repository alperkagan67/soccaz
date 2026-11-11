import { existsSync } from "node:fs";
import { Pool } from "pg";
import { cleanupTestData } from "../cleanup";
import { dbHostAllowed } from "../integration/db-guard";

/** Entfernt nach den E2E-Tests alle Testdaten. Läuft nur gegen eine lokale Datenbank. */
export default async function globalTeardown() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (!dbHostAllowed(host)) {
    console.warn(`E2E-Aufräumen übersprungen: Datenbank-Host ${host} ist nicht lokal.`);
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    await cleanupTestData(pool);
  } finally {
    await pool.end();
  }
}
