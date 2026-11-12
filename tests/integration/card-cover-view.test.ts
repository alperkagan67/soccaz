import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, paymentProfiles, stripeEvents } from "@/db/schema";
import { runCharges } from "@/server/payments/charge-run";
import { releaseCover, takeOverShare } from "@/server/payments/cover";
import { releaseOwnCover, takeOverAndNotify } from "@/server/payments/cover-flow";
import { notifyCoverReleased, notifyCoverTaken } from "@/server/payments/cover-notify";
import { getCoverView } from "@/server/payments/cover-view";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-3b: Daten der Lobby-Seite für "Anteil übernehmen" je Betrachter (cover-view.ts) und die Benachrichtigungen (cover-notify.ts).
// Wer sieht was: Plan docs/design/m3c-3b-plan.md, Abschnitte 3 bis 7. Der Übernehmer kommt in der Aktion immer aus der Sitzung; hier wird die Domäne direkt geprüft.

beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_cvv_%"));
});
beforeEach(async () => {
  setPaymentProviderForTests(new FakeProvider());
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
type User = Awaited<ReturnType<typeof addPlayer>>;

/** Kartenspiel mit 10 Plätzen (Heim: adminA + 4, Gast: adminB + 4), alle mit Karte AUSSER a (Heim, keine Karte). b und c (Heim) haben Karte. Anteil fixiert. */
async function game(o: { hoursAhead?: number } = {}) {
  const m = await makeMatch({ hoursAhead: o.hoursAhead ?? 72, priceCents: 8000, costCents: 8000 });
  const all: User[] = [m.adminA, m.adminB];
  while (all.length < 10) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  const [a, b, c] = [all[2], all[4], all[6]]; // alle Heim
  const away = all[3];
  for (const p of all) {
    if (p.id === a.id) continue;
    await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_cvv"), paymentMethodId: nid("pm_cvv") });
  }
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, a.id)));
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: 800, status: "confirmed" }).where(eq(matches.id, m.match.id));
  return { ...m, all, a, b, c, away };
}
type G = Awaited<ReturnType<typeof game>>;

const as = (g: G, u: User | null, extra: { platformAdmin?: boolean; adminOf?: string[] } = {}) => getCoverView(g.match.id, { userId: u?.id ?? null, platformAdmin: extra.platformAdmin ?? false, adminOf: extra.adminOf ?? [] });
const mails = async (u: User) => (await db.select().from(notifications).where(eq(notifications.userId, u.id))).map((n) => ({ title: n.title, body: n.body }));

describe("getCoverView: vor der Übernahme", () => {
  it("B (Karte, gleiches Team) bekommt den Knopf bei A; Gast, Mitspieler des anderen Teams und Spieler ohne Karte nicht", async () => {
    const g = await game();
    expect((await as(g, g.b)).canCover).toEqual([g.a.id]);
    expect((await as(g, g.c)).canCover).toEqual([g.a.id]);
    expect((await as(g, g.away)).canCover).toEqual([]); // anderes Team (Teamspiel), A ist dort kein Teammitglied
    expect((await as(g, g.a)).canCover).toEqual([]); // A hat keine Karte
    expect(await as(g, null)).toEqual({ canCover: [], covering: null, releasable: false, covered: false, pairs: [] }); // Gast: nichts
  });

  it("Kartenmodell AUS: nirgends ein Knopf", async () => {
    const g = await game();
    await setSetting(null, "card_payments_enabled", false);
    expect((await as(g, g.b)).canCover).toEqual([]);
    await setSetting(null, "card_payments_enabled", true);
  });

  it("Spiel nicht mehr offen (abgesagt oder gestartet): spielweit kein Knopf", async () => {
    const g = await game();
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, g.match.id));
    expect((await as(g, g.b)).canCover).toEqual([]);
    const past = await game({ hoursAhead: -1 });
    expect((await as(past, past.b)).canCover).toEqual([]);
  });
});

