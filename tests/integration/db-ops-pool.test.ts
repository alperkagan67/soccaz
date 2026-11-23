import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { dbUrlAllowed, setupRoles } from "../../scripts/db-roles.mjs";

// G25-009 Etappe B: die EXECUTE-Grenze fuer evidence_set_setting und evidence_late_attempt (Plan Abschnitt 5). Arbeitet NUR in einer selbst angelegten Wegwerf-Datenbank (Prozess-ID im Namen) mit Attrappen
// derselben Signaturen: die ECHTE Migration 0058 (und ihr Rueckfall) werden aus den Dateien gelesen und ausgefuehrt; den Entzug von PUBLIC und soccaz_app macht erst die A2-Migration, seine Anweisungen
// stehen hier einmal (A2 uebernimmt sie), damit die Grenze als Ganzes belegt ist (App scheitert, Ops laeuft). Rollenpasswoerter entstehen zufaellig im Test und werden am Ende entfernt.
const base = new URL(process.env.DATABASE_URL ?? "postgres://x@127.0.0.1/x");
const name = `soccaz_opspool_test_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const scratchUrl = new URL(base);
scratchUrl.pathname = "/" + name;
const pwApp = randomBytes(12).toString("hex");
const pwOps = randomBytes(12).toString("hex");
let admin: pg.Client;
let scratch: pg.Client;

const FN_SET = "public.evidence_set_setting(text, text, uuid, text)";
const FN_LATE = "public.evidence_late_attempt(uuid, uuid, uuid)";
const up = readFileSync("drizzle/0058_ops_execute.sql", "utf8");
const down = readFileSync("drizzle/down/0058_down.sql", "utf8");
// Anweisungen der A2-Migration (Entzug), hier nur zum Beleg der Grenze
const A2_REVOKE = [`REVOKE EXECUTE ON FUNCTION ${FN_SET} FROM PUBLIC`, `REVOKE EXECUTE ON FUNCTION ${FN_LATE} FROM PUBLIC`, `REVOKE EXECUTE ON FUNCTION ${FN_SET} FROM soccaz_app`, `REVOKE EXECUTE ON FUNCTION ${FN_LATE} FROM soccaz_app`];

const urlFor = (user: string, password: string) => {
  const u = new URL(scratchUrl);
  u.username = user;
  u.password = password;
  return u.toString();
};
async function asRole(user: string, password: string, sql: string) {
  const c = new pg.Client({ connectionString: urlFor(user, password) });
  await c.connect();
  try {
    return await c.query(sql);
  } finally {
    await c.end();
  }
}
const canExecute = async (role: string, fn: string) => (await scratch.query(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])).rows[0].ok as boolean;

beforeAll(async () => {
  if (!dbUrlAllowed(base.toString())) throw new Error("nur lokale Datenbank");
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await setupRoles({ url: scratchUrl.toString(), apply: true, allowDatabase: name, env: { DB_PASSWORD_APP: pwApp, DB_PASSWORD_OPS: pwOps } });
  scratch = new pg.Client({ connectionString: scratchUrl.toString() });
  await scratch.connect();
  // Attrappen (SECURITY INVOKER wie in 0054, ohne Tabellenzugriff): Erfolg heisst hier einfach "Aufruf erlaubt"
  await scratch.query(`create function public.evidence_set_setting(p_key text, p_value text, p_actor uuid, p_reason text) returns void as $$ select $$ language sql`);
  await scratch.query(`create function public.evidence_late_attempt(p_match uuid, p_venue uuid, p_actor uuid) returns boolean as $$ select true $$ language sql`);
  await scratch.query(`create function public.evidence_write(p_x text) returns void as $$ select $$ language sql`);
  await scratch.query(`revoke usage on schema public from public`); // gehaertete Datenbank (wie die lokalen Cluster): ohne USAGE findet eine Rolle die Funktionen nicht; die Migration muss ops USAGE geben
});
afterAll(async () => {
  if (scratch) await scratch.end().catch(() => null);
  if (admin) {
    await admin.query("alter role soccaz_app password null").catch(() => null); // kein bekanntes Test-Passwort im Cluster hinterlassen
    await admin.query("alter role soccaz_ops password null").catch(() => null);
    await admin.query(`drop database if exists "${name}" with (force)`).catch(() => null);
    await admin.end().catch(() => null);
  }
});

describe("Migration 0058: GRANT fuer soccaz_ops", () => {
  it("nur GRANT, kein REVOKE (verhaltensneutral bis A2); Rollenteil mit Existenzpruefung statt EXCEPTION-Verschlucken", () => {
    const code = up.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"); // ohne Kommentare
    expect(up).toMatch(/GRANT USAGE ON SCHEMA public TO soccaz_ops/);
    expect(up).toMatch(/GRANT EXECUTE ON FUNCTION public\.evidence_set_setting\(text, text, uuid, text\) TO soccaz_ops/);
    expect(up).toMatch(/GRANT EXECUTE ON FUNCTION public\.evidence_late_attempt\(uuid, uuid, uuid\) TO soccaz_ops/);
    expect(code).not.toMatch(/\bREVOKE\b/i); // der Entzug gehoert in die A2-Migration (sonst scheitert jede Verbindung, die nicht als Eigentuemer laeuft)
    expect(code).not.toMatch(/EXCEPTION/i);
    expect(up).toMatch(/pg_roles WHERE rolname = 'soccaz_ops'/);
  });

  it("vor dem Entzug: ops hat EXECUTE durch die Migration, die App noch ueber PUBLIC (verhaltensneutral)", async () => {
    expect(await canExecute("soccaz_ops", FN_SET)).toBe(true); // PUBLIC (Standard) gilt noch fuer alle
    await scratch.query(`revoke execute on function ${FN_SET} from public`); // nur um das GRANT der Migration isoliert zu pruefen
    await scratch.query(`revoke execute on function ${FN_LATE} from public`);
    expect(await canExecute("soccaz_ops", FN_SET)).toBe(false);
    await scratch.query(up);
    expect(await canExecute("soccaz_ops", FN_SET)).toBe(true);
    expect(await canExecute("soccaz_ops", FN_LATE)).toBe(true);
    expect(await canExecute("soccaz_app", FN_SET)).toBe(false); // nur ops, nicht die App
    // Ausgangszustand wiederherstellen (PUBLIC darf wieder), damit der naechste Test die Zeit VOR A2 abbildet
    await scratch.query(`grant execute on function ${FN_SET} to public`);
    await scratch.query(`grant execute on function ${FN_LATE} to public`);
  });
});

describe("EXECUTE-Grenze nach dem Entzug (A2-Anweisungen)", () => {
  it("soccaz_app scheitert mit insufficient_privilege (42501) auf die Funktion, soccaz_ops ist erfolgreich, evidence_write ist fuer keinen von beiden direkt aufrufbar", async () => {
    await scratch.query(`grant usage on schema public to soccaz_app`); // die App-Rolle bekommt USAGE mit der A2-Whitelist: hier, damit ihr Scheitern am EXECUTE und nicht am Schema liegt
    for (const s of A2_REVOKE) await scratch.query(s);
    await scratch.query(`revoke execute on function public.evidence_write(text) from public`); // Trigger-only (Plan Abschnitt 5)
    const setCall = `select evidence_set_setting('k', 'v', gen_random_uuid(), 'grund')`;
    const lateCall = `select evidence_late_attempt(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`;
    await expect(asRole("soccaz_app", pwApp, setCall)).rejects.toMatchObject({ code: "42501", message: expect.stringContaining("evidence_set_setting") }); // 42501 = insufficient_privilege (Meldungstext ist sprachabhaengig)
    await expect(asRole("soccaz_app", pwApp, lateCall)).rejects.toMatchObject({ code: "42501", message: expect.stringContaining("evidence_late_attempt") });
    expect((await asRole("soccaz_ops", pwOps, setCall)).rowCount).toBe(1); // der Aufruf selbst ist erlaubt (Ende-zu-Ende mit den echten Funktionen erst nach A2: Definer)
    expect((await asRole("soccaz_ops", pwOps, lateCall)).rows[0].evidence_late_attempt).toBe(true);
    for (const [r, pw] of [["soccaz_app", pwApp], ["soccaz_ops", pwOps]] as const) {
      await expect(asRole(r, pw, `select evidence_write('x')`)).rejects.toMatchObject({ code: "42501", message: expect.stringContaining("evidence_write") });
    }
    expect(await canExecute("soccaz_app", FN_SET)).toBe(false);
    expect(await canExecute("soccaz_app", FN_LATE)).toBe(false);
    expect(await canExecute("soccaz_ops", FN_SET)).toBe(true);
    expect(await canExecute("soccaz_ops", FN_LATE)).toBe(true);
  });

  it("Rueckfall 0058 nimmt ops die Rechte wieder (die App behaelt keinen)", async () => {
    await scratch.query(down);
    expect(await canExecute("soccaz_ops", FN_SET)).toBe(false);
    expect(await canExecute("soccaz_ops", FN_LATE)).toBe(false);
    await scratch.query(up); // wieder herstellen
    expect(await canExecute("soccaz_ops", FN_SET)).toBe(true);
  });
});

// REIHENFOLGE-FALLE (w4 R-T361, dokumentiert): solange die echten Funktionen SECURITY INVOKER sind (bis A2), kann soccaz_ops mit EXECUTE trotzdem nichts: der Aufruf scheitert mit 42501 an den Tabellen.
// Deshalb DATABASE_URL_OPS erst im selben Release wie A2 setzen (BETRIEB, GO-LIVE-AUDIT G25-009). NACH A2 (Definer) dreht sich dieser Test um: der Aufruf gelingt (dann hier die Erwartung umkehren).
describe("Reihenfolge-Falle: ops + echte INVOKER-Funktion scheitert (bis A2)", () => {
  const dbName = decodeURIComponent(base.pathname.replace(/^\//, ""));
  const pw = randomBytes(12).toString("hex");
  let adm: pg.Client;
  beforeAll(async () => {
    if (!dbUrlAllowed(base.toString())) throw new Error("nur lokale Datenbank");
    await setupRoles({ url: base.toString(), apply: true, allowDatabase: dbName, env: { DB_PASSWORD_OPS: pw } });
    adm = new pg.Client({ connectionString: base.toString() });
    await adm.connect();
    await adm.query(`grant usage on schema public to soccaz_ops`); // wie Migration 0058; hier unabhaengig davon, ob die Rolle beim Migrieren schon da war
    await adm.query(`grant execute on function public.evidence_set_setting(text, text, uuid, text) to soccaz_ops`);
  });
  afterAll(async () => {
    if (adm) {
      await adm.query("alter role soccaz_ops password null").catch(() => null);
      await adm.query("revoke usage on schema public from soccaz_ops").catch(() => null);
      await adm.query("revoke execute on function public.evidence_set_setting(text, text, uuid, text) from soccaz_ops").catch(() => null);
      await adm.end().catch(() => null);
    }
  });

  it("EXECUTE ist da, der Aufruf scheitert trotzdem mit insufficient_privilege (Tabellenrecht), es wird nichts geschrieben", async () => {
    const u = new URL(base);
    u.username = "soccaz_ops";
    u.password = pw;
    const c = new pg.Client({ connectionString: u.toString() });
    await c.connect();
    try {
      await expect(c.query(`select evidence_set_setting('evidence_cutover_at', '', gen_random_uuid(), 'grund fuer den test')`)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await c.end();
    }
    const n = (await adm.query(`select count(*)::int as n from audit_log where action = 'evidence_setting' and after->>'reason' = 'grund fuer den test'`)).rows[0].n;
    expect(n).toBe(0);
  });
});
