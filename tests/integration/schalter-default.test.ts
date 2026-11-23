import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { cardPaymentsEnabled, paymentsEnabled, setSetting } from "@/server/settings";
import globalSetup from "../e2e/global-setup";
import { enableCardModel } from "../../scripts/lib/seed-switches";
import { cleanup } from "./helpers";

// Schalter-Flip: Seeds schalten Zahlungen UND Kartenmodell EIN (nur lokal), Tests starten und enden im Produktionsstandard AUS/AUS (setup.ts, cleanup.ts, e2e/global-setup.ts).
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  await pool.end();
  await cleanup();
});
const both = async () => [await paymentsEnabled(), await cardPaymentsEnabled()];
const audits = async (key: string) => (await db.select().from(auditLog).where(eq(auditLog.entityId, key))).filter((a) => a.action === "setting.change").length;

describe("Testdatei startet im Produktionsstandard AUS/AUS (tests/integration/setup.ts)", () => {
  it("beide Schalter sind zu Beginn der Datei aus (auch wenn ein Dev-Seed oder eine abgebrochene Datei sie eingeschaltet hat)", async () => {
    expect(await both()).toEqual([false, false]);
  });
});

describe("Dev-Seed: enableCardModel", () => {
  it("schaltet beide EIN, ist idempotent (zweiter Lauf aendert nichts, keine zweite Audit-Zeile) und schreibt eine Audit-Zeile je Aenderung", async () => {
    const a0 = await audits("payments_enabled");
    const c0 = await audits("card_payments_enabled");
    expect(await enableCardModel(pool)).toEqual(["payments_enabled", "card_payments_enabled"]);
    expect(await both()).toEqual([true, true]);
    expect(await audits("payments_enabled")).toBe(a0 + 1);
    expect(await audits("card_payments_enabled")).toBe(c0 + 1);
    expect(await enableCardModel(pool)).toEqual([]);
    expect(await audits("payments_enabled")).toBe(a0 + 1);
    expect(await audits("card_payments_enabled")).toBe(c0 + 1);
    // nur ein Schalter war aus: nur dieser wird geaendert
    await setSetting(null, "card_payments_enabled", false);
    expect(await enableCardModel(pool)).toEqual(["card_payments_enabled"]);
    expect(await both()).toEqual([true, true]);
  });
});

describe("Aufraeumen setzt BEIDE Schalter zurueck (Leck-Fix)", () => {
  it("cleanup() stellt payments_enabled UND card_payments_enabled auf false", async () => {
    await setSetting(null, "payments_enabled", true);
    await setSetting(null, "card_payments_enabled", true);
    await cleanup();
    expect(await both()).toEqual([false, false]);
  });
});

describe("E2E globalSetup setzt vor den Specs den Produktionsstandard", () => {
  it("beide Schalter werden auf false gesetzt (nur lokale Datenbank)", async () => {
    await setSetting(null, "payments_enabled", true);
    await setSetting(null, "card_payments_enabled", true);
    await globalSetup();
    expect(await both()).toEqual([false, false]);
  });

  it("eine fremde Datenbank-URL wird nicht angefasst (Wächter dbUrlAllowed)", async () => {
    await setSetting(null, "card_payments_enabled", true);
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://u:p@evil.example:5433/soccaz_w1";
    try {
      await globalSetup();
    } finally {
      process.env.DATABASE_URL = saved;
    }
    expect(await cardPaymentsEnabled()).toBe(true); // unveraendert
    await setSetting(null, "card_payments_enabled", false);
  });
});

