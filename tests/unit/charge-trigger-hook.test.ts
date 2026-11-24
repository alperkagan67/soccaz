import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Testhaken fuer den Hintergrundlauf der Kartenabbuchung (Backlog 190): NUR im Testmodus wirksam, in Produktion unerreichbar, Fehlerisolierung unveraendert.
const runCharges = vi.fn();
vi.mock("@/server/payments/charge-run", () => ({ runCharges: (...a: unknown[]) => runCharges(...a), AFTER_START: "after_start", UNKNOWN_OUTCOME: "unknown_outcome" }));

import { chargeTriggerTestHookActive, drainBackgroundCharges, startChargesInBackground } from "@/server/payments/charge-trigger";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<unknown>((r) => {
    resolve = () => r({ ran: true });
  });
  return { promise, resolve };
}

beforeEach(() => {
  runCharges.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Testhaken Hintergrundlauf: Produktion", () => {
  it("in Produktion ist der Haken nie aktiv, auch nicht mit PAYMENTS_FAKE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_FAKE", "1");
    expect(chargeTriggerTestHookActive()).toBe(false);
    const d = deferred();
    runCharges.mockReturnValue(d.promise);
    const p = startChargesInBackground("m1");
    expect(runCharges).toHaveBeenCalledTimes(1); // in Produktion startet der Lauf wie immer
    // drain kehrt in Produktion sofort zurueck, obwohl der Lauf noch haengt (Gegenprobe: ein Timer, der erst nach dem Aufruf feuert, gewinnt NICHT gegen drain)
    const winner = await Promise.race([drainBackgroundCharges().then(() => "drain"), new Promise((r) => setTimeout(() => r("timer"), 50))]);
    expect(winner).toBe("drain");
    d.resolve();
    await p;
  });
});

describe("Testhaken Hintergrundlauf: Testmodus", () => {
  it("Testmodus: der Lauf startet wie bisher und ist registriert; drain wartet, bis er fertig ist", async () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(chargeTriggerTestHookActive()).toBe(true);
    const d = deferred();
    runCharges.mockReturnValue(d.promise);
    void startChargesInBackground("m2");
    expect(runCharges).toHaveBeenCalledTimes(1);
    let drained = false;
    const drain = drainBackgroundCharges().then(() => {
      drained = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(drained).toBe(false);
    d.resolve();
    await drain;
    expect(drained).toBe(true);
  });

  it("PAYMENTS_FAKE=1 ausserhalb von Produktion schaltet den Haken ein (Dev-Server der E2E-Tests)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENTS_FAKE", "1");
    expect(chargeTriggerTestHookActive()).toBe(true);
    vi.stubEnv("PAYMENTS_FAKE", "0");
    expect(chargeTriggerTestHookActive()).toBe(false);
  });

  it("Fehlerisolierung: ein Fehler im Lauf wird nie weitergereicht (start und drain loesen sich ohne Fehler auf), das Log traegt keine Nutzer- oder Spieldaten", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runCharges.mockRejectedValue(new Error("Karte 4242 von max@example.test"));
    await expect(startChargesInBackground("m4")).resolves.toBeUndefined();
    await expect(drainBackgroundCharges()).resolves.toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain("max@example.test");
    log.mockRestore();
  });
});

describe("Testhaken Hintergrundlauf: Quelltext", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(import.meta.dirname, "../..", rel), "utf8");

  it("finalConfirm ruft den Lauf ueber startChargesInBackground, weiter ohne Warten (void), nie direkt", () => {
    const src = read("src/server/lobby.ts");
    expect(src).toContain("if (bothConfirmed) void startChargesInBackground(matchId);");
    expect(src).not.toContain("void triggerChargesInBackground(");
  });

  it("der Haken prueft Produktion zuerst und hat keine zweite Einschaltstelle", () => {
    const src = read("src/server/payments/charge-trigger.ts");
    expect(src).toContain('if (process.env.NODE_ENV === "production") return false;');
    expect(src.split("chargeTriggerTestHookActive()").length - 1).toBeGreaterThanOrEqual(3); // Definition, start, drain
    expect(src).not.toContain("CHARGE_TRIGGER_BACKGROUND"); // kein zweiter Schalter im Zahlungspfad
  });
});
