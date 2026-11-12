import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges } from "@/db/schema";
import { audienceFor } from "@/lib/card-visibility";
import { getCardDisplays, getTeamCardsReady } from "@/server/payments/card-status";
import { addPlayer, cleanup, makeMatch } from "./helpers";

afterAll(cleanup);

const setStatus = (matchId: string, userId: string, cardStatus: "none" | "card_ready" | "charged" | "failed") =>
  db.update(matchParticipants).set({ cardStatus }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));

async function game() {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const a2 = await addPlayer(m.match.id, m.home.id);
  const b2 = await addPlayer(m.match.id, m.away.id);
  return { ...m, a2, b2 };
}

describe("getTeamCardsReady: vollständig je Team, unabhängig vom Betrachter (Fund 3)", () => {
  it("true erst, wenn jeder eingeteilte Platz des Teams eine Karte hat oder abgebucht ist; failed und none zählen nicht", async () => {
    const g = await game();
    expect((await getTeamCardsReady(g.match.id))[g.home.id]).toBe(false);
    await setStatus(g.match.id, g.adminA.id, "card_ready");
    await setStatus(g.match.id, g.a2.id, "charged");
    expect((await getTeamCardsReady(g.match.id))[g.home.id]).toBe(true);
    expect((await getTeamCardsReady(g.match.id))[g.away.id]).toBe(false);
    await setStatus(g.match.id, g.a2.id, "failed");
    expect((await getTeamCardsReady(g.match.id))[g.home.id]).toBe(false);
  });
});

describe("getCardDisplays: Sichtbarkeit je Betrachter aus der Datenbank (Fund 4)", () => {
  it("self und Captain desselben Teams sehen failed mit Grund; Gegner-Captain/Mitspieler nur 'open'; Gäste nichts; der Plattform-Admin sieht failed", async () => {
    const g = await game();
    await setStatus(g.match.id, g.a2.id, "failed");
    await db.insert(paymentCharges).values({ matchId: g.match.id, userId: g.a2.id, amountCents: 800, status: "failed", failureCode: "card_declined", idempotencyKey: `charge:${g.match.id}:${g.a2.id}` });
    const as = (viewer: Parameters<typeof audienceFor>[0]) => getCardDisplays(g.match.id, (p) => audienceFor(viewer, p));

    const self = await as({ userId: g.a2.id, platformAdmin: false, adminOf: [], isParticipant: true });
    expect(self[g.a2.id]).toEqual({ status: "failed", reason: "card_declined" });

    const captain = await as({ userId: g.adminA.id, platformAdmin: false, adminOf: [g.home.id], isParticipant: true });
    expect(captain[g.a2.id]).toEqual({ status: "failed", reason: "card_declined" });

    const opponentCaptain = await as({ userId: g.adminB.id, platformAdmin: false, adminOf: [g.away.id], isParticipant: true });
    expect(opponentCaptain[g.a2.id]).toEqual({ status: "open", reason: null });

    const teammate = await as({ userId: g.b2.id, platformAdmin: false, adminOf: [], isParticipant: true });
    expect(teammate[g.a2.id]).toEqual({ status: "open", reason: null });

    const admin = await as({ userId: "platform-admin", platformAdmin: true, adminOf: [], isParticipant: false });
    expect(admin[g.a2.id]).toEqual({ status: "failed", reason: "card_declined" });

    const guest = await as({ userId: null, platformAdmin: false, adminOf: [], isParticipant: false });
    expect(Object.keys(guest)).toHaveLength(0);
    const outsider = await as({ userId: "outsider", platformAdmin: false, adminOf: [], isParticipant: false });
    expect(Object.keys(outsider)).toHaveLength(0);
    // nie ein Fehlercode oder das Wort failed für Dritte
    expect(JSON.stringify([opponentCaptain, teammate, guest, outsider])).not.toMatch(/failed|card_declined/);
  });
});

describe("getCardDisplays: Freigabe offen (M3c-1c)", () => {
  it("authorize nur bei requires_action + authentication_required im offenen Fenster, nur fuer Betroffenen und Captain; nie fuer Mitspieler", async () => {
    const g = await game();
    await setStatus(g.match.id, g.a2.id, "failed");
    await db.insert(paymentCharges).values({ matchId: g.match.id, userId: g.a2.id, amountCents: 800, status: "requires_action", failureCode: "authentication_required", graceUntil: new Date(Date.now() + 3_600_000), idempotencyKey: `charge:${g.match.id}:${g.a2.id}`, paymentIntentId: "pi_cs_authz" });
    const as = (viewer: Parameters<typeof audienceFor>[0]) => getCardDisplays(g.match.id, (p) => audienceFor(viewer, p));
    expect((await as({ userId: g.a2.id, platformAdmin: false, adminOf: [], isParticipant: true }))[g.a2.id]).toMatchObject({ status: "failed", authorize: true });
    expect((await as({ userId: g.adminA.id, platformAdmin: false, adminOf: [g.home.id], isParticipant: true }))[g.a2.id]).toMatchObject({ authorize: true });
    expect(JSON.stringify((await as({ userId: g.adminB.id, platformAdmin: false, adminOf: [g.away.id], isParticipant: true }))[g.a2.id])).not.toMatch(/authorize|pi_cs_authz/);
    // Fenster abgelaufen: kein Flag
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 1000) }).where(eq(paymentCharges.userId, g.a2.id));
    expect((await as({ userId: g.a2.id, platformAdmin: false, adminOf: [], isParticipant: true }))[g.a2.id]).not.toHaveProperty("authorize");
  });
});