describe("getCoverView: nach der Übernahme, je Betrachter", () => {
  it("B sieht die Übernahme und darf zurücknehmen; A sieht nur 'wird übernommen'; ein Dritter sieht NICHTS; der Captain sieht das Paar; der andere Captain nicht", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    expect(await as(g, g.b)).toEqual({ canCover: [], covering: g.a.id, releasable: true, covered: false, pairs: [] });
    expect(await as(g, g.a)).toEqual({ canCover: [], covering: null, releasable: false, covered: true, pairs: [] });
    expect(await as(g, g.c)).toEqual({ canCover: [], covering: null, releasable: false, covered: false, pairs: [] }); // Dritter: weder Knopf (ein Platz einmal) noch Paar
    expect(await as(g, g.away)).toEqual({ canCover: [], covering: null, releasable: false, covered: false, pairs: [] });
    expect((await as(g, g.adminA, { adminOf: [g.home.id] })).pairs).toEqual([{ targetUserId: g.a.id, payerUserId: g.b.id }]);
    expect((await as(g, g.adminB, { adminOf: [g.away.id] })).pairs).toEqual([]); // Captain des anderen Teams
    expect((await as(g, null, { platformAdmin: true })).pairs).toEqual([{ targetUserId: g.a.id, payerUserId: g.b.id }]);
  });

  it("jeder Platz einmal und ein Platz je Übernehmer: weder C noch B bekommen einen Knopf bei A", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    expect((await as(g, g.c)).canCover).toEqual([]);
    expect((await as(g, g.b)).canCover).toEqual([]);
  });

  it("Zurücknehmen bringt den Knopf zurück, A ist wieder offen", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    await releaseCover(g.b.id, g.match.id);
    expect((await as(g, g.b)).covering).toBeNull();
    expect((await as(g, g.a)).covered).toBe(false);
    expect((await as(g, g.c)).canCover).toEqual([g.a.id]);
  });

  it("nach dem Anlegen der Abbuchungszeilen: spielweit kein Knopf mehr (auch kein Zurücknehmen), die Übernahme bleibt sichtbar", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    const r = await runCharges(g.match.id, new Date(), {});
    expect(r.created).toBeGreaterThan(0);
    const b = await as(g, g.b);
    expect(b.canCover).toEqual([]);
    expect(b.releasable).toBe(false); // Zeilen existieren: nicht mehr zurücknehmbar
    expect(b.covering).toBe(g.a.id);
    for (const u of [g.c, g.away, g.a]) expect((await as(g, u)).canCover, u.id).toEqual([]);
  });
});

describe("Benachrichtigungen (cover-notify): nur A, B und Captain", () => {
  it("Übernahme: A neutral (ohne Namen von B), B Beleg mit Betrag, Captain mit beiden Namen; ein Dritter bekommt nichts", async () => {
    const g = await game();
    await notifyCoverTaken(g.match.id, g.b.id, g.a.id, 800);
    const [ma, mb, mc, mAdmin, mAway] = await Promise.all([mails(g.a), mails(g.b), mails(g.c), mails(g.adminA), mails(g.away)]);
    expect(ma.map((n) => n.title)).toEqual(["Dein Anteil wird übernommen"]);
    expect(ma[0].body).not.toContain(g.b.name); // A erfährt den Namen nicht
    expect(mb.map((n) => n.title)).toEqual(["Du übernimmst einen Anteil"]);
    expect(mb[0].body).toContain("8,00");
    expect(mAdmin.map((n) => n.title)).toEqual(["Anteil übernommen"]);
    expect(mAdmin[0].body).toContain(g.b.name);
    expect(mAdmin[0].body).toContain(g.a.name);
    expect(mc).toEqual([]); // Dritter: nichts
    expect(mAway).toEqual([]);
  });

  it("Zurücknehmen: A und Captain, nicht B (eigene Aktion) und kein Dritter", async () => {
    const g = await game();
    await notifyCoverReleased(g.match.id, g.b.id, g.a.id);
    expect((await mails(g.a)).map((n) => n.title)).toEqual(["Dein Anteil wird nicht mehr übernommen"]);
    expect((await mails(g.adminA)).map((n) => n.title)).toEqual(["Übernahme zurückgenommen"]);
    expect(await mails(g.b)).toEqual([]);
    expect(await mails(g.c)).toEqual([]);
  });

  it("kein Text nennt einen Fehlschlag oder Grund (AC-20) und alle verweisen auf die Lobby", async () => {
    const g = await game();
    await notifyCoverTaken(g.match.id, g.b.id, g.a.id, null);
    await notifyCoverReleased(g.match.id, g.b.id, g.a.id);
    const all = (await Promise.all([g.a, g.b, g.adminA].map(mails))).flat();
    expect(all.length).toBeGreaterThan(0);
    for (const n of all) expect(`${n.title} ${n.body}`).not.toMatch(/fehlgeschlagen|abgelehnt|declined|insufficient/i);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, g.a.id));
    for (const r of rows) expect(r.url).toBe(`/lobby/${g.match.id}`);
  });

  it("gesperrte Nutzer bekommen keine Nachricht, ein Fehler beim Benachrichtigen wirft nie", async () => {
    const g = await game();
    await expect(notifyCoverTaken("00000000-0000-0000-0000-000000000000", g.b.id, g.a.id, 800)).resolves.toBeUndefined();
    await expect(notifyCoverReleased("kein-uuid", g.b.id, g.a.id)).resolves.toBeUndefined();
  });
});

