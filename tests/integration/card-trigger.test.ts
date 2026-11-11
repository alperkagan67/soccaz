import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, paymentProfiles, stripeEvents, teamMembers } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { fixDeadline } from "@/lib/deadlines";
import { audit } from "@/server/audit";
import { deleteAccount } from "@/server/account";
import { mergeTeams } from "@/server/admin";
import { createCardSetup } from "@/server/payments/card-setup";
import { applyStoredCard } from "@/server/payments/stored-card";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { StripeProvider } from "@/server/payments/stripe";
import { assignSubstitute, cancelMatch, cancelMatchTx, finalConfirm, getLobby, joinAsSubstitute, joinLobby, leaveLobby, randomSplit, removeParticipant, setReady, setVenue, unassignParticipant } from "@/server/lobby";
import { ATTEMPT_MAX_AGE_MS, CLAIM_LEASE_MS, runCharges } from "@/server/payments/charge-run";
import { runCardCharges, runChargesIfDue, triggerChargesInBackground } from "@/server/payments/charge-trigger";
import { FakeProvider } from "@/server/payments/fake";
import { PaymentIdempotencyError, setPaymentProviderForTests } from "@/server/payments/provider";
import { JOBS, SCHEDULE } from "@/server/jobs";
import { expireScheduling } from "@/server/scheduling";
import { cancelUnderfilledLobbies, closeLobbiesAtDeadline } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { CHARGES_LOCKED, joinClosed, leaveClosed } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, makeTeam, makeUser, reloadMatch } from "./helpers";

let provider: FakeProvider;
beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_ct_%"));
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

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type Setup = { price?: number; n?: number; hoursAhead?: number; confirmed?: boolean; legacy?: boolean };
/** Kartenspiel, abbuchungsbereit: n Spieler mit Karte und Zahlungsprofil, Anteil fixiert; beide Captains bereit (confirmed: false lässt das weg). */
async function game(o: Setup = {}) {
  const n = o.n ?? 6;
  const price = o.price ?? 6000;
  const m = await makeMatch({ hoursAhead: o.hoursAhead ?? 72, priceCents: price, costCents: price, legacy: o.legacy });
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_ct"), paymentMethodId: nid("pm_ct") });
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  const confirmed = o.confirmed ?? true;
  await db
    .update(matches)
    .set({ homeFinalAt: confirmed ? new Date() : null, awayFinalAt: confirmed ? new Date() : null, finalShareCents: price > 0 ? Math.ceil(price / n) : 0, status: "confirmed" })
    .where(eq(matches.id, m.match.id));
  return { ...m, all, n, price };
}
type G = Awaited<ReturnType<typeof game>>;

const rowsOf = (g: G) => db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id));
const callsFor = (g: G) => provider.calls.filter((c) => c.method === "createPaymentIntent" && (c.args as { metadata: { matchId: string } }).metadata.matchId === g.match.id);
const statusOf = async (g: G) => (await reloadMatch(g.match.id)).status;
const startOf = async (g: G) => (await reloadMatch(g.match.id)).startsAt;
const dueNow = async (g: G) => new Date((await startOf(g)).getTime() - 48 * 3_600_000 + 60_000); // kurz nach der 48-h-Frist
const auditCount = async (action: string, entityId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)))).length;
const seatsOf = (g: G) => db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id));
const entriesOf = (g: G) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id));

