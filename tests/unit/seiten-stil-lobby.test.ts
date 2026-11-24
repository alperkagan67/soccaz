import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LobbyAktion } from "@/lib/lobby-stand";

// 013 M3 PR 5a, AC-30 (genau eine Hauptaktion, nie text-xs) und AC-3 (44 px) für die Lobby-Bausteine.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const noop = async () => undefined;
vi.mock("@/server/actions", () => Object.fromEntries(["assignSubstituteAction", "unassignParticipantAction", "cancelMatchAction", "joinAsSubstituteAction", "joinLobbyAction", "leaveLobbyAction", "removeParticipantAction", "setReadyAction", "setVenueAction", "finalConfirmAction", "randomSplitAction"].map((n) => [n, noop])));
vi.mock("@/server/matchmaking-actions", () => ({ acceptChallengeAction: noop, declineChallengeAction: noop }));
vi.mock("@/server/payments/authorize-actions", () => ({ createAuthorizationAction: noop, createTournamentAuthorizationAction: noop }));
vi.mock("@/server/payments/fake-card-actions", () => ({ fakeAuthorizeAction: noop, fakeAuthorizeTournamentAction: noop, fakeCardReadyAction: noop, fakeTournamentCardAction: noop }));

const root = join(__dirname, "..", "..");
const dir = "src/app/lobby/[id]";
const files = readdirSync(join(root, dir)).filter((f) => f.endsWith(".tsx")).map((f) => `${dir}/${f}`);
const src = (f: string) => readFileSync(join(root, f), "utf8");
const primaries = (html: string) => html.match(/\bbtn-primary\b/g)?.length ?? 0;

