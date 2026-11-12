import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { SetOwnerError, setOwner } from "../../scripts/lib/set-owner.mjs";
import { cleanup, makeUser } from "./helpers";

// Vertrag 009 M1, E1a (docs/design/009-m1-plan.md Abschnitte 5 und 6): Admin 1 festlegen. Höchstens einer je Datenbank, idempotent, Abbruch bei fremdem Admin 1.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(async () => {
  await cleanup(); // löscht alle @test.local-Nutzer, damit der einzige Platz für Admin 1 frei ist
});
afterAll(async () => {
  await cleanup();
  await pool.end();
});

const rowOf = async (id: string) => (await db.select({ role: users.role, isOwner: users.isOwner }).from(users).where(eq(users.id, id)))[0];
const auditCount = async (id: string) => (await db.select().from(auditLog).where(eq(auditLog.entityId, id))).filter((a) => a.action === "user.owner_set").length;

describe("set-owner: Admin 1 festlegen", () => {
  it("setzt Rolle admin und is_owner, schreibt einen Protokolleintrag ohne Akteur", async () => {
    const u = await makeUser("so", "player");
    const r = await setOwner(pool, u.email);
    expect(r).toEqual({ status: "set", userId: u.id });
    expect(await rowOf(u.id)).toEqual({ role: "admin", isOwner: true });
    const entries = (await db.select().from(auditLog).where(eq(auditLog.entityId, u.id))).filter((a) => a.action === "user.owner_set");
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBeNull();
  });

  it("zweimal aufgerufen: der zweite Aufruf ändert nichts (idempotent), kein zweiter Protokolleintrag; E-Mail ohne Beachtung der Schreibweise", async () => {
    const u = await makeUser("so2", "admin");
    expect((await setOwner(pool, u.email)).status).toBe("set");
    expect(await setOwner(pool, u.email.toUpperCase())).toEqual({ status: "already", userId: u.id });
    expect(await rowOf(u.id)).toEqual({ role: "admin", isOwner: true });
    expect(await auditCount(u.id)).toBe(1);
  });

  it("bricht ab, wenn schon ein anderes Konto Admin 1 ist: nichts geändert", async () => {
    const first = await makeUser("so3", "owner");
    const second = await makeUser("so4", "player");
    await expect(setOwner(pool, second.email)).rejects.toMatchObject({ name: "Error", code: "other_owner" });
    expect(await rowOf(second.id)).toEqual({ role: "player", isOwner: false });
    expect(await rowOf(first.id)).toEqual({ role: "admin", isOwner: true });
    expect(await auditCount(second.id)).toBe(0);
  });

  it("unbekannte E-Mail, ungültige E-Mail und gesperrtes Konto: Abbruch", async () => {
    await expect(setOwner(pool, "gibt-es-nicht@test.local")).rejects.toMatchObject({ code: "unknown_user" });
    await expect(setOwner(pool, "")).rejects.toBeInstanceOf(SetOwnerError);
    const banned = await makeUser("so5", "admin");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    await expect(setOwner(pool, banned.email)).rejects.toMatchObject({ code: "banned" });
    expect(await rowOf(banned.id)).toEqual({ role: "admin", isOwner: false });
  });

  it("gleichzeitige Aufrufe für zwei Konten: genau eines wird Admin 1", async () => {
    const a = await makeUser("so6", "player");
    const b = await makeUser("so7", "player");
    const results = await Promise.allSettled([setOwner(pool, a.email), setOwner(pool, b.email)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const owners = (await db.select({ id: users.id }).from(users).where(eq(users.isOwner, true))).map((r) => r.id);
    expect(owners).toHaveLength(1);
  });
});

describe("Datenbank: genau ein Admin 1, immer Plattform-Admin", () => {
  it("makeUser(owner) ist admin mit is_owner; ein zweiter Admin 1 wird vom Teilindex abgelehnt", async () => {
    const o = await makeUser("db1", "owner");
    expect(await rowOf(o.id)).toEqual({ role: "admin", isOwner: true });
    await expect(makeUser("db2", "owner")).rejects.toThrow();
  });

  it("is_owner mit Rolle player wird vom CHECK abgelehnt", async () => {
    const p = await makeUser("db3", "player");
    await expect(db.update(users).set({ isOwner: true }).where(eq(users.id, p.id))).rejects.toThrow();
  });
});
