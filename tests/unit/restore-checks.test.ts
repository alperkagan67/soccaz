import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROW_ONLY_TABLES, MANIFEST_SQL, chainResult, compareManifest, compareMigrations, connEnv, detectFormat, exitCode, formatReport, manifestIncomplete, restoreHint, scratchNameOk, triggerResult, withDatabase } from "../../scripts/lib/restore-checks.mjs";
import { parseArgs } from "../../scripts/restore-test.mjs";

// Restore-Probe (E8): reine Funktionen, Schutzregeln und Benutzerfehler OHNE Datenbank. Der Rundlauf mit echter Sicherung steht in tests/integration/restore-test.test.ts.
type Res = { id: string; status: string; text: string };
const by = (rs: Res[], id: string) => rs.find((r) => r.id === id);

const manifest = (o: Record<string, unknown> = {}) => ({ format: 1, tables: { users: 3, ledger_entries: 10, booking_evidence: 4 }, migrations: 5, ledgerSum: 5000, evidenceCount: 4, evidenceHead: "h4", ...o });
const actual = (o: Record<string, unknown> = {}) => ({ tables: { users: 3, ledger_entries: 10, booking_evidence: 4 }, ledgerSum: 5000, evidenceCount: 4, evidenceHeadAtManifest: "h4", ...o });

describe("Schutz der Wegwerf-Datenbank und der Verbindung", () => {
  it("nur restore_check_* darf angelegt/gelöscht werden: Quelle, Produktion und Worker-Datenbanken nie", () => {
    expect(scratchNameOk("restore_check_abc123_42")).toBe(true);
    for (const bad of ["soccav2", "soccaz_w1", "postgres", "socaz", "restore_check_", "restore_check_X", "restore_check_a-b", "restore_check_a\"; drop database soccav2; --", "xrestore_check_a", "", null, undefined, 5]) expect(scratchNameOk(bad as never), String(bad)).toBe(false);
  });

  it("connEnv: Passwort nur als Umgebungsvariable (nie in einer Argumentliste), Sonderzeichen werden dekodiert", () => {
    expect(connEnv("postgres://us%40er:p%40ss%3Aw@127.0.0.1:5433/postgres")).toEqual({ PGHOST: "127.0.0.1", PGPORT: "5433", PGUSER: "us@er", PGPASSWORD: "p@ss:w", PGDATABASE: "postgres" });
    expect(connEnv("postgres://u@localhost/db").PGPORT).toBe("5432");
    expect(withDatabase("postgres://u:p@127.0.0.1:5433/postgres", "restore_check_x")).toBe("postgres://u:p@127.0.0.1:5433/restore_check_x");
  });

  it("Format wird an den ersten Bytes erkannt (gzip, custom, Klartext)", () => {
    expect(detectFormat(Buffer.from([0x1f, 0x8b, 8, 0]))).toBe("gzip-sql");
    expect(detectFormat(Buffer.from("PGDMP\u0001"))).toBe("custom");
    expect(detectFormat(Buffer.from("-- PostgreSQL"))).toBe("sql");
    expect(detectFormat(Buffer.alloc(0))).toBe("sql");
  });

  it("parseArgs: Anker nur paarweise, unbekannte Option und zweite Datei werden abgewiesen", () => {
    expect(parseArgs(["a.sql.gz", "--keep", "--strict"])).toMatchObject({ file: "a.sql.gz", keep: true, strict: true });
    expect(parseArgs(["a", "--head-hash", "ab", "--count", "3"])).toMatchObject({ headHash: "ab", count: 3 });
    expect(() => parseArgs(["a", "--head-hash", "ab"])).toThrow(/zusammen/);
    expect(() => parseArgs(["a", "--count", "x", "--head-hash", "ab"])).toThrow(/ganze Zahl/);
    expect(() => parseArgs(["a", "--force"])).toThrow(/unbekannte Option/);
    expect(() => parseArgs(["a", "b"])).toThrow(/eine Sicherung/);
    expect(() => parseArgs(["a", "--manifest"])).toThrow(/Wert/);
  });
});

