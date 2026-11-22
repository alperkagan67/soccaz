import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Die Wartungsausnahme der Datenbank-Trigger (socaz.ledger_maintenance) und der Zählerschutz des Beweisprotokolls (socaz.evidence_insert) sind freie Sitzungswerte
// (bekannte Grenze, docs/BETRIEB.md, GO-LIVE-AUDIT G25-009 "DB-Rollenmodell"). Damit der App-Code sie nie setzt, prüft dieser Test den Quelltext:
// In src/, scripts/ und den Konfigurationsdateien im Wurzelverzeichnis darf der Präfix "socaz." außerhalb von Kommentaren NICHT vorkommen (Strings, Konstanten, SET [LOCAL] "…",
// set_config(...) werden ohne Raten erfasst). Erlaubt: tests/, drizzle/ (Migrationen) und ausdrücklich benannte Wartungsskripte (Allowlist, derzeit leer).
const ROOT = process.cwd();
const ALLOW: string[] = []; // z. B. "scripts/wartung-xyz.mjs": bewusst benannte Wartungsskripte
const PREFIX = /\bsocaz\.[a-z_]+/i;
const EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|yml|yaml|sh|cmd|ps1|sql)$/;
const ROOT_CONFIG = /^(drizzle\.config|next\.config|vitest[\w.-]*|playwright\.config|eslint\.config|postcss\.config|package)\.(ts|mts|js|mjs|cjs|json)$/;

/** Entfernt Kommentare (// nach Leerraum oder Zeilenanfang, Blockkommentare, -- in SQL/Shell/YAML #-Zeilen); der Rest ist Code oder Text. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/^\s*(--|#).*$/gm, "");
}
// Bekannte harmlose Treffer (keine Datenbank-Einstellung): Domain der Absender-/Push-Adresse und der localStorage-Schlüssel des Installationshinweises.
const HARMLESS = [/@socaz\.de\b/gi, /["']socaz\.installHint\.dismissed["']/g];
export const mentionsSocazSetting = (text: string) => PREFIX.test(HARMLESS.reduce((s, re) => s.replace(re, ""), stripComments(text)));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

describe("Wartungsausnahme und Zählerschutz der Trigger (Präfix socaz.)", () => {
  it("der Präfix socaz. kommt in src/, scripts/ und den Konfigurationsdateien im Wurzelverzeichnis außerhalb von Kommentaren nirgends vor (Allowlist leer)", () => {
    const rootFiles = readdirSync(ROOT).filter((n) => ROOT_CONFIG.test(n)).map((n) => join(ROOT, n));
    const offenders = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts")), ...rootFiles]
      .map((p) => relative(ROOT, p).replace(/\\/g, "/"))
      .filter((rel) => !ALLOW.includes(rel))
      .filter((rel) => mentionsSocazSetting(readFileSync(join(ROOT, rel), "utf8")));
    expect(offenders, `Präfix socaz. im Code: ${offenders.join(", ")}`).toEqual([]);
  });

  it("Selbsttest: erkannt werden alle Schreibweisen, auch die Konstante, SET LOCAL mit Anführungszeichen und die Zählervariable", () => {
    for (const code of [
      "await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`)",
      "set local socaz.ledger_maintenance = 'on'",
      'SET LOCAL "socaz.ledger_maintenance" = \'on\'',
      "SET socaz.ledger_maintenance TO 'on'",
      "const KEY = 'socaz.ledger_maintenance'; await db.execute(sql.raw(`set local ${KEY} = 'on'`));",
      "select set_config('socaz.evidence_insert','on',true)",
      "SET LOCAL socaz.evidence_insert = 'on'",
      "const SETTING = \"socaz.evidence_insert\";",
      "set_config('SOCAZ.Ledger_Maintenance','on',true)",
      "const k = 'socaz.installHint.other';",
    ]) expect(mentionsSocazSetting(code), code).toBe(true);
  });

  it("Selbsttest: reine Kommentare (// , /* */, -- , #) und die zwei bekannten harmlosen Treffer lösen nichts aus", () => {
    for (const code of [
      "// Ausnahme: socaz.ledger_maintenance (nur Kommentar)",
      "const x = 1; // socaz.evidence_insert",
      "/* socaz.ledger_maintenance */ const y = 2;",
      "/**\n * socaz.evidence_insert\n */\nexport const z = 3;",
      "-- set local socaz.ledger_maintenance = 'on'",
      "# SET socaz.ledger_maintenance",
      'from: "Socaz <noreply@socaz.de>"',
      'const KEY = "socaz.installHint.dismissed";',
    ]) expect(mentionsSocazSetting(code), code).toBe(false);
  });
});

// Weitere Umgehungswege der DEFERRABLE-Haken (Plan 15.4): SET CONSTRAINTS ... IMMEDIATE (ändert das Timing), session_replication_role (Trigger feuern nicht), DISABLE TRIGGER,
// pg_restore --disable-triggers. Nicht im App-Code (src/) und nicht in Skripten (scripts/); tests/, drizzle/ und die Wiederherstellung (BETRIEB, manuell) sind ausgenommen.
const BYPASS = /\b(set\s+constraints\b|session_replication_role\b|disable\s+trigger\b|enable\s+replica\s+trigger\b)|--disable-triggers/i;
export const usesBypass = (text: string) => BYPASS.test(stripComments(text));

describe("Umgehungswege der Trigger (SET CONSTRAINTS, session_replication_role, DISABLE TRIGGER)", () => {
  it("kommen in src/ und scripts/ außerhalb von Kommentaren nirgends vor (Allowlist leer)", () => {
    const offenders = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))]
      .map((p) => relative(ROOT, p).replace(/\\/g, "/"))
      .filter((rel) => !ALLOW.includes(rel))
      .filter((rel) => usesBypass(readFileSync(join(ROOT, rel), "utf8")));
    expect(offenders, `Umgehungsweg in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("Selbsttest: erkannt werden die Schreibweisen, Kommentare nicht", () => {
    for (const code of [
      "await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`)",
      "set constraints booking_jobs_evidence_upd immediate",
      "SET LOCAL session_replication_role = replica",
      "ALTER TABLE booking_jobs DISABLE TRIGGER booking_jobs_evidence_ins",
      "pg_restore --disable-triggers dump",
    ]) expect(usesBypass(code), code).toBe(true);
    for (const code of ["// SET CONSTRAINTS ALL IMMEDIATE ist verboten", "-- session_replication_role", "/* DISABLE TRIGGER */ const x = 1;"]) expect(usesBypass(code), code).toBe(false);
  });
});
