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
  // Beweisprotokoll (009 M3, Plan 14.7): recordEvidence nur in Tests. Produktiv schreiben DEFERRABLE-Trigger beim COMMIT; ein App-Aufruf mitten in der Transaktion braechte den Deadlock-Zyklus zurueck.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/evidence-write.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/evidence-write", "**/evidence-write.ts"], message: "recordEvidence ist nur fuer Tests (Plan 009 M3, 14.7); die Eintraege entstehen per DB-Trigger." }] }],
      // dynamische Imports und require() erfassen (no-restricted-imports sieht nur statische Importe)
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression[source.value=/evidence-write/]", message: "recordEvidence ist nur fuer Tests (Plan 009 M3, 14.7)." },
        { selector: "CallExpression[callee.name='require'][arguments.0.value=/evidence-write/]", message: "recordEvidence ist nur fuer Tests (Plan 009 M3, 14.7)." },
      ],
    },
  },
  // G25-009 Etappe B: der Ops-Pool (src/db/ops.ts, Rolle soccaz_ops) ist NUR fuer evidence-admin.ts und veto.ts. Flache Konfiguration: eine spaetere Regel ersetzt die fruehere, deshalb enthaelt dieser Block
  // ZUSAETZLICH die evidence-write-Sperre (fuer alle Dateien AUSSER den dreien, die ops importieren duerfen; fuer diese gilt der Block darueber).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/evidence-write.ts", "src/db/ops.ts", "src/server/evidence-admin.ts", "src/server/veto.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/evidence-write", "**/evidence-write.ts"], message: "recordEvidence ist nur fuer Tests (Plan 009 M3, 14.7); die Eintraege entstehen per DB-Trigger." },
            { group: ["**/db/ops", "**/db/ops.ts", "@/db/ops"], message: "Der Ops-Pool (soccaz_ops) ist nur fuer evidence-admin.ts und veto.ts (G25-009 B)." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression[source.value=/evidence-write/]", message: "recordEvidence ist nur fuer Tests (Plan 009 M3, 14.7)." },
        { selector: "CallExpression[callee.name='require'][arguments.0.value=/evidence-write/]", message: "recordEvidence ist nur fuer Tests (Plan 009 M3, 14.7)." },
        { selector: "ImportExpression[source.value=/db.ops/]", message: "Der Ops-Pool ist nur fuer evidence-admin.ts und veto.ts (G25-009 B)." },
        { selector: "CallExpression[callee.name='require'][arguments.0.value=/db.ops/]", message: "Der Ops-Pool ist nur fuer evidence-admin.ts und veto.ts (G25-009 B)." },
      ],
    },
  },
  // Altbestand: LiveBadge hat text-[11px]. Darstellung bleibt in M2-1 unverändert; Umstellung auf text-xs in M2b/M3.
  {
    files: ["src/app/turniere/[[]id]/LiveBadge.tsx"],
    rules: { "soccaz/min-font-size": "warn" },
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
