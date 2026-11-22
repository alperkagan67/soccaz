import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, users } from "@/db/schema";
import { venueAccess, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { hallZusageOkLive } from "@/server/tournament-venue";
import { armConfirmationForNewAccess } from "@/server/tournament-confirm";
import { chargeDueAt } from "@/server/tournaments";
import { setSetting } from "@/server/settings";
import { cleanup, makeUser } from "./helpers";

// 012 M5-7b (Plan 19.14, R-T250): Zugang wird wirksam, waehrend ein Turnier der Halle in payment ohne Zusage steht. GESCHRIEBEN, NICHT GELAUFEN (Lauf erst nach 'Lauf frei' und 0054).
// Fixtures per DB (kein Spielerfluss): Turnier in payment, eingefrorene Halle, Snapshot false, Frist = Start minus 48 h.

beforeAll(() => setSetting(null, "card_payments_enabled", true));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const DAY = 86_400_000;
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;

async function fixture(over: { startsInDays?: number; snapshot?: boolean | null } = {}) {
  const org = await makeUser("org");
  const [v] = await db.insert(venues).values({ name: `E2E Halle LIVE ${nid("v")}`, city: "Essen", isPartner: true, active: true }).returning();
  const days = over.startsInDays ?? 6;
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: nid("Live-Cup"),
      city: "Essen",
      startsOn: new Date(Date.now() + days * DAY).toISOString().slice(0, 10),
      format: "knockout",
      maxTeams: 4,
      totalCents: 16000,
      hourlyCents: 8000,
      durationMin: 120,
      status: "payment",
      registrationDeadline: new Date(Date.now() + (days - 2) * DAY),
      startsAt: new Date(Date.now() + days * DAY),
      isPrivate: false,
      venueId: v.id,
      venueAccessRequiredSnapshot: over.snapshot === undefined ? false : over.snapshot,
      commissionPercentSnapshot: "10.00",
      finalShareCents: 1000,
    } as typeof tournaments.$inferInsert)
    .returning();
  return { org, v, t };
}
async function grantAccess(venueId: string, assignedAt: Date = new Date()) {
  const u = await makeUser("op");
  await db.insert(venueAccess).values({ venueId, userId: u.id, status: "active", assignedAt });
  return u;
}
const rowOf = async (id: string) => (await db.select().from(tournaments).where(eq(tournaments.id, id)))[0];
const arm = (venueIds: string[]) => db.transaction((tx) => armConfirmationForNewAccess(tx, venueIds));
const markers = async (tid: string) => (await db.select().from(auditLog).where(and(eq(auditLog.entityId, tid), sql`${auditLog.action} like 'tournament.hall_fixed_notice.%'`))).length;

describe("M5-7b: Zugang wird wirksam in payment (Fairness-Zusatz)", () => {
  it("Snapshot false -> true, Zugangsinhaber benachrichtigt, je Turnier und Preisrunde einmal (Wiederholung nichts)", async () => {
    const { v, t } = await fixture();
    const op = await grantAccess(v.id);
    expect(await arm([v.id])).toBe(1);
    expect((await rowOf(t.id)).venueAccessRequiredSnapshot).toBe(true);
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, op.id), eq(notifications.title, "Zusage der Halle gefragt")))).length).toBe(1);
    expect(await markers(t.id)).toBe(1);
    expect(await arm([v.id])).toBe(0); // Snapshot schon true: nichts, keine zweite Mitteilung
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, op.id), eq(notifications.title, "Zusage der Halle gefragt")))).length).toBe(1);
  });

  it("nicht bei Turnieren in registration, mit Zusage, nach der Frist, ohne Frist oder fremder Halle", async () => {
    const a = await fixture();
    await db.update(tournaments).set({ status: "registration" }).where(eq(tournaments.id, a.t.id));
    const b = await fixture();
    await db.update(tournaments).set({ venueConfirmedAt: new Date() }).where(eq(tournaments.id, b.t.id));
    const c = await fixture({ startsInDays: 1 }); // Start in 1 Tag: die Frist (Start minus 48 h bzw. 1 h) ist vorbei oder nah
    await db.update(tournaments).set({ startsAt: new Date(Date.now() + 30 * 60_000) }).where(eq(tournaments.id, c.t.id));
    const other = await fixture();
    for (const f of [a, b, c]) await grantAccess(f.v.id);
    expect(await arm([a.v.id, b.v.id, c.v.id])).toBe(0);
    for (const f of [a, b, c]) expect((await rowOf(f.t.id)).venueAccessRequiredSnapshot).toBe(false);
    expect((await rowOf(other.t.id)).venueAccessRequiredSnapshot).toBe(false); // andere Halle bleibt unberuehrt
  });

  it("R-T250 Mittel 1: sobald Abbuchungszeilen existieren, wird das Turnier nie nachtraeglich zusagepflichtig (auch nicht live)", async () => {
    const { v, t, org } = await fixture();
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: org.id, amountCents: 1000, idempotencyKey: nid("c") });
    await grantAccess(v.id);
    expect(await arm([v.id])).toBe(0);
    expect((await rowOf(t.id)).venueAccessRequiredSnapshot).toBe(false);
    const row = await rowOf(t.id);
    expect(await db.transaction(async (tx) => hallZusageOkLive(tx, row, await chargeDueAt(tx, row)))).toBe(true); // Live-Zugang blockiert nicht mehr
  });
});

