import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, paymentCharges } from "@/db/schema";
import { abortDeadline, dueWithGrace, fixDeadline, hasLongLead } from "@/lib/deadlines";
import { berlinTime, notifyResumedGames } from "@/server/pause-notify";
import { resumeUntil } from "@/server/pause-resume";
import { setSetting } from "@/server/settings";
import { leadStart } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";
import { resumeCycle } from "./pause-helpers";

// Nach dem Wiedereinschalten: wer noch handeln muss (Spieler OHNE Karte, ihre Captains) erfaehrt die neue Frist (Typ payment, ohne Namen Dritter, Berliner Zeit) -- nur fuer Spiele, deren Frist in der Pause
// ablief und durch die Karenz verschoben wird, im Kartenmodell, nicht kostenlos, nicht abrechnungsgebunden, ohne Abbuchungszeilen.
beforeEach(async () => {
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
  await db.execute(sql`delete from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const notesOf = async (userId: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "payment")))).filter((n) => n.title === "Bezahlung ist wieder möglich");
type Match = Awaited<ReturnType<typeof makeMatch>>;
/** Spiel mit langem Vorlauf (Frist = Anstoss minus 48 h, in der Zukunft): die Pause wird ueber die Frist gelegt (Zeitpunkte der Audit-Zeilen), danach loest der Test die Mitteilung selbst aus. */
async function longGame(opts: { priceCents?: number; legacy?: boolean } = {}): Promise<Match & { due: Date }> {
  const m = await makeMatch({ hoursAhead: 72, priceCents: opts.priceCents ?? 6000, costCents: opts.priceCents ?? 6000, legacy: opts.legacy });
  const [row] = await db.select().from(matches).where(eq(matches.id, m.match.id));
  const payOpenAt = await leadStart(db, row);
  const due = dueWithGrace(hasLongLead(row.startsAt, payOpenAt) ? fixDeadline(row.startsAt) : abortDeadline(row.startsAt), payOpenAt, row.startsAt, row.createdAt);
  return { ...m, due };
}
const pauseAcross = (due: Date) => resumeCycle(new Date(due.getTime() + 30_000), new Date(due.getTime() - 3_600_000));

describe("Mitteilung nach dem Wiedereinschalten (Spiele)", () => {
  it("nur wer noch handeln muss: Spieler OHNE Karte und die Captains dieser Teams; Spieler mit Karte, Fremde nichts; Text mit neuer Frist in Berliner Zeit, ohne Namen", async () => {
    const g = await longGame();
    const noCard = await addPlayer(g.match.id, g.home.id);
    const withCard = await addPlayer(g.match.id, g.away.id);
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, withCard.id)));
    const outsider = await makeUser("fremd");
    await pauseAcross(g.due);
    const info = (await resumeUntil())!;
    expect(await notifyResumedGames()).toBeGreaterThanOrEqual(1);
    const expected = berlinTime(info.until);
    const n = await notesOf(noCard.id);
    expect(n).toHaveLength(1);
    expect(n[0].body).toContain(`Neue Frist: ${expected}`);
    expect(n[0].body).toContain(info.until.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })); // Berliner Zeit, unabhaengig berechnet
    expect(n[0].body).not.toMatch(/Heim|Gast|E2E/); // keine Namen von Teams oder Dritten
    expect(await notesOf(g.adminA.id)).toHaveLength(1); // Captain des Teams mit fehlender Karte
    expect(await notesOf(withCard.id)).toHaveLength(0); // hat eine Karte
    expect(await notesOf(outsider.id)).toHaveLength(0);
  });

  it("Ausschluesse (je ein Spiel): kostenlos, mit Abbuchungszeilen, Guthaben im Platz, Altspiel, alle mit Karte: keine Mitteilung", async () => {
    const free = await longGame({ priceCents: 0 });
    const charged = await longGame();
    await db.insert(paymentCharges).values({ matchId: charged.match.id, userId: charged.adminA.id, amountCents: 1000, status: "succeeded", idempotencyKey: `charge:${charged.match.id}:${charged.adminA.id}:pn` });
    const guthaben = await longGame(); // Platz mit Guthaben (paid_cents > 0, Altmodell): kein Kartenmodell
    await db.update(matchParticipants).set({ paidCents: 800 }).where(and(eq(matchParticipants.matchId, guthaben.match.id), eq(matchParticipants.userId, guthaben.adminA.id)));
    const legacy = await longGame({ legacy: true });
    const allCards = await longGame();
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, allCards.match.id));
    await pauseAcross(free.due);
    await notifyResumedGames();
    for (const g of [free, charged, guthaben, legacy, allCards]) {
      expect(await notesOf(g.adminA.id)).toHaveLength(0);
      expect(await notesOf(g.adminB.id)).toHaveLength(0);
    }
  });

  it("abrechnungsgebunden (Anteil fixiert, noch keine Abbuchungszeilen): die Frist-Regel gilt bei eingeschalteten Zahlungen trotzdem (Karenz), also bekommen die Spieler ohne Karte die Mitteilung", async () => {
    const g = await longGame();
    await db.update(matches).set({ finalShareCents: 1500 }).where(eq(matches.id, g.match.id));
    await pauseAcross(g.due);
    await notifyResumedGames();
    expect(await notesOf(g.adminA.id)).toHaveLength(1);
  });

  it("Frist nicht in der Pause abgelaufen oder Karenz reicht bis zum Anstoss: keine 'neue Frist'", async () => {
    const g = await longGame();
    await resumeCycle(new Date(g.due.getTime() - 3 * 3_600_000), new Date(g.due.getTime() - 4 * 3_600_000)); // Pause war vor der Frist zu Ende
    await notifyResumedGames();
    expect(await notesOf(g.adminA.id)).toHaveLength(0);
    const short = await makeMatch({ hoursAhead: 1.5, priceCents: 6000, costCents: 6000 }); // Abbruchfrist (Anstoss minus 1 h) in der Pause, Karenz reicht bis zum Anstoss
    const [row] = await db.select().from(matches).where(eq(matches.id, short.match.id));
    const abortAt = abortDeadline(row.startsAt);
    await resumeCycle(new Date(abortAt.getTime() + 60_000), new Date(abortAt.getTime() - 3_600_000));
    await notifyResumedGames();
    expect(await notesOf(short.adminA.id)).toHaveLength(0);
  });

  it("entprellt je Spiel und Einschaltung (auch parallel); eine neue Einschaltung meldet erneut; nach Ablauf der Karenz nichts mehr", async () => {
    const g = await longGame();
    await pauseAcross(g.due);
    await Promise.all([notifyResumedGames(), notifyResumedGames()]);
    expect(await notesOf(g.adminA.id)).toHaveLength(1);
    await notifyResumedGames();
    expect(await notesOf(g.adminA.id)).toHaveLength(1);
    await resumeCycle(new Date(g.due.getTime() + 5 * 60_000), new Date(g.due.getTime() - 30 * 60_000)); // zweite Pause ueber die Frist (neue Einschaltung)
    await db.execute(sql`delete from audit_log where action = 'card_switch.on' and at < ${new Date(g.due.getTime() + 60_000)}`); // nur die neue Einschaltung zaehlt
    await notifyResumedGames();
    expect((await notesOf(g.adminA.id)).length).toBeGreaterThanOrEqual(1);
    // Karenz vorbei: nichts mehr
    const info = (await resumeUntil())!;
    expect(await notifyResumedGames(new Date(info.until.getTime() + 60_000))).toBe(0);
  });

  it("Flattern des Schalters: eine zweite Pause nach der Frist (D nicht darin) loest keine zweite Mitteilung aus (Marke je Frist, nicht je Einschaltung)", async () => {
    const g = await longGame();
    await pauseAcross(g.due);
    await notifyResumedGames();
    expect(await notesOf(g.adminA.id)).toHaveLength(1);
    await resumeCycle(new Date(g.due.getTime() + 40 * 60_000), new Date(g.due.getTime() + 30 * 60_000)); // zweite Pause, D liegt nicht darin
    await notifyResumedGames();
    expect(await notesOf(g.adminA.id)).toHaveLength(1);
  });

  it("Begrenzung: mit Limit 1 bekommt je Aufruf nur ein Spiel die Mitteilung, der Rest kommt beim naechsten Aufruf (Job)", async () => {
    const a = await longGame();
    const b = await longGame();
    await pauseAcross(a.due);
    const first = await notifyResumedGames(new Date(), { limit: 1 });
    expect(first).toBe(1);
    for (let i = 0; i < 20 && (await notifyResumedGames(new Date(), { limit: 1 })) > 0; i++); // der Job holt den Rest nach (je Aufruf eines)
    expect(await notesOf(a.adminA.id)).toHaveLength(1);
    expect(await notesOf(b.adminA.id)).toHaveLength(1);
  });

  it("ohne Audit-Eintrag (nie wieder eingeschaltet) und bei Pause (Karte AUS) keine Mitteilung", async () => {
    const g = await longGame();
    expect(await notifyResumedGames()).toBe(0);
    await pauseAcross(g.due);
    await setSetting(null, "card_payments_enabled", false);
    expect(await notifyResumedGames()).toBe(0);
    expect(await notesOf(g.adminA.id)).toHaveLength(0);
  });
});
