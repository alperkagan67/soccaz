import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { FakeProvider } from "@/server/payments/fake";
import { fakeAuthorizeTournamentCore } from "@/server/payments/fake-authorize";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { setSetting } from "@/server/settings";
import { fakeAuthorizeTournamentAction } from "@/server/payments/fake-card-actions";
import { cleanup, makeUser } from "./helpers";

// Die Sitzung und der Next-Cache gibt es im Test nicht: die Aktion darf sie in den Sperr-Faellen NIE erreichen (der Mock der Sitzung wirft, wenn sie doch gerufen wird).
vi.mock("@/server/session", () => ({ requireUser: async () => { throw new Error("SITZUNG-GERUFEN"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// 012-Rest PR B (Backlog 143): Fake-3-D-Secure fuer Turnierzeilen. Fixtures per DB (Turnier in payment, Zeile requires_action mit PaymentIntent und Profil); die Zahlung laeuft durch den echten Webhook.
let provider: FakeProvider;
beforeAll(async () => {
  await setSetting(null, "card_payments_enabled", true);
});
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_fakeauth_t_%"));
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const DAY = 86_400_000;
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;

async function fixture(over: { payerIsOther?: boolean; status?: "requires_action" | "failed" | "succeeded"; code?: string | null } = {}) {
  const org = await makeUser("org");
  const player = await makeUser("pl");
  const other = await makeUser("oth");
  const payer = over.payerIsOther ? other : player; // Variante B: der Zahler ist ein anderer als der Platz
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id, name: nid("Fake3DS-Cup"), city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: 4, totalCents: 16000, hourlyCents: 8000, durationMin: 120,
      status: "payment", registrationDeadline: new Date(Date.now() + 4 * DAY), startsAt: new Date(Date.now() + 6 * DAY), isPrivate: false, venueAccessRequiredSnapshot: false, commissionPercentSnapshot: "10.00", finalShareCents: 1000,
    } as typeof tournaments.$inferInsert)
    .returning();
  await db.insert(paymentProfiles).values({ userId: payer.id, stripeCustomerId: nid("cus"), paymentMethodId: nid("pm") });
  const pi = nid("pi_fake3ds");
  const [row] = await db
    .insert(paymentCharges)
    .values({
      tournamentId: t.id, userId: player.id, payerUserId: over.payerIsOther ? other.id : null, amountCents: 1000, idempotencyKey: nid("c"), status: over.status ?? "requires_action",
      failureCode: over.code === undefined ? "authentication_required" : over.code, paymentIntentId: pi, graceUntil: new Date(Date.now() + 3_600_000),
    })
    .returning();
  return { org, player, other, payer, t, row, pi };
}
const rowOf = async (id: string) => (await db.select().from(paymentCharges).where(eq(paymentCharges.id, id)))[0];
const events = async () => (await db.select().from(stripeEvents).where(like(stripeEvents.eventId, "evt_fakeauth_t_%"))).length;
const NONE = /keine Freigabe möglich/;

describe("Fake-Freigabe fuer Turnierzeilen", () => {
  it("ok: der Zahler gibt frei, die Zeile ist bezahlt, gebucht mit tournament_id, ueber den Webhook (stripe_events)", async () => {
    const { payer, row, t, pi } = await fixture();
    const before = await events();
    expect(await fakeAuthorizeTournamentCore(payer.id, t.id, "ok")).toEqual({});
    const after = await rowOf(row.id);
    expect(after.status).toBe("succeeded");
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `charge:${pi}`)))[0]).toMatchObject({ kind: "tournament_share", tournamentId: t.id });
    expect(await events()).toBe(before + 1); // signiertes Ereignis, nie direkt gebucht
  });

  it("fail: die Zeile ist fehlgeschlagen, das Turnier bleibt in payment (Nachzahlfenster)", async () => {
    const { payer, row, t } = await fixture();
    expect(await fakeAuthorizeTournamentCore(payer.id, t.id, "fail")).toEqual({});
    expect((await rowOf(row.id)).status).toBe("failed");
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe("payment");
  });

  it("Uebernahme (Variante B): der ZAHLER bekommt die Freigabe, nicht der Platz", async () => {
    const { player, other, row, t } = await fixture({ payerIsOther: true });
    expect(await fakeAuthorizeTournamentCore(player.id, t.id, "ok")).toEqual({ error: expect.stringMatching(NONE) });
    expect((await rowOf(row.id)).status).toBe("requires_action");
    expect(await fakeAuthorizeTournamentCore(other.id, t.id, "ok")).toEqual({});
    expect((await rowOf(row.id)).status).toBe("succeeded");
  });

  it("fremder Nutzer, Veranstalter, falscher Zustand, unbekanntes Turnier, ungueltige ID: dieselbe neutrale Meldung, kein Ereignis, keine Aenderung", async () => {
    const a = await fixture();
    const stranger = await makeUser("str");
    const b = await fixture({ status: "failed", code: "card_declined" });
    const c = await fixture({ status: "succeeded", code: null });
    // auch Fremde mit eigenem Zahlungsprofil duerfen keine fremde Zeile freigeben (sonst schuetzt nur das fehlende Profil)
    for (const u of [stranger, a.org]) await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: nid("cus"), paymentMethodId: nid("pm") });
    const before = await events();
    for (const [uid, tid] of [
      [stranger.id, a.t.id],
      [a.org.id, a.t.id],
      [b.payer.id, b.t.id],
      [c.payer.id, c.t.id],
      [a.payer.id, "00000000-0000-4000-8000-000000000000"],
      [a.payer.id, "kein-uuid"],
    ] as const) expect(await fakeAuthorizeTournamentCore(uid, tid, "ok")).toEqual({ error: expect.stringMatching(NONE) });
    expect(await events()).toBe(before);
    expect((await rowOf(a.row.id)).status).toBe("requires_action");
  });

  it("Anbieter ungleich Fake: nicht verfuegbar", async () => {
    const { payer, t } = await fixture();
    setPaymentProviderForTests({ name: "stripe" } as never); // ein anderer Anbieter als der Fake ist aktiv
    const r = await fakeAuthorizeTournamentCore(payer.id, t.id, "ok");
    expect(r.error).toBeDefined();
    expect(r.error).not.toMatch(NONE); // "Nicht verfügbar."
    expect(await rowOf((await db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, t.id)))[0].id)).toMatchObject({ status: "requires_action" });
  });
});

