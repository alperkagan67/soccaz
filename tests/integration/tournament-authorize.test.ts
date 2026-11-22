import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentProfiles, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { getTournamentAuthorizationSecret, hasOpenTournamentAuthorization } from "@/server/payments/authorize";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M5-5: 3-D-Secure-Freigabe fuer Turnierzeilen: nur der Zahler selbst, nur im Fenster, neutrale Fehler.

let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCA ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
  hall = v.id;
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Auth-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

describe("M5-5: 3-D-Secure fuer Turnierzeilen", () => {
  it("Secret nur fuer den Zahler selbst im Fenster; Fremde, Veranstalter und abgelaufenes Fenster bekommen den neutralen Fehler", async () => {
    const admin = await makeUser("tadmin", "admin");
    const o = await makeUser("org");
    await setOrganizer(admin.id, o.id, true);
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const all: { id: string }[] = [];
    const caps: { id: string }[] = [];
    for (let i = 0; i < t.maxTeams; i++) {
      const captain = await makeUser("cap");
      const team = await makeTeam(captain.id, "Turnier");
      await registerTeam(captain.id, t.id, team.id);
      const ps = [captain];
      for (let k = 1; k < 4; k++) {
        const p = await makeUser("pl");
        await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
        await joinAsPlayer(p.id, t.id, team.id);
        ps.push(p);
      }
      await setRosterComplete(captain.id, t.id, true);
      for (const p of ps) await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_tca"), paymentMethodId: nid("pm_tca") });
      all.push(...ps);
      caps.push(captain);
    }
    for (const c of caps) await setPaidReady(c.id, t.id);
    const victim = all[5];
    const stranger = all[9];
    provider.setChargeOutcome(victim.id, "requires_action");
    await runTournamentCharges(t.id, new Date(T0 + 3.5 * DAY));
    const [row] = await db.select().from(paymentCharges).where(eq(paymentCharges.userId, victim.id));
    expect(row).toMatchObject({ status: "requires_action", failureCode: "authentication_required" });

    expect(await hasOpenTournamentAuthorization(victim.id, t.id)).toBe(true);
    expect(await hasOpenTournamentAuthorization(stranger.id, t.id)).toBe(false);
    expect(await hasOpenTournamentAuthorization(o.id, t.id)).toBe(false);
    const ok = await getTournamentAuthorizationSecret(victim.id, t.id);
    expect(ok.clientSecret).toBeTruthy();
    await expect(getTournamentAuthorizationSecret(stranger.id, t.id)).rejects.toThrow(/keine Freigabe/);
    await expect(getTournamentAuthorizationSecret(o.id, t.id)).rejects.toThrow(/keine Freigabe/);
    await expect(getTournamentAuthorizationSecret(victim.id, "kein-uuid")).rejects.toThrow(/keine Freigabe/);
    // Fenster abgelaufen
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, row.id));
    await expect(getTournamentAuthorizationSecret(victim.id, t.id)).rejects.toThrow(/keine Freigabe/);
    // Schalter AUS
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() + 3_600_000) }).where(eq(paymentCharges.id, row.id));
    await setSetting(null, "card_payments_enabled", false);
    await expect(getTournamentAuthorizationSecret(victim.id, t.id)).rejects.toThrow(/keine Freigabe/);
  });
});
