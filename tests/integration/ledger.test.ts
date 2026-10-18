import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { ledgerEntries } from "@/db/schema-finance";
import { eq, sql } from "drizzle-orm";
import { creditWallet, debitWallet, InsufficientFunds, post, reverseEntry, totalWalletLiability, trialBalance, walletBalance, walletStatement } from "@/server/ledger";
import { cleanup, makeUser } from "./helpers";

afterAll(cleanup);

const key = () => `t-${Math.random().toString(36).slice(2)}`;

describe("Ledger", () => {
  it("Aufladung erhöht das Guthaben", async () => {
    const u = await makeUser();
    expect(await walletBalance(db, u.id)).toBe(0);
    await post(db, { debit: { account: "clearing" }, credit: { account: "wallet", userId: u.id }, amountCents: 5000, kind: "topup", idempotencyKey: key() });
    expect(await walletBalance(db, u.id)).toBe(5000);
  });

  it("derselbe Schlüssel bucht genau einmal (Webhook-Wiederholung)", async () => {
    const u = await makeUser();
    const k = key();
    const first = await creditWallet(db, u.id, { from: "clearing", amountCents: 1000, kind: "topup", idempotencyKey: k });
    const second = await creditWallet(db, u.id, { from: "clearing", amountCents: 1000, kind: "topup", idempotencyKey: k });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await walletBalance(db, u.id)).toBe(1000);
  });

  it("Abbuchung nur mit ausreichendem Guthaben", async () => {
    const u = await makeUser();
    await creditWallet(db, u.id, { from: "clearing", amountCents: 1000, kind: "topup", idempotencyKey: key() });
    await expect(db.transaction((tx) => debitWallet(tx, u.id, { to: "revenue", amountCents: 1001, kind: "match_share", idempotencyKey: key() }))).rejects.toBeInstanceOf(InsufficientFunds);
    await db.transaction((tx) => debitWallet(tx, u.id, { to: "revenue", amountCents: 1000, kind: "match_share", idempotencyKey: key() }));
    expect(await walletBalance(db, u.id)).toBe(0);
  });

  it("zwei gleichzeitige Abbuchungen geben das Guthaben nicht doppelt aus", async () => {
    const u = await makeUser();
    await creditWallet(db, u.id, { from: "clearing", amountCents: 1000, kind: "topup", idempotencyKey: key() });
    const attempt = () => db.transaction((tx) => debitWallet(tx, u.id, { to: "revenue", amountCents: 700, kind: "match_share", idempotencyKey: key() }));
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(await walletBalance(db, u.id)).toBe(300);
  });

  it("Buchungen sind unveränderlich: ändern und löschen schlagen fehl", async () => {
    const u = await makeUser();
    const { id } = await creditWallet(db, u.id, { from: "clearing", amountCents: 500, kind: "topup", idempotencyKey: key() });
    await expect(db.update(ledgerEntries).set({ amountCents: 999999 }).where(eq(ledgerEntries.id, id))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/unveränderlich/) } });
    await expect(db.delete(ledgerEntries).where(eq(ledgerEntries.id, id))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/unveränderlich/) } });
    expect(await walletBalance(db, u.id)).toBe(500);
  });

  it("die Datenbank lehnt ungültige Buchungen ab", async () => {
    const u = await makeUser();
    // Betrag 0 und negativ
    await expect(post(db, { debit: { account: "clearing" }, credit: { account: "revenue" }, amountCents: 0, kind: "adjustment", idempotencyKey: key() })).rejects.toThrow();
    // am Treiber vorbei: negativer Betrag direkt in die Tabelle
    await expect(
      db.execute(sql`insert into ledger_entries (debit_account, credit_account, amount_cents, kind, idempotency_key) values ('clearing','revenue',-5,'adjustment',${key()})`),
    ).rejects.toThrow();
    // Guthaben ohne Nutzer
    await expect(
      db.execute(sql`insert into ledger_entries (debit_account, credit_account, amount_cents, kind, idempotency_key) values ('clearing','wallet',5,'topup',${key()})`),
    ).rejects.toThrow();
    // Systemkonto mit Nutzer
    await expect(
      db.execute(sql`insert into ledger_entries (debit_account, debit_user_id, credit_account, amount_cents, kind, idempotency_key) values ('clearing', ${u.id}, 'revenue', 5, 'adjustment', ${key()})`),
    ).rejects.toThrow();
  });

  it("Gegenbuchung hebt eine Buchung auf, ohne sie zu verändern", async () => {
    const u = await makeUser();
    await creditWallet(db, u.id, { from: "clearing", amountCents: 2000, kind: "topup", idempotencyKey: key() });
    const share = await db.transaction((tx) => debitWallet(tx, u.id, { to: "revenue", amountCents: 800, kind: "match_share", idempotencyKey: key() }));
    expect(await walletBalance(db, u.id)).toBe(1200);
    await db.transaction((tx) => reverseEntry(tx, share.id, { reason: "Test", idempotencyKey: key() }));
    expect(await walletBalance(db, u.id)).toBe(2000);
    const [orig] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, share.id));
    expect(orig.amountCents).toBe(800);
  });

  it("Kontoauszug mit Vorzeichen, neueste zuerst", async () => {
    const u = await makeUser();
    await creditWallet(db, u.id, { from: "clearing", amountCents: 3000, kind: "topup", idempotencyKey: key() });
    await db.transaction((tx) => debitWallet(tx, u.id, { to: "revenue", amountCents: 1000, kind: "match_share", idempotencyKey: key() }));
    const rows = await walletStatement(u.id);
    expect(rows.map((r) => r.signedCents)).toEqual([-1000, 3000]);
    expect(rows.map((r) => r.kind)).toEqual(["match_share", "topup"]);
  });

  it("Saldenprobe: Soll und Haben sind gleich, Gesamtschuld stimmt", async () => {
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    const wallet = tb.rows.find((r) => r.account === "wallet");
    expect(await totalWalletLiability()).toBe(wallet?.balance ?? 0);
  });
});