describe("Auslöser: Frist und Job", () => {
  it("vor der Frist passiert nichts: keine Zeilen, kein Stripe-Aufruf (auch nicht bei direktem Aufruf des Auslösers)", async () => {
    const g = await game({ hoursAhead: 72 });
    await runCardCharges(new Date());
    expect((await runChargesIfDue(g.match.id, new Date())).reason).toBe("not_due");
    expect(callsFor(g)).toHaveLength(0);
    expect(await rowsOf(g)).toHaveLength(0);
  });

  it("zur Frist wird jeder Spieler genau einmal belastet; ein zweiter Lauf sendet nichts; das Spiel ist gebucht", async () => {
    const g = await game();
    const now = await dueNow(g);
    await runCardCharges(now);
    expect(callsFor(g)).toHaveLength(g.n);
    expect(new Set(callsFor(g).map((c) => (c.args as { idempotencyKey: string }).idempotencyKey)).size).toBe(g.n);
    expect((await rowsOf(g)).every((r) => r.status === "succeeded")).toBe(true);
    expect((await reloadMatch(g.match.id)).settledAt).not.toBeNull();
    await runCardCharges(now);
    expect(callsFor(g)).toHaveLength(g.n);
  });

  it("Job doppelt und parallel: je Spieler genau eine Abbuchung", async () => {
    const g = await game({ n: 8 });
    const now = await dueNow(g);
    await Promise.all([runCardCharges(now), runCardCharges(now), runCardCharges(now), runChargesIfDue(g.match.id, now)]);
    expect(callsFor(g)).toHaveLength(8);
    expect(await rowsOf(g)).toHaveLength(8);
    expect(new Set((await rowsOf(g)).map((r) => r.paymentIntentId)).size).toBe(8);
  });

  it("Karenz: bei nachträglich festgelegtem Termin wird erst nach Ablauf der Karenz abgebucht, nicht schon zur nominellen 48-h-Frist", async () => {
    const g = await game({ hoursAhead: 50 });
    await db.update(matches).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(matches.id, g.match.id));
    await audit(null, "scheduling.locked", "match", g.match.id, {});
    const start = await startOf(g);
    const nominal = new Date(fixDeadline(start).getTime() + 60_000); // 2 h nach jetzt: Karenz (12 h) läuft noch
    expect((await runChargesIfDue(g.match.id, nominal)).reason).toBe("not_due");
    expect(callsFor(g)).toHaveLength(0);
    const afterGrace = new Date(Date.now() + 12 * 3_600_000 + 120_000);
    expect((await runChargesIfDue(g.match.id, afterGrace)).reason).toBe("ready");
    expect(callsFor(g)).toHaveLength(g.n);
  });

  it("solange Termin oder Hallen-Veto laufen, wird nicht abgebucht", async () => {
    const g = await game();
    await db.update(matches).set({ schedulingOpen: true }).where(eq(matches.id, g.match.id));
    expect((await runChargesIfDue(g.match.id, await dueNow(g))).reason).toBe("not_due");
    expect(callsFor(g)).toHaveLength(0);
  });

  it("nicht bestätigt (ein Captain fehlt) zur Frist: nichts abgebucht", async () => {
    const g = await game({ confirmed: false });
    expect((await runChargesIfDue(g.match.id, await dueNow(g))).reason).toBe("not_confirmed");
    expect(callsFor(g)).toHaveLength(0);
  });
});

describe("Job-Anschluss", () => {
  it("der Job card-charges ist registriert und läuft im 5-Minuten-Takt", () => {
    expect(typeof JOBS["card-charges"]).toBe("function");
    expect(SCHEDULE["card-charges"]).toBe("*/5 * * * *");
  });

  it("der Job bucht fehlende Stripe-Gebühren nach (Nachholer), unabhängig vom Schalter", async () => {
    const g = await game({ hoursAhead: 24, n: 4 });
    await runCharges(g.match.id); // Gebühr noch nicht verfügbar: fee_cents bleibt leer
    expect((await rowsOf(g)).every((r) => r.status === "succeeded" && r.feeCents === null)).toBe(true);
    provider.setFee("*", 30);
    await setSetting(null, "card_payments_enabled", false);
    await runCardCharges(new Date());
    expect((await rowsOf(g)).every((r) => r.feeCents === 30)).toBe(true);
    expect((await entriesOf(g)).filter((e) => e.kind === "fee")).toHaveLength(4);
  });
});

