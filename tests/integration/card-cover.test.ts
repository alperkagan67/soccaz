import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, notifications, paymentCharges, paymentProfiles, paymentRefunds, stripeEvents } from "@/db/schema";
import { ledgerEntries, receipts } from "@/db/schema-finance";
import { trialBalance } from "@/server/ledger";
import { getAuthorizationSecret, listOpenAuthorizations } from "@/server/payments/authorize";
import { getCardDisplays, getTeamCardsReady } from "@/server/payments/card-status";
import { retryChargesInWindow } from "@/server/payments/charge-retry";
import { runCharges } from "@/server/payments/charge-run";
import { releaseCover, takeOverShare } from "@/server/payments/cover";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { requestMatchCancel } from "@/server/payments/refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { COVER_MANDATE_KEY } from "@/lib/cover";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-3a: "Anteil uebernehmen" (AC-13/AC-14), Variante B. Spieler B (Karte) uebernimmt den Anteil des Platzes von Spieler A (keine Karte). Die Zeile bleibt A's,
// payer_user_id = B, der PaymentIntent liegt beim Kunden von B, die Erstattung geht auf diesen PaymentIntent.

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_cv_%"));
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_cv_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type User = Awaited<ReturnType<typeof addPlayer>>;
/**
 * Kartenspiel mit 10 Plaetzen (Heim: adminA + 4, Gast: adminB + 4), alle mit Karte AUSSER `a` (Heim, keine Karte, kein Profil). `b` (Heim) hat Karte.
 * Beide Captains bereit, Anteil fixiert (800 Cent): bereit zum Abbuchen, sobald a gedeckt ist.
 */
async function game(o: { hoursAhead?: number } = {}) {
  const m = await makeMatch({ hoursAhead: o.hoursAhead ?? 72, priceCents: 8000, costCents: 8000 });
  const all: User[] = [m.adminA, m.adminB];
  while (all.length < 10) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  const a = all[2]; // Heim
  const b = all[4]; // Heim
  const away = all[3]; // Gast
  const customers = new Map<string, string>();
  for (const p of all) {
    if (p.id === a.id) continue; // a hat keine Karte
    const c = nid("cus_cv");
    customers.set(p.id, c);
    await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: c, paymentMethodId: nid("pm_cv") });
  }
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, a.id)));
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: 800, status: "confirmed" }).where(eq(matches.id, m.match.id));
  return { ...m, all, a, b, away, customers };
}
type G = Awaited<ReturnType<typeof game>>;

const seatOf = async (g: G, u: User) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, u.id))))[0];
const rowsOf = (g: G) => db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id));
const rowOf = async (g: G, u: User) => (await rowsOf(g)).find((r) => r.userId === u.id)!;
const piCalls = () => provider.calls.filter((c) => c.method === "createPaymentIntent");
const auditCount = async (action: string, matchId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, matchId)))).length;
const NOT_POSSIBLE = /nicht übernehmen/;

