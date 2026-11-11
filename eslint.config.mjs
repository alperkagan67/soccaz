import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import soccaz from "./eslint-rules/min-font-size.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Schrift unter 12 px verboten (013 M2-1)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/receipt-pdf.tsx"], // PDF-Beleg in Punkt, keine Bildschirmschrift
    plugins: { soccaz },
    rules: { "soccaz/min-font-size": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