describe("Mehrere offene Zeilen eines Zahlers (eigene + uebernommene), Reihenfolge", () => {
  it("Zahler mit zwei requires_action-Zeilen: beide nacheinander freigebbar, zuerst die aelteste", async () => {
    const { payer, row, t } = await fixture();
    const owner2 = await makeUser("pl2");
    const [row2] = await db
      .insert(paymentCharges)
      .values({ tournamentId: t.id, userId: owner2.id, payerUserId: payer.id, amountCents: 1000, idempotencyKey: nid("c"), status: "requires_action", failureCode: "authentication_required", paymentIntentId: nid("pi_fake3ds"), graceUntil: new Date(Date.now() + 3_600_000), createdAt: new Date(row.createdAt.getTime() - 60_000) }) // physisch SPAETER eingefuegt, aber AELTER
      .returning();
    expect(await fakeAuthorizeTournamentCore(payer.id, t.id, "ok")).toEqual({});
    expect((await rowOf(row2.id)).status).toBe("succeeded"); // die aeltere zuerst (ORDER BY created_at, id), nicht die zuerst eingefuegte
    expect((await rowOf(row.id)).status).toBe("requires_action");
    expect(await fakeAuthorizeTournamentCore(payer.id, t.id, "ok")).toEqual({});
    expect((await rowOf(row.id)).status).toBe("succeeded");
    expect(await fakeAuthorizeTournamentCore(payer.id, t.id, "ok")).toEqual({ error: expect.stringMatching(NONE) }); // nichts mehr offen
  });
});

describe("Aktion: Sperren im Verhalten (NODE_ENV=production), ohne Sitzung und Server", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("PAYMENTS_FAKE=1 in Produktion: die Aktion wirft vor jeder Sitzung und jedem Kern", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_FAKE", "1");
    await expect(fakeAuthorizeTournamentAction("00000000-0000-4000-8000-000000000000", "ok")).rejects.toThrow(/Produktion verboten/);
  });
  it("Produktion ohne PAYMENTS_FAKE: 'Nicht verfuegbar', kein Kern, keine Aenderung", async () => {
    const { payer, row, t } = await fixture();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_FAKE", "");
    expect(await fakeAuthorizeTournamentAction(t.id, "ok")).toEqual({ error: "Nicht verfügbar." });
    vi.unstubAllEnvs();
    expect((await rowOf(row.id)).status).toBe("requires_action");
    expect(payer.id).toBeDefined();
  });
});
