import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { OPS_CONNECT_TIMEOUT_MS, OPS_POOL_MAX, opsConnection } from "@/db/ops";
import { errorCodeOf, isOpsUnreachable } from "@/lib/ops-errors";

// G25-009 Etappe B: Regeln des zweiten Verbindungspools (soccaz_ops), seine Importeure und die Sperre in ESLint.
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("opsConnection", () => {
  it("mit DATABASE_URL_OPS: eigener Pool (Wert nur fuer die Verbindung)", () => {
    expect(opsConnection({ DATABASE_URL_OPS: "postgres://soccaz_ops@127.0.0.1/x" })).toEqual({ kind: "ops", url: "postgres://soccaz_ops@127.0.0.1/x" });
  });
  it("ohne die Variable: Hauptpool; in Produktion mit Warnung, sonst ohne", () => {
    expect(opsConnection({})).toEqual({ kind: "main", warn: false });
    expect(opsConnection({ NODE_ENV: "development" })).toEqual({ kind: "main", warn: false });
    expect(opsConnection({ NODE_ENV: "production" })).toEqual({ kind: "main", warn: true });
    expect(opsConnection({ DATABASE_URL_OPS: "   " })).toEqual({ kind: "main", warn: false }); // nur Leerzeichen zaehlt als nicht gesetzt
  });
  it("der Pool ist klein (hoechstens 2 Verbindungen)", () => {
    expect(OPS_POOL_MAX).toBe(2);
  });
});

describe("isOpsUnreachable", () => {
  it("Verbindungs-, Anmelde- und Rechtefehler zaehlen als nicht nutzbar, fachliche Fehler nicht", () => {
    for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "57P03", "28P01", "3D000", "53300", "08006", "08001", "42501"]) expect(isOpsUnreachable({ code }), code).toBe(true);
    for (const code of ["P0001", "23505", "22P02", "40001"]) expect(isOpsUnreachable({ code }), code).toBe(false);
    expect(isOpsUnreachable(new Error("irgendwas"))).toBe(false);
    expect(isOpsUnreachable(null)).toBe(false);
    expect(isOpsUnreachable({ code: 42 })).toBe(false);
  });
});

describe("Importeure und Sperre", () => {
  it("nur evidence-admin.ts und veto.ts importieren den Ops-Pool", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name) && /from\s+["'][^"']*db\/ops["']|import\(["'][^"']*db\/ops["']\)/.test(read(rel))) hits.push(rel);
      }
    };
    walk("src");
    expect(hits.sort()).toEqual(["src/server/evidence-admin.ts", "src/server/veto.ts"]);
  });

  it("die zwei Aufrufer nutzen NUR die engen Ops-Funktionen; der rohe Zugang (opsDb) ist nicht exportiert und die Funktionen laufen ueber ihn, nie ueber den Hauptpool", () => {
    expect(read("src/server/evidence-admin.ts")).toMatch(/await callEvidenceSetSetting\(plan\.key, plan\.value, actorId, plan\.reason\)/);
    expect(read("src/server/evidence-admin.ts")).not.toMatch(/evidence_set_setting\(\$\{/); // kein eigenes SQL mehr
    expect(read("src/server/veto.ts")).toMatch(/await callEvidenceLateAttempt\(matchId, venueId, userId\)/);
    expect(read("src/server/veto.ts")).not.toMatch(/select evidence_late_attempt\(/);
    const ops = read("src/db/ops.ts");
    expect(ops).not.toMatch(/export function opsDb/); // nur die zwei engen Funktionen sind aussen sichtbar
    expect(ops).toMatch(/export async function callEvidenceSetSetting/);
    expect(ops).toMatch(/export async function callEvidenceLateAttempt/);
    expect(ops).toMatch(/await opsDb\(\)\.execute\(sql`select evidence_set_setting\(/);
    expect(ops).toMatch(/await opsDb\(\)\.transaction\(\(tx\) => tx\.execute\(sql`select evidence_late_attempt\(/);
  });

  it("ESLint sperrt den Import des Ops-Pools (statisch und dynamisch) ausser in evidence-admin.ts und veto.ts (ESLint-API, nicht der Konfigurationstext)", async () => {
    const eslint = new ESLint({ cwd: root });
    const lint = async (file: string, code: string) => (await eslint.lintText(code, { filePath: path.join(root, file) }))[0].messages.filter((m) => m.severity === 2);
    const staticImport = 'import { callEvidenceLateAttempt } from "@/db/ops";\nexport const x = callEvidenceLateAttempt;\n';
    const dynamicImport = 'export const z = () => import("@/db/ops");\n';
    expect((await lint("src/server/x.ts", staticImport)).map((m) => m.ruleId)).toContain("no-restricted-imports");
    expect((await lint("src/server/x.ts", dynamicImport)).map((m) => m.ruleId)).toContain("no-restricted-syntax");
    expect((await lint("src/app/page.tsx", staticImport)).map((m) => m.ruleId)).toContain("no-restricted-imports");
    for (const ok of ["src/server/veto.ts", "src/server/evidence-admin.ts"]) expect(await lint(ok, staticImport), ok).toEqual([]);
    // die evidence-write-Sperre bleibt fuer alle ausser evidence-write.ts bestehen (auch in den zwei erlaubten Dateien)
    const ew = 'import { recordEvidence } from "./evidence-write";\nexport const y = recordEvidence;\n';
    expect((await lint("src/server/veto.ts", ew)).map((m) => m.ruleId)).toContain("no-restricted-imports");
    expect((await lint("src/server/x.ts", ew)).map((m) => m.ruleId)).toContain("no-restricted-imports");
  }, 60_000);

  it("Fehler nicht still: beide Aufrufer melden einen nicht nutzbaren Ops-Zugang (reportOpsFailure) und der Schalter zeigt den Betreibertext", () => {
    expect(read("src/server/evidence-admin.ts")).toMatch(/isOpsUnreachable\(error\)[\s\S]{0,120}reportOpsFailure\("switchEvidence", error\)[\s\S]{0,120}SWITCH_TEXTS\.opsUnavailable/);
    expect(read("src/server/veto.ts")).toMatch(/isOpsUnreachable\(error\)\) await reportOpsFailure\("recordLateAttempt", error\)/);
  });
});

describe("errorCodeOf", () => {
  it("findet den Code auch in verpackten Fehlern (Drizzle: cause), nie die Meldung", () => {
    expect(errorCodeOf({ code: "ECONNREFUSED" })).toBe("ECONNREFUSED");
    expect(errorCodeOf({ message: "Failed query", cause: { code: "57P03" } })).toBe("57P03");
    expect(errorCodeOf({ cause: { cause: { code: "28P01" } } })).toBe("28P01");
    expect(errorCodeOf(new Error("nur Text"))).toBeUndefined();
    expect(errorCodeOf(undefined)).toBeUndefined();
    expect(isOpsUnreachable({ message: "Failed query", cause: { code: "ECONNREFUSED" } })).toBe(true);
  });
});

describe("Verbindungsaufbau", () => {
  it("der Ops-Pool bricht den Verbindungsaufbau nach 5 Sekunden ab (kein Haenger der Admin-Aktion)", () => {
    expect(OPS_CONNECT_TIMEOUT_MS).toBe(5_000);
    expect(read("src/db/ops.ts")).toContain("connectionTimeoutMillis: OPS_CONNECT_TIMEOUT_MS");
  });
});
