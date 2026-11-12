import { spawnSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { cleanup, makeUser } from "./helpers";

// scripts/set-owner.mjs als Prozess: die E-Mail kommt nur aus OWNER_EMAIL, wird nie ausgegeben, ohne --yes passiert nichts (Entscheid t9, Plan Abschnitt 6).
beforeEach(cleanup);
afterAll(cleanup);

const run = (args: string[], email?: string) =>
  spawnSync("node", ["scripts/set-owner.mjs", ...args], { env: { ...process.env, ...(email ? { OWNER_EMAIL: email } : { OWNER_EMAIL: "" }) }, encoding: "utf8" });
const isOwnerOf = async (id: string) => (await db.select({ o: users.isOwner }).from(users).where(eq(users.id, id)))[0].o;

describe("scripts/set-owner.mjs (Prozess)", () => {
  it("ohne --yes: Trockenlauf, nichts geändert, E-Mail nicht in der Ausgabe", async () => {
    const u = await makeUser("cli1", "admin");
    const r = run([], u.email);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Trockenlauf/);
    expect(r.stdout + r.stderr).not.toContain(u.email);
    expect(await isOwnerOf(u.id)).toBe(false);
  });

  it("mit --yes und OWNER_EMAIL: Admin 1 gesetzt, E-Mail und Zugangsdaten nicht in der Ausgabe", async () => {
    const u = await makeUser("cli2", "admin");
    const r = run(["--yes"], u.email);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Admin 1 festgelegt/);
    expect(r.stdout + r.stderr).not.toContain(u.email);
    expect(r.stdout + r.stderr).not.toContain(new URL(process.env.DATABASE_URL as string).password || "\u0000");
    expect(await isOwnerOf(u.id)).toBe(true);
    const again = run(["--yes"], u.email);
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/Unverändert/);
  });

  it("E-Mail als Argument wird abgelehnt (nur über die Umgebung), mehrere Admin-Konten ohne Angabe: Abbruch mit Exit 1", async () => {
    const a = await makeUser("cli3", "admin");
    await makeUser("cli4", "admin");
    const arg = run([a.email, "--yes"]);
    expect(arg.status).toBe(2);
    expect(arg.stderr).not.toContain(a.email);
    const none = run(["--yes"]);
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/ambiguous/);
    expect(await isOwnerOf(a.id)).toBe(false);
  });
});
