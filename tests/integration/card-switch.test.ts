import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditLog, matchParticipants, users } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { settings } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { getAlerts } from "@/server/finance";
import { setReady } from "@/server/lobby";
import { cardPaymentsEnabled, paymentsEnabled, setSetting, tournamentPaymentsActive } from "@/server/settings";
import { frozenTournaments } from "@/server/tournaments";
import { getCardSwitch, setCardSwitch } from "@/server/payment-switch";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Notschalter Kartenzahlung (Entscheid t2q/t2s): NUR Admin 1; Grund (3 bis 200, bereinigt) und Bestaetigung Pflicht; eine Transaktion unter Sperre; Audit mit Grund im Klartext UND SHA-256, ohne
// Personendaten. Aus = Zahlungen pausiert (kein Guthaben-Fallback, nicht kostenlos): Turniere frieren ein, Alarm card:switch-off.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { setCardSwitchAction } from "@/server/admin-finance-actions";

beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  await setSetting(null, "payments_enabled", false);
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

// Admin 1 gibt es hoechstens einmal je Datenbank (Teilindex): einmal anlegen, bis cleanup() in afterAll
let ownerUser: Awaited<ReturnType<typeof makeUser>> | null = null;
const owner = async () => (ownerUser ??= await makeUser("sw1", "owner"));
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const switchAudits = async () => (await db.select().from(auditLog).where(and(eq(auditLog.entity, "setting"), eq(auditLog.entityId, "card_payments_enabled"), like(auditLog.action, "card_switch.%")))).sort((a, b) => a.at.getTime() - b.at.getTime());
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ reason: "Stripe-Stoerung seit 10 Uhr", confirm: "on", ...over })) fd.set(k, v);
  return fd;
};

describe("setCardSwitch: nur Admin 1", () => {
  it("Admin 2, Spieler, Betreiber und gesperrter Admin werden abgewiesen, nichts geaendert, kein Audit", async () => {
    const admin2 = await makeUser("sw2", "admin");
    const player = await makeUser("swp");
    const o = await owner();
    const before = (await switchAudits()).length;
    for (const who of [admin2, player]) {
      await expect(setCardSwitch(who.id, false, "Notfall wegen Stoerung", true)).rejects.toThrow(/nur Admin 1/);
    }
    // gesperrter Admin 1 darf nicht schalten
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, o.id));
    await expect(setCardSwitch(o.id, false, "Notfall wegen Stoerung", true)).rejects.toThrow(/nur Admin 1/);
    await db.update(users).set({ bannedAt: null }).where(eq(users.id, o.id));
    expect(await cardPaymentsEnabled()).toBe(true);
    expect((await switchAudits()).length).toBe(before);
  });

  it("die Server-Aktion verlangt Admin 1 (Waechter owner): Admin 2 wird weitergeleitet, nichts geaendert", async () => {
    const admin2 = await makeUser("sw2", "admin");
    currentUserId = admin2.id;
    await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, admin2.id));
    await expect(setCardSwitchAction(false, undefined, form())).rejects.toThrow(/REDIRECT/);
    expect(await cardPaymentsEnabled()).toBe(true);
  });
});

describe("setCardSwitch: Pflichtangaben", () => {
  it("Grund Pflicht (leer, zu kurz, zu lang, nur Steuerzeichen) und Bestaetigung Pflicht: nichts geaendert", async () => {
    const o = await owner();
    for (const reason of ["", "ab", "x".repeat(201), "\n\n\t  "]) await expect(setCardSwitch(o.id, false, reason, true)).rejects.toThrow(/Grund/);
    await expect(setCardSwitch(o.id, false, "Stripe-Stoerung seit 10 Uhr", false)).rejects.toThrow(/Folgen/);
    expect(await cardPaymentsEnabled()).toBe(true);
  });

  it("Steuerzeichen und Zeilenumbrueche im Grund werden bereinigt", async () => {
    const o = await owner();
    await setCardSwitch(o.id, false, "Stripe\nStoerung\u0000 heute\r\nfrueh", true);
    const a = (await switchAudits()).at(-1)!;
    expect((a.after as { reason: string }).reason).toBe("Stripe Stoerung heute frueh");
  });
});

