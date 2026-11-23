import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { priceRules, venueAccess, venues } from "@/db/schema-finance";
import { priceFor } from "@/server/pricing";
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
afterEach(() => {
  vi.useRealTimers();
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
const utcToday = () => new Date().toISOString().slice(0, 10); // dieselbe Konvention wie addPriceRule und priceFor

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
      [60, 4000, 4000, utcToday()],
      [90, 5500, 5500, utcToday()],
    ]);
    expect((await db.select().from(venueAccess).where(eq(venueAccess.venueId, v.id)))[0]).toMatchObject({ userId: u.id, status: "active" });
    const audits = await auditsOf(v.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({ status: "requested", courts: 3, price60Cents: 4000, price90Cents: 5500, termsKey: "hallen.onboarding.terms.entwurf", termsVersion: 1 }); // Preise: Spur fuer Streit Betreiber/Admin um die Miete (kein Personenbezug)
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

describe("Review w2/security (M2d-1 Folge): Preisregeln, Doppelklick, Wiederanfrage", () => {
  it("validFrom folgt der UTC-Tagesgrenze von priceFor: um 00:30 Berlin (22:30 UTC Vortag) findet priceFor die neue Regel sofort", async () => {
    const u = await operator();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T22:30:00Z")); // 16.06. 00:30 Berlin
    const v = await requestVenue(u.id, { name: name("clock"), city: CITY, courts: 2, price60Cents: 4000, price90Cents: 5500, termsKey: "k", termsVersion: 1 });
    const found = await priceFor(db, v.id, 60, new Date());
    expect(found).toEqual({ priceCents: 4000, costCents: 4000 });
    expect((await rulesOf(v.id)).every((r) => r.validFrom === "2026-06-15")).toBe(true);
  });

  it("nur EIN Preis (60 ODER 90 Minuten): abgewiesen, nichts geschrieben, vorhandene Regeln bleiben bei der Wiederanfrage erhalten", async () => {
    const u = await operator();
    const nm = name("einpreis");
    await expect(requestVenue(u.id, { name: nm, city: CITY, price60Cents: 4000 })).rejects.toThrow(/beide Preise/);
    expect(await venueByName(nm)).toBeUndefined();
    const nm2 = name("einpreis2");
    const v = await requestVenue(u.id, { name: nm2, city: CITY, courts: 2, price60Cents: 4000, price90Cents: 5500 });
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, v.id, "Preise pruefen");
    await expect(resubmitVenue(u.id, v.id, { name: nm2, city: CITY, price90Cents: 5000 })).rejects.toThrow(/beide Preise/);
    expect(await rulesOf(v.id)).toHaveLength(2); // nicht still geloescht
    expect((await venueByName(nm2)).approvalStatus).toBe("rejected");
  });

  it("resubmitVenueAction mit einer ungueltigen venueId (kein UUID): 'Halle nicht gefunden', kein Typfehler/500", async () => {
    await operator();
    const r = await resubmitVenueAction("kein-uuid", undefined, form());
    expect(r?.error).toMatch(/nicht gefunden/);
  });

  it("Wiederanfrage zaehlt gegen die Obergrenze offener Anfragen (nicht 4 offene moeglich)", async () => {
    const u = await operator();
    const first = await requestVenue(u.id, { name: name("ob1"), city: CITY });
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, first.id, "Doppelt angelegt");
    for (let i = 2; i <= 4; i++) await requestVenue(u.id, { name: name(`ob${i}`), city: CITY }); // 3 offene (ob2..ob4)
    await expect(resubmitVenue(u.id, first.id, { name: first.name, city: CITY })).rejects.toThrow(/offene Hallen-Anfragen/);
    expect((await venueByName(first.name)).approvalStatus).toBe("rejected");
  });

  it("Doppelklick: dieselbe offene Anfrage mit IDENTISCHEN Werten ist ok (dieselbe Halle); mit ABWEICHENDEN Werten Fehlermeldung statt stillem ok", async () => {
    const u = await operator();
    const nm = name("dbl");
    const same = form({ name: nm });
    expect((await requestVenueAction(undefined, same))?.ok).toBe(true);
    const first = await venueByName(nm);
    expect((await requestVenueAction(undefined, form({ name: nm })))?.ok).toBe(true); // identisch (gleiche Standardwerte)
    expect((await db.select().from(venues).where(eq(venues.name, nm))).length).toBe(1);
    const differing = await requestVenueAction(undefined, form({ name: nm, courts: "9", price60: "99,00" }));
    expect(differing?.ok).not.toBe(true);
    expect(differing?.error).toMatch(/Diese Anfrage liegt schon vor/);
    expect(await venueByName(nm)).toMatchObject({ id: first.id, courtCount: 3 }); // unveraendert
    expect((await rulesOf(first.id)).map((r) => r.priceCents).sort()).toEqual([4000, 5500]);
    void u;
  });

  it("Wiederanfrage ueberschreibt stumm vorhandene (Admin-)Regeln der abgelehnten Halle: ersetzt, Preise stehen im Audit", async () => {
    const u = await operator();
    const nm = name("ueber");
    const v = await requestVenue(u.id, { name: nm, city: CITY, courts: 2, price60Cents: 4000, price90Cents: 5500, termsKey: "k", termsVersion: 1 });
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, v.id, "Preise pruefen");
    await db.insert(priceRules).values({ venueId: v.id, durationMin: 60, priceCents: 9900, costCents: 5000, validFrom: "2020-01-01" }); // Admin-Regel
    await resubmitVenue(u.id, v.id, { name: nm, city: CITY, courts: 2, price60Cents: 3800, price90Cents: 5200, termsKey: "k", termsVersion: 1 });
    expect((await rulesOf(v.id)).map((r) => [r.durationMin, r.priceCents]).sort()).toEqual([[60, 3800], [90, 5200]]);
    const re = (await auditsOf(v.id)).filter((a) => (a.after as { resubmit?: boolean })?.resubmit);
    expect(re).toHaveLength(1);
    expect(re[0].after).toMatchObject({ price60Cents: 3800, price90Cents: 5200 });
  });
});
