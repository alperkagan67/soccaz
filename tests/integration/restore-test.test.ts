import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor, ledgerEntries, venues } from "@/db/schema-finance";
import { recordEvidence } from "@/server/evidence-write";
import { MANIFEST_SQL, connEnv, withDatabase } from "../../scripts/lib/restore-checks.mjs";
import { addPlayer, cleanup, makeMatch } from "./helpers";
import { sql } from "drizzle-orm";

// Restore-Probe (E8) mit ECHTER Sicherung: pg_dump der Test-Datenbank (Klartext+gzip wie backup-loop.sh, und custom-Format) -> scripts/restore-test.mjs spielt in eine Wegwerf-Datenbank ein und prüft.
// Braucht psql/pg_dump/pg_restore (PATH oder PG_BIN). Fehlen sie, wird ÜBERSPRUNGEN und das steht in der Testausgabe (nicht "grün belegt").
const BIN = process.env.PG_BIN;
const tool = (n: string) => (BIN ? `${BIN}/${n}` : n);
const has = (n: string) => !spawnSync(tool(n), ["--version"]).error;
const major = (v: string) => Number(/(\d+)[.\s]/.exec(v)?.[1] ?? 0);
// pg_dump bricht ab, wenn der Server NEUER ist als das Werkzeug ("unpassende Serverversion"): dann ehrlich überspringen statt rot oder falsch grün
let skipWhy = "";
if (!(has("psql") && has("pg_dump") && has("pg_restore"))) skipWhy = "psql/pg_dump/pg_restore nicht gefunden";
else {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const serverMajor = major(String((await c.query("show server_version")).rows[0].server_version));
  await c.end();
  const toolMajor = major(spawnSync(tool("pg_dump"), ["--version"], { encoding: "utf8" }).stdout.replace("pg_dump (PostgreSQL)", ""));
  if (toolMajor < serverMajor) skipWhy = `pg_dump ${toolMajor} ist älter als der Server ${serverMajor}`;
}
const TOOLS = skipWhy === "";
if (!TOOLS) console.warn(`[restore-test] Rundlauf-Tests werden ÜBERSPRUNGEN, NICHT belegt: ${skipWhy}`);