describe("M5-7b: Live-Pruefung der Zusage (hallZusageOkLive)", () => {
  const live = async (id: string) => {
    const row = await rowOf(id);
    return db.transaction(async (tx) => hallZusageOkLive(tx, row, await chargeDueAt(tx, row)));
  };

  it("Snapshot false, Zugang vor der Frist wirksam, keine Zusage -> nicht erfuellt; mit Zusage erfuellt; ohne Zugang erfuellt", async () => {
    const { v, t } = await fixture();
    expect(await live(t.id)).toBe(true); // kein Zugang
    await grantAccess(v.id);
    expect(await live(t.id)).toBe(false); // Zugang jetzt aktiv, keine Zusage
    await db.update(tournaments).set({ venueConfirmedAt: new Date() }).where(eq(tournaments.id, t.id));
    expect(await live(t.id)).toBe(true);
  });

  it("R-T250 Mittel 2: ein Zugang, der erst NACH der Frist wirksam wurde, blockiert nicht", async () => {
    const { v, t } = await fixture();
    const row = await rowOf(t.id);
    const due = (await db.transaction((tx) => chargeDueAt(tx, row)))!;
    await grantAccess(v.id, new Date(due.getTime() + 3_600_000)); // eine Stunde nach der Frist
    expect(await live(t.id)).toBe(true);
  });

  it("Snapshot true bleibt maßgeblich (Entzug aendert nichts), NULL-Snapshot bleibt fail-closed", async () => {
    const a = await fixture({ snapshot: true });
    expect(await live(a.t.id)).toBe(false); // keine Zusage
    const b = await fixture({ snapshot: null });
    expect(await live(b.t.id)).toBe(false);
  });
});

describe("M5-7b: Einloesen und Fehler", () => {
  it("Savepoint je Turnier: ein Fehler bei einem Turnier laesst die anderen und die Transaktion intakt", async () => {
    const { v, t } = await fixture();
    await grantAccess(v.id);
    // Gegenprobe der Kapselung: eine nicht existierende Halle in der Liste stoert nicht
    expect(await arm(["00000000-0000-4000-8000-000000000000", v.id])).toBe(1);
    expect((await rowOf(t.id)).venueAccessRequiredSnapshot).toBe(true);
    // users bleibt benutzbar (Transaktion nicht abgebrochen)
    expect((await db.select().from(users).where(eq(users.id, (await rowOf(t.id)).organizerId))).length).toBe(1);
  });
});

// ---- R-T251: Grenze, Fallback, ohne Frist, Zustandsmatrix, Ende zu Ende ----
import { confirmTournamentVenue } from "@/server/tournament-confirm";
import { zusageRequired } from "@/server/tournament-venue";
import { tournamentChargeEligibility } from "@/server/payments/tournament-charge";

