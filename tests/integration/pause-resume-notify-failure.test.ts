import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cardPaymentsEnabled, setSetting } from "@/server/settings";
import { setCardSwitch } from "@/server/payment-switch";
import { cleanup, makeUser } from "./helpers";

// Die Mitteilung nach dem Wiedereinschalten ist best effort: ein Fehler dort verhindert das Einschalten nie (Notschalter-Lehre).
vi.mock("@/server/pause-notify", () => ({ notifyResumedGames: async () => { throw new Error("Mitteilung kaputt"); } }));
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

describe("Wiedereinschalten trotz fehlschlagender Mitteilung", () => {
  it("setCardSwitch(on) besteht und der Schalter ist EIN, obwohl die Mitteilung wirft", async () => {
    const owner = await makeUser("rnf", "owner");
    await setCardSwitch(owner.id, false, "Notabschaltung wegen Stoerung", true);
    await expect(setCardSwitch(owner.id, true, "Stoerung behoben, alles geprueft", true)).resolves.toBeUndefined();
    expect(await cardPaymentsEnabled()).toBe(true);
  });
});
