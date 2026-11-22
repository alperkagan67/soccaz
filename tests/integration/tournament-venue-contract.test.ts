import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, stripeEvents, teamMembers, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { cardAlertsFrom, getRefundAlerts } from "@/server/finance";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer, setRosterComplete } from "@/server/tournaments";
import { freezeVenueTerms, isPartnerVenue, listPartnerVenueOptions, NO_ONLINE_CONFIRM_HINT, setTournamentVenue, venueCommissionPercent, venueHasAccess } from "@/server/tournament-venue";
import { accessHolders, hasVenueAccess, venueHasActiveAccess } from "@/server/venue-access-rules";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M5-7a (Plan 19): Zugang je Halle aus EINER Bedingung, Provisionssatz aus der Halle, Hallenauswahl ohne Zugang, Sperre beim Fixieren, Alarm bei Zahlung ohne Zuordnung (Backlog 118).

let provider: FakeProvider;
let owner: { id: string };
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_m57_%"));
  owner = await makeUser("own57", "owner"); // Admin 1: hoechstens einer je Datenbank
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_m57_%"));
  await cleanup();
});

const T0 = Date.now();
const base = { name: "Vertrags-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;
async function venue(over: Partial<typeof venues.$inferInsert> = {}) {
  const [v] = await db.insert(venues).values({ name: `E2E Halle M57 ${nid("v")}`, city: "Essen", address: "Hallenweg 1", isPartner: true, active: true, ...over }).returning();
  return v;
}
async function grant(venueId: string, over: { status?: "invited" | "active" | "revoked"; role?: "player" | "admin"; banned?: boolean } = {}) {
  const status = over.status ?? "active";
  const u = await makeUser("op", over.role ?? "player");
  if (over.banned) await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, u.id));
  if (status === "invited") await db.insert(venueAccess).values({ venueId, userId: null, invitedEmail: `${nid("inv")}@test.local`, status });
  else await db.insert(venueAccess).values({ venueId, userId: u.id, status, assignedAt: new Date() });
  return u;
}
async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}
async function squad(tid: string) {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  for (let i = 1; i < 4; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
  }
  return { captain, team };
}
const rowOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];

describe("M5-7a: Zugang je Halle (eine Bedingung fuer hasVenueAccess, accessHolders, venueHasActiveAccess)", () => {
  const cases: [string, Parameters<typeof grant>[1], boolean][] = [
    ["aktiver Zugang", {}, true],
    ["Einladung (noch nicht eingeloest)", { status: "invited" }, false],
    ["Zugang entzogen", { status: "revoked" }, false],
    ["Konto gesperrt", { banned: true }, false],
    ["Admin-Konto mit Zugang gilt NICHT (t9 P4)", { role: "admin" }, false],
  ];
  it.each(cases)("%s", async (_name, over, expected) => {
    const v = await venue();
    const u = await grant(v.id, over);
    expect(await venueHasActiveAccess(v.id)).toBe(expected);
    expect(await venueHasAccess(v.id)).toBe(expected);
    expect(await hasVenueAccess(v.id, u.id)).toBe(expected);
    expect((await accessHolders()).has(v.id)).toBe(expected); // alle drei Funktionen sagen dasselbe
  });

  it("Halle ohne jede Zugangszeile: kein Zugang; anonymisiertes Konto (Zugang entzogen) zaehlt nicht", async () => {
    const v = await venue();
    expect(await venueHasActiveAccess(v.id)).toBe(false);
    const u = await grant(v.id);
    expect(await venueHasActiveAccess(v.id)).toBe(true);
    await db.update(users).set({ email: `geloescht-${u.id}@geloescht.invalid` }).where(eq(users.id, u.id));
    await db.update(venueAccess).set({ status: "revoked", revokedAt: new Date() }).where(eq(venueAccess.venueId, v.id));
    expect(await venueHasActiveAccess(v.id)).toBe(false);
  });
});

