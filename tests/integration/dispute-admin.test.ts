import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges, paymentDisputeEntries, paymentDisputes, paymentSetupIntents, users } from "@/db/schema";
import { receipts } from "@/db/schema-finance";
import { countOpenDisputes, disputeMarks, getDispute, listDisputes } from "@/server/payments/dispute-admin";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M4a-2 (AC-11): Zahlungsstreit im Admin: Liste, Detail mit Beweis-Ansicht, Markierung am Spieler. Nur lesen, keine Sperre.

afterAll(cleanup);

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Spiel mit einem Zahler, bezahlter Abbuchung, Mandat, Beleg und einem Streit im gewuenschten Status. */
async function withDispute(status: string, over: { amount?: number } = {}) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const p = await addPlayer(m.match.id, m.home.id, "da");
  const [charge] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: p.id, amountCents: 800, status: "succeeded", idempotencyKey: `charge:${m.match.id}:${p.id}`, paymentIntentId: nid("pi_da") }).returning();
  const [dispute] = await db
    .insert(paymentDisputes)
    .values({ disputeId: nid("dp_test_da"), chargeId: charge.id, paymentIntentId: charge.paymentIntentId, matchId: m.match.id, payerUserId: p.id, amountCents: over.amount ?? 800, currency: "eur", reason: "fraudulent", status, evidenceDueBy: new Date(Date.now() + 5 * 86_400_000) })
    .returning();
  return { ...m, p, charge, dispute };
}
type D = Awaited<ReturnType<typeof withDispute>>;

describe("listDisputes", () => {
  it("offene zuerst filterbar: Standard nur offene (inkl. UNBEKANNTER Status), 'alle' zeigt auch gewonnene und verlorene", async () => {
    const [a, b, c, d] = [await withDispute("needs_response"), await withDispute("won"), await withDispute("lost"), await withDispute("neuer_stripe_status")];
    const open = (await listDisputes({ onlyOpen: true })).rows.map((r) => r.disputeId);
    expect(open).toEqual(expect.arrayContaining([a.dispute.disputeId, d.dispute.disputeId]));
    expect(open).not.toContain(b.dispute.disputeId);
    expect(open).not.toContain(c.dispute.disputeId);
    const all = (await listDisputes({ onlyOpen: false })).rows.map((r) => r.disputeId);
    expect(all).toEqual(expect.arrayContaining([a, b, c, d].map((x) => x.dispute.disputeId)));
  });

  it("Zeile: Betrag, Zahler, Spiel, Doppelverlust, abgelehnte Eintraege, 'keine passende Zahlung'", async () => {
    const g = await withDispute("lost");
    await db.update(paymentDisputes).set({ refundConflict: true, doubleLossCents: 800 }).where(eq(paymentDisputes.id, g.dispute.id));
    await db.insert(paymentDisputeEntries).values({ disputeRowId: g.dispute.id, balanceTransactionId: nid("txn_test_da"), kind: "withdrawal", amountCents: 900, status: "rejected", rejectReason: "amount_exceeds_charge" });
    const unknown = await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_unk"), amountCents: 500, currency: "eur", status: "needs_response" }).returning();
    const rows = (await listDisputes({ onlyOpen: false })).rows;
    const r = rows.find((x) => x.id === g.dispute.id)!;
    expect(r).toMatchObject({ amountCents: 800, payerUserId: g.p.id, refundConflict: true, doubleLossCents: 800, rejectedEntries: 1, matchId: g.match.id, open: false });
    expect(r.payerName).toBe(g.p.name);
    expect(r.matchLabel).toContain(" gegen ");
    const u = rows.find((x) => x.id === unknown[0].id)!;
    expect(u).toMatchObject({ payerUserId: null, matchId: null, matchLabel: null, open: true });
  });

  it("Seiten: genau 25 je Seite, hasMore, die zweite Seite beginnt dahinter", async () => {
    for (let i = 0; i < 27; i++) await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_pg"), amountCents: 100 + i, currency: "eur", status: "needs_response" });
    const res = await listDisputes({ onlyOpen: true, page: 1 });
    expect(res.rows).toHaveLength(25);
    expect(res.hasMore).toBe(true);
    const second = await listDisputes({ onlyOpen: true, page: 2 });
    expect(second.rows.length).toBeGreaterThan(0);
    expect(second.rows.some((r) => res.rows.some((x) => x.id === r.id))).toBe(false);
  });
});

