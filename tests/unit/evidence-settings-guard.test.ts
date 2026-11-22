import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

describe("setSetting verweigert die geschützten Beweisprotokoll-Einstellungen (Plan 16g.1)", () => {
  it("jeder der fünf Schlüssel wirft vor jedem Datenbankzugriff mit klarer Meldung", { timeout: 60_000 }, async () => {
    const { setSetting, PROTECTED_EVIDENCE_SETTINGS } = await import("@/server/settings");
    expect(PROTECTED_EVIDENCE_SETTINGS).toHaveLength(5);
    for (const k of PROTECTED_EVIDENCE_SETTINGS) await expect(setSetting(null, k, "on")).rejects.toThrow(/evidence_set_setting/);
  });
});
