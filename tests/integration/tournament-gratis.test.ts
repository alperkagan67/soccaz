import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSetting, setSetting } from "@/server/settings";
import { createTournament, setOrganizer } from "@/server/tournaments";
import { cleanup, makeUser } from "./helpers";

// Gratis-Turnier PR A: bei Zahlungen AUS (Produktion) braucht das Anlegen keinen Hallenpreis und keinen Standardpreis (Voreinstellung 0); bei Zahlungen AN bleibt der Standardpreis-Weg.
let before: { payments: boolean; card: boolean };
beforeAll(async () => {
  before = { payments: (await getSetting<boolean>("payments_enabled", false)) === true, card: (await getSetting<boolean>("card_payments_enabled", false)) === true };
});
afterAll(async () => {
  await setSetting(null, "payments_enabled", before.payments);
  await setSetting(null, "card_payments_enabled", before.card);
  await cleanup();
});

const T0 = Date.now();
const input = { name: "Gratis-Cup", city: "Essen", startsAt: new Date(T0 + 12 * 86_400_000), registrationDeadline: new Date(T0 + 8 * 86_400_000), maxTeams: 8, durationMin: 180 };
async function organizer() {
  const o = await makeUser("gt-org");
  const admin = await makeUser("gt-adm", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}

describe("Turnier anlegen ohne Preisangabe", () => {
  it("Zahlungen AUS: Hallenpreis 0, Gesamtkosten 0, keine Partnerhalle nötig", async () => {
    await setSetting(null, "payments_enabled", false);
    await setSetting(null, "card_payments_enabled", false);
    const o = await organizer();
    const t = await createTournament(o.id, input); // keine hourlyCents
    expect(t.hourlyCents).toBe(0);
    expect(t.totalCents).toBe(0);
    expect(t.venueId).toBeNull();
  });
  it("Zahlungen AUS: ein ausdrücklicher Preis bleibt gültig (nicht überschrieben)", async () => {
    await setSetting(null, "payments_enabled", false);
    await setSetting(null, "card_payments_enabled", false);
    const o = await organizer();
    const t = await createTournament(o.id, { ...input, hourlyCents: 8000 });
    expect(t.hourlyCents).toBe(8000);
  });
});
