import { existsSync } from "node:fs";
import { Pool } from "pg";
import { dbUrlAllowed } from "../integration/db-guard";

/**
 * Setzt VOR den E2E-Tests beide Plattform-Schalter auf den Produktionsstandard AUS/AUS (Schalter-Flip: Dev-Seeds schalten das Kartenmodell EIN, Specs erwarten den Standard
 * und setzen ihren Schalter pro Test selbst, Regel 23). Laeuft nur gegen eine lokale Datenbank, nie gegen eine fremde.
 */
export default async function globalSetup() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) return;
  if (!dbUrlAllowed(url)) {
    console.warn("E2E-Schalter-Reset uebersprungen: Datenbank-URL ist nicht lokal (oder hat Query/Fragment).");
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("update settings set value = 'false'::jsonb where key in ('payments_enabled', 'card_payments_enabled')");
  } finally {
    await pool.end();
  }
}