describe("Auslöser: Vorlauf unter 48 Stunden (nach dem zweiten Bereit)", () => {
  it("sofort nach dem zweiten Bereit (finalConfirm), nicht nach dem ersten", async () => {
    const g = await game({ hoursAhead: 24, n: 8, confirmed: false });
    // Kein Preis fixiert: finalConfirm fixiert beim zweiten Bereit selbst; alle bereit setzen
    await db.update(matches).set({ finalShareCents: null, status: "lobby" }).where(eq(matches.id, g.match.id));
    for (const p of g.all) await setReady(p.id, g.match.id, true);
    await finalConfirm(g.adminA.id, g.match.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(callsFor(g)).toHaveLength(0); // nach dem ersten Bereit nichts
    await finalConfirm(g.adminB.id, g.match.id);
    await vi.waitFor(async () => expect(callsFor(g)).toHaveLength(8), { timeout: 5000 });
    await vi.waitFor(async () => expect((await reloadMatch(g.match.id)).settledAt).not.toBeNull(), { timeout: 5000 });
  });

  it("Fehler im Auslöser bricht die Bestätigung nicht ab und verzögert sie nicht; der Job holt nach", async () => {
    const g = await game({ hoursAhead: 24, n: 8, confirmed: false });
    await db.update(matches).set({ finalShareCents: null, status: "lobby" }).where(eq(matches.id, g.match.id));
    for (const p of g.all) await setReady(p.id, g.match.id, true);
    await finalConfirm(g.adminA.id, g.match.id);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Die Bestätigung selbst läuft durch (erster Transaktionsaufruf); jeder weitere Datenbankaufruf des Auslösers scheitert
    const original = db.transaction.bind(db);
    let n = 0;
    const spy = vi.spyOn(db, "transaction").mockImplementation(((...args: Parameters<typeof original>) => (++n === 1 ? original(...args) : Promise.reject(new Error("boom")))) as typeof db.transaction);
    try {
      await expect(finalConfirm(g.adminB.id, g.match.id)).resolves.toBeUndefined(); // Bestätigung gelingt trotzdem
      await vi.waitFor(() => expect(logged).toHaveBeenCalledWith("triggerCharges: Fehler", "Error"), { timeout: 5000 }); // Hintergrundlauf gescheitert und beendet
    } finally {
      spy.mockRestore();
      logged.mockRestore();
    }
    const m = await reloadMatch(g.match.id);
    expect(m.homeFinalAt && m.awayFinalAt).toBeTruthy();
    expect(await rowsOf(g)).toHaveLength(0);
    expect(callsFor(g)).toHaveLength(0);
    await runCardCharges(new Date()); // der Job holt nach
    expect((await reloadMatch(g.match.id)).settledAt).not.toBeNull();
    expect(callsFor(g)).toHaveLength(8);
  });

  it("der Hintergrund-Auslöser wirft nie, auch nicht bei unbekanntem Spiel", async () => {
    await expect(triggerChargesInBackground("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
  });
});

describe("Auslöser: Schalter, Altspiel, Guthaben-Spiel, kostenlos (kein Aufruf)", () => {
  it("Schalter AUS", async () => {
    const g = await game({ hoursAhead: 24 });
    await setSetting(null, "card_payments_enabled", false);
    await runCardCharges(new Date());
    expect((await runChargesIfDue(g.match.id)).reason).toBe("not_card_mode");
    expect(callsFor(g)).toHaveLength(0);
    expect(await rowsOf(g)).toHaveLength(0);
  });

  it("Altspiel", async () => {
    const g = await game({ hoursAhead: 24, legacy: true });
    await runCardCharges(new Date());
    expect((await runChargesIfDue(g.match.id)).reason).toBe("not_card_mode");
    expect(callsFor(g)).toHaveLength(0);
  });

  it("Guthaben-Spiel (ein Platz mit bezahltem Anteil)", async () => {
    const g = await game({ hoursAhead: 24 });
    await db.update(matchParticipants).set({ paidCents: 1000 }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.adminA.id)));
    await runCardCharges(new Date());
    expect((await runChargesIfDue(g.match.id)).reason).toBe("not_card_mode");
    expect(callsFor(g)).toHaveLength(0);
  });

  it("kostenloses Spiel", async () => {
    const g = await game({ hoursAhead: 24, price: 0 });
    await runCardCharges(new Date());
    expect((await runChargesIfDue(g.match.id)).reason).toBe("free");
    expect(callsFor(g)).toHaveLength(0);
  });

  it("unabhängig von payments_enabled: auch bei AUS wird abgebucht", async () => {
    const g = await game({ hoursAhead: 24 });
    await setSetting(null, "payments_enabled", false);
    try {
      await runCardCharges(new Date());
      expect(callsFor(g)).toHaveLength(g.n);
    } finally {
      await setSetting(null, "payments_enabled", true);
    }
  });
});

describe("Absage-/Listensperre bei vorhandenen Abbuchungszeilen", () => {
  /** Zeilen stehen (Netzfehler bei allen Sendeversuchen), Spiel läuft noch. */
  async function withRows() {
    const g = await game({ hoursAhead: 24 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id);
    expect((await rowsOf(g)).length).toBe(g.n);
    return g;
  }
  const noLedger = async (g: G) => {
    expect((await entriesOf(g)).filter((e) => e.kind !== "match_share")).toHaveLength(0); // keine Erstattung, kein Guthaben-Eintrag
  };

  it("Beitritt, Austritt, Rauswurf, Ersatz-Beitritt, Zuweisung, Verlosen, Entfernen aus Team: alle abgelehnt, Liste unverändert", async () => {
    const g = await withRows();
    const before = (await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id))).length;
    const member = await makeUser("cm");
    await db.insert(teamMembers).values({ teamId: g.home.id, userId: member.id, role: "player" });
    const outsider = await makeUser("ou");
    const target = g.all[3];
    await expect(joinLobby(member.id, g.match.id)).rejects.toThrow(CHARGES_LOCKED);
    await expect(leaveLobby(target.id, g.match.id)).rejects.toThrow(CHARGES_LOCKED);
    await expect(removeParticipant(g.adminA.id, g.match.id, target.id)).rejects.toThrow(CHARGES_LOCKED);
    await expect(joinAsSubstitute(outsider.id, g.match.id)).rejects.toThrow(CHARGES_LOCKED);
    await expect(assignSubstitute(g.adminA.id, g.match.id, outsider.id, g.home.id)).rejects.toThrow(CHARGES_LOCKED);
    await expect(randomSplit(g.adminA.id, g.match.id)).rejects.toThrow(CHARGES_LOCKED);
    await expect(unassignParticipant(g.adminA.id, g.match.id, target.id)).rejects.toThrow(CHARGES_LOCKED);
    expect((await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id))).length).toBe(before);
    expect(await statusOf(g)).toBe("confirmed");
    await noLedger(g);
  });

  it("joinClosed und leaveClosed melden gesperrt, sobald Zeilen existieren (Anzeige und Aktion), davor nicht", async () => {
    const g = await game({ hoursAhead: 72 });
    const now = new Date();
    const before = await reloadMatch(g.match.id);
    expect(await joinClosed(db, before, now)).toBe(false);
    expect(await leaveClosed(db, before, now)).toBe(false);
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id);
    expect(await joinClosed(db, before, now)).toBe(true);
    expect(await leaveClosed(db, before, now)).toBe(true);
  });

  it("manuelle Absage (Captain) und Absage durch System/Admin (actorId null) sind abgelehnt: Status bleibt, kein Wallet-Eintrag", async () => {
    const g = await withRows();
    await expect(cancelMatch(g.adminA.id, g.match.id, "Wir sagen ab")).rejects.toThrow(/Abbuchung begonnen/);
    expect(await statusOf(g)).toBe("confirmed");
    await expect(db.transaction(async (tx) => cancelMatchTx(tx, await reloadMatch(g.match.id), null, "System"))).rejects.toThrow(/Abbuchung begonnen/);
    await expect(db.transaction(async (tx) => cancelMatchTx(tx, await reloadMatch(g.match.id), g.adminB.id, "Admin"))).rejects.toThrow(/Abbuchung begonnen/);
    expect(await statusOf(g)).toBe("confirmed");
    await noLedger(g);
    expect(await auditCount("match.cancel", g.match.id)).toBe(0);
  });

  it("die Jobs stornieren kein Spiel mit Zeilen (zur Frist, nach der Frist, 24-h-Prüfung)", async () => {
    const g = await withRows();
    const far = new Date((await startOf(g)).getTime() - 30 * 60_000); // 30 min vor Anstoß: weit hinter jeder Frist
    await db.update(matches).set({ status: "lobby", homeFinalAt: null }).where(eq(matches.id, g.match.id)); // sogar "nicht bestätigt"
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await closeLobbiesAtDeadline(far);
      expect(logged).not.toHaveBeenCalled(); // der Job übergeht das Spiel selbst, er stößt nicht erst an die Absagesperre
      await setSetting(null, "payments_enabled", false); // dann gilt die 24-h-Prüfung für Spiele des neuen Modells
      await cancelUnderfilledLobbies(far);
    } finally {
      await setSetting(null, "payments_enabled", true);
      logged.mockRestore();
    }
    expect(await statusOf(g)).toBe("lobby");
    expect(await auditCount("match.cancel", g.match.id)).toBe(0);
    await noLedger(g);
  });

  it("ein abbuchungsbereites Spiel ohne Zeilen wird zur Frist vom Job nicht abgesagt (die Abbuchung übernimmt der Karten-Job); ein nicht bereites schon", async () => {
    const ready = await game();
    const notReady = await game({ confirmed: false });
    const now = await dueNow(ready);
    await closeLobbiesAtDeadline(now);
    expect(await statusOf(ready)).toBe("confirmed");
    expect(await statusOf(notReady)).toBe("cancelled");
  });

  it("Fenster zwischen Beanspruchen und Stripe-Aufruf: eine Absage in diesem Fenster scheitert an den Zeilen (Phase A hat sie schon committet)", async () => {
    const g = await game({ hoursAhead: 24 });
    let cancelResult: unknown = "offen";
    // Der Anbieter wird aufgerufen, nachdem die Zeile beansprucht ist; genau dort versuchen wir abzusagen
    const original = provider.createPaymentIntent.bind(provider);
    provider.createPaymentIntent = async (input) => {
      if (cancelResult === "offen") cancelResult = await cancelMatch(g.adminA.id, g.match.id, "Absage im Fenster").then(() => "abgesagt", (e: Error) => e.message);
      return original(input);
    };
    await runCharges(g.match.id);
    expect(cancelResult).toMatch(/Abbuchung begonnen/);
    expect(await statusOf(g)).toBe("confirmed");
    expect((await reloadMatch(g.match.id)).settledAt).not.toBeNull();
  });
});

