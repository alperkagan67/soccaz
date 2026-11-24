import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { APPLE_NAME_PLATZHALTER } from "@/lib/apple-login";
import { anmeldenMitApple } from "@/server/apple-account";
import { deleteAccount, exportMyData } from "@/server/account";
import { cleanup, makeUser } from "./helpers";

vi.mock("@/auth", () => ({ auth: async () => null, signOut: async () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const run = randomUUID().slice(0, 8);
const sub = (n: string) => `001234.${run}${n}.0001`;
const mail = (n: string) => `apple-${n}-${run}@test.local`;
afterAll(cleanup);

const byApple = async (s: string) => (await db.select().from(users).where(eq(users.appleId, s)))[0];

describe("Anmeldung mit Apple: Zuordnung NUR über den Apple-sub", () => {
  it("neuer Nutzer: Konto mit apple_id, E-Mail klein geschrieben, Name aus dem ersten Login", async () => {
    const r = await anmeldenMitApple({ sub: sub("a"), email: mail("A").toUpperCase(), name: "Ali Kaya" });
    expect(r.ok).toBe(true);
    const u = await byApple(sub("a"));
    expect(u.email).toBe(mail("A").toLowerCase());
    expect(u.name).toBe("Ali Kaya");
    expect(u.googleId).toBeNull();
    expect(r.ok && r.user.id).toBe(u.id);
  });

  it("zweiter Login: gleiches Konto (kein zweites), auch wenn Apple die E-Mail ändert oder den Namen nicht mehr liefert", async () => {
    const first = await anmeldenMitApple({ sub: sub("b"), email: mail("b"), name: "Bea" });
    const again = await anmeldenMitApple({ sub: sub("b"), email: `neu-${mail("b")}`, name: APPLE_NAME_PLATZHALTER });
    expect(first.ok && again.ok && first.user.id === again.user.id).toBe(true);
    expect(await db.select().from(users).where(eq(users.appleId, sub("b")))).toHaveLength(1);
    expect((await byApple(sub("b"))).name).toBe("Bea"); // der gespeicherte Name wird nie überschrieben
    expect(again.ok && again.user.email).toBe(mail("b")); // kanonische Konto-E-Mail (die jwt-Callback-Suche braucht sie)
  });

  it("Takeover-Schutz: gleiche E-Mail wie ein bestehendes Konto: Abweisung, KEIN zweites Konto, das Konto bleibt unberührt", async () => {
    const g = await makeUser("g");
    const r = await anmeldenMitApple({ sub: sub("c"), email: g.email.toUpperCase(), name: "Angreifer" });
    expect(r).toEqual({ ok: false, reason: "email_vergeben" });
    expect(await byApple(sub("c"))).toBeUndefined();
    const [after] = await db.select().from(users).where(eq(users.id, g.id));
    expect(after.appleId).toBeNull();
    expect(after.name).toBe(g.name);
  });

  it("derselbe Mensch mit Google und Apple (gleiche E-Mail): klare Abweisung, nicht zwei Konten", async () => {
    const g = await makeUser("gg");
    const r = await anmeldenMitApple({ sub: sub("d"), email: g.email, name: "Doppelt" });
    expect(r.ok).toBe(false);
    expect(await db.select().from(users).where(eq(users.email, g.email))).toHaveLength(1);
  });

  it("Privat-Relay-Adresse ist kein Fehler", async () => {
    const r = await anmeldenMitApple({ sub: sub("e"), email: `${run}e@privaterelay.appleid.com`, name: APPLE_NAME_PLATZHALTER });
    expect(r.ok).toBe(true);
  });

  it("ohne E-Mail oder ohne gültigen sub: Abweisung, nichts angelegt", async () => {
    expect(await anmeldenMitApple({ sub: sub("f"), email: null, name: "X" })).toEqual({ ok: false, reason: "keine_email" });
    expect(await anmeldenMitApple({ sub: sub("f"), email: "   ", name: "X" })).toEqual({ ok: false, reason: "keine_email" });
    expect(await anmeldenMitApple({ sub: "", email: mail("f"), name: "X" })).toEqual({ ok: false, reason: "ungueltig" });
    expect(await anmeldenMitApple({ sub: 5, email: mail("f"), name: "X" })).toEqual({ ok: false, reason: "ungueltig" });
    expect(await byApple(sub("f"))).toBeUndefined();
  });

  it("gleichzeitige erste Anmeldungen derselben Kennung: genau ein Konto", async () => {
    const rs = await Promise.all([1, 2, 3].map(() => anmeldenMitApple({ sub: sub("g"), email: mail("g"), name: "Gleich" })));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(await db.select().from(users).where(eq(users.appleId, sub("g")))).toHaveLength(1);
  });

  it("gesperrtes Konto: Anmeldung liefert das Konto (die Sperre wirkt wie bei Google im jwt-Callback), kein neues Konto", async () => {
    await anmeldenMitApple({ sub: sub("h"), email: mail("h"), name: "Hans" });
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.appleId, sub("h")));
    const r = await anmeldenMitApple({ sub: sub("h"), email: mail("h"), name: "Hans" });
    expect(r.ok && r.user.bannedAt).toBeTruthy();
    expect(await db.select().from(users).where(eq(users.appleId, sub("h")))).toHaveLength(1);
  });
});

describe("DSGVO: Löschung und Export berücksichtigen apple_id", () => {
  it("Export nennt den Anmeldeweg (Apple verknüpft: ja/nein), nie die Kennung selbst", async () => {
    await anmeldenMitApple({ sub: sub("i"), email: mail("i"), name: "Ida" });
    const u = await byApple(sub("i"));
    const ex = await exportMyData(u.id);
    expect(ex.user).toMatchObject({ mitAppleAngemeldet: true });
    expect(JSON.stringify(ex)).not.toContain(sub("i"));
    const g = await makeUser("ex");
    expect((await exportMyData(g.id)).user).toMatchObject({ mitAppleAngemeldet: false });
  });

  it("Konto löschen: apple_id wird geleert; dieselbe Apple-Kennung belebt das gelöschte Konto NICHT wieder (neues, leeres Konto)", async () => {
    await anmeldenMitApple({ sub: sub("j"), email: mail("j"), name: "Jo" });
    const alt = await byApple(sub("j"));
    await deleteAccount(alt.id);
    const [nachLoeschen] = await db.select().from(users).where(eq(users.id, alt.id));
    expect(nachLoeschen.appleId).toBeNull();
    expect(nachLoeschen.name).toBe("Gelöschter Nutzer");
    const neu = await anmeldenMitApple({ sub: sub("j"), email: mail("j"), name: "Jo" });
    expect(neu.ok && neu.user.id !== alt.id).toBe(true);
    const [altNachher] = await db.select().from(users).where(eq(users.id, alt.id));
    expect(altNachher.bannedAt).toBeTruthy();
    expect(altNachher.name).toBe("Gelöschter Nutzer");
  });
});
