import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { matchHallRequests } from "@/db/schema-matchmaking";
import { createBookingJob, updateBookingJob } from "@/server/booking";
import { setSetting } from "@/server/settings";
import { getScheduling } from "@/server/scheduling";
import { createTournament, setOrganizer } from "@/server/tournaments";
import { isPartnerVenue, listPartnerVenueOptions } from "@/server/tournament-venue";
import { startHallCheck } from "@/server/veto";
import { getPublicVenue, listPublicVenues, listVenues, updateVenue } from "@/server/venues";
import { approveVenue, countVenueRequests, listRejectedVenues, listVenueRequests, myPendingVenues, rejectVenue, requestVenue, resubmitVenue } from "@/server/venue-approval";
import sitemap from "@/app/sitemap";
import { cleanup, makeMatch, makeUser } from "./helpers";

// 013 v3 AC-31: Eine Halle aus der Anfrage ist erst nach Freischaltung durch Admin 1/2 sichtbar und buchbar. Der SERVER prueft (nicht nur die Oberflaeche):
// jeder Leser filtert, und beim Zuordnen einer Halle (Fremd-ID per POST) kommt dieselbe Antwort wie bei einer unbekannten ID (kein Existenz-Leck).

const CITY = "Freigabeort";
let n = 0;
const name = (p: string) => `E2E Freigabe ${p} ${Date.now().toString(36)}${++n}`;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  await setSetting(null, "card_payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await db.execute(sql`delete from venue_access where venue_id in (select id from venues where name like 'E2E Freigabe%')`);
  await cleanup();
});

async function requested() {
  const operator = await makeUser("vop");
  const v = await requestVenue(operator.id, { name: name("neu"), city: CITY, address: "Weg 1" });
  await db.update(venues).set({ isPartner: true }).where(eq(venues.id, v.id)); // wie nach der Anlage durch einen Admin: Partnerhalle, aber noch nicht freigegeben
  return { operator, v };
}
/** Fehlzustand simulieren: aktiv, aber nicht freigegeben (z. B. durch einen vergessenen Pfad). Jeder Leser muss trotzdem filtern (zweiter Riegel neben active). */
const forceActive = (id: string) => db.update(venues).set({ active: true }).where(eq(venues.id, id));
const publicIds = async () => (await listPublicVenues(CITY)).map((r) => r.id);
const statusOf = async (id: string) => (await db.select().from(venues).where(eq(venues.id, id)))[0];

