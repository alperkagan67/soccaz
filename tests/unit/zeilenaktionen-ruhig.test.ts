import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Impeccable Lauf 3, P2-2 (AC-30 b, AC-3): Zeilenaktionen auf / und /suche (Lobby-Board, Herausforderungen, Herausfordern, Annehmen) sind ruhig (ghost) und nicht unter 44 px;
// die eine Hauptaktion je Seite bleibt Hero bzw. "Lobby aufmachen". Quelltext + gerenderte Bausteine.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const noop = async () => undefined;
vi.mock("@/server/matchmaking-actions", () => ({ challengeTeamAction: noop, acceptSearchAction: noop }));

const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const primaries = (html: string) => html.match(/\bbtn-primary\b/g)?.length ?? 0;
const ZEILEN = ["src/components/LobbyBoard.tsx", "src/components/Challenges.tsx"];

let ChallengeNow: typeof import("../../src/components/ChallengeNow").ChallengeNow;
let AcceptSearch: typeof import("../../src/components/AcceptSearch").AcceptSearch;
let Challenges: typeof import("../../src/components/Challenges").Challenges;
beforeAll(async () => {
  ({ ChallengeNow } = await import("../../src/components/ChallengeNow"));
  ({ AcceptSearch } = await import("../../src/components/AcceptSearch"));
  ({ Challenges } = await import("../../src/components/Challenges"));
}, 60_000);

describe("Quelltext: keine orange Zeilenaktion, kein Knopf unter 44 px", () => {
  it("LobbyBoard und Challenges: kein btn-primary und kein !min-h-/!px- am Knopf", () => {
    for (const f of ZEILEN) {
      expect(src(f), f).not.toMatch(/\bbtn-primary\b/);
      expect(src(f), f).not.toMatch(/!min-h-9|!px-3/);
    }
  });
  it("Teilen und Details sind 44 px hohe Links in text-sm (kein text-xs)", () => {
    const s = src("src/components/LobbyBoard.tsx");
    expect(s).not.toMatch(/className="text-xs (text-muted|text-accent-fg) underline"/);
    expect(s).toContain('className="inline-flex min-h-11 items-center text-sm text-muted underline"');
  });
  it("das Board reicht quiet an ChallengeNow und AcceptSearch (Listenzeilen)", () => {
    const s = src("src/components/LobbyBoard.tsx");
    expect(s).toContain("<ChallengeNow quiet");
    expect(s).toContain("<AcceptSearch quiet");
  });
  it("die Hauptaktion bleibt: Start Hero und /suche 'Lobby aufmachen' sind die einzigen btn-primary ihrer Seite (Quelltext)", () => {
    expect(src("src/app/suche/page.tsx").match(/\bbtn-primary\b/g)).toHaveLength(1);
    expect(src("src/app/page.tsx")).toMatch(/btn btn-primary" data-testid="home-main-action"/);
    expect(src("src/components/MyGames.tsx")).not.toMatch(/btn-primary|variant="primary"/);
  });
});

describe("gerendert: Zeilen ruhig, Team-Seite behält ihren Knopf", () => {
  it("ChallengeNow: quiet = ghost, Standard (Teamseite) = primary; keine !min-h-Überschreibung", () => {
    const render = (quiet?: boolean) => renderToStaticMarkup(createElement(ChallengeNow, { target: { id: "t", name: "Gegner FC" }, teams: [{ id: "a", name: "Heim" }], ...(quiet === undefined ? {} : { quiet }) }));
    expect(primaries(render(true))).toBe(0);
    expect(primaries(render())).toBe(1);
    expect(render(true)).not.toContain("!min-h");
    expect(render(true)).toContain("btn-ghost");
  });
  it("AcceptSearch: quiet = ghost, Standard = primary", () => {
    const render = (quiet?: boolean) => renderToStaticMarkup(createElement(AcceptSearch, { entryId: "e", teams: [{ id: "a", name: "Heim", elo: 1000, strength: 3 }], opponent: { name: "Gegner", elo: 1000, wantMin: null, wantMax: null }, ...(quiet === undefined ? {} : { quiet }) }));
    expect(primaries(render(true))).toBe(0);
    expect(primaries(render())).toBe(1);
  });
  it("Challenges: 'Ansehen und annehmen' ist ruhig und ohne Höhenüberschreibung", () => {
    const row = { id: "c1", fromTeam: "A", fromSlug: "a", toTeam: "B", startsAt: new Date("2026-12-01T18:00:00Z"), durationMin: 60, city: "Essen", note: null, href: null } as never;
    const out = renderToStaticMarkup(createElement(Challenges, { incoming: [row], outgoing: [] }));
    expect(out).toContain("Ansehen und annehmen");
    expect(primaries(out)).toBe(0);
    expect(out).not.toContain("!min-h");
  });
});
