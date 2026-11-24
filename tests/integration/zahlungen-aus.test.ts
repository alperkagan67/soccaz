import { afterAll, describe, expect, it } from "vitest";
import { setSetting } from "@/server/settings";
import { zahlungenAus } from "@/server/zahlungen-aus";
import { cleanup } from "./helpers";

// Modus "Zahlungen AUS": EIN Schalter (payments_enabled). Standard und AUS = true, nur AN = false; der Kartenschalter ändert nichts daran.
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

describe("zahlungenAus()", () => {
  it("Zahlungen AUS (Standard, false) = true; AN = false; unabhängig vom Kartenschalter", async () => {
    await setSetting(null, "payments_enabled", false);
    await setSetting(null, "card_payments_enabled", false);
    expect(await zahlungenAus()).toBe(true);
    await setSetting(null, "card_payments_enabled", true); // Zahlungen AUS bleibt AUS, auch mit eingeschaltetem Kartenmodell
    expect(await zahlungenAus()).toBe(true);
    await setSetting(null, "payments_enabled", true);
    expect(await zahlungenAus()).toBe(false);
    await setSetting(null, "card_payments_enabled", false);
    expect(await zahlungenAus()).toBe(false);
  });
});
