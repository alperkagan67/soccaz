import { existsSync } from "node:fs";
import { Pool } from "pg";
import { cleanupTestData } from "../cleanup";

/** Entfernt nach den E2E-Tests alle Testdaten. Läuft nur gegen eine lokale Datenbank. */
export default async function globalTeardown() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
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
