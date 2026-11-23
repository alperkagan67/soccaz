import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, paymentProfiles, teamMembers, users } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, notifyMissingCardReminders, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Kartenmodell UND Zahlungen EIN (Produktivzustand); "Zahlungen AUS" = Gratis ist in payments-off-free.test.ts abgedeckt.
beforeAll(() => setSetting(null, "payments_enabled", true));
afterAll(() => setSetting(null, "payments_enabled", false));

// 012 M5-5 (Entscheid t2q zu B7): Vorwarnung "Karte fehlt" 24 h und 6 h vor der Frist, je Stufe einmal, nur Betroffene und Captain, ohne Namen Dritter.

let hall = "";
beforeAll(async () => {
  await setSetting(null, "card_payments_enabled", true);
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCR ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
  hall = v.id;
});
beforeEach(() => setSetting(null, "card_payments_enabled", true));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const base = { name: "Erinnerungs-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const DUE = T0 + 3 * DAY; // Start minus 48 Stunden (Karenz greift hier nicht)
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
type Squad = { captain: { id: string }; team: { id: string }; players: { id: string }[] };

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}
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
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tcr"), paymentMethodId: nid("pm_tcr") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tcr") } });
const reminders = (uids: string[]) => db.select().from(notifications).where(and(inArray(notifications.userId, uids), eq(notifications.title, "Karte fehlt")));

/** Turnier in der Zahlungsphase, alle bereit; danach entfernt ein Spieler seine Karte (Fall "alle bereit, Karte fehlt"). */
async function withMissingCard() {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players) await giveCard(p.id);
  for (const s of squads) await setPaidReady(s.captain.id, t.id);
  const victim = squads[1].players[2];
  await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, victim.id));
  return { o, t, squads, victim };
}

describe("M5-5: Vorwarnung 'Karte fehlt'", () => {
  it("24 h und 6 h vor der Frist je einmal: nur der Betroffene und sein Captain, nie der Veranstalter und keine anderen Spieler; keine Namen Dritter im Text; keine Dopplung bei Wiederholung", async () => {
    const { o, t, squads, victim } = await withMissingCard();
    const captain = squads[1].captain.id;
    const others = [o.id, squads[0].captain.id, squads[2].captain.id, squads[1].players[1].id];
    // zu frueh (mehr als 24 h vor der Frist): nichts
    expect(await notifyMissingCardReminders(new Date(DUE - 30 * HOUR))).toBe(0);
    // Stufe 24 h
    expect(await notifyMissingCardReminders(new Date(DUE - 23 * HOUR))).toBeGreaterThanOrEqual(1);
    expect(await notifyMissingCardReminders(new Date(DUE - 22 * HOUR))).toBe(0); // dieselbe Stufe: nicht noch einmal
    expect(await reminders([victim.id])).toHaveLength(1);
    expect(await reminders([captain])).toHaveLength(1);
    expect(await reminders(others)).toHaveLength(0);
    // Stufe 6 h
    expect(await notifyMissingCardReminders(new Date(DUE - 5 * HOUR))).toBeGreaterThanOrEqual(1);
    expect(await notifyMissingCardReminders(new Date(DUE - 4 * HOUR))).toBe(0);
    expect(await reminders([victim.id])).toHaveLength(2);
    expect(await reminders([captain])).toHaveLength(2);
    // Text ohne Namen Dritter
    const names = (await db.select({ name: users.name }).from(users).where(inArray(users.id, [victim.id, ...others]))).map((u) => u.name).filter((n): n is string => Boolean(n));
    for (const n of await reminders([victim.id, captain])) {
      for (const name of names) expect(n.body).not.toContain(name);
      expect(n.url).toBe(`/turniere/${t.id}`);
    }
    // nach der Frist keine Erinnerung mehr
    expect(await notifyMissingCardReminders(new Date(DUE + HOUR))).toBe(0);
  });

  it("ein Turnier mit allen Karten bekommt keine Erinnerung; bei Schalter AUS auch nicht", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const squads: Squad[] = [];
    for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
    for (const s of squads) for (const p of s.players) await giveCard(p.id);
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    const before = (await db.select().from(notifications).where(eq(notifications.title, "Karte fehlt"))).length;
    await notifyMissingCardReminders(new Date(DUE - 23 * HOUR));
    expect((await db.select().from(notifications).where(eq(notifications.title, "Karte fehlt"))).length).toBe(before);

    const m = await withMissingCard();
    await setSetting(null, "card_payments_enabled", false);
    try {
      await notifyMissingCardReminders(new Date(DUE - 23 * HOUR));
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
    expect(await reminders([m.victim.id])).toHaveLength(0);
  });
});