describe("Uebernahme eintragen und zuruecknehmen", () => {
  it("B (Karte, gleiches Team) uebernimmt den roten Platz von A: Eintrag mit Mandatszusatz-Schluessel und Zeitpunkt, Audit; A bleibt rot (zahlt nichts)", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    const s = await seatOf(g, g.a);
    expect(s.coveredByUserId).toBe(g.b.id);
    expect(s.coverMandateText).toBe(COVER_MANDATE_KEY);
    expect(s.coverAcceptedAt).not.toBeNull();
    expect(s.cardStatus).toBe("none");
    expect(await auditCount("cover.taken", g.match.id)).toBe(1);
    expect(await rowsOf(g)).toHaveLength(0); // nichts abgebucht, nicht sofort
    expect(piCalls()).toHaveLength(0);
  });

  it("Ablehnungen: ohne Mandatszusatz, eigener Platz, B ohne Karte, anderes Team, A hat eine Karte, kein Teilnehmer, ungueltige IDs", async () => {
    const g = await game();
    await expect(takeOverShare(g.b.id, g.match.id, g.a.id, false)).rejects.toThrow(/Mandat/);
    await expect(takeOverShare(g.a.id, g.match.id, g.a.id, true)).rejects.toThrow(NOT_POSSIBLE);
    await expect(takeOverShare(g.away.id, g.match.id, g.a.id, true)).rejects.toThrow(NOT_POSSIBLE); // anderes Team (Teamspiel)
    await expect(takeOverShare(g.b.id, g.match.id, g.all[6].id, true)).rejects.toThrow(NOT_POSSIBLE); // A hat Karte
    await expect(takeOverShare(g.a.id, g.match.id, g.b.id, true)).rejects.toThrow(); // A hat selbst keine Karte
    const stranger = await addPlayer(g.match.id, g.home.id, "cvx");
    await db.delete(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, stranger.id)));
    await expect(takeOverShare(stranger.id, g.match.id, g.a.id, true)).rejects.toThrow(NOT_POSSIBLE);
    await expect(takeOverShare(g.b.id, "kein-uuid", g.a.id, true)).rejects.toThrow(NOT_POSSIBLE);
    await expect(takeOverShare(g.b.id, g.match.id, "kein-uuid", true)).rejects.toThrow(NOT_POSSIBLE);
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    await expect(takeOverShare(g.b.id, g.match.id, g.a.id, true)).rejects.toThrow(/eigene|Karte/); // B ohne Karte
    expect((await seatOf(g, g.a)).coveredByUserId).toBeNull();
  });

  it("ein Platz je Uebernehmer, ein Uebernehmer je Platz, keine Kette", async () => {
    const g = await game();
    const a2 = g.all[6]; // Heim, wird auch rot
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, a2.id)));
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    await expect(takeOverShare(g.b.id, g.match.id, a2.id, true)).rejects.toThrow(/schon einen Anteil/); // ein Platz je Uebernehmer
    const c = g.all[8]; // Heim, Karte
    await expect(takeOverShare(c.id, g.match.id, g.a.id, true)).rejects.toThrow(/schon übernommen/); // ein Uebernehmer je Platz
    // Kette: a2 ist rot und hat B als Zahler?  Hier: B soll nicht selbst uebernommen werden koennen
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    await expect(takeOverShare(c.id, g.match.id, g.b.id, true)).resolves.toBeUndefined(); // B (rot) darf von C uebernommen werden
    // ... dann ist die Uebernahme von A durch B ungueltig (B hat keine Karte mehr / ist selbst uebernommen): A wird nicht doppelt gedeckt
    const { chargeEligibility } = await import("@/server/payments/charge-run");
    const [match] = await db.select().from(matches).where(eq(matches.id, g.match.id));
    const e = await db.transaction((tx) => chargeEligibility(tx, match, new Date()));
    expect(e.reason).toBe("cards_missing");
  });

  it("Zuruecknehmen nur durch den Uebernehmer und nur bis zur Frist; danach (Zeilen angelegt) nicht mehr", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    await expect(releaseCover(g.away.id, g.match.id)).rejects.toThrow(/keinen Anteil/);
    await expect(releaseCover(g.a.id, g.match.id)).rejects.toThrow(/keinen Anteil/); // der Platzhalter selbst nimmt nichts zurueck
    await releaseCover(g.b.id, g.match.id);
    const s = await seatOf(g, g.a);
    expect(s).toMatchObject({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null });
    expect(await auditCount("cover.released", g.match.id)).toBe(1);
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    provider.setChargeOutcome(g.away.id, "declined"); // ein anderer Spieler scheitert: das Spiel ist NICHT abgerechnet, aber die Zeilen stehen
    await runCharges(g.match.id);
    expect((await rowsOf(g)).length).toBe(10);
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].settledAt).toBeNull();
    await expect(releaseCover(g.b.id, g.match.id)).rejects.toThrow(/nicht mehr/);
    await expect(takeOverShare(g.b.id, g.match.id, g.a.id, true)).rejects.toThrow(NOT_POSSIBLE);
  });

  it("nach Ablauf des Countdowns 'Lobby schliesst' (langer Vorlauf) und bei abgesagtem Spiel oder Kartenmodell AUS keine Uebernahme", async () => {
    const g = await game({ hoursAhead: 40 });
    await db.update(matches).set({ createdAt: new Date(Date.now() - 100 * 3_600_000) }).where(eq(matches.id, g.match.id));
    await expect(takeOverShare(g.b.id, g.match.id, g.a.id, true)).rejects.toThrow(NOT_POSSIBLE); // 40 h vor Anstoss, angelegt vor 100 h: Frist (48 h) vorbei
    const h = await game();
    await db.update(matches).set({ cancelRequestedAt: new Date() }).where(eq(matches.id, h.match.id));
    await expect(takeOverShare(h.b.id, h.match.id, h.a.id, true)).rejects.toThrow(NOT_POSSIBLE);
    const k = await game();
    await setSetting(null, "card_payments_enabled", false);
    await expect(takeOverShare(k.b.id, k.match.id, k.a.id, true)).rejects.toThrow(NOT_POSSIBLE);
  });

  it("Datenbank: kein Selbst-Eintrag, Einwilligung gehoert zum Eintrag, ein Platz je Uebernehmer (Index)", async () => {
    const g = await game();
    const upd = (userId: string, set: Record<string, unknown>) => db.update(matchParticipants).set(set).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, userId)));
    await expect(upd(g.a.id, { coveredByUserId: g.a.id, coverAcceptedAt: new Date() })).rejects.toThrow();
    await expect(upd(g.a.id, { coveredByUserId: g.b.id })).rejects.toThrow(); // ohne Einwilligungszeitpunkt
    await upd(g.a.id, { coveredByUserId: g.b.id, coverAcceptedAt: new Date(), coverMandateText: COVER_MANDATE_KEY });
    await expect(upd(g.all[6].id, { coveredByUserId: g.b.id, coverAcceptedAt: new Date() })).rejects.toThrow(); // zweiter Platz desselben Uebernehmers
    await expect(db.update(paymentCharges).set({ payerUserId: g.a.id }).where(eq(paymentCharges.matchId, g.match.id))).resolves.toBeDefined(); // keine Zeilen: nichts betroffen
  });
});

