import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentProfiles, paymentRefunds, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { sendPendingTournamentRefunds } from "@/server/payments/tournament-refund";
import { setSetting } from "@/server/settings";
import { cancelTournament, createTournament, joinAsPlayer, registerTeam, reopenRosters, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// 012 M6b (Befund aus b2-i Teil 2): Kader öffnen ist ab der ersten Abbuchungszeile des Turniers nicht mehr möglich. Vorher lief reopenRosters nach einer TEILWEISEN Abbuchung
// (15 erfolgreich, 1 gescheitert, Turnier noch in "payment") ohne Fehler: Status zurück auf Anmeldung, die erfolgreichen Abbuchungen blieben ohne Erstattung bestehen und
// der nächste Preislauf hätte dieselben Spieler ein zweites Mal belastet. Jetzt: Ablehnung, die Absage (Admin 1) erstattet.
let provider: FakeProvider;
let hall = "";
let owner: { id: string };
beforeAll(async () => {
  owner = await makeUser("adm1", "owner"); // Admin 1: nach der ersten Abbuchung sagt nur er ab
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
  const [v] = await db.insert(venues).values({ name: `RG Halle ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
  hall = v.id;
});
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const base = { name: "Reopen-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
let seq = 0;

/** Turnier im Kartenmodell, 4 Teams vollzählig (Status payment), alle mit Karte, alle Captains bereit; noch NICHT abgebucht. */
async function readyTournament() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const all: { id: string }[] = [];
  const caps: { id: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const c = await makeUser("cap");
    const team = await makeTeam(c.id, "Turnier");
    await registerTeam(c.id, t.id, team.id, await tokenOf(t.id));
    caps.push(c);
    all.push(c);
    for (let j = 1; j < 4; j++) {
      const p = await makeUser("pl");
      await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
      await joinAsPlayer(p.id, t.id, team.id);
      all.push(p);
    }
    await setRosterComplete(c.id, t.id, true);
  }
  await db.insert(paymentProfiles).values(all.map((u) => ({ userId: u.id, stripeCustomerId: `cus_rg_${u.id}_${++seq}`, paymentMethodId: `pm_rg_${u.id}` })));
  for (const c of caps) await setPaidReady(c.id, t.id);
  return { o, t, all, caps };
}
const chargesOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const statusOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const readyCount = async (tid: string) => (await db.select().from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tid)))).filter((x) => x.paidReadyAt !== null).length;

describe("Kader wieder öffnen nach Beginn der Abbuchung", () => {
  it("nach TEILWEISER Abbuchung (15 erfolgreich, 1 gescheitert, Turnier noch in payment): abgelehnt, nichts ändert sich; die Absage durch Admin 1 erstattet die 15 Abbuchungen", async () => {
    const { o, t, all } = await readyTournament();
    provider.setChargeOutcome(all[5].id, "declined");
    await runTournamentCharges(t.id, new Date());
    const before = await chargesOf(t.id);
    expect(before.filter((c) => c.status === "succeeded")).toHaveLength(15);
    expect(before.filter((c) => c.status === "failed")).toHaveLength(1);
    expect((await statusOf(t.id)).status).toBe("payment"); // Alles-oder-nichts-Fenster: nicht gebucht, kein Bracket

    await expect(reopenRosters(o.id, t.id)).rejects.toThrow(/Abbuchung hat begonnen.*Admin 1/);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment" }); // unverändert
    expect((await statusOf(t.id)).finalShareCents).not.toBeNull();
    expect(await readyCount(t.id)).toBe(4); // Bereit der Teams bleibt
    expect((await chargesOf(t.id)).map((c) => c.status).sort()).toEqual(before.map((c) => c.status).sort());

    // der richtige Weg: Absage durch Admin 1, die erfolgreichen Abbuchungen werden erstattet
    await cancelTournament(owner.id, t.id);
    await sendPendingTournamentRefunds(t.id);
    const refunds = await db.select().from(paymentRefunds).where(eq(paymentRefunds.tournamentId, t.id));
    expect(refunds.filter((r) => r.status === "succeeded")).toHaveLength(15);
    expect((await statusOf(t.id)).status).toBe("cancelled");
  });

  it("schon mit EINER Abbuchungszeile (auch ausstehend) ist das Öffnen abgelehnt; ohne Abbuchungszeile funktioniert es weiter (Regression)", async () => {
    const a = await readyTournament();
    await reopenRosters(a.o.id, a.t.id); // noch nichts abgebucht
    expect(await statusOf(a.t.id)).toMatchObject({ status: "registration", finalShareCents: null });
    expect(await readyCount(a.t.id)).toBe(0);

    const b = await readyTournament();
    await db.insert(paymentCharges).values({ tournamentId: b.t.id, userId: b.all[0].id, amountCents: 1000, status: "pending", idempotencyKey: `charge:t:${b.t.id}:${b.all[0].id}:rg` });
    await expect(reopenRosters(b.o.id, b.t.id)).rejects.toThrow(/Abbuchung hat begonnen/);
    expect((await statusOf(b.t.id)).status).toBe("payment");
  });
});
