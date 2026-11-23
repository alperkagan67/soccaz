import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, users } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { cardAlertsFrom, getRefundAlerts } from "@/server/finance";
import { setSetting } from "@/server/settings";
import { chargeDueAt, frozenTournaments, notifyFrozenTournaments } from "@/server/tournaments";
import { cleanup, makeUser } from "./helpers";

// Kartenmodell UND Zahlungen EIN (Produktivzustand); "Zahlungen AUS" = Gratis ist in payments-off-free.test.ts abgedeckt.
beforeAll(() => setSetting(null, "payments_enabled", true));
afterAll(() => setSetting(null, "payments_enabled", false));

// 012-Rest PR A (Backlog 141): eingefrorene Turniere bei Schalter AUS. GESCHRIEBEN, NICHT GELAUFEN (Lauf erst nach 'Lauf frei').
// Zeitreise ueber den now-Parameter; Frist = Start minus 48 h (Start in 6 Tagen -> Frist in 4 Tagen).

let owner: { id: string };
beforeAll(async () => {
  owner = await makeUser("own141", "owner"); // Admin 1: hoechstens einer je Datenbank
  await setSetting(null, "card_payments_enabled", false);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const DAY = 86_400_000;
const H = 3_600_000;
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;

async function fixture(over: Partial<typeof tournaments.$inferInsert> = {}) {
  const org = await makeUser("org");
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: nid("Frozen-Cup"),
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
      venueAccessRequiredSnapshot: false,
      commissionPercentSnapshot: "10.00",
      finalShareCents: 1000,
      ...over,
    } as typeof tournaments.$inferInsert)
    .returning();
  const due = (await db.transaction((tx) => chargeDueAt(tx, t)))!;
  return { org, t, due };
}
const notes = async (userId: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.title, "Turnier eingefroren")))).length;
const markers = async (tid: string) => (await db.select().from(auditLog).where(and(eq(auditLog.entityId, tid), eq(auditLog.entity, "tournament")))).filter((a) => a.action.startsWith("tournament.frozen_notice.")).length;
const alarm = async (now: Date) => cardAlertsFrom(await getRefundAlerts(now)).some((a) => a.code === "card:tournament-frozen");

