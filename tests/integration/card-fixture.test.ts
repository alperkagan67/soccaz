import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges, paymentProfiles } from "@/db/schema";
import { cardPaymentsEnabled, paymentsEnabled, setSetting } from "@/server/settings";
import { cardGame, chargeGame, cleanup, giveCard, makeUser, useCardMode } from "./helpers";

// 012 M6b Kartenfixture: der Helfer selbst ist geprüft (Aufbau, genau eine Abbuchung je Platz, Rückbau der Schalter).
let mode: Awaited<ReturnType<typeof useCardMode>>;
beforeEach(async () => {
  mode = await useCardMode();
});
afterEach(async () => {
  await mode.restore();
  await cleanup();
});

describe("Kartenfixture", () => {
  it("giveCard legt genau ein Zahlungsprofil an (zweimal aufrufen ändert nichts)", async () => {
    const u = await makeUser("fx");
    await giveCard(u.id);
    await giveCard(u.id);
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, u.id))).toHaveLength(1);
  });

  it("cardGame baut ein abbuchungsbereites Spiel: n Plätze mit Karte, Anteil fixiert, nichts bezahlt, keine Abbuchungszeile", async () => {
    const g = await cardGame({ n: 6, price: 6000 });
    const seats = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id));
    expect(seats).toHaveLength(6);
    expect(seats.every((s) => s.cardStatus === "card_ready" && s.paidCents === 0)).toBe(true);
    expect(g.all).toHaveLength(6);
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).toHaveLength(0);
  });

  it("chargeGame belastet jeden Platz genau einmal (zweiter Lauf ändert nichts), Plätze sind 'charged', paid_cents bleibt 0", async () => {
    const g = await cardGame({ n: 4, price: 4000 });
    await chargeGame(g);
    await chargeGame(g);
    const rows = await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === "succeeded" && r.amountCents === 1000)).toBe(true);
    const seats = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id)));
    expect(seats.every((s) => s.cardStatus === "charged" && s.paidCents === 0)).toBe(true);
  });

  it("useCardMode schaltet beide Schalter an; restore() stellt die AUSGANGSWERTE wieder her (auch wenn sie nicht aus waren)", async () => {
    expect(await paymentsEnabled()).toBe(true);
    expect(await cardPaymentsEnabled()).toBe(true);
    await mode.restore();
    expect(await paymentsEnabled()).toBe(false);
    expect(await cardPaymentsEnabled()).toBe(false);
    // Ausgangslage "payments AN, card AUS" (pausiert, Entscheid D) bleibt nach useCardMode/restore erhalten
    await setSetting(null, "payments_enabled", true);
    const m2 = await useCardMode();
    await m2.restore();
    expect(await paymentsEnabled()).toBe(true);
    expect(await cardPaymentsEnabled()).toBe(false);
    await setSetting(null, "payments_enabled", false);
    mode = await useCardMode(); // für das afterEach
  });
});