describe("Manifest-Vergleich (Zeilenzahlen, Summen, Kopf-Hash)", () => {
  it("alles gleich: PASS ohne WARN", () => {
    const rs = compareManifest(manifest(), actual());
    expect(rs.map((r) => r.status)).not.toContain("FAIL");
    expect(rs.map((r) => r.status)).not.toContain("WARN");
    expect(by(rs, "beweis-kopf")?.status).toBe("PASS");
  });
  it("ohne Manifest: nur WARN (Teilbeweis), nie stilles Grün", () => {
    const rs = compareManifest(null, actual());
    expect(rs).toHaveLength(1);
    expect(rs[0].status).toBe("WARN");
    expect(rs[0].text).toMatch(/NICHT gegen die Quelle/);
  });
  it("fehlende Tabelle: FAIL", () => {
    expect(by(compareManifest(manifest(), actual({ tables: { users: 3, ledger_entries: 10 } })), "tabellen")?.status).toBe("FAIL");
  });
  it("nur-anhängende Tabellen dürfen nicht schrumpfen (FAIL), dürfen wachsen; übrige Drift ist WARN", () => {
    expect(GROW_ONLY_TABLES).toEqual(["ledger_entries", "booking_evidence"]);
    expect(by(compareManifest(manifest(), actual({ tables: { users: 3, ledger_entries: 9, booking_evidence: 4 } })), "zeilen-wachsend")?.status).toBe("FAIL");
    expect(by(compareManifest(manifest(), actual({ tables: { users: 3, ledger_entries: 12, booking_evidence: 5 } })), "zeilen-wachsend")?.status).toBe("PASS");
    const d = by(compareManifest(manifest(), actual({ tables: { users: 2, ledger_entries: 10, booking_evidence: 4 } })), "zeilen-drift");
    expect(d?.status).toBe("WARN");
    expect(d?.text).toContain("users (-1)");
  });
  it("Buchungssumme kleiner als im Manifest: FAIL; größer: PASS (nur anhängend)", () => {
    expect(by(compareManifest(manifest(), actual({ ledgerSum: 4999 })), "ledger-summe")?.status).toBe("FAIL");
    expect(by(compareManifest(manifest(), actual({ ledgerSum: 6000 })), "ledger-summe")?.status).toBe("PASS");
  });
  it("Beweiskette: Eintrag Nr. N mit anderem Hash = FAIL (auch bei längerer Kette), kürzere Kette = FAIL, leere Kette im Manifest = PASS", () => {
    expect(by(compareManifest(manifest(), actual({ evidenceHeadAtManifest: "x" })), "beweis-kopf")?.status).toBe("FAIL");
    expect(by(compareManifest(manifest(), actual({ evidenceCount: 3 })), "beweis-anzahl")?.status).toBe("FAIL");
    expect(by(compareManifest(manifest(), actual({ evidenceCount: 9, evidenceHeadAtManifest: "h4" })), "beweis-kopf")?.status).toBe("PASS");
    expect(by(compareManifest(manifest({ evidenceCount: 0, evidenceHead: "" }), actual({ evidenceCount: 2, evidenceHeadAtManifest: null })), "beweis-kopf")?.status).toBe("PASS");
  });
  it("unbekanntes Manifest-Format: FAIL", () => {
    expect(compareManifest(manifest({ format: 2 }), actual())[0].status).toBe("FAIL");
  });
});

describe("Migrationen gegen das Journal", () => {
  it("gleich = PASS; Sicherung älter = WARN; neuer = FAIL; anderer Hash = FAIL; Tabelle fehlt = FAIL", () => {
    expect(compareMigrations(["a", "b"], ["a", "b"])[0].status).toBe("PASS");
    expect(compareMigrations(["a"], ["a", "b"])[0].status).toBe("WARN");
    expect(compareMigrations(["a", "b", "c"], ["a", "b"])[0].status).toBe("FAIL");
    expect(compareMigrations(["a", "x"], ["a", "b"])[0].status).toBe("FAIL");
    expect(compareMigrations(null, ["a"])[0].status).toBe("FAIL");
  });
});

