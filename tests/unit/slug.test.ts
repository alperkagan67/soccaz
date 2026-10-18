import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("wandelt Umlaute um", () => {
    expect(slugify("FC Müller-Größe")).toBe("fc-mueller-groesse");
  });
  it("entfernt Sonderzeichen und trimmt", () => {
    expect(slugify("  !!Team 7 & Co.!! ")).toBe("team-7-co");
  });
  it("kürzt auf 48 Zeichen", () => {
    expect(slugify("a".repeat(100)).length).toBe(48);
  });
});