describe("Ausgang unbekannt und Idempotenz-Konflikt", () => {
  it("unknown_outcome: der Job sendet die Zeile nie erneut und rechnet das Spiel nicht ab", async () => {
    const g = await game({ hoursAhead: 24, n: 4 });
    provider.setChargeOutcome(g.all[0].id, "error");
    await runCharges(g.match.id);
    const row = (await rowsOf(g)).find((r) => r.userId === g.all[0].id)!;
    const late = new Date(row.attemptStartedAt!.getTime() + ATTEMPT_MAX_AGE_MS + 60_000);
    provider.setChargeOutcome(g.all[0].id, "succeeded");
    const calls = callsFor(g).length;
    await runCardCharges(late);
    await runCardCharges(new Date(late.getTime() + 600_000));
    expect(callsFor(g)).toHaveLength(calls);
    expect((await rowsOf(g)).find((r) => r.userId === g.all[0].id)).toMatchObject({ status: "pending", failureCode: "unknown_outcome" });
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
    expect(await auditCount("charge.unknown_outcome", g.match.id)).toBe(1);
  });

  it("Idempotenz-Konflikt: Zeile failed (idempotency_mismatch) mit Audit, nicht verschluckt, nie erneut gesendet", async () => {
    const g = await game({ hoursAhead: 24, n: 4 });
    provider.setChargeOutcome(g.all[1].id, "idempotency_mismatch");
    await runCharges(g.match.id);
    const row = (await rowsOf(g)).find((r) => r.userId === g.all[1].id)!;
    expect(row).toMatchObject({ status: "failed", failureCode: "idempotency_mismatch", paymentIntentId: null });
    expect(await auditCount("charge.failed", g.match.id)).toBe(1);
    const calls = callsFor(g).length;
    await runCharges(g.match.id, new Date(Date.now() + 120_000));
    expect(callsFor(g)).toHaveLength(calls);
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
  });
});

