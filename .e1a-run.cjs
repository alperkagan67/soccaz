// Legt eine Wegwerf-Datenbank soccaz_e1a_test an (alle Migrationen), startet die uebergebenen Integrationstests dagegen und loescht sie danach.
// Aufruf im Worktree: node e1a-run.cjs <vitest-args...>; DATABASE_URL kommt aus .env.local, wird nur im Prozess umgeschrieben und nie ausgegeben.
process.loadEnvFile(".env.local");
const { Client } = require("pg");
const { spawnSync } = require("node:child_process");
const base = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.search || base.hash) throw new Error("nur lokale DB");
const name = "soccaz_e1a_test";
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const testUrl = new URL(base); testUrl.pathname = "/" + name;
(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), STRIPE_SECRET_KEY: "" };
  let status = 0;
  try {
    let r = spawnSync("node", ["scripts/migrate.mjs"], { env, stdio: "inherit" });
    if (r.status !== 0) throw new Error("Migration fehlgeschlagen");
    r = spawnSync("npx", ["vitest", "run", "-c", "vitest.integration.config.mts", ...process.argv.slice(2)], { env, stdio: "inherit", shell: true });
    status = r.status ?? 1;
  } finally {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.end();
  }
  process.exit(status);
})().catch((e) => { console.error("Abbruch:", e.message); process.exit(1); });