describe("Anfrage: nicht freigegebene Halle ist unsichtbar und nicht buchbar", () => {
  it("requestVenue legt Status requested an (inaktiv), mit aktivem Betreiber-Zugang; erneuter Aufruf mit denselben Angaben legt keine zweite Halle an", async () => {
    const operator = await makeUser("vop");
    const input = { name: name("idem"), city: CITY };
    const a = await requestVenue(operator.id, input);
    const b = await requestVenue(operator.id, input);
    expect(b.id).toBe(a.id);
    const row = await statusOf(a.id);
    expect(row).toMatchObject({ approvalStatus: "requested", active: false, managerUserId: operator.id }); // requestVenue legt inaktiv an
    expect(row.approvalRequestedAt).not.toBeNull();
    const access = await db.select().from(venueAccess).where(eq(venueAccess.venueId, a.id));
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ userId: operator.id, status: "active" });
    expect((await db.select().from(venues).where(eq(venues.name, input.name))).length).toBe(1);
  });

  it("erscheint nirgends: Liste, Detail, Auswahl, Sitemap, Termin-Auswahl, Veto, Turnier-Partnerhalle (auch im Fehlzustand active = true)", async () => {
    const { v } = await requested();
    await forceActive(v.id);
    expect(await publicIds()).not.toContain(v.id);
    expect(await getPublicVenue(v.id)).toBeNull();
    expect((await listVenues(false)).map((x) => x.id)).not.toContain(v.id);
    expect((await sitemap()).some((e) => e.url.endsWith(`/hallen/${v.id}`))).toBe(false);
    const sched = await getScheduling({ id: UNKNOWN, schedulingOpen: true, schedulingDeadline: null, timeWindows: null }, CITY);
    expect(sched?.venues.map((x) => x.id)).not.toContain(v.id);
    expect((await listPartnerVenueOptions())?.map((x) => x.id)).not.toContain(v.id);
    expect(await isPartnerVenue(db, v.id)).toBe(false);
    // Veto: die Halle kommt nicht in den Pool
    const m = await makeMatch({ hoursAhead: 100 });
    await db.transaction((tx) => startHallCheck(tx, m.match, CITY));
    expect((await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, m.match.id))).map((r) => r.venueId)).not.toContain(v.id);
  });

  it("nicht buchbar: Fremd-ID per POST liefert dieselbe Antwort wie eine unbekannte ID (Turnier-Partnerhalle, Buchungsauftrag), kein Existenz-Leck", async () => {
    const { v } = await requested();
    await forceActive(v.id);
    const org = await makeUser("vorg");
    const admin = await makeUser("vadm", "admin");
    await setOrganizer(admin.id, org.id, true);
    const base = { name: "Freigabe-Cup", city: CITY, startsAt: new Date(Date.now() + 5 * 86_400_000), registrationDeadline: new Date(Date.now() + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
    const asUnknown = await createTournament(org.id, { ...base, venueId: UNKNOWN }).then(() => "ok", (e: Error) => e.message);
    const asRequested = await createTournament(org.id, { ...base, venueId: v.id }).then(() => "ok", (e: Error) => e.message);
    expect(asRequested).not.toBe("ok");
    expect(asRequested).toBe(asUnknown);
    const m = await makeMatch({ hoursAhead: 100 });
    const job = await db.transaction((tx) => createBookingJob(tx, m.match));
    await updateBookingJob(admin.id, job!.id, { status: "in_progress" });
    const asUnknownBook = await updateBookingJob(admin.id, job!.id, { status: "booked", venueId: UNKNOWN }).then(() => "ok", (e: Error) => e.message);
    const asRequestedBook = await updateBookingJob(admin.id, job!.id, { status: "booked", venueId: v.id }).then(() => "ok", (e: Error) => e.message);
    expect(asRequestedBook).not.toBe("ok");
    expect(asRequestedBook).toBe(asUnknownBook);
    expect((await statusOf(v.id)).approvalStatus).toBe("requested");
  });

  it("Admin kann eine angefragte Halle nicht ueber updateVenue aktivieren (active nur durch die Freischaltung)", async () => {
    const { v } = await requested();
    const admin = await makeUser("vadm", "admin");
    await expect(updateVenue(admin.id, v.id, { name: v.name, city: v.city, active: true })).rejects.toThrow(/freigeschaltet/);
    expect((await statusOf(v.id)).active).toBe(false);
  });

  it("bestehende Hallen (Standard, Backfill) sind freigegeben und sichtbar", async () => {
    const [h] = await db.insert(venues).values({ name: name("alt"), city: CITY }).returning();
    expect(h.approvalStatus).toBe("approved");
    expect(await publicIds()).toContain(h.id);
    expect(await getPublicVenue(h.id)).not.toBeNull();
  });
});

