import { defineConfig } from "vitest/config";
import path from "node:path";

// Integrationstests laufen gegen die echte (lokale) Datenbank. Aufruf: npm run test:integration
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