describe("Anzeige-Betrag in der Lobby", () => {
  it("angehobener Mindestbetrag, normaler Betrag, kostenlos", async () => {
    const small = await game({ price: 300, n: 6 }); // 3,00 EUR / 6 = 0,50: genau Mindestbetrag
    const tiny = await game({ price: 200, n: 6 }); // 0,34 -> 0,50 angehoben
    const normal = await game({ price: 6000, n: 6 });
    const free = await game({ price: 0, n: 6 });
    const pay = async (g: G) => (await getLobby(g.match.id, { id: g.adminA.id, role: "player" }))!.payments;
    expect(await pay(small)).toMatchObject({ chargeCents: 50, minChargeApplied: false });
    expect(await pay(tiny)).toMatchObject({ chargeCents: 50, minChargeApplied: true });
    expect(await pay(normal)).toMatchObject({ chargeCents: 1000, minChargeApplied: false });
    expect(await pay(free)).toMatchObject({ chargeCents: null, minChargeApplied: false });
  });
});

describe("T104b: Bestätigungen bleiben, Nachholen, Zusammenführen, Konto, Kartenwechsel", () => {
  async function withRows(o: Setup = {}) {
    const g = await game({ hoursAhead: 24, n: 8, ...o });
    await db.update(matchParticipants).set({ readyAt: new Date() }).where(eq(matchParticipants.matchId, g.match.id));
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id);
    expect((await rowsOf(g)).length).toBe(g.n);
    for (const p of g.all) provider.setChargeOutcome(p.id, "succeeded");
    return g;
  }
  const finals = async (g: G) => {
    const m = await reloadMatch(g.match.id);
    return Boolean(m.homeFinalAt && m.awayFinalAt);
  };

  it("setReady ist mit Zeilen gesperrt; setVenue löscht die Captain-Bestätigungen nie (auch wenn ein Platz nicht mehr Karte da zeigt)", async () => {
    const g = await withRows();
    await expect(setReady(g.all[3].id, g.match.id, false)).rejects.toThrow(CHARGES_LOCKED);
    await db.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.all[3].id)));
    await setVenue(g.adminA.id, g.match.id, "Neue Halle");
    expect(await finals(g)).toBe(true);
  });

  it("Job holt offene Zeilen nach, auch wenn eine Captain-Bestätigung fehlt (Kandidat über offene Zeilen)", async () => {
    const g = await withRows();
    await db.update(matches).set({ homeFinalAt: null }).where(eq(matches.id, g.match.id));
    await runCardCharges(new Date(Date.now() + CLAIM_LEASE_MS + 5_000));
    expect((await rowsOf(g)).every((r) => r.status === "succeeded")).toBe(true);
    expect((await reloadMatch(g.match.id)).settledAt).not.toBeNull();
  });

  it("Captain-Neubestätigung mit Zeilen ist möglich (charge_pending zählt als Karte da)", async () => {
    const g = await withRows();
    expect((await seatsOf(g)).every((s) => s.cardStatus === "charge_pending")).toBe(true);
    await expect(finalConfirm(g.adminA.id, g.match.id)).resolves.toBeUndefined();
    expect(await finals(g)).toBe(true);
  });

  it("mergeTeams ist abgelehnt, wenn eines der Teams ein offenes Spiel mit Zeilen hat; ohne Zeilen geht es", async () => {
    const g = await withRows();
    const extra = await makeUser("mt");
    const t3 = await makeTeam(extra.id, "Drittteam");
    await expect(mergeTeams(extra.id, t3.id, g.home.id)).rejects.toThrow(/Abbuchung begonnen/);
    await expect(mergeTeams(extra.id, g.away.id, t3.id)).rejects.toThrow(/Abbuchung begonnen/);
    expect((await seatsOf(g)).length).toBe(g.n); // nichts umgehängt
    const free = await game({ hoursAhead: 24, n: 8 });
    const t4 = await makeTeam(extra.id, "Viertteam");
    await expect(mergeTeams(extra.id, t4.id, free.home.id)).resolves.toBeUndefined();
  });

  it("Konto löschen: gesperrt bei offenem Spiel mit Abbuchung (auch lange nach Anstoß); Bereit in abgesagten Spielen mit Zeilen bleibt", async () => {
    const g = await withRows();
    const user = g.all[4];
    await db.update(matches).set({ startsAt: new Date(Date.now() - 8 * 3_600_000) }).where(eq(matches.id, g.match.id)); // weit nach Anstoß: die 6-h-Regel greift nicht mehr
    await expect(deleteAccount(user.id)).rejects.toThrow(/laufendes Spiel mit Abbuchung/);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, g.match.id));
    await deleteAccount(user.id);
    expect((await seatsOf(g)).find((s) => s.userId === user.id)!.readyAt).not.toBeNull();
  });

  it("nach dem Anstoß werden offene Zeilen einmal markiert (after_start + Audit), nie neu gesendet; unknown_outcome bleibt", async () => {
    const g = await game({ hoursAhead: 24, n: 4 });
    provider.setChargeOutcome(g.all[0].id, "error");
    provider.setChargeOutcome(g.all[1].id, "requires_action");
    provider.setChargeOutcome(g.all[2].id, "error");
    await runCharges(g.match.id);
    await db.update(paymentCharges).set({ failureCode: "unknown_outcome" }).where(and(eq(paymentCharges.matchId, g.match.id), eq(paymentCharges.userId, g.all[2].id)));
    const calls = callsFor(g).length;
    const late = new Date((await startOf(g)).getTime() + 60_000);
    await runCardCharges(late);
    await runCardCharges(new Date(late.getTime() + 600_000));
    const rows = await rowsOf(g);
    const by = (i: number) => rows.find((r) => r.userId === g.all[i].id)!;
    expect(by(0)).toMatchObject({ status: "pending", failureCode: "after_start" });
    expect(by(1)).toMatchObject({ status: "requires_action", failureCode: "after_start" });
    expect(by(2)).toMatchObject({ status: "pending", failureCode: "unknown_outcome" });
    expect(by(3)).toMatchObject({ status: "succeeded" });
    expect(await auditCount("charge.after_start", g.match.id)).toBe(1);
    expect(callsFor(g)).toHaveLength(calls);
  });

  it("Idempotenz: Parameteränderung => Konflikt; Schlüssel in Benutzung (409) => normaler Fehler, Zeile bleibt pending", async () => {
    const make = (err: object) => {
      const p = new StripeProvider({ secretKey: "sk_test_unit" });
      (p as unknown as { client: unknown }).client = { paymentIntents: { create: async () => Promise.reject(Object.assign(new Error("stripe"), err)) } };
      return p.createPaymentIntent({ customerId: "cus_x", paymentMethodId: "pm_x", amountCents: 500, idempotencyKey: "k", metadata: { matchId: "m", userId: "u" } });
    };
    await expect(make({ type: "StripeIdempotencyError", code: "idempotency_error", statusCode: 400 })).rejects.toBeInstanceOf(PaymentIdempotencyError);
    const inUse = await make({ type: "StripeIdempotencyError", code: "idempotency_key_in_use", statusCode: 409 }).catch((e: unknown) => e);
    expect(inUse).not.toBeInstanceOf(PaymentIdempotencyError);
    expect(inUse).toBeInstanceOf(Error);
    const g = await game({ hoursAhead: 24, n: 4 });
    provider.setChargeOutcome(g.all[0].id, "error"); // wie der 409-Fall im Lauf: Fehler => pending, kein failed
    await runCharges(g.match.id);
    expect((await rowsOf(g)).find((r) => r.userId === g.all[0].id)).toMatchObject({ status: "pending", failureCode: null });
  });

  it("expireScheduling stoppt nicht an einem Spiel mit Zeilen (Absagesperre): Fehler je Spiel isoliert, Status bleibt", async () => {
    const g = await withRows();
    await db.update(matches).set({ status: "lobby", schedulingOpen: true, schedulingDeadline: new Date(Date.now() - 60_000) }).where(eq(matches.id, g.match.id));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(expireScheduling(new Date())).resolves.toBeGreaterThanOrEqual(0);
      expect(logged).toHaveBeenCalledWith("expireScheduling: Fehler bei Spiel", g.match.id, expect.any(String));
    } finally {
      logged.mockRestore();
    }
    expect(await statusOf(g)).toBe("lobby");
  });

  it("Kartenwechsel setzt charge_pending/charged nie auf card_ready zurück (gespeicherte Karte und Webhook)", async () => {
    const g = await game({ hoursAhead: 24, n: 4 });
    const me = g.all[0];
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, me.id)));
    const setup = await createCardSetup(me.id, { matchId: g.match.id, mandateAccepted: true });
    for (const s of ["charge_pending", "charged"] as const) {
      await db.update(matchParticipants).set({ cardStatus: s }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, me.id)));
      await applyStoredCard(me.id, g.match.id, true);
      const seat = (await seatsOf(g)).find((x) => x.userId === me.id)!;
      expect(seat.cardStatus).toBe(s);
    }
    const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, me.id));
    provider.registerCard({ id: "pm_ct_new", brand: "visa", last4: "4242" });
    const ev = provider.signEvent({ id: `evt_ct_${Date.now().toString(36)}`, type: "setup_intent.succeeded", object: { id: setup.setupIntentId, customer: profile.stripeCustomerId, payment_method: "pm_ct_new" } });
    expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
    expect((await seatsOf(g)).find((x) => x.userId === me.id)!.cardStatus).toBe("charged"); // unverändert
  });
});
