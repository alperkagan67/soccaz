import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, paymentCharges, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { cancelTournamentsAfterWindow, closeTournamentsAtDeadline, createTournament, joinAsPlayer, registerTeam, setOrganizer, setRosterComplete } from "@/server/tournaments";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { setCardSwitch } from "@/server/payment-switch";
import { berlinTime } from "@/server/pause-notify";
import { lastResumeAt, RESUME_GRACE_MS } from "@/server/pause-resume";
import { setSetting } from "@/server/settings";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Turniere in der Pause (Zahlungen AN + Karte AUS): eingefroren, nie wegen der Frist abgesagt (auch wenn der Preis erst in der Pause festgelegt wurde, Snapshot leer); nach dem Wiedereinschalten Karenz
// (Wiedereinschalten + 2 Stunden, nie ueber den Start hinaus; sonst Absage mit Klartext).
let provider: FakeProvider;
let hall = "";
let owner: Awaited<ReturnType<typeof makeUser>> | undefined;
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
async function squad(tid: string) {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  for (let i = 1; i < 4; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
  }
  await setRosterComplete(captain.id, tid, true);
  return { captain, team };
}
/** Turnier in der Zahlungsphase, NICHT alle bereit (Karten fehlen): zur Frist faellt es im Kartenmodell aus. */
async function unready() {
  const o = await makeUser("org");
  const admin2 = await makeUser("adm2", "admin");
  await setOrganizer(admin2.id, o.id, true);
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  return { o, t, squads };
}
async function pauseAndResume(at: Date) {
  owner ??= await makeUser("ptadm", "owner");
  await setCardSwitch(owner.id, false, "Notabschaltung wegen Stoerung", true);
  await setCardSwitch(owner.id, true, "Stoerung behoben, alles geprueft", true);
  await db.execute(sql`update audit_log set at = ${at} where action = 'card_switch.on' and entity_id = 'card_payments_enabled'`);
}

describe("Turnier in der Pause", () => {
  it("Kontrolle (Karte AN): nicht alle bereit -> zur Frist abgesagt", async () => {
    const { t } = await unready();
    await closeTournamentsAtDeadline(new Date(T0 + 4.9 * DAY));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });

  it("Pause (Zahlungen AN, Karte AUS): dasselbe Turnier wird NICHT abgesagt; Preis in der Pause festgelegt (Snapshot leer) ebenso; nach dem Wiedereinschalten gilt die Frist wieder", async () => {
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
    const { t } = await unready();
    const now = new Date(T0 + 4.9 * DAY); // Frist (Start minus 48 h) ist laengst erreicht
    await pauseAndResume(new Date(now.getTime() - 30 * MIN));
    expect(await closeTournamentsAtDeadline(now)).toBe(0);
    expect((await tOf(t.id)).status).not.toBe("cancelled");
    await closeTournamentsAtDeadline(new Date(now.getTime() + 91 * MIN));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });

  it("Obergrenze: reicht die Karenz bis zum Start, gilt die bestehende Absageregel mit Klartext (nie stille Absage)", async () => {
    const { o, t } = await unready();
    const now = new Date(T0 + 5 * DAY - 30 * MIN);
    await pauseAndResume(new Date(now.getTime() - 30 * MIN)); // Karenzende = Start + 1 h
    await closeTournamentsAtDeadline(now);
    expect((await tOf(t.id)).status).toBe("cancelled");
    const notes = await db.select().from(notifications).where(eq(notifications.userId, o.id));
    expect(notes.some((n) => /Bezahlung war pausiert/.test(n.body) || /Bezahlung war pausiert/.test(n.title))).toBe(true);
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
    await db.execute(sql`delete from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`);
    const t = await failedRow();
    expect(await cancelTournamentsAfterWindow()).toBeGreaterThanOrEqual(1);
    expect((await tOf(t.id)).status).toBe("cancelled");
  });

  it("Fenster in der Pause abgelaufen: nach dem Wiedereinschalten 2 Stunden Karenz, dann die Absage", async () => {
    const t = await failedRow();
    await pauseAndResume(new Date());
    expect(await cancelTournamentsAfterWindow()).toBe(0);
    expect((await tOf(t.id)).status).not.toBe("cancelled");
    await cancelTournamentsAfterWindow(new Date(Date.now() + 2 * 3_600_000 + 5 * MIN));
    expect((await tOf(t.id)).status).toBe("cancelled");
  });
});

describe("Mitteilung an Veranstalter und Captains nach dem Wiedereinschalten", () => {
  it("Turnier mit Frist in den naechsten 2 Stunden: Veranstalter und Captains bekommen die neue Frist (Berliner Zeit, ohne Namen Dritter), je Einschaltung genau einmal; Spieler ohne Amt und Fremde nichts", async () => {
    await db.execute(sql`delete from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`); // frühere Tests dieser Datei haben Einschaltzeitpunkte in die Zukunft gelegt
    const o = await makeUser("orn");
    const admin2 = await makeUser("adm2n", "admin");
    await setOrganizer(admin2.id, o.id, true);
    // Start in 2,5 Stunden: Frist (Start minus 1 Stunde) in 1,5 Stunden, die Karenz (2 Stunden) verschiebt sie
    const t = await createTournament(o.id, { ...base, startsAt: new Date(Date.now() + 2.5 * 3_600_000), registrationDeadline: new Date(Date.now() + 1 * 3_600_000), venueId: hall });
    const squads = [];
    for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
    const later = await unready(); // Frist in rund 3 Tagen: durch die Karenz nichts verschoben
    const bystander = await makeUser("fremd");
    owner ??= await makeUser("ptadm", "owner");
    await setCardSwitch(owner.id, false, "Notabschaltung wegen Stoerung", true);
    await setCardSwitch(owner.id, true, "Stoerung behoben, alles geprueft", true);
    const resumeAt = (await lastResumeAt())!;
    const expected = berlinTime(new Date(resumeAt.getTime() + RESUME_GRACE_MS));
    for (const id of [o.id, ...squads.map((x) => x.captain.id)]) {
      const notes = (await db.select().from(notifications).where(eq(notifications.userId, id))).filter((n) => n.title === "Bezahlung ist wieder möglich");
      expect(notes).toHaveLength(1);
      expect(notes[0].body).toContain(expected);
      expect(notes[0].body).not.toMatch(/Pausen-Cup|Turnier [A-Z]/);
    }
    expect((await db.select().from(notifications).where(eq(notifications.userId, later.o.id))).filter((n) => n.title === "Bezahlung ist wieder möglich")).toHaveLength(0);
    expect((await db.select().from(notifications).where(eq(notifications.userId, bystander.id))).filter((n) => n.title === "Bezahlung ist wieder möglich")).toHaveLength(0);
    const { notifyResumedGames } = await import("@/server/pause-notify");
    await notifyResumedGames(); // zweiter Lauf derselben Einschaltung: nichts nachschreiben
    expect((await db.select().from(notifications).where(eq(notifications.userId, o.id))).filter((n) => n.title === "Bezahlung ist wieder möglich")).toHaveLength(1);
  });
});
