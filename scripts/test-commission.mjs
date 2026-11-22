// Integrationstests der Kartensuiten im Provisionsmodell (Vertrag 009 M2): setzt TEST_LEDGER_MODEL=commission und startet vitest mit Zeitlimit.
// Aufruf: npm run test:integration:commission   (braucht die lokale Datenbank wie npm run test:integration)
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("tests/integration")
  .filter((f) => /^card-.*\.test\.ts$/.test(f) || f === "dispute-admin.test.ts")
  .map((f) => `tests/integration/${f}`);
const r = spawnSync("npx", ["vitest", "run", "--config", "vitest.integration.config.mts", "--testTimeout=60000", ...files], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, TEST_LEDGER_MODEL: "commission", STRIPE_SECRET_KEY: "" }, // nie ein echter Stripe-Schlüssel in Tests (wie beim Wegwerf-Lauf)
  timeout: 15 * 60_000, // Gesamtzeitlimit: kein unbegrenzter Lauf (Speicherregel)
});
process.exit(r.status ?? 1);