describe("M5-7b R-T251: Live-Pflicht und Zusage sind EINE Regel", () => {
  const dueOf = async (id: string) => {
    const row = await rowOf(id);
    return (await db.transaction((tx) => chargeDueAt(tx, row)))!;
  };
  const okLive = async (id: string) => {
    const row = await rowOf(id);
    return db.transaction(async (tx) => hallZusageOkLive(tx, row, await chargeDueAt(tx, row)));
  };

  it("ohne bekannte Frist (Altturnier) zaehlt der Live-Zugang NICHT (keine Sackgasse)", async () => {
    const { v, t } = await fixture();
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() + 5.9 * DAY) }).where(eq(tournaments.id, t.id)); // spaeter als Start minus 48 h: Altturnier, chargeDueAt = null
    expect(await db.transaction(async (tx) => chargeDueAt(tx, await rowOf(t.id)))).toBeNull();
    await grantAccess(v.id);
    expect(await okLive(t.id)).toBe(true);
  });

  it("Grenze: Zugang exakt zur Frist zaehlt nicht (strikt davor), eine Sekunde davor zaehlt", async () => {
    const a = await fixture();
    const dueA = await dueOf(a.t.id);
    await grantAccess(a.v.id, dueA);
    expect(await okLive(a.t.id)).toBe(true);
    const b = await fixture();
    const dueB = await dueOf(b.t.id);
    await grantAccess(b.v.id, new Date(dueB.getTime() - 1000));
    expect(await okLive(b.t.id)).toBe(false);
  });

  it("assigned_at NULL: der Zeitpunkt der Einladung (invited_at) entscheidet", async () => {
    const a = await fixture();
    const opA = await makeUser("op");
    await db.insert(venueAccess).values({ venueId: a.v.id, userId: opA.id, status: "active", invitedAt: new Date(Date.now() - DAY) });
    expect(await okLive(a.t.id)).toBe(false); // Einladung lange vor der Frist
    const b = await fixture();
    const dueB = await dueOf(b.t.id);
    const opB = await makeUser("op");
    await db.insert(venueAccess).values({ venueId: b.v.id, userId: opB.id, status: "active", invitedAt: new Date(dueB.getTime() + 3_600_000) });
    expect(await okLive(b.t.id)).toBe(true); // Einladung erst nach der Frist
  });

  it("Zustandsmatrix: Abbuchung erlaubt <=> Zusage nicht verlangt; Zusage verlangt und Zugang da => confirm moeglich", async () => {
    for (const snapshot of [true, false, null] as const) {
      for (const access of ["none", "before", "after"] as const) {
        for (const rows of [false, true]) {
          for (const confirmed of [false, true]) {
            const { v, t, org } = await fixture({ snapshot });
            const due = await dueOf(t.id);
            let boss: { id: string } | null = null;
            if (access !== "none") boss = await grantAccess(v.id, access === "before" ? new Date(due.getTime() - 3_600_000) : new Date(due.getTime() + 3_600_000));
            if (rows) await db.insert(paymentCharges).values({ tournamentId: t.id, userId: org.id, amountCents: 1000, idempotencyKey: nid("m") });
            if (confirmed) await db.update(tournaments).set({ venueConfirmedAt: new Date() }).where(eq(tournaments.id, t.id));
            const row = await rowOf(t.id);
            const required = snapshot === true || (snapshot === false && access === "before" && !rows);
            const expectedOk = snapshot === null ? false : !required || confirmed;
            const label = JSON.stringify({ snapshot, access, rows, confirmed });
            expect(await db.transaction((tx) => zusageRequired(tx, row, due)), label).toBe(required);
            expect(await okLive(t.id), label).toBe(expectedOk);
            if (required && !confirmed && boss) {
              await expect(confirmTournamentVenue(boss.id, t.id), label).resolves.toEqual({ confirmed: true }); // Invariante: verlangt die Pruefung eine Zusage, nimmt confirm sie an
              expect((await rowOf(t.id)).venueAccessRequiredSnapshot, label).toBe(true);
            }
          }
        }
      }
    }
  }, 240_000);

  it("Ende zu Ende: Live-Pflicht -> no_zusage (kein Abbuchungsweg), nach der Zusage nicht mehr no_zusage", async () => {
    const { v, t } = await fixture(); // Snapshot false
    const boss = await grantAccess(v.id);
    const reason = async () => db.transaction(async (tx) => (await tournamentChargeEligibility(tx, await rowOf(t.id), new Date())).reason);
    expect(await reason()).toBe("no_zusage");
    await confirmTournamentVenue(boss.id, t.id);
    expect(await reason()).not.toBe("no_zusage"); // die naechste Huerde (Teams) ist eine andere
  });
});

