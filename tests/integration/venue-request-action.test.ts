import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { priceRules, venueAccess, venues } from "@/db/schema-finance";
import { approveVenue, rejectVenue, requestVenue, resubmitVenue, REQUESTS_PER_HOUR } from "@/server/venue-approval";
import { cleanup, makeUser } from "./helpers";

// M2d-1 (013 v3 AC-25/AC-31): Server der Hallen-Anfrage. Die Server-Aktion laeuft mit der ECHTEN Sitzungspruefung; nur die Anmeldung und die Weiterleitung sind ersetzt.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { requestVenueAction, resubmitVenueAction } from "@/server/venue-request-actions";

const CITY = "Gelsenkirchen";
let n = 0;
const name = (p: string) => `E2E Anfrage ${p} ${Date.now().toString(36)}${++n}`;

afterAll(async () => {
  await db.execute(sql`delete from venue_access where venue_id in (select id from venues where name like 'E2E Anfrage%')`);
  await cleanup();
});
beforeEach(() => {
  currentUserId = "";
});

async function operator(tag = "vop") {
  const u = await makeUser(tag);
  await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, u.id));
  currentUserId = u.id;
  return u;
}

function form(over: Record<string, string> = {}): FormData {
  const base: Record<string, string> = { name: name("form"), city: CITY, address: "Hallenweg 1", contact: "halle@example.test", courts: "3", surface: "Kunstrasen", hasShowers: "on", hasParking: "", price60: "40,00", price90: "55,00", terms: "on" };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
}
const venueByName = async (nm: string) => (await db.select().from(venues).where(eq(venues.name, nm)))[0];
const rulesOf = (venueId: string) => db.select().from(priceRules).where(eq(priceRules.venueId, venueId));
const auditsOf = (venueId: string) => db.select().from(auditLog).where(and(eq(auditLog.entityId, venueId), like(auditLog.action, "venue.%")));
const berlinToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

describe("requestVenueAction: Sitzung und Eingaben", () => {
  it("ohne Anmeldung: Weiterleitung, nichts geschrieben", async () => {
    const nm = name("anon");
    await expect(requestVenueAction(undefined, form({ name: nm }))).rejects.toThrow(/REDIRECT:\/anmelden/);
    expect(await venueByName(nm)).toBeUndefined();
  });

  it("gesperrtes Konto und Admin-Konto werden abgewiesen, nichts geschrieben", async () => {
    const banned = await operator("vban");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    const nm1 = name("ban");
    const r1: { ok?: boolean; error?: string } | undefined = await requestVenueAction(undefined, form({ name: nm1 })).then((r) => r, (e: Error) => ({ error: e.message }));
    expect(r1?.ok).not.toBe(true);
    expect(await venueByName(nm1)).toBeUndefined();
    const admin = await makeUser("vadm", "admin");
    await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, admin.id));
    currentUserId = admin.id;
    const nm2 = name("adm");
    const r2 = await requestVenueAction(undefined, form({ name: nm2 }));
    expect(r2?.error).toMatch(/Admin-Konto/);
    expect(await venueByName(nm2)).toBeUndefined();
  });

  it("ungueltige Eingaben je Feld: fieldErrors mit den Texten aus validateAll, NICHTS geschrieben (keine Halle, kein Zugang, keine Regel, kein Audit)", async () => {
    const u = await operator();
    const before = (await db.select().from(auditLog).where(eq(auditLog.actorId, u.id))).length;
    const nm = name("bad");
    const r = await requestVenueAction(undefined, form({ name: nm, city: "Nirgendwo", address: "x", contact: "kein-kontakt", courts: "0", price60: "0,10", price90: "abc", terms: "" }));
    expect(r?.ok).not.toBe(true);
    expect(Object.keys(r?.fieldErrors ?? {}).sort()).toEqual(["address", "city", "contact", "courts", "price60", "price90", "terms"]);
    expect(await venueByName(nm)).toBeUndefined();
    expect((await db.select().from(venueAccess).where(eq(venueAccess.userId, u.id))).length).toBe(0);
    expect((await db.select().from(auditLog).where(eq(auditLog.actorId, u.id))).length).toBe(before);
  });
});

