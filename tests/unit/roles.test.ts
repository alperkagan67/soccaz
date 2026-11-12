import { describe, expect, it } from "vitest";
import { can, isOwner, isPlatformAdmin } from "@/lib/roles";

// Vertrag 009 M1, E1a: Admin 1 trägt weiter die Rolle admin (zusätzlich is_owner), damit alle bisherigen Plattform-Prüfungen für ihn gelten.
describe("isPlatformAdmin / isOwner", () => {
  it("Plattform-Admin ist nur die Rolle admin (Admin 1 und Admin 2), Teilrollen und Spieler nicht", () => {
    expect(isPlatformAdmin({ role: "admin" })).toBe(true);
    expect(isPlatformAdmin({ role: "admin", isOwner: true } as never)).toBe(true);
    for (const role of ["player", "moderator", "finance", "booking"] as const) expect(isPlatformAdmin({ role })).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });
  it("Admin 1 = Rolle admin UND is_owner; Admin 2 und alle anderen nicht", () => {
    expect(isOwner({ role: "admin", isOwner: true })).toBe(true);
    expect(isOwner({ role: "admin", isOwner: false })).toBe(false);
    expect(isOwner({ role: "admin" })).toBe(false);
    expect(isOwner({ role: "player", isOwner: true })).toBe(false); // verletzt den CHECK der Datenbank, die Funktion lässt es trotzdem nicht durch
    expect(isOwner(null)).toBe(false);
  });
  it("can() bleibt unverändert: Admin 1 hat als Rolle admin alle Berechtigungen", () => {
    expect(can("admin", "finance")).toBe(true);
  });
});