describe("Abbuchung ueber den Kunden des Zahlers", () => {
  it("A's Zeile bleibt A's, payer_user_id = B, PaymentIntent beim Kunden von B mit den Metadaten des Platzes; Spiel gebucht, B bekommt EINEN Beleg ueber beide Posten", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    const r = await runCharges(g.match.id);
    expect(r).toMatchObject({ reason: "ready", created: 10, attempted: 10, settled: true });
    const aRow = await rowOf(g, g.a);
    expect(aRow).toMatchObject({ userId: g.a.id, payerUserId: g.b.id, amountCents: 800, status: "succeeded" });
    expect((await rowOf(g, g.b)).payerUserId).toBeNull();
    const call = piCalls().find((c) => (c.args as { metadata: { userId: string } }).metadata.userId === g.a.id)!;
    expect(call.args).toMatchObject({ customerId: g.customers.get(g.b.id), amountCents: 800, metadata: { matchId: g.match.id, userId: g.a.id } });
    expect((await seatOf(g, g.a)).cardStatus).toBe("charged");
    const rc = await db.select().from(receipts).where(eq(receipts.matchId, g.match.id));
    expect(rc).toHaveLength(9); // 9 Zahler (A zahlt nicht selbst)
    expect(rc.find((x) => x.userId === g.b.id)!.amountCents).toBe(1600);
    expect(rc.some((x) => x.userId === g.a.id)).toBe(false);
    expect((await trialBalance()).balanced).toBe(true);
    const shares = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id))).filter((e) => e.kind === "match_share");
    expect(shares).toHaveLength(10);
  });

  it("Frist: ist B zur Frist nicht mehr bereit, verfaellt die Uebernahme (kein Zahler gesetzt, nichts angelegt, A bleibt rot)", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    const r = await runCharges(g.match.id);
    expect(r).toMatchObject({ reason: "cards_missing", created: 0, attempted: 0 });
    expect(await rowsOf(g)).toHaveLength(0);
    expect(piCalls()).toHaveLength(0);
  });

  it("Frist: B nicht mehr eingeteilt => Uebernahme verfaellt; hat A inzwischen selbst eine Karte, zahlt A selbst (kein Zahler)", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    await db.update(matchParticipants).set({ teamId: null }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    expect((await runCharges(g.match.id)).reason).toBe("cards_missing");
    await db.update(matchParticipants).set({ teamId: g.home.id }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    const c = nid("cus_cv_a");
    await db.insert(paymentProfiles).values({ userId: g.a.id, stripeCustomerId: c, paymentMethodId: nid("pm_cv_a") });
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.a.id)));
    expect((await runCharges(g.match.id)).reason).toBe("ready");
    expect((await rowOf(g, g.a)).payerUserId).toBeNull();
    const call = piCalls().find((x) => (x.args as { metadata: { userId: string } }).metadata.userId === g.a.id)!;
    expect(call.args).toMatchObject({ customerId: c });
  });
});