describe("AC-30 e / AC-3: Lobby-Bausteine", () => {
  it("kein text-xs in der Lobby (Backlog 237) und keine Knopf-Verkleinerung (!min-h, !px)", () => {
    for (const f of files) {
      expect(src(f), f).not.toMatch(/\btext-xs\b/);
      expect(src(f), f).not.toMatch(/!min-h-\d|!px-\d/);
    }
  });
  it("jeder ActionButton der Lobby hat ein eigenes className (der Standard ist !min-h-9 text-xs: 36 px, zu klein; R-T373)", () => {
    for (const f of files) {
      for (const m of src(f).matchAll(/<ActionButton\b[^>]*?\/>/g)) expect(m[0], f).toContain("className=");
    }
    expect(src("src/components/ActionButton.tsx")).not.toMatch(/error text-xs/);
  });
  it("geteilte Ampel-Bausteine der Lobby (PlayerLight, CardLight, Legenden) ohne text-xs", () => {
    expect(src("src/components/PlayerLight.tsx")).not.toMatch(/\btext-xs\b/);
  });
  it("höchstens vier Schriftgrößen je Baustein und Seite (base als Fließtext zählt mit; sm:text-3xl ist derselbe Titel in größerer Breite)", () => {
    for (const f of files) {
      const sizes = new Set([...src(f).matchAll(/\btext-(sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g)].map((m) => m[1]));
      sizes.delete("3xl");
      expect(sizes.size + 1, f).toBeLessThanOrEqual(4);
    }
  });
});

describe("AC-30 b: eine Hauptaktion je Zustand", () => {
  it("Seite: btn-primary nur im Stand-Block (Anmelden, Zur Spielseite: sich ausschließende Aktionen), Bausteine bekommen die Hauptaktion durchgereicht", () => {
    const s = src(`${dir}/page.tsx`);
    expect(s.match(/\bbtn-primary\b/g)?.length).toBe(2);
    expect(s).toContain('stand.aktion === "anmelden"');
    expect(s).toContain('stand.aktion === "spielseite"');
    expect(s).toContain("main={stand.aktion}");
    expect(s).toContain('primary={stand.aktion === "final"}');
    expect(s).toContain('main={stand.aktion === "annehmen"}');
  });
  it("PrivateTools, SchedulingPanel, VenueBox, Einladungslink und der gesperrte Bereit-Knopf sind ruhig (ghost)", () => {
    for (const f of ["PrivateTools", "SchedulingPanel", "VenueBox"]) expect(src(`${dir}/${f}.tsx`), f).not.toContain("btn-primary");
    expect(src(`${dir}/page.tsx`)).toContain('testId="game-invite" quiet');
    expect(src(`${dir}/page.tsx`)).toContain("<InviteBox key={t.id} teamId={t.id} teamName={t.name} quiet />"); // Team einladen: kein orange Knopf, keine Karte in der Karte
    expect(src(`${dir}/page.tsx`)).toContain('btn btn-ghost w-full" disabled>Bereit machen');
  });

  const card = (o: Record<string, unknown> = {}) => ({ ready: true, mandateText: "Mandat", fake: false, priceCents: 6000, estimateCents: 1500, estimateFixed: false, stored: null, failure: null, ...o });
  // Kaltimport EINMAL vor den Tests und mit eigenem Zeitlimit (60 s): im ersten Test gezählt, überschritt die Transformation unter Last die 5 s des Standards
  let MyActions: typeof import("../../src/app/lobby/[id]/LobbyClient").MyActions;
  let FinalConfirm: typeof import("../../src/app/lobby/[id]/FinalConfirm").FinalConfirm;
  let ChallengePanel: typeof import("../../src/app/lobby/[id]/ChallengePanel").ChallengePanel;
  beforeAll(async () => {
    ({ MyActions } = await import("../../src/app/lobby/[id]/LobbyClient"));
    ({ FinalConfirm } = await import("../../src/app/lobby/[id]/FinalConfirm"));
    ({ ChallengePanel } = await import("../../src/app/lobby/[id]/ChallengePanel"));
  }, 60_000);
  async function actions(mode: string, main: LobbyAktion, c: unknown, ready = false) {
    return renderToStaticMarkup(createElement(MyActions, { matchId: "m", mode: mode as never, ready, hasTeam: true, main, card: c as never }));
  }
  it("MyActions: nur der Besitzer der Hauptaktion ist btn-primary; ohne Hauptaktion keiner", async () => {
    expect(primaries(await actions("join", "beitreten", null))).toBe(1);
    expect(primaries(await actions("join", null, null))).toBe(0);
    expect(primaries(await actions("substitute", "ersatz", null))).toBe(1);
    expect(primaries(await actions("participant", "bereit", null))).toBe(1);
    expect(primaries(await actions("participant", "bereit", card()))).toBe(1);
    expect(primaries(await actions("participant", null, card(), true))).toBe(0);
  });
  it("MyActions: Karte fehlt: Bereit ist nie btn-primary, Karte hinterlegen ist die eine Hauptaktion; ohne Hauptaktion bleibt auch die Karte ruhig", async () => {
    const mitKarte = await actions("participant", "karte", card({ ready: false, fake: true }));
    const bereit = [...mitKarte.matchAll(/<button[^>]*>[^<]*[Bb]ereit[^<]*<\/button>/g)].map((m) => m[0]); // der Bereit-Knopf selbst
    expect(bereit.length).toBe(1);
    expect(bereit[0]).not.toContain("btn-primary");
    expect(primaries(await actions("participant", "karte", card({ ready: false, fake: true })))).toBe(1);
    expect(primaries(await actions("participant", null, card({ ready: false })))).toBe(0);
  });
  it("FinalConfirm: primary nur mit dem Merkmal primary, sonst ruhig", async () => {
    const team = (id: string) => ({ id, name: id, confirmed: false, ready: 5, paid: 5, total: 5, complete: true });
    const render = (primary: boolean) => renderToStaticMarkup(createElement(FinalConfirm, { matchId: "m", teams: [team("a"), team("b")], myTeamId: "a", paymentsOn: false, minPlayers: 4, payable: true, amountText: "15,00 €", primary }));
    expect(primaries(render(true))).toBe(1);
    expect(primaries(render(false))).toBe(0);
  });
  it("ChallengePanel: Annehmen nur mit main primary", async () => {
    const render = (main: boolean) => renderToStaticMarkup(createElement(ChallengePanel, { matchId: "m", homeName: "A", awayName: "B", role: "target", deadlineText: "morgen", main }));
    expect(primaries(render(true))).toBe(1);
    expect(primaries(render(false))).toBe(0);
  });
});
