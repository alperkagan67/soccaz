import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], testTimeout: 15_000 }, // 5 s (Standard) waren unter Last zu knapp (Kaltimporte, Skriptstarts); echte Hänger zeigt das Limit weiter
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
