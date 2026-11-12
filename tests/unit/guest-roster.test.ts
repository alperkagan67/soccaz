import { describe, expect, it } from "vitest";
import { guestRosterView, initialsOf } from "@/lib/guest-roster";

describe("guest-roster", () => {
  it("bildet Initialen aus erstem und letztem Namensteil", () => {
    expect(initialsOf("Max Muster")).toBe("MM");
    expect(initialsOf("anna maria von Test")).toBe("AT");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("   ")).toBe("?");
  });

  it("Ein-Zeichen-Name: nur dieses eine Zeichen, kein Sonderfall", () => {
    expect(initialsOf("x")).toBe("X");
    expect(initialsOf("X Y")).toBe("XY");
  });

  it("Emoji und Surrogatpaare werden nicht zerschnitten", () => {
    expect(initialsOf("😀 Smile")).toBe("😀S");
    expect(initialsOf("👨‍👩‍👧 Familie")).toBe("👨‍👩‍👧F"); // ZWJ-Folge bleibt ein Zeichen
    expect(initialsOf("𝒳avier")).toBe("𝒳"); // Zeichen außerhalb der Grundebene
  });

  it("kombinierende Zeichen bleiben beim Buchstaben", () => {
    expect(initialsOf("émile Zola")).toBe("ÉZ"); // e + Akzent als zwei Codepunkte
    expect(initialsOf("Zola É")).toBe("ZÉ");
  });

  it("ß wird nach deutschen Regeln zu SS", () => {
    expect(initialsOf("ß")).toBe("SS");
    expect(initialsOf("ßmith Ärmel")).toBe("SSÄ");
  });

  it("liefert nur Anzahl und Initialen, nie Namen oder IDs", () => {
    const view = guestRosterView([{ name: "Max Muster" }, { name: "Erika Beispiel" }]);
    expect(view).toEqual({ count: 2, initials: ["MM", "EB"] });
    expect(JSON.stringify(view)).not.toMatch(/Max|Muster|Erika|Beispiel/);
  });
});
