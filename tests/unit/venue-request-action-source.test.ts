import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// M2d-1: Die Server-Aktion benutzt NUR parseOnboarding (die gemeinsame Quelle mit der Oberflaeche) und hat keine eigene Pruefung der Felder.
const src = readFileSync(path.resolve(import.meta.dirname, "../../src/server/venue-request-actions.ts"), "utf8");

describe("venue-request-actions.ts", () => {
  it("ruft parseOnboarding und werteAusFormData der gemeinsamen Quelle (src/lib/venue-onboarding)", () => {
    expect(src).toContain('from "@/lib/venue-onboarding"');
    expect(src).toMatch(/parseOnboarding\(werteAusFormData\(/);
  });

  it("keine eigene Pruefung: weder parseEuro noch LIMITS noch Zahl-/Laengenpruefung der Felder", () => {
    expect(src).not.toMatch(/parseEuro|LIMITS|CITIES|\.length\s*[<>]|Number\(|parseInt|parseFloat/);
  });

  it("Sitzung zuerst (requireUser) und Fehlertexte nur aus DomainError", () => {
    expect(src.indexOf("requireUser(")).toBeGreaterThan(-1);
    expect(src.indexOf("requireUser(")).toBeLessThan(src.indexOf("parseOnboarding("));
    expect(src).toContain("DomainError");
  });
});
