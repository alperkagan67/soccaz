import pg from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { callEvidenceSetSetting, resetOpsPoolForTests } from "@/db/ops";
import { sql } from "drizzle-orm";

// Backlog 228-3: trennt der Server einen Leerlauf-Client (pg_terminate_backend), darf der Prozess nicht sterben ("Unhandled error event"); der Pool baut danach neu auf.
// Läuft dieser Test ohne Handler, meldet vitest den unbehandelten Fehler und ist rot.
const terminate = async (pid: number) => {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("select pg_terminate_backend($1)", [pid]);
  } finally {
    await admin.end();
  }
  await new Promise((r) => setTimeout(r, 400));
};

afterAll(async () => {
  delete process.env.DATABASE_URL_OPS;
  await resetOpsPoolForTests();
});

describe("Leerlauf-Verbindung wird vom Server getrennt", () => {
  it("Hauptpool: Prozess lebt, Zeile mit Code 57P01 ohne Verbindungsdaten, nächster Zugriff geht", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const pid = Number(((await db.execute(sql`select pg_backend_pid() as pid`)) as unknown as { rows: { pid: number }[] }).rows[0].pid);
      await terminate(pid);
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("Pool main"));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("57P01");
      expect(lines[0]).not.toMatch(/postgres:\/\/|password/i);
      await expect(db.execute(sql`select 1 as ok`)).resolves.toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("Ops-Pool: dasselbe (eigener Pool über DATABASE_URL_OPS)", async () => {
    process.env.DATABASE_URL_OPS = process.env.DATABASE_URL;
    await resetOpsPoolForTests();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await callEvidenceSetSetting("pool_error_test_unbekannt", "x", "00000000-0000-0000-0000-000000000000", "Test").catch(() => undefined); // legt den Ops-Pool an; der Aufruf selbst darf scheitern
      const ops = (globalThis as unknown as { opsPool?: pg.Pool }).opsPool;
      expect(ops).toBeDefined();
      const pid = Number((await ops!.query("select pg_backend_pid() as pid")).rows[0].pid);
      await terminate(pid);
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("Pool ops"));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("57P01");
      await expect(ops!.query("select 1")).resolves.toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });
});