// Security-Review R-T181 (MITTEL): Die Empfänger kommen nur aus dem Ergebnis der Domäne, nie aus einem Wert des Clients. Zurücknehmen kennt kein Ziel-Argument mehr.
describe("Eintragen/Zurücknehmen mit Benachrichtigung (cover-flow)", () => {
  const nobody = async (g: G, users: User[]) => {
    for (const u of users) expect(await mails(u), u.id).toEqual([]);
  };

  it("Zurücknehmen benachrichtigt NUR den Platz, dessen Übernahme wirklich zurückgenommen wurde, und dessen Captain; Dritte, B und der andere Captain nichts", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    const target = await releaseOwnCover(g.b.id, g.match.id);
    expect(target).toBe(g.a.id);
    expect((await mails(g.a)).map((n) => n.title)).toEqual(["Dein Anteil wird nicht mehr übernommen"]);
    expect((await mails(g.adminA)).map((n) => n.title)).toEqual(["Übernahme zurückgenommen"]);
    await nobody(g, [g.b, g.c, g.away, g.adminB]);
  });

  it("Zurücknehmen hat kein Ziel-Argument (nur Übernehmer und Spiel): ein Wert vom Client kann nie Empfänger werden", () => {
    expect(releaseOwnCover.length).toBe(2);
  });

  it("wer nichts übernimmt, kann nichts zurücknehmen: Fehler und KEINE Nachricht an irgendjemanden (kein Spam, kein Namensleck)", async () => {
    const g = await game();
    await expect(releaseOwnCover(g.c.id, g.match.id)).rejects.toThrow(/keinen Anteil/); // c übernimmt nichts
    await expect(releaseOwnCover(g.away.id, g.match.id)).rejects.toThrow(/keinen Anteil/);
    await nobody(g, [g.a, g.b, g.c, g.away, g.adminA, g.adminB]);
  });

  it("ein Übernehmer kann nach seiner Rücknahme nicht noch einmal Nachrichten auslösen (zweiter Aufruf: Fehler, keine weitere Nachricht)", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    await releaseOwnCover(g.b.id, g.match.id);
    const before = (await mails(g.a)).length;
    await expect(releaseOwnCover(g.b.id, g.match.id)).rejects.toThrow(/keinen Anteil/);
    expect((await mails(g.a)).length).toBe(before);
  });

  it("Übernehmen: ohne Einwilligung Fehler und keine Nachricht; mit Einwilligung Nachricht an A, B und Captain, nie an Dritte", async () => {
    const g = await game();
    await expect(takeOverAndNotify(g.b.id, g.match.id, g.a.id, false)).rejects.toThrow(/Mandat/);
    await nobody(g, [g.a, g.b, g.c, g.adminA]);
    await takeOverAndNotify(g.b.id, g.match.id, g.a.id, true);
    expect((await mails(g.a)).map((n) => n.title)).toEqual(["Dein Anteil wird übernommen"]);
    expect((await mails(g.b)).map((n) => n.title)).toEqual(["Du übernimmst einen Anteil"]);
    expect((await mails(g.adminA)).map((n) => n.title)).toEqual(["Anteil übernommen"]);
    await nobody(g, [g.c, g.away, g.adminB]);
  });

  it("Übernehmen mit fremdem Ziel (Platz mit Karte, anderes Team): Fehler, keine Nachricht an diesen Spieler", async () => {
    const g = await game();
    await expect(takeOverAndNotify(g.b.id, g.match.id, g.away.id, true)).rejects.toThrow();
    await expect(takeOverAndNotify(g.b.id, g.match.id, g.c.id, true)).rejects.toThrow();
    await nobody(g, [g.away, g.c, g.a, g.b, g.adminA, g.adminB]);
  });
});
