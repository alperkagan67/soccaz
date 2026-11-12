import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { SetOwnerError, setOwner } from "../../scripts/lib/set-owner.mjs";
import { cleanup, makeUser } from "./helpers";

// Vertrag 009 M1 (docs/design/009-m1-plan.md Abschnitte 5 und 6, Entscheid t9): Admin 1 festlegen. Ein BESTEHENDES Konto mit role admin, E-Mail aus OWNER_EMAIL.
// Höchstens einer je Datenbank, idempotent, Abbruch bei fremdem Admin 1, ohne E-Mail nur bei genau einem Admin-Konto (keine Raterei).
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(async () => {
  await cleanup(); // löscht alle @test.local-Nutzer, damit der einzige Platz für Admin 1 frei ist
});
afterAll(async () => {
  await cleanup();
  await pool.end();
});

const rowOf = async (id: string) => (await db.select({ role: users.role, isOwner: users.isOwner }).from(users).where(eq(users.id, id)))[0];
const entries = async (id: string) => (await db.select().from(auditLog).where(eq(auditLog.entityId, id))).filter((a) => a.action === "user.owner_set");
const foreignAdmins = async () => Number((await pool.query("select count(*) from users where role = 'admin' and banned_at is null and email not like '%@test.local'")).rows[0].count);

describe("set-owner: Admin 1 festlegen", () => {
  it("setzt is_owner für ein bestehendes Admin-Konto und schreibt einen Protokolleintrag ohne Akteur", async () => {
    const u = await makeUser("so", "admin");
    expect(await setOwner(pool, u.email)).toEqual({ status: "set", userId: u.id });
    expect(await rowOf(u.id)).toEqual({ role: "admin", isOwner: true });
    const e = await entries(u.id);
    expect(e).toHaveLength(1);
    expect(e[0].actorId).toBeNull();
    expect((e[0].after as { reason: string }).reason).toMatch(/Admin 1 festgelegt/);
  });

  it("ein Konto ohne role admin wird nicht befördert (Abbruch, nichts geändert)", async () => {
    const p = await makeUser("so1", "player");
    await expect(setOwner(pool, p.email)).rejects.toMatchObject({ code: "not_admin" });
    expect(await rowOf(p.id)).toEqual({ role: "player", isOwner: false });
    expect(await entries(p.id)).toHaveLength(0);
  });

  it("zweimal aufgerufen: der zweite Aufruf ändert nichts (idempotent), kein zweiter Protokolleintrag; Schreibweise der E-Mail egal", async () => {
    const u = await makeUser("so2", "admin");
    expect((await setOwner(pool, u.email)).status).toBe("set");
    expect(await setOwner(pool, u.email.toUpperCase())).toEqual({ status: "already", userId: u.id });
    expect(await rowOf(u.id)).toEqual({ role: "admin", isOwner: true });
    expect(await entries(u.id)).toHaveLength(1);
  });

  it("bricht ab, wenn schon ein anderes Konto Admin 1 ist: nichts geändert", async () => {
    const first = await makeUser("so3", "owner");
    const second = await makeUser("so4", "admin");
    await expect(setOwner(pool, second.email)).rejects.toMatchObject({ code: "other_owner" });
    expect(await rowOf(second.id)).toEqual({ role: "admin", isOwner: false });
    expect(await rowOf(first.id)).toEqual({ role: "admin", isOwner: true });
    expect(await entries(second.id)).toHaveLength(0);
  });

  it("unbekannte E-Mail, ungültige E-Mail und gesperrtes Konto: Abbruch", async () => {
    await expect(setOwner(pool, "gibt-es-nicht@test.local")).rejects.toMatchObject({ code: "unknown_user" });
    await expect(setOwner(pool, "kein-at-zeichen")).rejects.toBeInstanceOf(SetOwnerError);
    const banned = await makeUser("so5", "admin");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    await expect(setOwner(pool, banned.email)).rejects.toMatchObject({ code: "banned" });
    expect(await rowOf(banned.id)).toEqual({ role: "admin", isOwner: false });
  });

  it("gleichzeitige Aufrufe für zwei Admin-Konten: genau eines wird Admin 1", async () => {
    const a = await makeUser("so6", "admin");
    const b = await makeUser("so7", "admin");
    const results = await Promise.allSettled([setOwner(pool, a.email), setOwner(pool, b.email)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.select({ id: users.id }).from(users).where(eq(users.isOwner, true))).length).toBe(1);
  });
});

describe("set-owner ohne E-Mail (OWNER_EMAIL nicht gesetzt): keine Raterei", () => {
  it("mehrere Admin-Konten: Abbruch, nichts geändert", async () => {
    const a = await makeUser("so8", "admin");
    const b = await makeUser("so9", "admin");
    await expect(setOwner(pool, undefined)).rejects.toMatchObject({ code: "ambiguous" });
    await expect(setOwner(pool, "")).rejects.toMatchObject({ code: "ambiguous" });
    expect(await rowOf(a.id)).toEqual({ role: "admin", isOwner: false });
    expect(await rowOf(b.id)).toEqual({ role: "admin", isOwner: false });
  });

  it("genau ein Admin-Konto: dieses wird Admin 1 (läuft nur, wenn die Datenbank keine fremden Admin-Konten enthält)", async (ctx) => {
    if ((await foreignAdmins()) > 0) ctx.skip();
    const only = await makeUser("so10", "admin");
    expect(await setOwner(pool, undefined)).toEqual({ status: "set", userId: only.id });
    expect(await rowOf(only.id)).toEqual({ role: "admin", isOwner: true });
  });

  it("kein Admin-Konto: Abbruch (läuft nur ohne fremde Admin-Konten)", async (ctx) => {
    if ((await foreignAdmins()) > 0) ctx.skip();
    await expect(setOwner(pool, undefined)).rejects.toMatchObject({ code: "no_admin" });
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