describe("listDisputes/countOpenDisputes: Filter in SQL, keine Obergrenze (R-T186)", () => {
  it("ein altes OFFENES Verfahren bleibt auffindbar, auch wenn mehr als 500 neuere abgeschlossene existieren; Zaehlung stimmt", async () => {
    const before = await countOpenDisputes();
    await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_alt"), amountCents: 111, currency: "eur", status: "under_review", createdAt: new Date("2020-01-01T00:00:00Z") });
    await db.execute(sql`insert into payment_disputes (dispute_id, amount_cents, currency, status, created_at) select 'dp_test_cap' || g || '_' || ${Date.now().toString(36)}, 100, 'eur', 'lost', now() + g * interval '1 second' from generate_series(1, 520) g`);
    expect(await countOpenDisputes()).toBe(before + 1);
    let found = false;
    for (let page = 1; page <= 40 && !found; page++) {
      const res = await listDisputes({ onlyOpen: true, page });
      if (res.rows.some((r) => r.amountCents === 111 && r.status === "under_review")) found = true;
      if (!res.hasMore) break;
    }
    expect(found).toBe(true);
    const all = await listDisputes({ onlyOpen: false, page: 21 }); // die Seiten der Gesamtliste laufen ueber die 500 hinaus
    expect(all.rows.length).toBeGreaterThan(0);
  });
});

