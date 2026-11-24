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
  it("in Produktion ist der Haken nie aktiv, auch nicht mit PAYMENTS_FAKE oder CHARGE_TRIGGER_BACKGROUND=off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_FAKE", "1");
    vi.stubEnv("CHARGE_TRIGGER_BACKGROUND", "off");
    expect(chargeTriggerTestHookActive()).toBe(false);
    const d = deferred();
    runCharges.mockReturnValue(d.promise);
    const p = startChargesInBackground("m1");
    expect(runCharges).toHaveBeenCalledTimes(1); // der Lauf startet trotz "off" (Schalter wirkungslos)
    let drained = false;
    void drainBackgroundCharges().then(() => {
      drained = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(true); // drain wartet in Produktion NICHT auf den Lauf
    d.resolve();
    await p;
  });
});

describe("Testhaken Hintergrundlauf: Testmodus", () => {
  it("Hook aus (Testmodus, kein Schalter): der Lauf startet wie bisher; drain wartet, bis er fertig ist", async () => {
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

  it("CHARGE_TRIGGER_BACKGROUND=off startet im Testmodus gar keinen Lauf", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CHARGE_TRIGGER_BACKGROUND", "off");
    await startChargesInBackground("m3");
    expect(runCharges).not.toHaveBeenCalled();
    await drainBackgroundCharges();
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
    expect(src.split("CHARGE_TRIGGER_BACKGROUND").length - 1).toBe(2); // Kommentar und genau EINE Pruefung, und die steht nach der Testmodus-Pruefung
    expect(src.indexOf("if (!chargeTriggerTestHookActive()) return triggerChargesInBackground(matchId);")).toBeLessThan(src.indexOf('process.env.CHARGE_TRIGGER_BACKGROUND === "off"'));
  });
});