describe("Webhook: Kunden- und Betragsabgleich mit dem Zahler (Auflage 1)", () => {
  async function pending() {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    provider.setChargeOutcome(g.a.id, "processing"); // PaymentIntent gebunden, Ergebnis kommt per Webhook
    await runCharges(g.match.id);
    const row = await rowOf(g, g.a);
    return { g, row };
  }
  const send = (g: G, row: { paymentIntentId: string | null }, over: Record<string, unknown> = {}, type = "payment_intent.succeeded") => {
    const object = { id: row.paymentIntentId, amount: 800, currency: "eur", customer: g.customers.get(g.b.id), metadata: { matchId: g.match.id, userId: g.a.id }, ...over };
    const e = provider.signEvent({ id: nid("evt_cv"), type, object });
    return handleStripeWebhook(e.rawBody, e.signature);
  };

  it("Kunde des ZAHLERS wird gebucht; A's eigener oder ein fremder Kunde wird abgelehnt (nichts gebucht)", async () => {
    const { g, row } = await pending();
    expect(row.status).toBe("pending");
    await send(g, row, { customer: g.customers.get(g.all[3].id) }); // fremder Kunde
    await send(g, row, { customer: nid("cus_fremd") });
    await send(g, row, { customer: null });
    expect((await rowOf(g, g.a)).status).toBe("pending");
    const ignored = await db.select().from(auditLog).where(and(eq(auditLog.action, "charge.ignored"), eq(auditLog.entityId, row.paymentIntentId!)));
    expect(ignored.map((x) => (x.after as { reason: string }).reason)).toEqual(["customer_mismatch", "customer_mismatch", "customer_mismatch"]);
    await send(g, row, { amount: 801 });
    expect((await rowOf(g, g.a)).status).toBe("pending"); // Betrag falsch
    await send(g, row); // Kunde von B, richtiger Betrag
    expect((await rowOf(g, g.a)).status).toBe("succeeded");
    expect((await seatOf(g, g.a)).cardStatus).toBe("charged");
  });

  it("Metadaten: userId muss der PLATZ (A) sein, nicht der Zahler", async () => {
    const { g, row } = await pending();
    await send(g, row, { metadata: { matchId: g.match.id, userId: g.b.id } });
    expect((await rowOf(g, g.a)).status).toBe("pending");
  });
});