describe("setCardSwitch: Wirkung und Protokoll", () => {
  it("Ausschalten und Wiedereinschalten: Schalter wechselt, updated_by = Akteur, genau eine Audit-Zeile je Wechsel mit before/after, Grund im Klartext UND SHA-256, ohne E-Mail", async () => {
    const o = await owner();
    const n0 = (await switchAudits()).length;
    await setCardSwitch(o.id, false, "Stripe-Stoerung seit 10 Uhr", true);
    expect(await cardPaymentsEnabled()).toBe(false);
    const row = (await db.select().from(settings).where(eq(settings.key, "card_payments_enabled")))[0];
    expect(row.updatedBy).toBe(o.id);
    await setCardSwitch(o.id, true, "Stoerung behoben, Webhook geprueft", true);
    expect(await cardPaymentsEnabled()).toBe(true);
    const audits = await switchAudits();
    expect(audits).toHaveLength(n0 + 2);
    const [off, on] = audits.slice(-2);
    expect(off.action).toBe("card_switch.off");
    expect(off.actorId).toBe(o.id);
    expect(off.before).toMatchObject({ value: true });
    expect(off.after).toMatchObject({ value: false, reason: "Stripe-Stoerung seit 10 Uhr", reasonSha256: sha("Stripe-Stoerung seit 10 Uhr") });
    expect(on.action).toBe("card_switch.on");
    expect(on.after).toMatchObject({ value: true, reasonSha256: sha("Stoerung behoben, Webhook geprueft") });
    expect(JSON.stringify(audits.slice(-2))).not.toContain("@test.local");
  });

  it("steht der Schalter schon auf dem Wunschwert: abgewiesen (Doppelklick), kein zweiter Audit; parallel: genau ein Gewinner", async () => {
    const o = await owner();
    await setCardSwitch(o.id, false, "Notabschaltung wegen Stoerung", true);
    await expect(setCardSwitch(o.id, false, "Nochmal ausschalten", true)).rejects.toThrow(/schon/);
    const res = await Promise.allSettled([setCardSwitch(o.id, true, "Gleichzeitig einschalten 1", true), setCardSwitch(o.id, true, "Gleichzeitig einschalten 2", true)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await cardPaymentsEnabled()).toBe(true);
  });

  it("die Aktion mit Formular: ohne Haekchen Fehlermeldung, mit Haekchen und Grund wirkt sie", async () => {
    const o = await owner();
    await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, o.id));
    currentUserId = o.id;
    const noConfirm = await setCardSwitchAction(false, undefined, form({ confirm: "" }));
    expect(noConfirm?.error).toMatch(/Folgen/);
    expect(await cardPaymentsEnabled()).toBe(true);
    const ok = await setCardSwitchAction(false, undefined, form());
    expect(ok?.ok).toBe(true);
    expect(await cardPaymentsEnabled()).toBe(false);
  });
});

describe("Anzeige und Folgen", () => {
  it("getCardSwitch liefert Zustand und seit wann; ohne Zeile: Standard AUS, 'noch nie geschaltet'", async () => {
    const o = await owner();
    await setCardSwitch(o.id, false, "Notabschaltung wegen Stoerung", true);
    const s = await getCardSwitch();
    expect(s).toMatchObject({ enabled: false, neverSwitched: false });
    expect(s.since).toBeInstanceOf(Date);
    expect(Date.now() - s.since!.getTime()).toBeLessThan(60_000);
    await db.delete(settings).where(eq(settings.key, "card_payments_enabled"));
    expect(await getCardSwitch()).toMatchObject({ enabled: false, since: null, neverSwitched: true });
  });

  it("AUS: Turnier mit Preis bleibt eingefroren (tournamentPaymentsActive false), Alarm card:switch-off bei Zahlungen AN; bei EIN kein Alarm", async () => {
    const o = await owner();
    await setSetting(null, "payments_enabled", true);
    const org = await makeUser("swo");
    const DAY = 86_400_000;
    const [t] = await db.insert(tournaments).values({ organizerId: org.id, name: `Notschalter-Cup ${Date.now()}`, city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: 4, totalCents: 16000, hourlyCents: 8000, durationMin: 120, status: "payment", registrationDeadline: new Date(Date.now() + 4 * DAY), startsAt: new Date(Date.now() + 6 * DAY), isPrivate: false, venueAccessRequiredSnapshot: false, commissionPercentSnapshot: "10.00", finalShareCents: 1000 } as typeof tournaments.$inferInsert).returning();
    expect((await getAlerts()).some((a) => a.code === "card:switch-off")).toBe(false);
    await setCardSwitch(o.id, false, "Notabschaltung wegen Stoerung", true);
    expect(await tournamentPaymentsActive()).toBe(false);
    expect((await frozenTournaments(db, new Date(Date.now() + 10 * DAY))).map((f) => f.id)).toContain(t.id);
    const alert = (await getAlerts()).find((a) => a.code === "card:switch-off");
    expect(alert).toMatchObject({ severity: "high" });
    await setCardSwitch(o.id, true, "Stoerung behoben, alles geprueft", true);
    expect((await getAlerts()).some((a) => a.code === "card:switch-off")).toBe(false);
    expect(await paymentsEnabled()).toBe(true);
  });

  it("bei Zahlungen AUS (Gratis) gibt es keinen Alarm, auch wenn der Kartenschalter aus ist", async () => {
    const o = await owner();
    await setCardSwitch(o.id, false, "Notabschaltung wegen Stoerung", true);
    expect(await paymentsEnabled()).toBe(false);
    expect((await getAlerts()).some((a) => a.code === "card:switch-off")).toBe(false);
  });
});

describe("Kernversprechen: Zahlungen AN + Karte AUS (pausiert)", () => {
  it("ein neuer Spieler kann beitreten, aber nicht 'Bereit' melden: abgewiesen mit Support-Hinweis, NICHTS wird kostenlos oder vom Guthaben gebucht (kein Hauptbuch-Eintrag, kein paid_cents), Alarm steht", async () => {
    const o = await owner();
    await setSetting(null, "payments_enabled", true);
    await setCardSwitch(o.id, false, "Notabschaltung wegen Stoerung", true);
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id); // Beitritt moeglich
    const ledgerBefore = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, m.match.id))).length;
    await expect(setReady(p.id, m.match.id, true)).rejects.toThrow(/zahle zuerst[\s\S]*Support/);
    const seat = (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, p.id))))[0];
    expect(seat.readyAt).toBeNull();
    expect(seat.paidCents).toBe(0);
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, m.match.id))).length).toBe(ledgerBefore);
    expect((await getAlerts()).some((a) => a.code === "card:switch-off")).toBe(true);
  });
});