describe("requestVenueAction: gueltige Anfrage", () => {
  it("legt Halle (requested, inaktiv), court_count, genau zwei Preisregeln (60/90, price = cost, ab heute), Zugang und Audit an; Audit ohne Kontakt und Adresse", async () => {
    const u = await operator();
    const nm = name("ok");
    const r = await requestVenueAction(undefined, form({ name: nm, contact: "geheim.kontakt@example.test", address: "Geheimstrasse 99" }));
    expect(r?.ok).toBe(true);
    const v = await venueByName(nm);
    expect(v).toMatchObject({ approvalStatus: "requested", active: false, courtCount: 3, managerUserId: u.id });
    const rules = (await rulesOf(v.id)).sort((a, b) => a.durationMin - b.durationMin);
    expect(rules.map((x) => [x.durationMin, x.priceCents, x.costCents, x.validFrom])).toEqual([
      [60, 4000, 4000, berlinToday()],
      [90, 5500, 5500, berlinToday()],
    ]);
    expect((await db.select().from(venueAccess).where(eq(venueAccess.venueId, v.id)))[0]).toMatchObject({ userId: u.id, status: "active" });
    const audits = await auditsOf(v.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({ status: "requested", courts: 3, termsKey: "hallen.onboarding.terms.entwurf", termsVersion: 1 });
    const json = JSON.stringify(audits);
    expect(json).not.toContain("geheim.kontakt");
    expect(json).not.toContain("Geheimstrasse");
    expect(json).not.toContain("example.test");
  });

  it("Atomaritaet: scheitert das Anlegen der Preisregeln, bleiben Halle, Zugang und Audit weg", async () => {
    const u = await operator();
    const nm = name("atom");
    await expect(requestVenue(u.id, { name: nm, city: CITY, address: "Hallenweg 2", contact: "a@b.test", courts: 2, price60Cents: 1.5, price90Cents: 5500, termsKey: "k", termsVersion: 1 })).rejects.toThrow();
    expect(await venueByName(nm)).toBeUndefined();
    expect((await db.select().from(venueAccess).where(eq(venueAccess.userId, u.id))).length).toBe(0);
  });
});

describe("Rate-Limit 5 pro Stunde je Akteur (aus audit_log venue.requested)", () => {
  const seedAudits = async (actorId: string, count: number, ageMs = 60_000) => {
    for (let i = 0; i < count; i++) {
      await db.insert(auditLog).values({ actorId, action: "venue.requested", entity: "venue", entityId: `rl-${actorId}-${i}`, after: { status: "requested" }, at: new Date(Date.now() - ageMs) });
    }
  };

  it("bis zur Grenze erlaubt, danach abgewiesen; aeltere als eine Stunde zaehlen nicht; anderer Akteur unberuehrt", async () => {
    expect(REQUESTS_PER_HOUR).toBe(5);
    const u = await operator();
    await seedAudits(u.id, 4);
    await requestVenue(u.id, { name: name("rl5"), city: CITY }); // 5. Anfrage in der Stunde
    await expect(requestVenue(u.id, { name: name("rl6"), city: CITY })).rejects.toThrow(/Zu viele Anfragen/);
    const old = await operator("vold");
    await seedAudits(old.id, 9, 2 * 3_600_000);
    await requestVenue(old.id, { name: name("rlold"), city: CITY }); // 9 Eintraege, aber alle aelter als eine Stunde
    const other = await operator("voth");
    await requestVenue(other.id, { name: name("rloth"), city: CITY });
  });

  it("Wiederanfrage zaehlt mit", async () => {
    const u = await operator();
    const v = await requestVenue(u.id, { name: name("rlre"), city: CITY });
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, v.id, "Adresse fehlt");
    await seedAudits(u.id, 3); // zusammen mit der Erstanfrage 4 in der Stunde
    await resubmitVenue(u.id, v.id, { name: v.name, city: CITY }); // 5.
    await rejectVenue(admin.id, v.id, "Immer noch");
    await expect(resubmitVenue(u.id, v.id, { name: v.name, city: CITY })).rejects.toThrow(/Zu viele Anfragen/);
  });

  it("parallele Anfragen ueberschreiten die Grenze nicht (genau eine passt noch)", async () => {
    const u = await operator();
    await seedAudits(u.id, 4);
    const res = await Promise.allSettled([1, 2, 3].map((i) => requestVenue(u.id, { name: name(`par${i}`), city: CITY })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("Wiederanfrage ersetzt die Preise (kein Verdoppeln)", () => {
  it("nach Ablehnung und erneuter Anfrage stehen genau zwei Regeln mit den neuen Werten; nur der Betreiber, nur aus rejected", async () => {
    const u = await operator();
    const nm = name("re");
    await requestVenueAction(undefined, form({ name: nm, price60: "40,00", price90: "55,00" }));
    const v = await venueByName(nm);
    expect(await rulesOf(v.id)).toHaveLength(2);
    // nicht abgelehnt: erneute Anfrage nicht moeglich
    expect((await resubmitVenueAction(v.id, undefined, form({ name: nm })))?.error).toMatch(/abgelehnte/);
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, v.id, "Preise zu hoch");
    // Fremde
    const stranger = await operator("vstr");
    expect((await resubmitVenueAction(v.id, undefined, form({ name: nm })))?.error).toMatch(/nicht gefunden/);
    currentUserId = u.id;
    const r = await resubmitVenueAction(v.id, undefined, form({ name: nm, price60: "35,00", price90: "50,00", courts: "5" }));
    expect(r?.ok).toBe(true);
    const rules = (await rulesOf(v.id)).sort((a, b) => a.durationMin - b.durationMin);
    expect(rules.map((x) => [x.durationMin, x.priceCents, x.costCents])).toEqual([[60, 3500, 3500], [90, 5000, 5000]]);
    expect(await venueByName(nm)).toMatchObject({ approvalStatus: "requested", courtCount: 5 });
    void stranger;
  });
});

describe("Sichtbarkeit unveraendert", () => {
  it("eine angefragte Halle mit Preisregeln bleibt unsichtbar; nach Freischaltung bleiben die Preisregeln erhalten", async () => {
    await operator();
    const nm = name("vis");
    await requestVenueAction(undefined, form({ name: nm }));
    const v = await venueByName(nm);
    expect(v.active).toBe(false);
    const admin = await makeUser("vadm", "admin");
    await approveVenue(admin.id, v.id);
    expect((await venueByName(nm)).active).toBe(true);
    expect(await rulesOf(v.id)).toHaveLength(2);
  });
});
