import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { JOBS, SCHEDULE } from "@/server/jobs";
import { expireVenueInvites } from "@/server/venue-access";
import { cleanup, grantVenueAccess, makeUser } from "./helpers";

// 011 M1 / t9 R1: die Adresse einer nie eingelösten Einladung wird 30 Tage nach Ablauf (14 Tage Gültigkeit) = 44 Tage nach dem Einladen geleert.
// Zeitreise: statt zu warten, wird invited_at in die Vergangenheit gesetzt; `now` ist ein Parameter.
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
});

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function venue() {
  const [v] = await db.insert(venues).values({ name: `Ablauf Halle ${Math.random().toString(36).slice(2, 8)}`, city: "Essen", source: "manual" }).returning();
  return v;
}
async function invite(venueId: string, days: number, email = `einladung-${Math.random().toString(36).slice(2, 8)}@test.local`) {
  const [a] = await db.insert(venueAccess).values({ venueId, invitedEmail: email, status: "invited", invitedAt: ago(days) }).returning();
  return a;
}
const row = async (id: string) => (await db.select().from(venueAccess).where(eq(venueAccess.id, id)))[0];

describe("expireVenueInvites (R1)", () => {
  it("leert die Adresse erst nach 44 Tagen; frühere und aktive Zeilen bleiben", async () => {
    const [v45, v40, v10, vAct] = [await venue(), await venue(), await venue(), await venue()];
    const a45 = await invite(v45.id, 45);
    const a40 = await invite(v40.id, 40); // abgelaufen (14 Tage), Adresse noch in der Aufbewahrung
    const a10 = await invite(v10.id, 10); // noch gültig
    const user = await makeUser("act");
    await grantVenueAccess(vAct.id, user.id);
    await db.update(venueAccess).set({ invitedAt: ago(90) }).where(eq(venueAccess.venueId, vAct.id)); // alt, aber aktiv: darf nie angefasst werden

    expect(await expireVenueInvites()).toBeGreaterThanOrEqual(1);
    expect(await row(a45.id)).toMatchObject({ status: "revoked", invitedEmail: null });
    expect((await row(a45.id)).revokedAt).not.toBeNull();
    expect(await row(a40.id)).toMatchObject({ status: "invited" });
    expect((await row(a40.id)).invitedEmail).not.toBeNull();
    expect(await row(a10.id)).toMatchObject({ status: "invited" });
    const act = await db.select().from(venueAccess).where(eq(venueAccess.venueId, vAct.id));
    expect(act[0]).toMatchObject({ status: "active", userId: user.id });

    // Zeitreise: 5 Tage später ist auch die 40-Tage-Zeile fällig, die 10-Tage-Zeile nicht
    const later = new Date(Date.now() + 5 * DAY);
    await expireVenueInvites(later);
    expect(await row(a40.id)).toMatchObject({ status: "revoked", invitedEmail: null });
    expect(await row(a10.id)).toMatchObject({ status: "invited" });
  });

  it("idempotent; Eingriffsprotokoll ohne Adresse; neue Einladung für die Halle danach möglich", async () => {
    const v = await venue();
    const mail = "geheim-adresse@test.local";
    const a = await invite(v.id, 50, mail);
    expect(await expireVenueInvites()).toBeGreaterThanOrEqual(1);
    expect(await expireVenueInvites()).toBe(0); // zweiter Lauf: nichts mehr zu tun
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.entityId, v.id), eq(auditLog.action, "venue.access.expire")));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain(mail);
    expect(JSON.stringify(logs[0])).toContain(a.id);
    // der partielle Unique stört nicht mehr
    await expect(invite(v.id, 0)).resolves.toBeTruthy();
  });

  it("parallele Läufe: jede Zeile genau einmal, ein Protokolleintrag je Zeile", async () => {
    const vs = await Promise.all([venue(), venue(), venue(), venue(), venue()]);
    const ids = (await Promise.all(vs.map((v) => invite(v.id, 60)))).map((a) => a.id);
    const counts = await Promise.all([expireVenueInvites(), expireVenueInvites(), expireVenueInvites()]);
    // SKIP LOCKED: ein Lauf kann eine gesperrte Halle überspringen; ein weiterer Lauf holt den Rest nach
    await expireVenueInvites();
    const rows = await db.select().from(venueAccess).where(inArray(venueAccess.id, ids));
    expect(rows.every((r) => r.status === "revoked" && r.invitedEmail === null)).toBe(true);
    const logs = await db.select().from(auditLog).where(and(inArray(auditLog.entityId, vs.map((v) => v.id)), eq(auditLog.action, "venue.access.expire")));
    expect(logs).toHaveLength(5);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5);
  });

  it("limit begrenzt einen Lauf; der nächste macht weiter", async () => {
    const vs = [await venue(), await venue(), await venue()];
    const ids = (await Promise.all(vs.map((v) => invite(v.id, 60)))).map((a) => a.id);
    expect(await expireVenueInvites(new Date(), 2)).toBe(2);
    expect(await expireVenueInvites(new Date(), 2)).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(venueAccess).where(inArray(venueAccess.id, ids));
    expect(rows.every((r) => r.status === "revoked")).toBe(true);
  });

  it("ist als Job eingetragen und eingeplant", () => {
    expect(typeof JOBS["expire-venue-invites"]).toBe("function");
    expect(SCHEDULE["expire-venue-invites"]).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
