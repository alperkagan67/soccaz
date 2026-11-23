// Gemeinsamer Wächter für Skripte, die Datenbanken anlegen, löschen oder Funktionen ändern (Backlog 175): dieselben Regeln wie tests/integration/db-guard.ts (dbUrlAllowed), Parität per Test
// (tests/unit/script-db-guards.test.ts). Nur lokale Datenbank (127.0.0.1/localhost, im CI-Container der Dienst "postgres"), KEIN Leerraum/Steuerzeichen/Backslash, KEINE Query und KEIN Fragment
// (pg übernimmt ?host=/?hostaddr= aus der URL und verbindet dann woanders), und die Gegenprobe mit pg-connection-string (Mehrfachhost, %2C, Socket-Pfade, abweichende Userinfo-Auslegung).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
// pg-connection-string ist KEINE direkte Abhaengigkeit, sondern kommt transitiv ueber pg (wie schon in tests/integration/db-guard.ts); eine direkte Abhaengigkeit waere eine Aenderung an package.json/Lockfile (Vorschlag im PR-Text, nur der Nutzer).
import { parse as parsePgUrl } from "pg-connection-string";

/**
 * @param {string | undefined} url
 * @param {Record<string, string | undefined>} [env]
 */
export function dbUrlAllowed(url, env = process.env) {
  if (!url || url !== url.trim() || /[\s\\]/.test(url) || /[\u0000-\u001f\u007f]/.test(url) || url.includes("?") || url.includes("#")) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return false;
  const host = u.hostname;
  if (!(host === "127.0.0.1" || host === "localhost" || (host === "postgres" && env.GITHUB_ACTIONS === "true"))) return false;
  try {
    return parsePgUrl(url).host === host;
  } catch {
    return false;
  }
}

/**
 * Wirft, wenn die URL nicht erlaubt ist (vor jeder Verbindung). Die Meldung enthaelt nie die URL (Zugangsdaten).
 * @param {string | undefined} url
 * @param {string} script Name fuer die Meldung
 * @param {Record<string, string | undefined>} [env]
 */
export function assertLocalDbUrl(url, script, env = process.env) {
  if (!dbUrlAllowed(url, env)) throw new Error(`${script}: DATABASE_URL nicht erlaubt (nur lokale Datenbank, ohne Query/Fragment/Leerraum; db-guard)`);
}

/**
 * Zusaetzlich: nur eine Worker-Datenbank (soccaz_w1 bis soccaz_w4), nie soccav2 oder eine andere.
 * @param {string | undefined} url
 * @param {string} script
 * @param {Record<string, string | undefined>} [env]
 */
export function assertWorkerDatabase(url, script, env = process.env) {
  assertLocalDbUrl(url, script, env);
  const db = decodeURIComponent(new URL(/** @type {string} */ (url)).pathname.slice(1));
  if (!/^soccaz_w[1-4]$/.test(db)) throw new Error(`${script}: nur Worker-Datenbank soccaz_w1 bis soccaz_w4 erlaubt`);
}

/**
 * Laedt die .env.local des Repo-/Worktree-Wurzelverzeichnisses (Pfad relativ zu DIESER Datei, nicht zum Arbeitsverzeichnis), wenn sie da ist (nicht ueberschreibend; in CI gibt es sie nicht).
 * Die Skripte selbst verwenden weitere relative Pfade (drizzle/, tests/): immer aus dem Wurzelverzeichnis starten.
 */
export function loadLocalEnv() {
  const file = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
