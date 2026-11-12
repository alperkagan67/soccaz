import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

// Backlog 3 (T42-Review): Das Vorab-Muster auf /app/teams/neu ließ Tab und Zeilenumbruch durch ("/<TAB>/evil" wird beim Auflösen zu "//evil").
// Jetzt gilt die gemeinsame Regel safeInternalPath. Die endgültige Prüfung macht weiter createTeamAction; hier geht es um das, was die Seite an das Formular weiterreicht.
const asked: string[] = [];
vi.mock("@/server/session", () => ({
  requireUser: vi.fn(async (path: string) => {
    asked.push(path);
    return { city: "Essen" };
  }),
}));
vi.mock("../../src/app/app/teams/neu/TeamForm", () => ({ TeamForm: () => null }));
const { default: NewTeamPage } = await import("../../src/app/app/teams/neu/page");

async function nextFor(raw: unknown): Promise<string | undefined> {
  const tree = (await NewTeamPage({ searchParams: Promise.resolve(raw === undefined ? {} : { next: raw }) } as never)) as ReactElement<{ children: ReactElement[] }>;
  const form = (tree.props.children as ReactElement<{ next?: string }>[]).find((c) => c && typeof c.type === "function" && "defaultCity" in (c.props as object));
  return (form?.props as { next?: string }).next;
}

describe("/app/teams/neu: next nur als interner Pfad", () => {
  it("ein gültiger interner Pfad bleibt (mit Query)", async () => {
    expect(await nextFor("/turniere/123?t=abc")).toBe("/turniere/123?t=abc");
  });

  it("Tab, Zeilenumbruch und andere Steuerzeichen werden verworfen (Umgehung von //)", async () => {
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r\n//evil", "/a\u0000b", "/a\u007fb"]) expect(await nextFor(bad), JSON.stringify(bad)).toBeUndefined();
  });

  it("fremde Hosts, Doppel-Schrägstrich, Backslash, fehlender Anfang, zu lang, Array und Zahl werden verworfen", async () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "evil", "", "/" + "a".repeat(500), ["/a", "/b"], 42]) expect(await nextFor(bad), JSON.stringify(bad)).toBeUndefined();
    expect(await nextFor(undefined)).toBeUndefined();
  });

  it("die Anmeldung merkt sich nur einen gültigen Pfad als Rückweg", async () => {
    asked.length = 0;
    await nextFor("/\t/evil.example");
    await nextFor("/turniere/1");
    expect(asked).toEqual(["/app/teams/neu", "/app/teams/neu?next=%2Fturniere%2F1"]);
  });
});
