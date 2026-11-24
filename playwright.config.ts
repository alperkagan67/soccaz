import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 60_000,
  // Nur die WARTEZEIT von Erwartungen (expect(...).toBeVisible usw.), NICHT der Test-Timeout: Der Dev-Server baut Seiten unter Last kalt und hydriert spät; Standard 5 s war die 5. Flake derselben Familie (Backlog 249).
  // Rückfall-Kriterium: dauert ein Browser-Teil dadurch länger als 10 Minuten, wird der Wert zurückgenommen und die Stellen einzeln mit eigenem Timeout versehen (siehe tests/unit/e2e-click-guard.test.ts).
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
