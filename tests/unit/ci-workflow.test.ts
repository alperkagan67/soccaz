import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aggregate } from "../../scripts/ci-gate.mjs";

// Der Workflow darf die Namen der Pflicht-Checks im Ruleset "main-schutz" nie veraendern, auch nicht bei einer anderen Zahl von Browser-Test-Teilen.
// Textpruefung ohne YAML-Paket (die Struktur des Workflows ist bewusst einfach gehalten).
const wf = readFileSync(".github/workflows/ci.yml", "utf8");
const job = (id: string) => {
  const m = wf.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9-]+:\\n|$)`));
  if (!m) throw new Error(`Job ${id} nicht gefunden`);
  return `\n${m[1]}`;
};

describe("CI-Workflow: Namen der Pflicht-Checks", () => {
  it("'Typen, Lint, Unit-Tests' und 'Browser-Tests' kommen genau einmal vor, unveraendert", () => {
    expect(job("check")).toMatch(/\n    name: Typen, Lint, Unit-Tests\n/);
    expect(job("browser-tests")).toMatch(/\n    name: Browser-Tests\n/);
    expect(wf.match(/\n    name: Browser-Tests\n/g)).toHaveLength(1);
    expect(wf.match(/\n    name: Typen, Lint, Unit-Tests\n/g)).toHaveLength(1);
  });

  it("die Teile heissen 'Browser-Tests Teil N/5' (nie exakt 'Browser-Tests') und liegen in EINEM Job mit Matrix 1 bis 5", () => {
    const shard = job("e2e-shard");
    expect(shard).toContain("name: Browser-Tests Teil ${{ matrix.shard }}/5");
    expect(shard).toMatch(/shard:\s*\[1, 2, 3, 4, 5\]/);
    expect(shard).toContain("timeout-minutes: 25");
  });

  it("der Sammelcheck 'Browser-Tests' wartet auf changes, e2e-shard und integration und meldet das Ergebnis der Matrix als EIN Ergebnis", () => {
    const agg = job("browser-tests");
    expect(agg).toContain("needs: [changes, e2e-shard, integration]");
    expect(agg).toContain("SHARD_RESULT: ${{ needs.e2e-shard.result }}");
    expect(agg).toContain("if: always()");
    // needs.<Job>.result einer Matrix ist EIN Wert: success nur, wenn ALLE Teile gruen sind (GitHub-Verhalten); die Tabelle kennt keine Teilzahl
    expect(aggregate({ changes: "success", docsOnly: "false", shard: "success", integration: "success" }).ok).toBe(true);
    for (const shard of ["failure", "cancelled", "skipped"]) expect(aggregate({ changes: "success", docsOnly: "false", shard, integration: "success" }).ok).toBe(false);
  });
});

describe("CI-Workflow: Browser-Test-Teile", () => {
  const shard = job("e2e-shard");
  it("jeder Teil nimmt seine Dateiliste aus .github/e2e-shards.json (kein --shard)", () => {
    expect(shard).toContain("npx playwright test $(node scripts/e2e-shards.mjs list ${{ matrix.shard }})");
    expect(shard).not.toContain("--shard=");
  });
  it("PAYMENTS_FAKE steht im Schritt mit dem Playwright-Aufruf (der Test-Prozess prueft die Variable) und im Server-Schritt", () => {
    const step = shard.slice(shard.indexOf("name: Browser-Tests dieses Teils"));
    expect(step).toMatch(/PAYMENTS_FAKE: "1"/);
    expect(shard.slice(shard.indexOf("name: Entwicklungsserver starten"), shard.indexOf("name: Browser-Tests dieses Teils"))).toMatch(/PAYMENTS_FAKE: "1"/);
  });
  it("Berichte werden 14 Tage aufbewahrt", () => {
    expect(shard).toContain("retention-days: 14");
    expect(shard).not.toContain("retention-days: 7");
  });
  it("die Pruefung der Zuordnung laeuft im Pflicht-Job 'Typen, Lint, Unit-Tests'", () => {
    expect(job("check")).toContain("node scripts/e2e-shards.mjs check");
  });
});

describe("CI-Workflow: Integrationstests", () => {
  it("laufen zusaetzlich im Provisionsmodell (gleicher Job, gleicher Check-Name)", () => {
    const integration = job("integration");
    expect(integration).toContain("name: Integrationstests\n");
    expect(integration).toContain("npm run test:integration:commission");
    expect(integration.indexOf("npm run test:integration\n")).toBeLessThan(integration.indexOf("npm run test:integration:commission"));
  });
});