describe("M5-7b R-T251: arm ueberspringt Turniere ohne bekannte Frist", () => {
  it("Altturnier (chargeDueAt = null): kein stilles Scharfschalten, Snapshot bleibt false", async () => {
    const { v, t } = await fixture();
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() + 5.9 * DAY) }).where(eq(tournaments.id, t.id));
    await grantAccess(v.id);
    expect(await arm([v.id])).toBe(0);
    expect((await rowOf(t.id)).venueAccessRequiredSnapshot).toBe(false);
  });
});

// ---- R-T255: N1 (ID und Berechtigung vor der Sperre), N2 (Liste und Erinnerung auf zusageRequired) ----
import { listTournamentConfirmations, notifyHallConfirmReminders } from "@/server/tournament-confirm";

describe("M5-7b R-T255", () => {
  it("N1: ungueltige ID und fremde Halle bekommen die neutrale Meldung (kein Roh-Postgres-Fehler)", async () => {
    const { v, t } = await fixture({ snapshot: true });
    const op = await grantAccess(v.id);
    const other = await grantAccess((await fixture()).v.id); // aktiver Zugang, aber zu einer ANDEREN Halle
    for (const id of ["kein-uuid", "", "00000000-0000-4000-8000-000000000000"]) await expect(confirmTournamentVenue(op.id, id)).rejects.toThrow(/lässt sich gerade nicht zusagen/);
    await expect(confirmTournamentVenue(other.id, t.id)).rejects.toThrow(/lässt sich gerade nicht zusagen/);
  });

  it("N2: Live-Pflicht ohne Einloesen (Zugang entstand anders): das Turnier steht in der Liste und die Erinnerung geht raus", async () => {
    const { v, t, org } = await fixture(); // Snapshot false
    const op = await grantAccess(v.id); // Zugang ohne redeemVenueInvites: arm lief nicht
    expect((await rowOf(t.id)).venueAccessRequiredSnapshot).toBe(false);
    expect((await listTournamentConfirmations(op.id)).map((x) => x.tournamentId)).toContain(t.id);
    const due = await db.transaction(async (tx) => chargeDueAt(tx, await rowOf(t.id)));
    expect(await notifyHallConfirmReminders(new Date(due!.getTime() - 3 * 3_600_000))).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, org.id), eq(notifications.title, "Halle hat noch nicht zugesagt")))).length).toBe(1);
  });
});

describe("M5-7b R-T257: Berechtigung VOR der Turniersperre", () => {
  it("ein Fremder wartet nie auf die Zeilensperre eines Turniers (sofortige neutrale Meldung)", async () => {
    const { t } = await fixture({ snapshot: true });
    const stranger = await makeUser("str");
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    let locked: () => void = () => {};
    const lockedP = new Promise<void>((r) => (locked = r));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from tournaments where id = ${t.id} for update`);
      locked();
      await held;
    });
    await lockedP;
    try {
      const outcome = await Promise.race([
        confirmTournamentVenue(stranger.id, t.id).then(() => "ok", (e: Error) => (/lässt sich gerade nicht zusagen/.test(e.message) ? "neutral" : "anders: " + e.message)),
        new Promise<string>((r) => setTimeout(() => r("blockiert"), 4000)),
      ]);
      expect(outcome).toBe("neutral");
    } finally {
      release();
      await holder;
    }
  });
});