describe("Scheitern beim Zahler, Wiederabbuchen, Freigabe", () => {
  it("Abbuchung fuer A scheitert: A's Zeile failed mit Fenster, Nachricht an B und den Captain (nicht an A), A bleibt rot (neutral), B's eigener Anteil bleibt bezahlt", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    provider.setChargeOutcome(g.a.id, "declined");
    await runCharges(g.match.id);
    const aRow = await rowOf(g, g.a);
    expect(aRow).toMatchObject({ status: "failed", payerUserId: g.b.id, failureCode: "card_declined" });
    expect(aRow.graceUntil).not.toBeNull();
    expect((await rowOf(g, g.b)).status).toBe("succeeded");
    const to = async (u: User) => (await db.select().from(notifications).where(eq(notifications.userId, u.id))).filter((n) => n.type === "payment");
    expect((await to(g.b)).some((n) => n.title === "Abbuchung fehlgeschlagen")).toBe(true);
    expect((await to(g.adminA)).some((n) => n.title === "Abbuchung fehlgeschlagen")).toBe(true);
    expect((await to(g.a)).filter((n) => n.title.includes("Abbuchung") || n.title.includes("Freigabe"))).toHaveLength(0);
    expect((await to(g.away)).length).toBe(0);
    expect((await seatOf(g, g.a)).cardStatus).toBe("failed");
  });

  it("'Karte aendern' des ZAHLERS startet den neuen Versuch fuer A's Zeile (neuer Schluessel, Kunde von B); A's eigene Karte ist dafuer nicht noetig", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    provider.setChargeOutcome(g.a.id, "declined");
    await runCharges(g.match.id);
    expect(await retryChargesInWindow({ userId: g.b.id })).toBe(0); // B's Platz ist charged: keine neue Karte, nichts zu tun
    // B aendert die Karte (Platz wieder card_ready), A's Platz bleibt 'failed'
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    provider.setChargeOutcome(g.a.id, "succeeded");
    expect(await retryChargesInWindow({ userId: g.a.id })).toBe(0); // A's eigene Karte zaehlt nicht (Filter auf den Zahler)
    expect(await retryChargesInWindow({ userId: g.b.id })).toBe(1);
    const aRow = await rowOf(g, g.a);
    expect(aRow).toMatchObject({ status: "succeeded", currentAttempt: 2, payerUserId: g.b.id });
    const call = piCalls().filter((c) => (c.args as { metadata: { userId: string } }).metadata.userId === g.a.id).pop()!;
    expect(call.args).toMatchObject({ idempotencyKey: `charge:${g.match.id}:${g.a.id}:2`, customerId: g.customers.get(g.b.id) });
  });

  it("3-D-Secure: die Freigabe fuer A's Anteil gehoert dem ZAHLER (Secret nur an B, Kunde von B), nie A; die Liste im Konto nennt es nur B", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    provider.setChargeOutcome(g.a.id, "requires_action");
    await runCharges(g.match.id);
    const aRow = await rowOf(g, g.a);
    expect(aRow).toMatchObject({ status: "requires_action", failureCode: "authentication_required" });
    await expect(getAuthorizationSecret(g.a.id, g.match.id)).rejects.toThrow(/keine Freigabe möglich/); // A hat keine eigene offene Zeile
    const secret = await getAuthorizationSecret(g.b.id, g.match.id);
    expect(secret.clientSecret).toBe(`${aRow.paymentIntentId}_secret_fake`);
    expect((await listOpenAuthorizations(g.b.id)).map((x) => x.matchId)).toEqual([g.match.id]);
    expect(await listOpenAuthorizations(g.a.id)).toEqual([]);
    await expect(getAuthorizationSecret(g.away.id, g.match.id)).rejects.toThrow(/keine Freigabe möglich/);
    // A's Anzeige traegt keinen Freigabe-Knopf (der Knopf gehoert dem Zahler)
    const displays = await getCardDisplays(g.match.id, (p) => (p.userId === g.a.id ? "self" : "manager"));
    expect(displays[g.a.id].authorize).toBeUndefined();
    const forManager = await getCardDisplays(g.match.id, () => "manager");
    expect(forManager[g.a.id].authorize).toBeUndefined(); // auch Captain/Veranstalter: die Freigabe an A's Platz gehoert dem Zahler
  });
});