describe("Kette, Trigger, Gesamtergebnis", () => {
  it("Kette: ungültig = FAIL; gültig ohne externen Anker = WARN (kein Beweis gegen Kürzen); mit Anker = PASS", () => {
    expect(chainResult({ ok: false, count: 3, headHash: "", firstBadSeq: 2, reason: "hash" }, true).status).toBe("FAIL");
    expect(chainResult({ ok: true, count: 3, headHash: "h", firstBadSeq: null, reason: null }, false).status).toBe("WARN");
    expect(chainResult({ ok: true, count: 3, headHash: "h", firstBadSeq: null, reason: null }, true).status).toBe("PASS");
  });
  it("Schutz-Trigger: abgewiesen = PASS, durchgelassen = FAIL, keine Zeile = SKIP", () => {
    expect(triggerResult("ledger_entries", true).status).toBe("PASS");
    expect(triggerResult("ledger_entries", false).status).toBe("FAIL");
    expect(triggerResult("ledger_entries", null).status).toBe("SKIP");
  });
  it("Exit-Code und Bericht: FAIL = 1; WARN nur im strengen Modus; Bericht nennt die Zählung", () => {
    const ok = [{ id: "a", status: "PASS", text: "x" }, { id: "b", status: "SKIP", text: "y" }];
    const warn = [...ok, { id: "c", status: "WARN", text: "z" }];
    const fail = [...ok, { id: "d", status: "FAIL", text: "w" }];
    expect(exitCode(ok)).toBe(0);
    expect(exitCode(warn)).toBe(0);
    expect(exitCode(warn, true)).toBe(1);
    expect(exitCode(fail)).toBe(1);
    expect(formatReport(fail)).toContain("NICHT BESTANDEN");
    expect(formatReport(ok)).toContain("ERGEBNIS: BESTANDEN (1 PASS, 0 WARN, 0 FAIL, 1 SKIP)");
  });
});

describe("Sicherungsskript schreibt dasselbe Manifest", () => {
  const sh = readFileSync("scripts/backup-loop.sh", "utf8");
  it("MANIFEST_SQL steht wortgleich in backup-loop.sh (Drift-Wächter)", () => {
    const m = sh.match(/MANIFEST_SQL="\$\(cat <<'SQL'\n([\s\S]*?)\nSQL\n\)"/);
    expect(m?.[1]).toBe(MANIFEST_SQL);
  });
  it("Manifest VOR dem Dump; ein Manifest-Fehler lässt die Sicherung nicht scheitern; alte Manifeste werden mit aufgeräumt", () => {
    expect(sh.indexOf("manifest.part")).toBeGreaterThan(-1);
    expect(sh.indexOf('psql -X -At -v ON_ERROR_STOP=1 -c "$MANIFEST_SQL"')).toBeLessThan(sh.indexOf("pg_dump --no-owner"));
    expect(sh).toMatch(/if psql .*; then mv .*; else rm -f .*; echo .*; fi/);
    expect(sh).toContain("socaz-*.manifest.json");
  });
  it("die Abfrage enthält nur Zahlen und den Hash, keine Personenspalten", () => {
    expect(MANIFEST_SQL).not.toMatch(/email|name|username|phone|iban|password/i);
    expect(MANIFEST_SQL).toContain("drizzle.__drizzle_migrations");
  });
});

