import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-path";

const BS = String.fromCharCode(92); // Backslash
const ch = (n: number) => String.fromCharCode(n);

describe("safeInternalPath: nur interne Pfade", () => {
  it("Normalfall, Query und Fragment bleiben erhalten", () => {
    expect(safeInternalPath("/turniere/123?t=abc")).toBe("/turniere/123?t=abc");
    expect(safeInternalPath("/app")).toBe("/app");
    expect(safeInternalPath("/a/b?x=1&y=2#frag")).toBe("/a/b?x=1&y=2#frag");
    expect(safeInternalPath("/")).toBe("/");
  });

  it("fremde Ziele ergeben den Fallback", () => {
    for (const bad of ["https://evil.example", "http://evil.example/x", "//evil.example", "///evil", "javascript:alert(1)", "evil.example", "app", "data:text/html,x"]) {
      expect(safeInternalPath(bad)).toBe("/app");
    }
  });

  it("Backslash und Steuerzeichen (auch Tab und Zeilenumbruch) sind verboten", () => {
    for (const bad of [`/${BS}evil.example`, `/a${BS}b`, `/${ch(9)}/evil.example`, `/${ch(10)}/evil.example`, `/${ch(13)}/evil`, `/a${ch(0)}b`, `/a${ch(31)}b`, `/a${ch(127)}b`]) {
      expect(safeInternalPath(bad)).toBe("/app");
    }
  });

  it("leer, fehlend und zu lang ergeben den Fallback; eigener Fallback möglich", () => {
    expect(safeInternalPath(undefined)).toBe("/app");
    expect(safeInternalPath(null)).toBe("/app");
    expect(safeInternalPath("")).toBe("/app");
    expect(safeInternalPath("/" + "a".repeat(500))).toBe("/app"); // 501 Zeichen
    expect(safeInternalPath("/" + "a".repeat(499))).toHaveLength(500);
    expect(safeInternalPath("nope", "/teams")).toBe("/teams");
  });

  it("kodierte Schrägstriche sind kein Host und gehen als interner Pfad durch", () => {
    expect(safeInternalPath("/%2f/evil")).toBe("/%2f/evil");
  });
});