describe("Freischaltung und Ablehnung", () => {
  it("Freischalten durch Admin 2: Halle wird aktiv, sichtbar und buchbar; Betreiber bekommt eine Mitteilung; Audit ohne Personendaten", async () => {
    const { operator, v } = await requested();
    const admin2 = await makeUser("vadm", "admin");
    await approveVenue(admin2.id, v.id);
    const row = await statusOf(v.id);
    expect(row).toMatchObject({ approvalStatus: "approved", active: true, approvalDecidedBy: admin2.id });
    expect(row.approvalDecidedAt).not.toBeNull();
    expect(await publicIds()).toContain(v.id);
    expect(await getPublicVenue(v.id)).not.toBeNull();
    expect((await sitemap()).some((e) => e.url.endsWith(`/hallen/${v.id}`))).toBe(true);
    expect((await listPartnerVenueOptions())?.map((x) => x.id)).toContain(v.id);
    expect(await isPartnerVenue(db, v.id)).toBe(true);
    const note = (await db.select().from(notifications).where(eq(notifications.userId, operator.id))).find((x) => /freigeschaltet/i.test(x.title));
    expect(note).toBeDefined();
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.entityId, v.id), like(auditLog.action, "venue.%")));
    expect(logs.map((l) => l.action).sort()).toEqual(["venue.approved", "venue.requested"]);
    expect(JSON.stringify(logs)).not.toContain("@test.local");
  });

  it("Ablehnen braucht einen Grund (3 bis 200 Zeichen); abgelehnte Halle bleibt unsichtbar und nicht buchbar; Betreiber wird benachrichtigt", async () => {
    const { operator, v } = await requested();
    const admin = await makeUser("vadm", "admin");
    await expect(rejectVenue(admin.id, v.id, "")).rejects.toThrow(/Grund/);
    await expect(rejectVenue(admin.id, v.id, "x".repeat(201))).rejects.toThrow(/Grund/);
    await rejectVenue(admin.id, v.id, "Adresse unklar");
    expect(await statusOf(v.id)).toMatchObject({ approvalStatus: "rejected", active: false, approvalReason: "Adresse unklar" });
    expect(await publicIds()).not.toContain(v.id);
    expect(await isPartnerVenue(db, v.id)).toBe(false);
    expect((await db.select().from(notifications).where(eq(notifications.userId, operator.id))).some((x) => /abgelehnt/i.test(x.title))).toBe(true);
  });

  it("Rechte: Spieler, Betreiber und gesperrter Admin duerfen weder freischalten noch ablehnen; Admin 1 darf", async () => {
    const { operator, v } = await requested();
    const player = await makeUser("vpl");
    const banned = await makeUser("vban", "admin");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    for (const who of [player, operator, banned]) {
      await expect(approveVenue(who.id, v.id)).rejects.toThrow(/darf/);
      await expect(rejectVenue(who.id, v.id, "Grund hier")).rejects.toThrow(/darf/);
    }
    expect((await statusOf(v.id)).approvalStatus).toBe("requested");
    const owner = await makeUser("vown", "owner");
    await approveVenue(owner.id, v.id);
    expect((await statusOf(v.id)).approvalStatus).toBe("approved");
  });

  it("Uebergaenge: nur aus requested; zweite Freischaltung, Ablehnung nach Freischaltung und Freischaltung einer abgelehnten Halle werden abgewiesen", async () => {
    const admin = await makeUser("vadm", "admin");
    const a = (await requested()).v;
    await approveVenue(admin.id, a.id);
    await expect(approveVenue(admin.id, a.id)).rejects.toThrow(/Anfrage/);
    await expect(rejectVenue(admin.id, a.id, "zu spaet")).rejects.toThrow(/Anfrage/);
    const b = (await requested()).v;
    await rejectVenue(admin.id, b.id, "Doppelt angelegt");
    await expect(approveVenue(admin.id, b.id)).rejects.toThrow(/Anfrage/);
  });

  it("parallel freischalten und ablehnen: genau ein Gewinner, der Endzustand ist eindeutig", async () => {
    const { v } = await requested();
    const a1 = await makeUser("vadm", "admin");
    const a2 = await makeUser("vadm", "admin");
    const res = await Promise.allSettled([approveVenue(a1.id, v.id), rejectVenue(a2.id, v.id, "Parallel abgelehnt")]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await statusOf(v.id);
    expect(["approved", "rejected"]).toContain(row.approvalStatus);
    expect(row.active).toBe(row.approvalStatus === "approved");
  });

  it("erneute Anfrage nach Ablehnung: nur der Betreiber (aktiver Zugang), Status wieder requested, Historie im Audit; andere Nutzer werden abgewiesen", async () => {
    const { operator, v } = await requested();
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, v.id, "Adresse fehlt");
    const stranger = await makeUser("vstr");
    await expect(resubmitVenue(stranger.id, v.id, { name: v.name, city: CITY, address: "Neu 1" })).rejects.toThrow(/nicht gefunden/);
    await resubmitVenue(operator.id, v.id, { name: v.name, city: CITY, address: "Neu 1" });
    expect(await statusOf(v.id)).toMatchObject({ approvalStatus: "requested", active: false, address: "Neu 1", approvalReason: null });
    const actions = (await db.select().from(auditLog).where(and(eq(auditLog.entityId, v.id), like(auditLog.action, "venue.%")))).map((l) => l.action);
    expect(actions.filter((a) => a === "venue.requested")).toHaveLength(2);
    expect(actions).toContain("venue.rejected");
    await expect(resubmitVenue(operator.id, v.id, { name: v.name, city: CITY })).rejects.toThrow(/abgelehnt/); // nur aus rejected
  });

  it("Admin-Liste: nur offene Anfragen; Admins werden bei der Anfrage benachrichtigt", async () => {
    const admin = await makeUser("vadm", "admin");
    const { v } = await requested();
    const list = await listVenueRequests();
    expect(list.map((x) => x.id)).toContain(v.id);
    expect((await db.select().from(notifications).where(eq(notifications.userId, admin.id))).some((x) => /Hallen-Anfrage/i.test(x.title))).toBe(true); // Admin existierte bei der Anfrage
    const admin2 = await makeUser("vadm", "admin");
    expect((await db.select().from(notifications).where(eq(notifications.userId, admin2.id))).some((x) => /Hallen-Anfrage/i.test(x.title))).toBe(false); // nach der ersten Anfrage angelegt: nichts nachtraeglich
    const op = await makeUser("vop");
    await requestVenue(op.id, { name: name("notify"), city: CITY });
    expect((await db.select().from(notifications).where(eq(notifications.userId, admin2.id))).some((x) => /Hallen-Anfrage/i.test(x.title))).toBe(true);
    await approveVenue(admin.id, v.id);
    expect((await listVenueRequests()).map((x) => x.id)).not.toContain(v.id);
  });
});