describe("restore-test.mjs: Schutz und Benutzerfehler ohne Datenbank", () => {
  const src = readFileSync("scripts/restore-test.mjs", "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"); // Kommentare zählen nicht
  const run = (args: string[], env: Record<string, string>) => spawnSync(process.execPath, ["scripts/restore-test.mjs", ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, timeout: 30_000 });

  it("ohne RESTORE_ADMIN_URL: Exit 2", () => {
    const r = run(["x.sql"], {});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("RESTORE_ADMIN_URL fehlt");
  });
  it("entfernter Server: Exit 2, und das Passwort steht in keiner Ausgabe", () => {
    for (const url of ["postgres://admin:Geheim-4711@db.example.com:5432/postgres", "postgres://admin:Geheim-4711@127.0.0.1:5432/postgres?host=db.example.com", "postgres://admin:Geheim-4711@10.0.0.5/postgres"]) {
      const r = run(["x.sql"], { RESTORE_ADMIN_URL: url });
      expect(r.status, url).toBe(2);
      expect(r.stderr + r.stdout).not.toContain("Geheim-4711");
      expect(r.stderr).toContain("nur ein lokaler Server");
    }
  });
  it("lokaler Server, aber Sicherung fehlt: Exit 2, Passwort nicht in der Ausgabe", () => {
    const r = run(["gibt-es-nicht.sql.gz"], { RESTORE_ADMIN_URL: "postgres://admin:Geheim-4711@127.0.0.1:1/postgres" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Sicherung nicht gefunden");
    expect(r.stderr + r.stdout).not.toContain("Geheim-4711");
  });
  it("Quelltext: kein .env-Zugriff, kein DROP ohne Namensprüfung, Passwort nie in Argumenten oder Ausgabe", () => {
    expect(src).not.toMatch(/loadEnvFile|dotenv|\.env\.local|readFileSync\([^)]*env/);
    const drops = [...src.matchAll(/drop database[^`]*`/g)];
    expect(drops.length).toBeGreaterThan(0);
    expect(src).toMatch(/else if \(scratchNameOk\(name\)\) await admin\.query\(`drop database/);
    expect(src).not.toMatch(/PGPASSWORD/); // nur über connEnv (Umgebungsvariable des Kindprozesses)
    for (const l of src.split("\n").filter((x) => /console\.(log|error)/.test(x) && /adminUrl|scratchUrl/.test(x))) expect(l, l).toMatch(/new URL\((adminUrl|scratchUrl)\)\.host/); // in Ausgaben nur der Host, nie die URL mit Passwort
    expect(src).toContain("shell: false");
  });
});

describe("Hinweis bei fehlender Rolle und unvollständigem Manifest (Review R-T372)", () => {
  it("restoreHint nennt nur Rollennamen, nie Zeileninhalt; ohne Rollenfehler kein Hinweis", () => {
    const h = restoreHint(["psql: ERROR:  role \"soccaz_ops\" does not exist", "DETAIL: Geheim Max Mustermann", "ERROR: role \"soccaz_app\" does not exist"].join(" | "));
    expect(h).toContain("soccaz_ops, soccaz_app");
    expect(h).toContain("db-roles.mjs");
    expect(h).not.toContain("Mustermann");
    expect(restoreHint("syntax error")).toBeNull();
    expect(restoreHint('role "a;b" does not exist')).toBeNull();
  });
  it("Manifest Format 1 mit fehlenden Feldern ist FAIL mit klarem Text, kein NaN-Vergleich", () => {
    const actual = { tables: { ledger_entries: 1 }, ledgerSum: 5, evidenceCount: 1, evidenceHeadAtManifest: "h" };
    for (const missing of ["evidenceCount", "ledgerSum", "migrations", "evidenceHead", "tables"]) {
      const m = { format: 1, tables: { ledger_entries: 1 }, migrations: 3, ledgerSum: 5, evidenceCount: 1, evidenceHead: "h" } as Record<string, unknown>;
      delete m[missing];
      const r = compareManifest(m, actual);
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe("FAIL");
      expect(r[0].text).toContain("unvollständig");
      expect(r[0].text).toContain(missing);
    }
    expect(manifestIncomplete({ format: 1, tables: { a: "x" }, migrations: 1, ledgerSum: 0, evidenceCount: 0, evidenceHead: "" })).toEqual(["tables (Zahlen)"]);
  });
});
