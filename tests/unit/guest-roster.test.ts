import { describe, expect, it } from "vitest";
import { guestRosterView, initialsOf } from "@/lib/guest-roster";

describe("guest-roster", () => {
  it("bildet Initialen aus erstem und letztem Namensteil", () => {
    expect(initialsOf("Max Muster")).toBe("MM");
    expect(initialsOf("anna maria von Test")).toBe("AT");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("   ")).toBe("?");
  });

  it("liefert nur Anzahl und Initialen, nie Namen oder IDs", () => {
    const view = guestRosterView([{ name: "Max Muster" }, { name: "Erika Beispiel" }]);
    expect(view).toEqual({ count: 2, initials: ["MM", "EB"] });
    expect(JSON.stringify(view)).not.toMatch(/Max|Muster|Erika|Beispiel/);
  });
});
