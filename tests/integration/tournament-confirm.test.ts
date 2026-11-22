import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, users } from "@/db/schema";
import { bookingEvidence, venueAccess, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { confirmTournamentVenue, listTournamentConfirmations, notifyHallConfirmReminders } from "@/server/tournament-confirm";
import { resetVenueConfirmationIfTermsChanged } from "@/server/tournament-venue";
import { setSetting } from "@/server/settings";
import { cleanup, makeUser } from "./helpers";

// 012 M5-7b: Zusage der Halle fuer Turniere (confirmTournamentVenue). Fixtures per DB: Turnier in payment mit eingefrorener Halle und Snapshot "Zusage noetig". Der Beweiseintrag entsteht durch den
// Trigger der Nachlieferung (0054, Variante T); hier wird nur geprueft, dass genau EINER entsteht.

beforeAll(() => setSetting(null, "card_payments_enabled", true));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const DAY = 86_400_000;
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;
const NEUTRAL = /lässt sich gerade nicht zusagen/;

async function fixture(over: Partial<typeof tournaments.$inferInsert> = {}) {
  const org = await makeUser("org");
  const boss = await makeUser("boss");
  const [v] = await db.insert(venues).values({ name: `E2E Halle ZUS ${nid("v")}`, city: "Essen", isPartner: true, active: true }).returning();
  await db.insert(venueAccess).values({ venueId: v.id, userId: boss.id, status: "active", assignedAt: new Date() });
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: nid("Zusage-Cup"),
      city: "Essen",
      startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10),
      format: "knockout",
      maxTeams: 4,
      totalCents: 16000,
      hourlyCents: 8000,
      durationMin: 120,
      status: "payment",
      registrationDeadline: new Date(Date.now() + 4 * DAY),
      startsAt: new Date(Date.now() + 6 * DAY),
      isPrivate: false,
      venueId: v.id,
      venueAccessRequiredSnapshot: true,
      commissionPercentSnapshot: "10.00",
      finalShareCents: 1000,
      ...over,
    } as typeof tournaments.$inferInsert)
    .returning();
  return { org, boss, v, t };
}
const rowOf = async (id: string) => (await db.select().from(tournaments).where(eq(tournaments.id, id)))[0];
const evidenceOf = (tid: string) => db.select().from(bookingEvidence).where(and(eq(bookingEvidence.tournamentId, tid), eq(bookingEvidence.subject, "tournament")));

describe("M5-7b: Zusage", () => {
  it("Betreiber sagt zu: Spalten gesetzt (_by = Betreiber), genau EIN Beweiseintrag (accepted, ohne Frist), Audit, Mitteilung an den Veranstalter im Namen der Halle; zweiter Aufruf idempotent", async () => {
    const { org, boss, v, t } = await fixture();
    expect(await confirmTournamentVenue(boss.id, t.id)).toEqual({ confirmed: true });
    const row = await rowOf(t.id);
    expect(row.venueConfirmedAt).not.toBeNull();
    expect(row.venueConfirmedBy).toBe(boss.id);
    const ev = await evidenceOf(t.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "accepted", venueId: v.id, deadlineAt: null, matchId: null });
    expect((await db.select().from(auditLog).where(and(eq(auditLog.action, "tournament.venue_confirm"), eq(auditLog.entityId, t.id)))).length).toBe(1);
    const note = (await db.select().from(notifications).where(and(eq(notifications.userId, org.id), eq(notifications.title, "Zusage der Halle"))))[0];
    expect(note.body).toContain(`hat für ${t.name} zugesagt`);
    expect(note.body).not.toContain(boss.name ?? "@@");
    expect(await confirmTournamentVenue(boss.id, t.id)).toEqual({ confirmed: false });
    expect(await evidenceOf(t.id)).toHaveLength(1);
  });

  it("parallele Zusagen: genau eine wirkt, genau ein Beweiseintrag", async () => {
    const { boss, t } = await fixture();
    const results = await Promise.all([confirmTournamentVenue(boss.id, t.id), confirmTournamentVenue(boss.id, t.id), confirmTournamentVenue(boss.id, t.id)]);
    expect(results.filter((r) => r.confirmed)).toHaveLength(1);
    expect(await evidenceOf(t.id)).toHaveLength(1);
  });

  it("Berechtigung ZUERST: wer keinen Zugang zur Halle des Turniers hat, bekommt fuer unbekannt/abgesagt/fixiert/ohne Snapshot/ohne Halle dieselbe neutrale Meldung", async () => {
    const stranger = await makeUser("str");
    const cases = [
      (await fixture()).t.id,
      (await fixture({ status: "cancelled" })).t.id,
      (await fixture({ bracketGeneratedAt: new Date(), status: "running" })).t.id,
      (await fixture({ venueAccessRequiredSnapshot: false })).t.id,
      "00000000-0000-4000-8000-000000000000",
    ];
    for (const id of cases) await expect(confirmTournamentVenue(stranger.id, id)).rejects.toThrow(NEUTRAL);
    expect((await rowOf(cases[0])).venueConfirmedAt).toBeNull();
  });

  it("Admin, gesperrtes Konto, eingeladen, entzogen und Betreiber einer anderen Halle werden abgelehnt (neutral)", async () => {
    const { t, v } = await fixture();
    const admin = await makeUser("adm", "admin");
    const [adminVenue] = await db.insert(venues).values({ name: `E2E Halle ADM ${nid("v")}`, city: "Essen", isPartner: true, active: true }).returning();
    await db.insert(venueAccess).values({ venueId: adminVenue.id, userId: admin.id, status: "active", assignedAt: new Date() }); // Admin mit Zugang zu einer ANDEREN Halle: gilt nie als Zugang
    const otherBoss = (await fixture()).boss; // aktiver Zugang, aber zu einer ANDEREN Halle
    const banned = await makeUser("ban");
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, banned.id));
    for (const u of [admin, otherBoss, banned]) await expect(confirmTournamentVenue(u.id, t.id)).rejects.toThrow(NEUTRAL);
    await db.update(venueAccess).set({ status: "revoked", revokedAt: new Date() }).where(eq(venueAccess.venueId, v.id)); // Entzug VOR der Zusage
    const [bossRow] = await db.select().from(venueAccess).where(eq(venueAccess.venueId, v.id));
    await expect(confirmTournamentVenue(bossRow.userId!, t.id)).rejects.toThrow(NEUTRAL);
    expect((await rowOf(t.id)).venueConfirmedAt).toBeNull();
  });

  it("Frist ueberschritten: abgelehnt mit Meldung zur Frist; Entzug NACH der Zusage aendert nichts", async () => {
    const late = await fixture();
    await expect(confirmTournamentVenue(late.boss.id, late.t.id, { now: new Date(Date.now() + 10 * DAY) })).rejects.toThrow(/Frist ist vorbei/);
    expect((await rowOf(late.t.id)).venueConfirmedAt).toBeNull();
    const ok = await fixture();
    await confirmTournamentVenue(ok.boss.id, ok.t.id);
    await db.update(venueAccess).set({ status: "revoked", revokedAt: new Date() }).where(eq(venueAccess.venueId, ok.v.id));
    expect((await rowOf(ok.t.id)).venueConfirmedAt).not.toBeNull(); // die Zusage bleibt
  });
});