describe("Betreiber-Sicht: eigene Anfrage mit Status", () => {
  it("myPendingVenues zeigt offene und abgelehnte Anfrage mit Grund, nie freigegebene oder fremde Hallen", async () => {
    const { operator, v } = await requested();
    const other = await makeUser("vo2");
    expect(await myPendingVenues(other.id)).toEqual([]);
    expect(await myPendingVenues(operator.id)).toEqual([{ id: v.id, name: v.name, status: "requested", reason: null }]);
    const admin = await makeUser("vadm", "admin");
    await rejectVenue(admin.id, v.id, "Adresse fehlt");
    expect(await myPendingVenues(operator.id)).toEqual([{ id: v.id, name: v.name, status: "rejected", reason: "Adresse fehlt" }]);
    await resubmitVenue(operator.id, v.id, { name: v.name, city: CITY, address: "Neu 2" });
    await approveVenue(admin.id, v.id);
    expect(await myPendingVenues(operator.id)).toEqual([]);
  });
});

describe("Admin-Hinweise: Zahl offener Anfragen und abgelehnte Anfragen", () => {
  it("countVenueRequests zaehlt nur offene Anfragen (steigt bei Anfrage, faellt bei Entscheidung)", async () => {
    const admin = await makeUser("vadm", "admin");
    const base = await countVenueRequests();
    const a = (await requested()).v;
    const b = (await requested()).v;
    expect(await countVenueRequests()).toBe(base + 2);
    await approveVenue(admin.id, a.id);
    await rejectVenue(admin.id, b.id, "Doppelt angelegt");
    expect(await countVenueRequests()).toBe(base);
  });

  it("listRejectedVenues zeigt abgelehnte Anfragen mit Grund (neueste zuerst), nie offene oder freigegebene", async () => {
    const admin = await makeUser("vadm", "admin");
    const open = (await requested()).v;
    const ok = (await requested()).v;
    const no = (await requested()).v;
    await approveVenue(admin.id, ok.id);
    await rejectVenue(admin.id, no.id, "Adresse unklar");
    const rows = await listRejectedVenues();
    expect(rows.map((r) => r.id)).toContain(no.id);
    expect(rows.map((r) => r.id)).not.toContain(open.id);
    expect(rows.map((r) => r.id)).not.toContain(ok.id);
    expect(rows.find((r) => r.id === no.id)).toMatchObject({ name: no.name, reason: "Adresse unklar" });
    expect(rows.find((r) => r.id === no.id)?.decidedAt).not.toBeNull();
  });
});