describe("Erstattung geht an den Zahler (AC-14)", () => {
  it("Absage nach erfolgreicher Abbuchung: A's Posten wird auf den PaymentIntent bei B's Kunden erstattet, die Erstattungszeile gehoert B", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    // nur Teil abbuchen: Spiel nicht abrechnen lassen, indem ein anderer Spieler scheitert
    provider.setChargeOutcome(g.away.id, "declined");
    await runCharges(g.match.id);
    const aRow = await rowOf(g, g.a);
    expect(aRow.status).toBe("succeeded");
    await requestMatchCancel(null, g.match.id, "Test");
    const refunds = await db.select().from(paymentRefunds).where(eq(paymentRefunds.matchId, g.match.id));
    const rA = refunds.find((x) => x.chargeId === aRow.id)!;
    expect(rA.userId).toBe(g.b.id); // nicht A
    const call = provider.calls.filter((c) => c.method === "createRefund").find((c) => (c.args as { paymentIntentId: string }).paymentIntentId === aRow.paymentIntentId);
    expect(call).toBeDefined();
    expect(rA.status).toBe("succeeded");
    expect((await trialBalance()).balanced).toBe(true);
    expect((await db.select().from(notifications).where(eq(notifications.userId, g.a.id))).filter((n) => n.type === "payment")).toHaveLength(0);
  });
});

describe("Anzeige und Datenschutz (Auflage 4)", () => {
  it("vor der Abbuchung: Mitspieler und A selbst sehen den Platz neutral GRUEN 'gedeckt' ohne Namen, Gaeste nichts, der Captain den echten Status mit Hinweis", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    const view = async (who: "self" | "member" | "guest" | "manager") => (await getCardDisplays(g.match.id, () => who))[g.a.id];
    expect(await view("member")).toEqual({ status: "card_ready", reason: null, covered: true });
    expect(await view("self")).toEqual({ status: "card_ready", reason: null, covered: true });
    expect(await view("guest")).toBeUndefined();
    expect(await view("manager")).toMatchObject({ status: "none", covered: true });
    const raw = JSON.stringify((await getCardDisplays(g.match.id, () => "member"))[g.a.id]);
    expect(raw).not.toContain(g.b.id);
    expect((await getTeamCardsReady(g.match.id))[g.home.id]).toBe(true); // gedeckt zaehlt als bereit
    // verliert der Uebernehmer seine Karte, ist der Platz nicht mehr gedeckt (Anzeige und Team-Bereitschaft)
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.b.id)));
    expect((await getCardDisplays(g.match.id, () => "member"))[g.a.id]).toEqual({ status: "open", reason: null });
    expect((await getTeamCardsReady(g.match.id))[g.home.id]).toBe(false);
  });

  it("nach gescheiterter Abbuchung: Dritte und A sehen nur die neutrale rote Ampel ohne Grund, der Captain den echten Grund", async () => {
    const g = await game();
    await takeOverShare(g.b.id, g.match.id, g.a.id, true);
    provider.setChargeOutcome(g.a.id, "declined");
    await runCharges(g.match.id);
    const view = async (who: "self" | "member" | "manager") => (await getCardDisplays(g.match.id, () => who))[g.a.id];
    expect(await view("member")).toEqual({ status: "open", reason: null });
    expect(await view("self")).toEqual({ status: "open", reason: null });
    expect(await view("manager")).toMatchObject({ status: "failed", reason: "card_declined" });
  });
});
