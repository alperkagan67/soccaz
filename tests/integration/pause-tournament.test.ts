import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, paymentCharges, paymentProfiles, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { cancelTournamentsAfterWindow, chargeDueAt, closeTournamentsAtDeadline, createTournament, joinAsPlayer, registerTeam, setOrganizer, setRosterComplete } from "@/server/tournaments";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { berlinTime, notifyResumedGames } from "@/server/pause-notify";
import { resumeUntil } from "@/server/pause-resume";
import { setSetting } from "@/server/settings";
import { cleanup, makeTeam, makeUser } from "./helpers";
import { resumeCycle } from "./pause-helpers";

// Turniere in der Pause (Zahlungen AN + Karte AUS): eingefroren, nie wegen der Frist abgesagt (auch wenn der Preis erst in der Pause festgelegt wurde, Snapshot leer); nach dem Wiedereinschalten Karenz
// fuer Fristen, die in der Pause abliefen (Wiedereinschalten + 2 Stunden, nie ueber den Start hinaus; sonst Absage mit Klartext); Mitteilung nur an die, die noch handeln muessen.
let provider: FakeProvider;
let hall = "";
const DAY = 86_400_000;
const MIN = 60_000;
const T0 = Date.now();
const base = { name: "Pausen-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
  const [v] = await db.insert(venues).values({ name: `E2E Halle PT ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
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
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const clearSwitchAudits = () => db.execute(sql`delete from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`);
const resumeNotes = async (userId: string) => (await db.select().from(notifications).where(eq(notifications.userId, userId))).filter((n) => n.title === "Bezahlung ist wieder möglich");
async function squad(tid: string, withCards = false) {
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
  if (withCards) for (const p of players) await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: `cus_pt_${p.id.slice(0, 8)}`, paymentMethodId: `pm_pt_${p.id.slice(0, 8)}` }).onConflictDoNothing();
  await setRosterComplete(captain.id, tid, true);
  return { captain, team, players };
}
/** Turnier in der Zahlungsphase, NICHT alle bereit (Karten fehlen): zur Frist faellt es im Kartenmodell aus. */
async function unready(withCards = false) {
  const o = await makeUser("org");
  const admin2 = await makeUser("adm2", "admin");
  await setOrganizer(admin2.id, o.id, true);
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, withCards));
  return { o, t, squads };
}

describe("Turnier in der Pause", () => {
  it("Kontrolle (Karte AN): nicht alle bereit -> zur Frist abgesagt", async () => {
    const { t } = await unready();
    await closeTournamentsAtDeadline(new Date(T0 + 4.9 * DAY));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });

  it("Pause (Zahlungen AN, Karte AUS): dasselbe Turnier wird NICHT abgesagt; Preis in der Pause festgelegt (Snapshot leer) ebenso; nach dem Wiedereinschalten gilt die Frist wieder", async () => {
    await clearSwitchAudits();
    const { t } = await unready();
    await db.update(tournaments).set({ venueAccessRequiredSnapshot: null }).where(eq(tournaments.id, t.id)); // Preis erst in der Pause festgelegt: kein Zugangs-Snapshot
    await setSetting(null, "card_payments_enabled", false);
    expect(await closeTournamentsAtDeadline(new Date(T0 + 4.9 * DAY))).toBe(0);
    expect((await tOf(t.id)).status).not.toBe("cancelled");
    await setSetting(null, "card_payments_enabled", true);
    await closeTournamentsAtDeadline(new Date(T0 + 4.9 * DAY));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });
});

describe("Turnier-Karenz nach dem Wiedereinschalten", () => {
  it("Frist in der Pause abgelaufen: innerhalb von 2 Stunden nach dem Wiedereinschalten keine Absage, danach die regulaere", async () => {
    await clearSwitchAudits();
    const { t } = await unready();
    const due = (await chargeDueAt(db, await tOf(t.id)))!;
    const now = new Date(T0 + 4.9 * DAY);
    await resumeCycle(new Date(now.getTime() - 30_000), new Date(due.getTime() - 60 * MIN)); // Pause ueber die Frist hinweg
    expect(await closeTournamentsAtDeadline(now)).toBe(0);
    expect((await tOf(t.id)).status).not.toBe("cancelled");
    await closeTournamentsAtDeadline(new Date(now.getTime() + 121 * MIN));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });

  it("Obergrenze: reicht die Karenz bis zum Start, gilt die bestehende Absageregel mit Klartext (nie stille Absage)", async () => {
    await clearSwitchAudits();
    const { o, t } = await unready();
    const due = (await chargeDueAt(db, await tOf(t.id)))!;
    const now = new Date(T0 + 5 * DAY - 30 * MIN);
    await resumeCycle(new Date(now.getTime() - 10 * MIN), new Date(due.getTime() - 60 * MIN)); // Karenzende = Start + 80 min
    await closeTournamentsAtDeadline(now);
    expect((await tOf(t.id)).status).toBe("cancelled");
    const notes = await db.select().from(notifications).where(eq(notifications.userId, o.id));
    expect(notes.some((n) => /Bezahlung war pausiert/.test(n.body))).toBe(true);
  });

  it("Frist VOR der Pause: keine Karenz, regulaere Absage", async () => {
    await clearSwitchAudits();
    const { t } = await unready();
    const due = (await chargeDueAt(db, await tOf(t.id)))!;
    const now = new Date(T0 + 4.9 * DAY);
    await resumeCycle(new Date(now.getTime() - 30_000), new Date(due.getTime() + 60 * MIN)); // Pause beginnt erst nach der Frist
    await closeTournamentsAtDeadline(now);
    expect((await tOf(t.id)).status).toBe("cancelled");
  });
});

describe("Turnier-Nachzahlfenster nach der Pause", () => {
  async function failedRow() {
    const { t, squads } = await unready();
    const victim = squads[0].captain;
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: victim.id, amountCents: 1000, status: "failed", failureCode: "card_declined", graceUntil: new Date(Date.now() - 60_000), idempotencyKey: `charge:t:${t.id}:${victim.id}:1:1` });
    return t;
  }

  it("Kontrolle (nie pausiert): Fenster abgelaufen -> Alles-oder-nichts-Absage", async () => {
    await clearSwitchAudits();
    const t = await failedRow();
    expect(await cancelTournamentsAfterWindow()).toBeGreaterThanOrEqual(1);
    expect((await tOf(t.id)).status).toBe("cancelled");
  });

  it("Fenster in der Pause abgelaufen: nach dem Wiedereinschalten 2 Stunden Karenz, dann die Absage", async () => {
    await clearSwitchAudits();
    const t = await failedRow();
    await resumeCycle(new Date(Date.now() - 30_000), new Date(Date.now() - 2 * 3_600_000));
    expect(await cancelTournamentsAfterWindow()).toBe(0);
    expect((await tOf(t.id)).status).not.toBe("cancelled");
    await cancelTournamentsAfterWindow(new Date(Date.now() + 2 * 3_600_000 + 5 * MIN));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });
});

describe("Mitteilung nach dem Wiedereinschalten (Turniere)", () => {
  /** Pause ueber die Frist hinweg (Zeitpunkte der Audit-Zeilen, Frist liegt in der Pause), danach die Mitteilung von Hand ausloesen (die automatische beim Einschalten sah die echte Uhr). */
  async function pauseAcrossDue(tid: string) {
    const due = (await chargeDueAt(db, await tOf(tid)))!;
    await resumeCycle(new Date(due.getTime() + 30_000), new Date(due.getTime() - 60 * MIN));
    return due;
  }

  it("nur wer noch handeln muss: Spieler OHNE Karte, die Captains dieser Teams und der Veranstalter; Spieler mit Karte, Fremde und Turniere mit Karten nichts; Neue Frist in Berliner Zeit, ohne Namen", async () => {
    await clearSwitchAudits();
    const { o, t, squads } = await unready();
    const withCard = squads[0].players[1];
    await db.insert(paymentProfiles).values({ userId: withCard.id, stripeCustomerId: `cus_wc_${withCard.id.slice(0, 8)}`, paymentMethodId: `pm_wc_${withCard.id.slice(0, 8)}` }).onConflictDoNothing();
    const allCards = await unready(true); // alle haben eine Karte: nichts zu melden
    const bystander = await makeUser("fremd");
    await pauseAcrossDue(t.id); // beide Turniere haben dieselbe Frist: die Pause liegt ueber beiden
    const info = (await resumeUntil())!;
    expect(await notifyResumedGames()).toBeGreaterThanOrEqual(1);
    const expected = berlinTime(info.until);
    const noCard = squads.flatMap((s) => s.players).filter((p) => p.id !== withCard.id);
    for (const p of noCard) {
      const notes = await resumeNotes(p.id);
      expect(notes.length).toBeGreaterThanOrEqual(1);
      expect(notes[0].body).toContain(`Neue Frist für das Turnier: ${expected}`);
      expect(notes[0].body).toContain(info.until.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })); // Berliner Zeit, unabhaengig berechnet
      expect(notes[0].body).not.toMatch(/Pausen-Cup|Turnier [A-Z]/); // keine Namen von Turnier, Teams oder Dritten
    }
    expect((await resumeNotes(o.id)).length).toBeGreaterThanOrEqual(1); // Veranstalter
    expect(await resumeNotes(withCard.id)).toHaveLength(0); // hat eine Karte (und ist weder Captain noch Veranstalter)
    expect(await resumeNotes(bystander.id)).toHaveLength(0);
    for (const p of allCards.squads.flatMap((s) => s.players)) expect(await resumeNotes(p.id)).toHaveLength(0); // alle mit Karte
    expect(await resumeNotes(allCards.o.id)).toHaveLength(0);
  });

  it("entprellt atomar je Turnier und Einschaltung: ein zweiter Lauf schreibt nichts nach", async () => {
    await clearSwitchAudits();
    const { o, t } = await unready();
    await pauseAcrossDue(t.id);
    await notifyResumedGames();
    const before = (await resumeNotes(o.id)).length;
    expect(before).toBeGreaterThanOrEqual(1);
    await Promise.all([notifyResumedGames(), notifyResumedGames()]);
    expect((await resumeNotes(o.id)).length).toBe(before);
  });

  it("Pause war vor der Frist zu Ende: keine Mitteilung", async () => {
    await clearSwitchAudits();
    const { o, t } = await unready();
    const due = (await chargeDueAt(db, await tOf(t.id)))!;
    await resumeCycle(new Date(due.getTime() - 3 * 3_600_000), new Date(due.getTime() - 4 * 3_600_000));
    await notifyResumedGames();
    expect(await resumeNotes(o.id)).toHaveLength(0);
  });

  it("Turnier ohne Preis: keine Mitteilung", async () => {
    await clearSwitchAudits();
    const { o, t } = await unready();
    await db.update(tournaments).set({ totalCents: 0 }).where(eq(tournaments.id, t.id));
    await pauseAcrossDue(t.id);
    await notifyResumedGames();
    expect(await resumeNotes(o.id)).toHaveLength(0);
  });
});

describe("Alarm: Turnier haengt in der Zahlungsphase (Start vorbei)", () => {
  it("Turnier in payment mit vergangenem Start und Preis: Alarm card:tournament-stuck (nur dieses); Turnier mit zukuenftigem Start nicht; ohne Preis nicht", async () => {
    const { getAlerts } = await import("@/server/finance");
    const stuck = await unready();
    const fine = await unready();
    await db.update(tournaments).set({ startsAt: new Date(Date.now() - 60 * MIN), status: "payment" }).where(eq(tournaments.id, stuck.t.id));
    const alerts = await getAlerts();
    expect(alerts.some((a) => a.code === `card:tournament-stuck:${stuck.t.id}` && a.severity === "high")).toBe(true);
    expect(alerts.some((a) => a.code === `card:tournament-stuck:${fine.t.id}`)).toBe(false);
    await db.update(tournaments).set({ totalCents: 0 }).where(eq(tournaments.id, stuck.t.id));
    expect((await getAlerts()).some((a) => a.code === `card:tournament-stuck:${stuck.t.id}`)).toBe(false);
  });
});