describe("M5-7a: Provisionssatz je Halle", () => {
  it.each([["0", 0, "0.00"], ["12.50", 12.5, "12.50"], ["100", 100, "100.00"], ["10", 10, "10.00"]] as const)("Satz %s wird gelesen und beim Fixieren eingefroren (%s)", async (db_value, num, snap) => {
    const v = await venue({ commissionPercent: db_value });
    expect(await venueCommissionPercent(v.id)).toBe(num);
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: v.id });
    await db.transaction((tx) => freezeVenueTerms(tx, t.id, v.id));
    const fixed = await rowOf(t.id);
    expect(fixed.commissionPercentSnapshot).toBe(snap);
    expect(fixed.venueAccessRequiredSnapshot).toBe(false);
    // eine spaetere Aenderung des Satzes wirkt nicht auf das fixierte Turnier
    await db.update(venues).set({ commissionPercent: "50" }).where(eq(venues.id, v.id));
    expect((await rowOf(t.id)).commissionPercentSnapshot).toBe(snap);
  });

  it("unbekannte Halle: DomainError mit Text, kein stilles 0", async () => {
    await expect(venueCommissionPercent("00000000-0000-4000-8000-000000000000")).rejects.toThrow(/gibt es nicht mehr/);
  });
});

describe("M5-7a: Hallenauswahl im Kartenmodell nur ohne Zugang (Liste und Pruefung sind dieselbe Regel)", () => {
  it("Halle mit Zugang: nicht waehlbar (Anlage, Wechsel, isPartnerVenue), in der Liste sichtbar mit unavailable; Liste = Pruefung; Schalter AUS: Zugang spielt keine Rolle", async () => {
    const free = await venue();
    const withAccess = await venue();
    await grant(withAccess.id);
    const o = await organizer();
    await expect(createTournament(o.id, { ...base, venueId: withAccess.id })).rejects.toThrow(/Halle noch ohne Online-Zusage/); // eigener Text statt "Bitte waehle eine Partnerhalle"
    await expect(createTournament(o.id, { ...base, venueId: (await venue({ isPartner: false })).id })).rejects.toThrow(/Partnerhalle/); // andere Gruende behalten den alten Text
    expect(await isPartnerVenue(db, withAccess.id)).toBe(false);
    expect(await isPartnerVenue(db, free.id)).toBe(true);
    const list = (await listPartnerVenueOptions())!;
    expect(list.find((x) => x.id === withAccess.id)).toMatchObject({ unavailable: true });
    expect(list.find((x) => x.id === free.id)).toMatchObject({ unavailable: false });
    for (const opt of list) expect(await isPartnerVenue(db, opt.id)).toBe(!opt.unavailable); // Konsistenz: waehlbar <=> vom Validator angenommen
    expect(NO_ONLINE_CONFIRM_HINT).toBe("Halle noch ohne Online-Zusage");
    const t = await createTournament(o.id, { ...base, venueId: free.id });
    await expect(setTournamentVenue(o.id, false, t.id, withAccess.id)).rejects.toThrow(/Halle noch ohne Online-Zusage/);
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect(await isPartnerVenue(db, withAccess.id)).toBe(true);
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
  });

  it("Zugang NACH der Wahl und VOR dem Fixieren: Fixieren wird mit klarer Meldung verweigert, nichts geaendert; nach Entzug des Zugangs klappt es", async () => {
    const v = await venue();
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: v.id });
    const squads = [];
    for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
    for (const s of squads.slice(0, 3)) await setRosterComplete(s.captain.id, t.id, true);
    await grant(v.id); // Einladung eingeloest: Zugang nach der Wahl
    await expect(setRosterComplete(squads[3].captain.id, t.id, true)).rejects.toThrow(/Betreiber-Zugang/);
    const after = await rowOf(t.id);
    expect(after.status).toBe("registration");
    expect(after.venueAccessRequiredSnapshot).toBeNull();
    const [entry] = await db.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, squads[3].team.id)));
    expect(entry.readyAt).toBeNull();
    await db.update(venueAccess).set({ status: "revoked", revokedAt: new Date() }).where(eq(venueAccess.venueId, v.id));
    await setRosterComplete(squads[3].captain.id, t.id, true);
    const fixed = await rowOf(t.id);
    expect(fixed.status).toBe("payment");
    expect(fixed.venueAccessRequiredSnapshot).toBe(false);
  });
});