describe("getDispute: Beweis-Ansicht", () => {
  async function evidence(g: D) {
    await db.insert(paymentSetupIntents).values({ id: nid("seti_da"), userId: g.p.id, matchId: g.match.id, status: "succeeded", mandateText: "Mandat-Wortlaut-Test", mandateAcceptedAt: new Date("2026-11-01T10:00:00Z") });
    await db.update(matchParticipants).set({ readyAt: new Date("2026-11-02T10:00:00Z") }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.p.id)));
    await db.insert(receipts).values({ number: nid("SOC-TEST"), userId: g.p.id, kind: "match", matchId: g.match.id, amountCents: 800 });
  }

  it("liefert Streit, Zahler, Spiel, Abbuchung, Eintraege und die Beweise (Mandat, Teilnahme, Beleg)", async () => {
    const g = await withDispute("needs_response");
    await evidence(g);
    await db.insert(paymentDisputeEntries).values({ disputeRowId: g.dispute.id, balanceTransactionId: nid("txn_test_de"), kind: "withdrawal", amountCents: 800, feeCents: 1500, status: "booked" });
    const d = (await getDispute(g.dispute.id))!;
    expect(d.dispute).toMatchObject({ id: g.dispute.id, open: true, final: false });
    expect(d.payer).toMatchObject({ id: g.p.id, deleted: false });
    expect(d.match!.label).toContain(" gegen ");
    expect(d.charge).toMatchObject({ amountCents: 800, status: "succeeded", coveredShare: false });
    expect(d.entries).toHaveLength(1);
    expect(d.evidence.mandateText).toBe("Mandat-Wortlaut-Test");
    expect(d.evidence.mandateAcceptedAt!.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(d.evidence.readyAt).not.toBeNull();
    expect(d.evidence.receiptNumber).toMatch(/^SOC-TEST/);
  });

  it("Anteil uebernommen: der Zahler ist der Uebernehmer, der Platz-Spieler wird genannt, der Mandatszusatz steht in den Beweisen", async () => {
    const g = await withDispute("needs_response");
    const payer = await addPlayer(g.match.id, g.home.id, "dap");
    await db.insert(paymentSetupIntents).values({ id: nid("seti_dap"), userId: payer.id, status: "succeeded", mandateText: "Mandat des Zahlers", mandateAcceptedAt: new Date("2026-11-01T09:00:00Z") });
    await db.insert(paymentSetupIntents).values({ id: nid("seti_das"), userId: g.p.id, status: "succeeded", mandateText: "Mandat des Platz-Spielers", mandateAcceptedAt: new Date("2026-11-01T08:00:00Z") });
    await db.update(paymentCharges).set({ payerUserId: payer.id }).where(eq(paymentCharges.id, g.charge.id));
    await db.update(paymentDisputes).set({ payerUserId: payer.id }).where(eq(paymentDisputes.id, g.dispute.id));
    await db.update(matchParticipants).set({ coveredByUserId: payer.id, coverMandateText: "cover.mandate.v1.entwurf", coverAcceptedAt: new Date("2026-11-03T10:00:00Z") }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.p.id)));
    const d = (await getDispute(g.dispute.id))!;
    expect(d.payer!.id).toBe(payer.id);
    expect(d.seatUser!.id).toBe(g.p.id);
    expect(d.charge!.coveredShare).toBe(true);
    expect(d.evidence.mandateText).toBe("Mandat des Zahlers"); // das Mandat dessen, dessen Karte belastet wurde
    expect(d.evidence.coverMandate).toBe("cover.mandate.v1.entwurf");
    expect(d.evidence.coverAcceptedAt).not.toBeNull();
  });

  it("nach Kontoloeschung: Zahler als geloescht gekennzeichnet, kein Mandat; ohne Zuordnung: Zahler/Spiel leer; ungueltige oder unbekannte ID: null", async () => {
    const g = await withDispute("lost");
    await db.update(users).set({ email: `geloescht-${g.p.id}@geloescht.invalid`, name: "Gelöschter Nutzer" }).where(eq(users.id, g.p.id));
    const d = (await getDispute(g.dispute.id))!;
    expect(d.payer).toMatchObject({ deleted: true });
    expect(d.evidence.mandateAcceptedAt).toBeNull();
    const [orphan] = await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_or"), amountCents: 500, currency: "eur", status: "needs_response" }).returning();
    const o = (await getDispute(orphan.id))!;
    expect(o.payer).toBeNull();
    expect(o.match).toBeNull();
    expect(o.charge).toBeNull();
    expect(await getDispute("kein-uuid")).toBeNull();
    expect(await getDispute("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("disputeMarks: Markierung am Spieler (keine Sperre)", () => {
  it("zaehlt offene und verlorene Streite je Zahler; gewonnene und Spieler ohne Streit tauchen nicht auf; unbekannter Status zaehlt als offen", async () => {
    const a = await withDispute("needs_response");
    const [b1, b2] = [await withDispute("lost"), await withDispute("won")];
    // zweiter, verlorener Streit des Zahlers a
    await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_m2"), chargeId: a.charge.id, matchId: a.match.id, payerUserId: a.p.id, amountCents: 100, currency: "eur", status: "lost" });
    const unknown = await withDispute("neuer_stripe_status");
    const free = await addPlayer(a.match.id, a.home.id, "daf");
    const marks = await disputeMarks([a.p.id, b1.p.id, b2.p.id, unknown.p.id, free.id, "kein-uuid"]);
    expect(marks.get(a.p.id)).toEqual({ open: 1, lost: 1 });
    expect(marks.get(b1.p.id)).toEqual({ open: 0, lost: 1 });
    expect(marks.get(b2.p.id)).toEqual({ open: 0, lost: 0 }); // gewonnen: kein Hinweis noetig, aber kein Fehler
    expect(marks.get(unknown.p.id)).toEqual({ open: 1, lost: 0 });
    expect(marks.has(free.id)).toBe(false);
    expect((await disputeMarks([])).size).toBe(0);
  });

  it("countOpenDisputes zaehlt offene inklusive unbekannter Status", async () => {
    const before = await countOpenDisputes();
    await withDispute("under_review");
    await withDispute("won");
    expect(await countOpenDisputes()).toBe(before + 1);
  });
});