describe("M5-7b: Liste, Erinnerung, Reset", () => {
  it("Liste: nur eigene Halle, payment, Snapshot true, ohne Zusage; nach der Zusage weg; namenfrei (keine Person im Ergebnis)", async () => {
    const a = await fixture();
    const b = await fixture();
    const list = await listTournamentConfirmations(a.boss.id);
    expect(list.map((x) => x.tournamentId)).toEqual([a.t.id]);
    expect(JSON.stringify(list)).not.toContain(a.org.id);
    expect(JSON.stringify(list)).not.toContain(b.t.id);
    await confirmTournamentVenue(a.boss.id, a.t.id);
    expect(await listTournamentConfirmations(a.boss.id)).toEqual([]);
  });

  it("Erinnerung 24 h und 6 h: je Stufe einmal, an den Veranstalter und die Zugangsinhaber, nie nach der Zusage", async () => {
    const { org, boss, t } = await fixture();
    const due = new Date(Date.now() + 4 * DAY); // Frist = Start minus 48 h (Karenz greift hier nicht)
    const at = (h: number) => new Date(due.getTime() - h * 3_600_000);
    expect(await notifyHallConfirmReminders(at(30))).toBe(0); // zu frueh
    const first = await notifyHallConfirmReminders(at(23));
    expect(first).toBeGreaterThanOrEqual(1);
    expect(await notifyHallConfirmReminders(at(22))).toBe(0); // gleiche Stufe nicht noch einmal
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, org.id), eq(notifications.title, "Halle hat noch nicht zugesagt")))).length).toBe(1);
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, boss.id), eq(notifications.title, "Zusage der Halle fehlt")))).length).toBe(1);
    await notifyHallConfirmReminders(at(5));
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, org.id), eq(notifications.title, "Halle hat noch nicht zugesagt")))).length).toBe(2);
    await confirmTournamentVenue(boss.id, t.id);
    expect(await notifyHallConfirmReminders(at(1))).toBe(0); // zugesagt: nichts mehr
  });

  it("Reset bei geaenderten Bedingungen (F7): Halle/Termin/Dauer/Miete setzen venue_confirmed_at UND _by zurueck, gleiche Bedingungen nicht", async () => {
    const { boss, t } = await fixture();
    await confirmTournamentVenue(boss.id, t.id);
    const row = await rowOf(t.id);
    const terms = { venueId: row.venueId, startsAt: row.startsAt, durationMin: row.durationMin, totalCents: row.totalCents };
    expect(await db.transaction((tx) => resetVenueConfirmationIfTermsChanged(tx, t.id, terms, { ...terms }))).toBe(false);
    expect((await rowOf(t.id)).venueConfirmedAt).not.toBeNull();
    expect(await db.transaction((tx) => resetVenueConfirmationIfTermsChanged(tx, t.id, terms, { ...terms, durationMin: 180 }))).toBe(true);
    const after = await rowOf(t.id);
    expect(after.venueConfirmedAt).toBeNull();
    expect(after.venueConfirmedBy).toBeNull();
  });
});
