import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, pushSubscriptions } from "@/db/schema";
import { deliverPending, notifyUsers } from "@/server/notifications";
import { cleanup, makeUser } from "./helpers";

// Backlog 3 (T42-Review): URLs in Benachrichtigungen sind nur interne Pfade. absoluteUrl() hängt den Pfad an die eigene Adresse: "@evil.example" würde den Host ersetzen
// ("http://localhost:3100@evil.example"), "//evil.example" ebenso beim Push. Geprüft wird das Speichern UND die Zustellung (auch für Altzeilen vor dieser Prüfung).
const sent = vi.hoisted(() => ({ emails: [] as { text: string }[], pushes: [] as { url?: string }[] }));
vi.mock("@/server/providers/email", () => ({
  sendEmail: async (m: { text: string }) => {
    sent.emails.push(m);
    return { status: "sent", detail: "test" };
  },
}));
vi.mock("@/server/providers/push", () => ({
  sendPush: async (_s: unknown, p: { url?: string }) => {
    sent.pushes.push(p);
    return { status: "sent", detail: "test", gone: false };
  },
}));

beforeEach(() => {
  sent.emails.length = 0;
  sent.pushes.length = 0;
});
afterAll(async () => {
  await cleanup();
});

const BAD = ["https://evil.example/x", "//evil.example", "@evil.example", "javascript:alert(1)", "/\\evil.example", "/\t/evil.example", "/a\nb", "", "/" + "a".repeat(600)];
const urlOf = async (userId: string) => {
  const [row] = await db.select().from(notifications).where(eq(notifications.userId, userId));
  return row ? row.url : "FEHLT"; // null ist ein gültiges Ergebnis (verworfen)
};

describe("notifyUsers: nur interne Pfade werden gespeichert", () => {
  it("ein gültiger interner Pfad bleibt, kein Pfad bleibt null", async () => {
    const [a, b] = [await makeUser("nu"), await makeUser("nu")];
    await notifyUsers([a.id], { type: "system", title: "t", body: "b", url: "/lobby/1?x=2" });
    await notifyUsers([b.id], { type: "system", title: "t", body: "b" });
    expect(await urlOf(a.id)).toBe("/lobby/1?x=2");
    expect(await urlOf(b.id)).toBeNull();
  });

  it("fremde Adressen, Host-Ersatz, Schemata, Steuerzeichen und zu lange Pfade werden verworfen (null)", async () => {
    for (const bad of BAD) {
      const u = await makeUser("nu");
      await notifyUsers([u.id], { type: "system", title: "t", body: "b", url: bad });
      expect(await urlOf(u.id), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("deliverPending: auch Altzeilen mit ungültiger Adresse bleiben harmlos", () => {
  it("E-Mail und Push enthalten nie eine fremde Adresse; ein gültiger Pfad wird eingesetzt", async () => {
    const u = await makeUser("dp");
    await db.insert(pushSubscriptions).values({ userId: u.id, endpoint: `https://push.example/${u.id}`, p256dh: "p", auth: "a" });
    // Altzeilen direkt in die Tabelle (vor dieser Prüfung gespeichert)
    await db.insert(notifications).values([
      { userId: u.id, type: "system", title: "alt1", body: "b", url: "@evil.example" },
      { userId: u.id, type: "system", title: "alt2", body: "b", url: "//evil.example/p" },
      { userId: u.id, type: "system", title: "ok", body: "b", url: "/lobby/42" },
    ]);
    await deliverPending();
    const mine = sent.emails.filter((m) => m.text.includes("http"));
    expect(mine.length).toBeGreaterThanOrEqual(3);
    for (const m of mine) expect(m.text).not.toMatch(/evil/i);
    expect(sent.emails.some((m) => m.text.includes("/lobby/42"))).toBe(true);
    for (const p of sent.pushes) expect(String(p.url)).not.toMatch(/evil/i);
    expect(sent.pushes.some((p) => p.url === "/lobby/42")).toBe(true);
    expect(sent.pushes.filter((p) => p.url === "/app").length).toBeGreaterThanOrEqual(2); // ungültig -> Rückfall /app
  });
});
