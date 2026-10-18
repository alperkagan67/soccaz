import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ledgerEntries, payments, promoCodes, promoRedemptions, receipts } from "@/db/schema-finance";
import { walletBalance, trialBalance } from "@/server/ledger";
import { completePayment, createTopUp, failPayment } from "@/server/payments";
import { createPromo, previewPromo } from "@/server/promo";
import { cleanup, makeUser } from "./helpers";

afterAll(cleanup);

const code = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

async function topUp(user: { id: string; email: string }, cents: number, promo?: string) {
  const { paymentId } = await createTopUp(user, cents, promo);
  return paymentId;
}

describe("Aufladen mit dem Entwicklungs-Anbieter", () => {
  it("Zahlung erfolgreich: Guthaben, Beleg, Benachrichtigung", async () => {
    const u = await makeUser();
    const id = await topUp(u, 5000);
    expect((await db.select().from(payments).where(eq(payments.id, id)))[0].status).toBe("pending");
    expect(await walletBalance(db, u.id)).toBe(0); // vor der Zahlung nichts

    expect(await completePayment({ paymentId: id })).toEqual({ status: "completed" });
    expect(await walletBalance(db, u.id)).toBe(5000);

    const [receipt] = await db.select().from(receipts).where(eq(receipts.paymentId, id));
    expect(receipt.number).toMatch(/^SOC-\d{4}-\d{6}$/);
    expect(receipt.amountCents).toBe(5000);
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.type, "payment")));
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("50,00");
  });

  it("wiederholte Meldung des Anbieters bucht nichts doppelt", async () => {
    const u = await makeUser();
    const id = await topUp(u, 2000);
    const results = await Promise.all([completePayment({ paymentId: id }), completePayment({ paymentId: id }), completePayment({ paymentId: id })]);
    expect(results.filter((r) => r.status === "completed")).toHaveLength(1);
    expect(await walletBalance(db, u.id)).toBe(2000);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, id))).toHaveLength(1);
    expect(await db.select().from(receipts).where(eq(receipts.paymentId, id))).toHaveLength(1);
  });

  it("unbekannte Zahlung wird ignoriert", async () => {
    expect(await completePayment({ providerRef: "gibt-es-nicht" })).toEqual({ status: "unknown" });
  });

  it("Abgebrochene Zahlung bringt nichts, eine spät eintreffende Zahlung zählt trotzdem", async () => {
    const u = await makeUser();
    const id = await topUp(u, 1000);
    await failPayment({ paymentId: id }, "canceled", "Nutzer hat abgebrochen");
    expect((await db.select().from(payments).where(eq(payments.id, id)))[0].status).toBe("canceled");
    expect(await walletBalance(db, u.id)).toBe(0);
    await completePayment({ paymentId: id }); // Geld ist angekommen
    expect(await walletBalance(db, u.id)).toBe(1000);
    // eine erfolgreiche Zahlung wird nicht mehr abgebrochen
    await failPayment({ paymentId: id }, "failed", "zu spät");
    expect((await db.select().from(payments).where(eq(payments.id, id)))[0].status).toBe("succeeded");
  });

  it("ungültige Beträge werden abgelehnt", async () => {
    const u = await makeUser();
    for (const bad of [0, 499, 20_001, -100, 1000.5]) await expect(createTopUp(u, bad)).rejects.toThrow(/zwischen 5,00 und 200,00/);
  });

  it("Rabattcode: Bonus, Einlösung wird gezählt", async () => {
    const admin = await makeUser("adm", "admin");
    const u = await makeUser();
    const c = code("BONUS");
    await createPromo(admin.id, { code: c, kind: "percent", value: 10 });
    const id = await topUp(u, 5000, c.toLowerCase());
    await completePayment({ paymentId: id });
    expect(await walletBalance(db, u.id)).toBe(5500);
    const [row] = await db.select().from(promoCodes).where(eq(promoCodes.code, c));
    expect(row.usedCents).toBe(500);
    expect(await db.select().from(promoRedemptions).where(eq(promoRedemptions.codeId, row.id))).toHaveLength(1);
    // zweites Mal derselbe Nutzer: abgelehnt, schon bei der Vorschau
    expect(await previewPromo(u.id, c, 5000)).toMatchObject({ ok: false });
    await expect(createTopUp(u, 5000, c)).rejects.toThrow(/schon eingelöst/);
  });

  it("Festbetrag-Code und Deckel", async () => {
    const admin = await makeUser("adm", "admin");
    const u = await makeUser();
    const c = code("FIX");
    await createPromo(admin.id, { code: c, kind: "fixed", value: 300 });
    await completePayment({ paymentId: await topUp(u, 1000, c) });
    expect(await walletBalance(db, u.id)).toBe(1300);

    const u2 = await makeUser();
    const capped = code("CAP");
    await createPromo(admin.id, { code: capped, kind: "percent", value: 50, maxBonusCents: 400 });
    await completePayment({ paymentId: await topUp(u2, 10_000, capped) });
    expect(await walletBalance(db, u2.id)).toBe(10_400);
  });

  it("Budget wird auch bei gleichzeitigem Einlösen nie überschritten", async () => {
    const admin = await makeUser("adm", "admin");
    const c = code("BUDGET");
    await createPromo(admin.id, { code: c, kind: "fixed", value: 500, budgetCents: 500 }); // reicht für genau eine Einlösung
    const [a, b, d] = [await makeUser(), await makeUser(), await makeUser()];
    // alle drei starten die Zahlung, solange das Budget noch frei ist
    const ids = await Promise.all([topUp(a, 1000, c), topUp(b, 1000, c), topUp(d, 1000, c)]);
    await Promise.all(ids.map((id) => completePayment({ paymentId: id })));
    const balances = await Promise.all([a, b, d].map((u) => walletBalance(db, u.id)));
    expect(balances.sort()).toEqual([1000, 1000, 1500]); // genau einer bekommt den Bonus
    const [row] = await db.select().from(promoCodes).where(eq(promoCodes.code, c));
    expect(row.usedCents).toBe(500);
  });

  it("Code nur für die erste Aufladung", async () => {
    const admin = await makeUser("adm", "admin");
    const c = code("NEU");
    await createPromo(admin.id, { code: c, kind: "fixed", value: 200, newUsersOnly: true });
    const u = await makeUser();
    await completePayment({ paymentId: await topUp(u, 1000) });
    await expect(createTopUp(u, 1000, c)).rejects.toThrow(/erste Aufladung/);
    const fresh = await makeUser();
    await completePayment({ paymentId: await topUp(fresh, 1000, c) });
    expect(await walletBalance(db, fresh.id)).toBe(1200);
  });

  it("Code mit Mindestbetrag, Ablauf und inaktiv", async () => {
    const admin = await makeUser("adm", "admin");
    const u = await makeUser();
    const min = code("MIN");
    await createPromo(admin.id, { code: min, kind: "fixed", value: 100, minTopupCents: 5000 });
    await expect(createTopUp(u, 1000, min)).rejects.toThrow(/ab einer Aufladung/);
    const old = code("OLD");
    await createPromo(admin.id, { code: old, kind: "fixed", value: 100, validFrom: new Date("2020-01-01"), validUntil: new Date("2020-12-31") });
    await expect(createTopUp(u, 1000, old)).rejects.toThrow(/abgelaufen/);
    await expect(createTopUp(u, 1000, "GIBTESNICHT")).rejects.toThrow(/gibt es nicht/);
  });

  it("Code anlegen prüft Eingaben und Duplikate", async () => {
    const admin = await makeUser("adm", "admin");
    await expect(createPromo(admin.id, { code: "a", kind: "percent", value: 10 })).rejects.toThrow(/3 bis 24/);
    await expect(createPromo(admin.id, { code: code("X"), kind: "percent", value: 101 })).rejects.toThrow(/Prozent/);
    await expect(createPromo(admin.id, { code: code("X"), kind: "fixed", value: 0 })).rejects.toThrow(/Festbetrag/);
    const c = code("DUP");
    await createPromo(admin.id, { code: c, kind: "percent", value: 5 });
    await expect(createPromo(admin.id, { code: c, kind: "percent", value: 5 })).rejects.toThrow(/schon/);
  });

  it("nach allen Zahlungen ist die Saldenprobe ausgeglichen", async () => {
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
  });
});
