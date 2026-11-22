import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, paymentProfiles, paymentRefunds, teamMembers } from "@/db/schema";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { cancelTournament, createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { setSetting } from "@/server/settings";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M5-5 (Review w4/w2): Absage-Berechtigung (Vorschlagsweg), Schalter AUS zur Frist, Absage eines GEBUCHTEN Turniers (Erstattung je Zeile, Summe 0 je tournament_id, Provisions-Storno), Parallelitaet, Loeschsperre.

let provider: FakeProvider;
let hall = "";
let owner: { id: string };
beforeAll(async () => {
  owner = await makeUser("adm1", "owner"); // Admin 1: es gibt hoechstens einen je Datenbank
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCP ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
  hall = v.id;
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Berechtigungs-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const DUE = new Date(T0 + 3.5 * DAY);
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
type Squad = { captain: { id: string }; team: { id: string }; players: { id: string }[] };

async function squad(tid: string): Promise<Squad> {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  const players = [captain];
  for (let i = 1; i < 4; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
    players.push(p);
  }
  await setRosterComplete(captain.id, tid, true);
  return { captain, team, players };
}
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tcp"), paymentMethodId: nid("pm_tcp") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tcp") } });
const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];

/** Turnier im Kartenmodell, alle bereit; Admin 1 (owner) und Admin 2 (admin) vorhanden. */
async function prepared(commissionPercent = "10") {
  const o = await makeUser("org");
  const admin2 = await makeUser("adm2", "admin");
  await setOrganizer(admin2.id, o.id, true);
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players) await giveCard(p.id);
  for (const s of squads) await setPaidReady(s.captain.id, t.id);
  await db.update(tournaments).set({ commissionPercentSnapshot: commissionPercent }).where(eq(tournaments.id, t.id));
  return { o, admin2, t, squads };
}
/** gebuchtes Turnier: alle 16 abgebucht, Bracket erzeugt, Provision gebucht */
async function booked() {
  const x = await prepared();
  await runTournamentCharges(x.t.id, DUE);
  expect((await tOf(x.t.id)).settledAt).not.toBeNull();
  return x;
}
async function netOf(tid: string, account: "venue_payable" | "commission") {
  const es = await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, tid));
  return es.reduce((s, e) => s + (e.debitAccount === account ? e.amountCents : 0) - (e.creditAccount === account ? e.amountCents : 0), 0);
}


async function setRow(tid: string, patch: Partial<typeof paymentCharges.$inferInsert>) {
  const row = (await rowsOf(tid)).sort((a, b) => a.id.localeCompare(b.id))[0]; // immer dieselbe Zeile
  await db.update(paymentCharges).set(patch).where(eq(paymentCharges.id, row.id));
}
const hasAlarm = async (tid: string) => (await (await import("@/server/finance")).getRefundAlerts(new Date())).tournamentOpenIntents.some((r) => r.id === tid);

describe("M5-5: Alarm offene Zahlung bei abgesagtem Turnier", () => {
  it("nur bei abgesagtem Turnier UND offener Zeile mit PaymentIntent UND Alter ueber 1 Stunde", async () => {
    const { t } = await booked();
    await setRow(t.id, { status: "pending", updatedAt: new Date(Date.now() - 2 * 3_600_000) });
    expect(await hasAlarm(t.id)).toBe(false); // Turnier nicht abgesagt
    await cancelTournament(owner.id, t.id);
    await setRow(t.id, { status: "pending", updatedAt: new Date(Date.now() - 2 * 3_600_000) });
    expect(await hasAlarm(t.id)).toBe(true);
    await setRow(t.id, { updatedAt: new Date(Date.now() - 600_000) });
    expect(await hasAlarm(t.id)).toBe(false); // zu jung
    await setRow(t.id, { updatedAt: new Date(Date.now() - 2 * 3_600_000), status: "failed" });
    expect(await hasAlarm(t.id)).toBe(false); // nicht mehr offen
    const { cardAlertsFrom, getRefundAlerts } = await import("@/server/finance");
    await setRow(t.id, { status: "requires_action" });
    expect(cardAlertsFrom(await getRefundAlerts(new Date())).some((a) => a.code === "card:tournament-open-intent")).toBe(true);
  });
});

describe("M5-5: Absagevorschlag von Admin 2", () => {
  it("Mitteilung an Admin 1, je Person und Turnier nur einmal; fuer beendete/abgesagte Turniere abgelehnt ohne Eintrag", async () => {
    const { o, admin2, t } = await booked();
    const count = async (uid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, uid), eq(notifications.title, "Absagevorschlag")))).length;
    const before = await count(owner.id);
    await expect(cancelTournament(admin2.id, t.id)).rejects.toThrow(/Absagevorschlag ist gespeichert/);
    expect(await count(owner.id)).toBe(before + 1);
    await expect(cancelTournament(admin2.id, t.id)).rejects.toThrow(/Absagevorschlag ist gespeichert/); // Wiederholung
    expect(await count(owner.id)).toBe(before + 1); // keine zweite Mitteilung
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.action, "tournament.cancel_proposal"), eq(auditLog.entityId, t.id), eq(auditLog.actorId, admin2.id)));
    expect(entries).toHaveLength(1);
    // eine zweite Person (Veranstalter) schlaegt ebenfalls vor: eigene Mitteilung (bewusst: je Person eine)
    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/Absagevorschlag ist gespeichert/);
    expect(await count(owner.id)).toBe(before + 2);
    // abgesagt: abgelehnt, kein neuer Eintrag
    await cancelTournament(owner.id, t.id);
    const n = (await db.select().from(auditLog).where(eq(auditLog.action, "tournament.cancel_proposal"))).length;
    const other = await makeUser("adm2b", "admin");
    await expect(cancelTournament(other.id, t.id)).rejects.toThrow(/schon beendet oder abgesagt/);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "tournament.cancel_proposal"))).length).toBe(n);
  });
});
