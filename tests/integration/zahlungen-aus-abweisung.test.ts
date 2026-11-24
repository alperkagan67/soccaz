import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { paymentProfiles, paymentSetupIntents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { KOMMT_BALD_TEXT } from "@/lib/turnier-only";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Turnier 12.12.: "Zahlungen AUS in Produktion" ist die Absicherung gegen Geld im Pilot. Belegt wird serverseitig: bei payments_enabled = false und card_payments_enabled = false weisen ALLE Karten- und
// Zahlungsaktionen ab, ohne einen Anbieter-Aufruf (kein Kunde, kein SetupIntent, kein clientSecret). Zusätzlich mit TURNIER_ONLY=1: Lobby-Spiele sind für diese Aktionen schon vor dem Dienst gesperrt.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => (currentUserId ? { user: { id: currentUserId } } : null), signOut: async () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createCardSetupAction, applyStoredCardForLobby } = await import("@/server/payments/card-actions");
const { fakeAuthorizeTournamentAction, fakeTournamentCardAction } = await import("@/server/payments/fake-card-actions");
const { createAuthorizationAction, createTournamentAuthorizationAction } = await import("@/server/payments/authorize-actions");
const { fakeCardReadyAction, fakeAuthorizeAction } = await import("@/server/payments/fake-card-actions");

let provider: FakeProvider;
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
});
afterEach(() => {
  setPaymentProviderForTests(null);
  delete process.env.TURNIER_ONLY;
  delete process.env.PAYMENTS_FAKE;
});
afterAll(cleanup);

async function lobby() {
  const { match, home } = await makeMatch();
  const me = await addPlayer(match.id, home.id, "zaus");
  currentUserId = me.id;
  return { match, me };
}
const anbieterAufrufe = () => provider.calls.filter((c) => ["createCustomer", "createSetupIntent", "createPaymentIntent", "retrieveSetupIntent", "findPaymentIntents"].includes(c.method)).length;

describe("Zahlungen AUS (payments_enabled und card_payments_enabled aus): serverseitig nichts einrichten, nichts herausgeben", () => {
  it("Karte einrichten (mit und ohne Spiel), gespeicherte Karte, Freigabe (Spiel und Turnier): alle weisen ab, kein Anbieteraufruf, keine Zeilen", async () => {
    const { match, me } = await lobby();
    const unbekannt = "00000000-0000-0000-0000-000000000000";
    expect(await createCardSetupAction({ mandateAccepted: true })).toMatchObject({ ok: false });
    expect(await createCardSetupAction({ matchId: match.id, mandateAccepted: true })).toMatchObject({ ok: false });
    expect(await applyStoredCardForLobby({ matchId: match.id, mandateAccepted: true })).toMatchObject({ ok: false });
    expect(await createAuthorizationAction(match.id)).toMatchObject({ ok: false });
    expect(await createTournamentAuthorizationAction(unbekannt)).toMatchObject({ ok: false });
    expect(anbieterAufrufe()).toBe(0);
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, me.id))).toHaveLength(0);
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, me.id))).toHaveLength(0);
  });

  it("die Abweisung nennt kein Bezahlen/Preis/Betrag in der Oberfläche; sie ist neutral", async () => {
    const { match } = await lobby();
    const r = await createCardSetupAction({ matchId: match.id, mandateAccepted: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(/Euro|€|Preis|zahlungspflichtig|abgebucht/i);
    const a = await createAuthorizationAction(match.id);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).not.toMatch(/Euro|€|Preis|zahlungspflichtig|abgebucht/i);
  });

  it("mit TURNIER_ONLY=1: Lobby-Aktionen mit Spiel sind VOR dem Dienst gesperrt (Ruhe-Meldung), auch die Test-Karten-Aktionen", async () => {
    process.env.TURNIER_ONLY = "1";
    process.env.PAYMENTS_FAKE = "1";
    const { match } = await lobby();
    await expect(createCardSetupAction({ matchId: match.id, mandateAccepted: true })).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(applyStoredCardForLobby({ matchId: match.id, mandateAccepted: true })).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(createAuthorizationAction(match.id)).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(fakeCardReadyAction(match.id)).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(fakeAuthorizeAction(match.id, "ok")).rejects.toThrow(KOMMT_BALD_TEXT);
    expect(anbieterAufrufe()).toBe(0);
  });
});

describe("TURNIER_ONLY=1: auch Karte im Konto (ohne Spiel) und Turnier-Zahlungsaktionen sind gesperrt, Plattform-Admin ausgenommen", () => {
  it("Spieler: alles gesperrt, kein Anbieteraufruf", async () => {
    process.env.TURNIER_ONLY = "1";
    process.env.PAYMENTS_FAKE = "1";
    await lobby();
    await expect(createCardSetupAction({ mandateAccepted: true })).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(createTournamentAuthorizationAction("00000000-0000-0000-0000-000000000000")).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(fakeAuthorizeTournamentAction("00000000-0000-0000-0000-000000000000", "ok")).rejects.toThrow(KOMMT_BALD_TEXT);
    await expect(fakeTournamentCardAction()).rejects.toThrow(KOMMT_BALD_TEXT);
    expect(anbieterAufrufe()).toBe(0);
  });
  it("Plattform-Admin: nicht durch die Betriebsart gesperrt (die Dienste entscheiden selbst, bei Zahlungen AUS weisen sie ab)", async () => {
    process.env.TURNIER_ONLY = "1";
    currentUserId = (await makeUser("zadm", "admin")).id;
    const r = await createCardSetupAction({ mandateAccepted: true });
    expect(r.ok).toBe(false); // abgewiesen vom Dienst (Karten-Schalter aus), nicht von der Sperre
  });
});
