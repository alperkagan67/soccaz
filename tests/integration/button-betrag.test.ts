import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getLobby } from "@/server/lobby";
import { cleanup, makeMatch } from "./helpers";

// Button-Loesung 312j (ENTWURF, Rechtspruefung): der Betrag an "Ich bin bereit", in der Kosten-Zeile und im Dialog "Anteil uebernehmen" kommt aus EINER Quelle: payments.chargeCents (lobby.ts:
// chargeAmount(price, finalShareCents ?? shareToCharge(...)), der tatsaechlich abgebuchte Betrag). Teamspiel mit nur 2 Eingeteilten: Mindestteiler 4, nie der ungeklemmte Anteil.
afterAll(() => cleanup());

describe("payments.chargeCents (die eine Quelle der Seite)", () => {
  it("Teamspiel mit 2 Eingeteilten: Mindestteiler 4 (6000 / 4 = 15,00), nicht 30,00", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 6000, costCents: 6000 }); // nur die zwei Captains sind eingeteilt
    const lobby = await getLobby(m.match.id, null);
    expect(lobby!.payments.chargeCents).toBe(1500);
    expect(lobby!.payments.minChargeApplied).toBe(false);
  });

  it("Mindestbetrag 0,50 EUR wird angehoben (und gekennzeichnet)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 100, costCents: 100 }); // 100 / 4 = 25 Cent
    const lobby = await getLobby(m.match.id, null);
    expect(lobby!.payments.chargeCents).toBe(50);
    expect(lobby!.payments.minChargeApplied).toBe(true);
  });

  it("fixierter Anteil (zweites Bereit) gewinnt: chargeCents = finalShareCents (mindestens 0,50)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 6000, costCents: 6000 });
    await db.update(matches).set({ finalShareCents: 900 }).where(eq(matches.id, m.match.id));
    const lobby = await getLobby(m.match.id, null);
    expect(lobby!.payments.chargeCents).toBe(900);
  });

  it("Gratisspiel (Preis 0) und kein Preis: keine Abbuchung, chargeCents ist null (die Seite zeigt dort keine Formel)", async () => {
    const free = await makeMatch({ hoursAhead: 72, priceCents: 0, costCents: 0 });
    expect((await getLobby(free.match.id, null))!.payments.chargeCents).toBeNull();
  });
});