const url = process.env.DATABASE_URL as string;
const adminUrl = withDatabase(url, "postgres");
const dir = TOOLS ? mkdtempSync(join(tmpdir(), "restore-probe-")) : "";
const env = () => ({ ...process.env, ...connEnv(url) });
const exec = (cmd: string, args: string[], input?: Buffer) => {
  const r = spawnSync(tool(cmd), args, { env: env() as never, input, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} endete mit ${r.status}: ${String(r.stderr ?? "").slice(0, 300)}`);
  return r.stdout;
};
const probe = (file: string, extra: string[] = []) =>
  spawnSync(process.execPath, ["scripts/restore-test.mjs", file, ...extra], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", RESTORE_ADMIN_URL: adminUrl, ...(BIN ? { PG_BIN: BIN } : {}) } as never, timeout: 240_000 });
const scratchDbs = async () => {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    return (await c.query("select datname from pg_database where datname like 'restore\\_check\\_%'")).rows.map((r) => r.datname as string);
  } finally {
    await c.end();
  }
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const maintenance = (fn: (tx: Tx) => Promise<unknown>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await fn(tx);
  });
async function resetChain() {
  await maintenance(async (tx) => {
    await tx.delete(evidenceActor);
    await tx.delete(bookingEvidence);
    await tx.update(bookingEvidenceCounter).set({ lastSeq: 0, lastHash: "" }).where(eq(bookingEvidenceCounter.id, 1));
  });
}

let plainGz = "";
let custom = "";
let manifestFile = "";
let head = { hash: "", seq: 0 };
let plainSql = "";

describe.skipIf(!TOOLS)(`Restore-Probe mit echter Sicherung${TOOLS ? "" : ` (ÜBERSPRUNGEN, NICHT belegt: ${skipWhy})`}`, () => {
  beforeAll(async () => {
    await cleanup();
    await resetChain();
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const [v] = await db.insert(venues).values({ name: `Restore Halle ${Date.now().toString(36)}`, city: "Essen", source: "manual" }).returning();
    const u = await addPlayer(m.match.id, m.home.id, "rs");
    await db.insert(ledgerEntries).values({ debitAccount: "wallet", debitUserId: u.id, creditAccount: "venue_payable", amountCents: 800, kind: "match_share", matchId: m.match.id, idempotencyKey: `restore-${Date.now()}`, reason: "Test" });
    for (const kind of ["request_sent", "request_sent", "job_open"] as const) await db.transaction((tx) => recordEvidence(tx, { matchId: m.match.id, venueId: kind === "job_open" ? null : v.id, round: 1, kind }));
    const [c] = await db.select().from(bookingEvidenceCounter);
    head = { hash: c.lastHash, seq: c.lastSeq };
    // Manifest VOR der Sicherung (wie backup-loop.sh), dann die Sicherung in beiden Formaten
    manifestFile = join(dir, "socaz-test.manifest.json");
    writeFileSync(manifestFile, exec("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", MANIFEST_SQL]));
    plainGz = join(dir, "socaz-test.sql.gz");
    writeFileSync(plainGz, gzipSync(exec("pg_dump", ["--no-owner", "--clean", "--if-exists"])));
    custom = join(dir, "socaz-test.dump");
    exec("pg_dump", ["--no-owner", "-Fc", "-f", custom]);
    plainSql = gunzipSync(readFileSync(plainGz)).toString("utf8").replace(/\r\n/g, "\n"); // pg_dump unter Windows schreibt CRLF; die Mutationen arbeiten zeilenweise
  }, 240_000);

  afterAll(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    await cleanup();
    await resetChain();
  });

  const anchor = () => ["--head-hash", head.hash, "--count", String(head.seq)];
  const mutate = (name: string, fn: (s: string) => string) => {
    const s = fn(plainSql);
    expect(s, `Mutation ${name} hat nichts verändert`).not.toBe(plainSql);
    const f = join(dir, `${name}.sql.gz`);
    writeFileSync(f, gzipSync(Buffer.from(s, "utf8")));
    writeFileSync(join(dir, `${name}.manifest.json`), readFileSync(manifestFile)); // Manifest neben der Sicherung (Standardpfad)
    return f;
  };
  /** Setzt die Zeilen eines COPY-Blocks neu zusammen (auch leer: dann folgt die Endmarke direkt auf den Kopf). */
  const rebuild = (s: string, b: { start: number; end: number }, rows: string[]) => s.slice(0, b.start) + rows.map((r) => r + String.fromCharCode(10)).join("") + s.slice(b.end + 1);
  /** Zeilen eines COPY-Blocks (ohne Kopf und Endmarke). */
  const block = (s: string, table: string) => {
    const a = s.indexOf(`COPY ${table} `);
    const start = s.indexOf("\n", a) + 1;
    const end = s.indexOf("\n\\.\n", start);
    return { start, end, rows: s.slice(start, end).split("\n").filter(Boolean) };
  };

  it("Klartext+gzip wie backup-loop.sh, mit Manifest und externem Anker: bestanden, alle Prüfungen PASS (Salden-Guard darf WARN sein), Wegwerf-Datenbank gelöscht", async () => {
    const r = probe(plainGz, ["--manifest", manifestFile, ...anchor()]);
    expect(r.stdout + r.stderr).toContain("ERGEBNIS: BESTANDEN");
    expect(r.status).toBe(0);
    for (const id of ["restore", "tabellen-anzahl", "zeilen-wachsend", "ledger-summe", "beweis-kopf", "migrationen", "beweiskette", "trigger-ledger_entries", "trigger-booking_evidence"]) expect(r.stdout, id).toMatch(new RegExp(`^PASS\\s+${id}:`, "m"));
    expect(r.stdout).not.toMatch(/^FAIL/m);
    expect(await scratchDbs()).toEqual([]);
  }, 300_000);

  it("custom-Format (pg_restore): ebenfalls bestanden", () => {
    const r = probe(custom, ["--manifest", manifestFile, ...anchor()]);
    expect(r.stdout + r.stderr).toContain("ERGEBNIS: BESTANDEN");
    expect(r.status).toBe(0);
  }, 300_000);

  it("ohne Manifest und ohne Anker: bestanden, aber mit WARN (Teilbeweis), im strengen Modus Exit 1", () => {
    const f = join(dir, "ohne.sql.gz");
    writeFileSync(f, readFileSync(plainGz));
    const r = probe(f);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^WARN\s+manifest:/m);
    expect(r.stdout).toMatch(/^WARN\s+beweiskette:.*KEIN Beweis gegen Kürzen/m);
    expect(probe(f, ["--strict"]).status).toBe(1);
  }, 300_000);

  describe("Mutationen der Sicherung: je FAIL (Exit 1)", () => {
    it("Beweiskette gekürzt (letzte Zeile fehlt): Anker und Manifest schlagen an", () => {
      const f = mutate("gekuerzt", (s) => {
        const b = block(s, "public.booking_evidence");
        return rebuild(s, b, b.rows.slice(0, -1));
      });
      const r = probe(f, ["--manifest", join(dir, "gekuerzt.manifest.json"), ...anchor()]);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toMatch(/^FAIL\s+beweiskette:/m);
    }, 300_000);

    it("Beweiskette verändert (Art eines Eintrags getauscht): Hash-Prüfung schlägt an", () => {
      const f = mutate("verfaelscht", (s) => s.replace("\trequest_sent\t", "\tjob_open\t"));
      const r = probe(f, ["--manifest", join(dir, "verfaelscht.manifest.json"), ...anchor()]);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toMatch(/^FAIL\s+(beweiskette|restore):/m);
    }, 300_000);

    it("Buchung fehlt (Zeile aus ledger_entries entfernt): Zeilenzahl nur-anhängend schlägt an", () => {
      const f = mutate("buchung-weg", (s) => {
        const b = block(s, "public.ledger_entries");
        return rebuild(s, b, b.rows.slice(0, -1));
      });
      const r = probe(f, ["--manifest", join(dir, "buchung-weg.manifest.json"), ...anchor()]);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toMatch(/^FAIL\s+(zeilen-wachsend|ledger-summe):/m);
    }, 300_000);

    it("Migrationseintrag fehlt (Sicherung älter): WARN; Hash verändert: FAIL", () => {
      const b = block(plainSql, "drizzle.__drizzle_migrations");
      const fewer = mutate("migration-fehlt", (s) => s.slice(0, b.start) + b.rows.slice(0, -1).join("\n") + s.slice(b.end));
      const r1 = probe(fewer, ["--manifest", join(dir, "migration-fehlt.manifest.json"), ...anchor()]);
      expect(r1.stdout).toMatch(/^WARN\s+migrationen:/m);
      const changed = mutate("migration-hash", (s) => s.slice(0, b.start) + b.rows[0].replace(/\t[0-9a-f]{64}\t/, `\t${"0".repeat(64)}\t`) + "\n" + b.rows.slice(1).join("\n") + s.slice(b.end));
      const r2 = probe(changed, ["--manifest", join(dir, "migration-hash.manifest.json"), ...anchor()]);
      expect(r2.status, r2.stdout).toBe(1);
      expect(r2.stdout).toMatch(/^FAIL\s+migrationen:/m);
    }, 300_000);

    it("Schutz-Trigger fehlen (Trigger aus der Sicherung entfernt): FAIL", () => {
      const f = mutate("ohne-trigger", (s) => s.replace(/CREATE TRIGGER [^\n]* ON public\.ledger_entries[^;]*;/g, ""));
      const r = probe(f, ["--manifest", join(dir, "ohne-trigger.manifest.json"), ...anchor()]);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toMatch(/^FAIL\s+trigger-ledger_entries:/m);
    }, 300_000);

    it("kaputte Sicherung (Datei abgeschnitten): restore FAIL, Wegwerf-Datenbank trotzdem gelöscht", async () => {
      const f = join(dir, "kaputt.sql.gz");
      writeFileSync(f, gzipSync(Buffer.from(plainSql.slice(0, Math.floor(plainSql.length / 2)) + "\nTHIS IS NOT SQL;\n")));
      const r = probe(f);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toMatch(/^FAIL\s+restore:/m);
      expect(await scratchDbs()).toEqual([]);
    }, 300_000);
  });

  it("Ausgabe enthält keine Zeileninhalte (kein Name, keine E-Mail der Testnutzer) und nicht das Passwort der Verbindung", () => {
    const r = probe(plainGz, ["--manifest", manifestFile, ...anchor()]);
    const pw = decodeURIComponent(new URL(url).password);
    if (pw) expect(r.stdout + r.stderr).not.toContain(pw);
    expect(r.stdout + r.stderr).not.toMatch(/@example\.|@test\./);
  }, 300_000);
});