describe("Backlog 141: eingefrorene Turniere (Schalter AUS)", () => {
  it("vor der Frist und unter 6 h danach: nichts; ab 6 h genau eine Mitteilung an Admin 1; Wiederholung keine zweite; ab 18 h die zweite, ab 30 h die dritte", async () => {
    const { t, due } = await fixture();
    const before = await notes(owner.id);
    expect(await notifyFrozenTournaments(new Date(due.getTime() - H))).toBe(0);
    expect(await notifyFrozenTournaments(new Date(due.getTime() + 5 * H))).toBe(0);
    expect(await markers(t.id)).toBe(0);
    expect(await notifyFrozenTournaments(new Date(due.getTime() + 7 * H))).toBeGreaterThanOrEqual(1);
    expect(await notes(owner.id)).toBe(before + 1);
    await notifyFrozenTournaments(new Date(due.getTime() + 10 * H)); // dieselbe Stufe
    expect(await notes(owner.id)).toBe(before + 1);
    await notifyFrozenTournaments(new Date(due.getTime() + 19 * H));
    expect(await notes(owner.id)).toBe(before + 2);
    await notifyFrozenTournaments(new Date(due.getTime() + 31 * H));
    expect(await notes(owner.id)).toBe(before + 3);
    expect(await markers(t.id)).toBe(3);
  });

  it("Text ohne Personendaten und ohne Turniername (auch mit Personenbezug im Namen); nie an andere als Admin 1 (Admin 2, Betreiber, gesperrter Owner)", async () => {
    const { t, due, org } = await fixture({ name: nid("Mueller Cup") });
    const admin2 = await makeUser("adm2", "admin");
    const operator = await makeUser("op");
    await notifyFrozenTournaments(new Date(due.getTime() + 7 * H));
    const note = (await db.select().from(notifications).where(and(eq(notifications.userId, owner.id), eq(notifications.title, "Turnier eingefroren"), eq(notifications.url, `/turniere/${t.id}`))))[0];
    expect(note).toBeDefined(); // genau die Mitteilung zu DIESEM Turnier (Positivkontrolle)
    expect(note.body).toContain("eingefroren"); // Kerntext (Positivkontrolle)
    expect(note.body).toMatch(/Stunden/);
    expect(note.body).not.toContain(t.name);
    expect(note.body).not.toContain("Mueller");
    expect(note.body).not.toMatch(/@/);
    for (const other of [org, admin2, operator]) expect(await notes(other.id)).toBe(0); // nur Admin 1
  });

  it("Alarm in der Liste ab 6 h; weg bei Schalter AN, abgesagtem oder gebuchtem Turnier", async () => {
    const { t, due } = await fixture();
    const now = new Date(due.getTime() + 7 * H);
    expect(await alarm(new Date(due.getTime() + 5 * H))).toBe(false);
    expect(await alarm(now)).toBe(true);
    await setSetting(null, "card_payments_enabled", true);
    try {
      expect(await alarm(now)).toBe(false);
      expect(await notifyFrozenTournaments(now)).toBe(0);
    } finally {
      await setSetting(null, "card_payments_enabled", false);
    }
    await db.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, t.id));
    expect((await frozenTournaments(db, now)).map((f) => f.id)).not.toContain(t.id);
  });

  it("kein Kartenfluss (Snapshot NULL, keine Zeilen) oder Bracket/Abrechnung: nie", async () => {
    const a = await fixture({ venueAccessRequiredSnapshot: null });
    const b = await fixture({ bracketGeneratedAt: new Date(), status: "running" });
    const c = await fixture({ settledAt: new Date() });
    const now = new Date(Date.now() + 5 * DAY + 7 * H);
    const ids = (await frozenTournaments(db, now)).map((f) => f.id);
    for (const f of [a, b, c]) expect(ids).not.toContain(f.t.id);
  });

  it("abgelaufenes Nachzahlfenster einer gescheiterten Zeile zaehlt als Beginn (auch vor der Frist)", async () => {
    const { t, org } = await fixture();
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: org.id, amountCents: 1000, idempotencyKey: nid("c"), status: "failed", failureCode: "card_declined", graceUntil: new Date(Date.now() - 8 * H) });
    expect((await frozenTournaments(db, new Date())).map((f) => f.id)).toContain(t.id); // Fenster seit 8 h abgelaufen
    expect(await alarm(new Date())).toBe(true);
  });

  it("R-T269: zwischenzeitlich nachgezahlt oder nicht mehr eingefroren: keine Mitteilung (Pruefung unter der Sperre)", async () => {
    const { t, org } = await fixture();
    const now = new Date();
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: org.id, amountCents: 1000, idempotencyKey: nid("c"), status: "failed", failureCode: "card_declined", graceUntil: new Date(Date.now() - 8 * H) });
    const stale = await frozenTournaments(db, now);
    expect(stale.map((f) => f.id)).toContain(t.id); // so sieht die Liste VOR dem Nachzahlen aus
    await db.update(paymentCharges).set({ status: "succeeded", failureCode: null }).where(eq(paymentCharges.tournamentId, t.id));
    await db.update(tournaments).set({ startsAt: new Date(Date.now() + 20 * DAY), registrationDeadline: new Date(Date.now() + 18 * DAY) }).where(eq(tournaments.id, t.id)); // Frist weit in der Zukunft
    const before = await notes(owner.id);
    expect(await notifyFrozenTournaments(now, { candidates: stale.filter((f) => f.id === t.id) })).toBe(0);
    expect(await notes(owner.id)).toBe(before);
    expect(await markers(t.id)).toBe(0);
  });

  it("gesperrter Owner bekommt nichts", async () => {
    const { t, due } = await fixture();
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, owner.id));
    const before = await notes(owner.id);
    try {
      await notifyFrozenTournaments(new Date(due.getTime() + 7 * H), { candidates: [{ id: t.id, since: due }] });
      expect(await notes(owner.id)).toBe(before);
    } finally {
      await db.update(users).set({ bannedAt: null }).where(eq(users.id, owner.id));
    }
  });

  it("Zeile mit technischem Code (kein Kartenproblem) startet keine Einfrierung", async () => {
    const { t, org } = await fixture();
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: org.id, amountCents: 1000, idempotencyKey: nid("c"), status: "failed", failureCode: "unknown_outcome", graceUntil: new Date(Date.now() - 8 * H) });
    expect((await frozenTournaments(db, new Date())).map((f) => f.id)).not.toContain(t.id);
  });
});
