import { describe, expect, it } from "vitest";
import { chargeFailureText, needsBankConfirmation } from "@/lib/charge-failure-text";

describe("chargeFailureText", () => {
  it("bekannte Codes ergeben einen deutschen Klartext ohne Rohcode", () => {
    for (const code of ["card_declined", "insufficient_funds", "expired_card", "incorrect_cvc", "authentication_required", "processing_error"]) {
      const t = chargeFailureText(code);
      expect(t.length).toBeGreaterThan(10);
      expect(t).not.toContain("_");
    }
    expect(chargeFailureText("insufficient_funds")).toMatch(/Guthaben/);
  });
  it("unbekannte, leere oder fehlende Codes ergeben den allgemeinen Text, nie den Rohcode", () => {
    for (const code of ["weird_new_code", "", null, undefined, "unknown"]) {
      expect(chargeFailureText(code)).toBe(chargeFailureText("nix"));
      expect(chargeFailureText(code)).not.toMatch(/weird|unknown/);
    }
  });
  it("nur authentication_required braucht die Bestätigung der Bank", () => {
    expect(needsBankConfirmation("authentication_required")).toBe(true);
    expect(needsBankConfirmation("card_declined")).toBe(false);
    expect(needsBankConfirmation(null)).toBe(false);
  });
});