describe("M5-7a: freezeVenueTerms prueft auf derselben Lesung (Zugang zwischen Pruefung und Einfrieren)", () => {
  it("hat die Halle beim Einfrieren einen Zugang, wird verweigert und nichts eingefroren", async () => {
    const v = await venue();
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: v.id });
    await grant(v.id); // der Zugang kommt NACH einer (hier nicht gemachten) Vorpruefung
    await expect(db.transaction((tx) => freezeVenueTerms(tx, t.id, v.id))).rejects.toThrow(/Betreiber-Zugang/);
    const after = await rowOf(t.id);
    expect(after.venueAccessRequiredSnapshot).toBeNull();
    expect(after.commissionPercentSnapshot).toBeNull();
  });
});

describe("M5-7a: Zahlung ohne Zuordnung (Backlog 118, Entscheid t2q P-M57-6)", () => {
  const send = (type: string, pi: string, amount = 1000) => {
    const e = provider.signEvent({ id: nid("evt_m57"), type, object: { id: pi, amount, currency: "eur", customer: "cus_unbekannt", metadata: {} } });
    return handleStripeWebhook(e.rawBody, e.signature);
  };
  const notes = async (pi: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, owner.id), eq(notifications.title, "Zahlung ohne Buchung"), sql`${notifications.body} like ${"%" + pi + "%"}`))).length;

  it("succeeded ohne Zuordnung: sofort EINE Mitteilung an Admin 1 (ohne Personendaten), Wiederholung derselben Zahlung keine zweite, Alarm in der Liste", async () => {
    const pi = nid("pi_m57ok");
    expect((await send("payment_intent.succeeded", pi, 2500)).status).toBe(200);
    expect(await notes(pi)).toBe(1);
    const [n1] = await db.select().from(notifications).where(and(eq(notifications.userId, owner.id), sql`${notifications.body} like ${"%" + pi + "%"}`));
    expect(n1.body).not.toMatch(/@|cus_unbekannt/); // keine Personendaten, kein Kunde
    await send("payment_intent.succeeded", pi, 2500); // neue Ereignis-ID, dieselbe Zahlung
    expect(await notes(pi)).toBe(1);
    const alerts = cardAlertsFrom(await getRefundAlerts(new Date()));
    expect(alerts.some((a) => a.code === "card:unmatched-success")).toBe(true);
  });

  it("andere unbekannte Ereignisse: keine Mitteilung, Alarm erst ab dem sechsten innerhalb 24 Stunden", async () => {
    await db.execute(sql`delete from audit_log where action = 'charge.ignored' and (after->>'reason') in ('unknown_payment_intent', 'unknown_charge') and coalesce(after->>'outcome', '') <> 'succeeded'`);
    for (let i = 0; i < 5; i++) await send("payment_intent.payment_failed", nid("pi_m57f"));
    expect(cardAlertsFrom(await getRefundAlerts(new Date())).some((a) => a.code === "card:unmatched-events")).toBe(false); // genau 5: noch kein Alarm
    const failedPi = nid("pi_m57f");
    await send("payment_intent.payment_failed", failedPi);
    expect(cardAlertsFrom(await getRefundAlerts(new Date())).some((a) => a.code === "card:unmatched-events")).toBe(true);
    expect(await notes(failedPi)).toBe(0); // nie eine Sofort-Mitteilung fuer Nicht-Erfolge
  });
});
