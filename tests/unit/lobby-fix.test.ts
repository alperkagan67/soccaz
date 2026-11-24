import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { lobbyStand, type LobbyStandInput } from "@/lib/lobby-stand";

// 013 M3, Lobby-Fix nach Impeccable-Lauf 2: P1-1 keine Karte in Karte, P1-2 Hauptaktion in der ersten Ansicht (Reihenfolge), P1-4 Captain in der Planung sieht den Schritt.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const noop = async () => undefined;
vi.mock("@/server/actions", () => Object.fromEntries(["assignSubstituteAction", "unassignParticipantAction", "cancelMatchAction", "joinAsSubstituteAction", "joinLobbyAction", "leaveLobbyAction", "removeParticipantAction", "setReadyAction", "setVenueAction", "finalConfirmAction", "randomSplitAction"].map((n) => [n, noop])));
vi.mock("@/server/matchmaking-actions", () => ({ acceptChallengeAction: noop, declineChallengeAction: noop, proposeOptionAction: noop, voteOptionAction: noop, withdrawOptionAction: noop, banHallAction: noop }));
vi.mock("@/server/payments/authorize-actions", () => ({ createAuthorizationAction: noop, createTournamentAuthorizationAction: noop }));
vi.mock("@/server/payments/fake-card-actions", () => ({ fakeAuthorizeAction: noop, fakeAuthorizeTournamentAction: noop, fakeCardReadyAction: noop, fakeTournamentCardAction: noop }));

const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const dir = "src/app/lobby/[id]";
const primaries = (html: string) => html.match(/\bbtn-primary\b/g)?.length ?? 0;
const framed = (html: string) => html.match(/rounded-lg border/g)?.length ?? 0;
const cards = (html: string) => html.match(/class="card[ "]/g)?.length ?? 0;

const basis: LobbyStandInput = {
  signedIn: true, status: "lobby", active: true, planning: true, planningPhase: "termin", isCaptain: true, myTurn: false, challengePending: false, challengeRole: "viewer",
  participant: true, hasTeam: true, ready: false, canJoin: false, canJoinAsSubstitute: false, teamFull: false,
  cardOn: true, cardReady: true, chargeFailure: null, minReady: 4, finalTeam: null,
};
const mit = (o: Partial<LobbyStandInput>) => lobbyStand({ ...basis, ...o });

describe("P1-4: Captain in der Planung sieht den Schritt in Dein Stand", () => {
  it("Termin: Captain bekommt 'Nächster Schritt: die Uhrzeit wählen' und die Hauptaktion vorschlagen; Nicht-Captain den bisherigen Text ohne Aktion", () => {
    const c = mit({});
    expect(c.zeile).toContain("Nächster Schritt: die Uhrzeit wählen");
    expect(c.aktion).toBe("vorschlagen");
    const n = mit({ isCaptain: false });
    expect(n.aktion).toBeNull();
    expect(n.zeile).toContain("Die Captains wählen Uhrzeit und Halle");
  });
  it("Veto: am Zug 'eine Halle bannen' (keine orange Hauptaktion, Bannen ist je Halle ruhig), sonst 'Das andere Team ist beim Bannen dran'", () => {
    expect(mit({ planningPhase: "veto", myTurn: true })).toEqual({ zeile: "Nächster Schritt: eine Halle bannen.", aktion: null });
    expect(mit({ planningPhase: "veto", myTurn: false })).toEqual({ zeile: "Das andere Team ist beim Bannen dran.", aktion: null });
  });
  it("Hallen-Anfrage: der Captain weiß, dass gewartet wird und was danach kommt", () => {
    expect(mit({ planningPhase: "hallen" }).zeile).toContain("Die Hallen werden angefragt");
  });
  it("Zustände der Lücken aus Lauf 2 (ohne Seed prüfbar): bestätigt, abgesagt, Privatspiel (ohne Kartenmodell), Übernahme ändert den Stand nicht", () => {
    const frei = { planning: false, planningPhase: null, isCaptain: false, ready: true };
    expect(mit({ ...frei, status: "confirmed" }).aktion).toBeNull(); // bestätigt, bereit: wartet
    expect(mit({ ...frei, status: "cancelled", active: false }).zeile).toBe("Das Spiel findet nicht statt.");
    expect(mit({ ...frei, cardOn: false, ready: false }).aktion).toBe("bereit"); // Privatspiel/Gratis: kein Kartenschritt
    for (const o of [{ planningPhase: "termin" as const }, { planningPhase: "veto" as const, myTurn: true }, { planningPhase: "hallen" as const }]) {
      expect(mit(o).zeile).not.toMatch(/zahlungspflichtig|abgebucht|€|Euro|kostenpflichtig|Preis steht/i);
    }
  });
});

describe("P1-1: Karte in Karte aufgelöst (gerendertes HTML je Baustein)", () => {
  const decisions = [{ teamId: "a", teamName: "Heim", text: "Captain hat noch nicht gewählt", done: false, active: true }, { teamId: "b", teamName: "Gast", text: "Captain wählt 20:00 Uhr", done: true }];
  it("Steps: die Team-Zeilen haben keinen Rahmen (nur die drei Schritt-Chips), eine einzige Karte", async () => {
    const { Steps } = await import("../../src/app/lobby/[id]/Steps");
    for (const current of [1, 2, 3, 4] as const) {
      const out = renderToStaticMarkup(createElement(Steps, { current, decisions, title: "Die Captains stimmen ab." }));
      expect(framed(out), `Schritt ${current}`).toBe(3); // nur die Chips Uhrzeit, Halle, Bezahlen
      expect(cards(out)).toBe(1);
      expect(out.match(/data-testid="team-decision"/g)).toHaveLength(2); // Test-IDs bleiben
    }
  });
  it("FinalConfirm: Team-Zeilen ohne Rahmen, Test-IDs bleiben", async () => {
    const { FinalConfirm } = await import("../../src/app/lobby/[id]/FinalConfirm");
    const team = (id: string, confirmed: boolean) => ({ id, name: id, confirmed, ready: 5, paid: 5, total: 5, complete: true });
    const out = renderToStaticMarkup(createElement(FinalConfirm, { matchId: "m", teams: [team("a", false), team("b", true)], myTeamId: "a", paymentsOn: false, minPlayers: 4, payable: true, amountText: "15,00 €", primary: true }));
    expect(framed(out)).toBe(0);
    expect(cards(out)).toBe(1);
    expect(out.match(/data-testid="final-team"/g)).toHaveLength(2);
    expect(out).toContain('data-confirmed="true"');
  });
  it("Terminwahl und Veto: Optionen und Hallen als Zeilen ohne Rahmen (Lücke aus Lauf 2: Veto-Phase)", async () => {
    const { SchedulingPanel } = await import("../../src/app/lobby/[id]/SchedulingPanel");
    const { VetoPanel } = await import("../../src/app/lobby/[id]/VetoPanel");
    const teams = [{ id: "a", name: "Heim" }, { id: "b", name: "Gast" }];
    const options = [{ id: "o1", label: "Sa 20:00 Uhr", proposedBy: "system" as const, proposedByTeamId: null, votedTeamIds: ["a"] }, { id: "o2", label: "Sa 21:00 Uhr", proposedBy: "Heim", proposedByTeamId: "a", votedTeamIds: [] }];
    const sched = (main: boolean) => renderToStaticMarkup(createElement(SchedulingPanel, { matchId: "m", options, teams, myTeamId: "a", deadlineText: "morgen", minStart: "2026-12-01T18:00", slots: [], dayText: null, main }));
    expect(framed(sched(true))).toBe(0);
    expect(cards(sched(true))).toBe(1);
    expect(sched(true).match(/data-testid="option"/g)).toHaveLength(2);
    const halls = [{ venueId: "h1", name: "Halle A", city: "Essen", website: null, verified: true, partner: false, bannedByTeam: null, bannedAuto: false, banOrder: null, picked: false }, { venueId: "h2", name: "Halle B", city: "Essen", website: null, verified: true, partner: true, bannedByTeam: "b", bannedAuto: false, banOrder: 1, picked: false }];
    const veto = renderToStaticMarkup(createElement(VetoPanel, { matchId: "m", halls, teams, turnTeamId: "a", myTeamId: "a", deadlineText: "morgen", done: false }));
    expect(framed(veto)).toBe(0);
    expect(cards(veto)).toBe(1);
    expect(veto.match(/data-testid="hall"/g)).toHaveLength(2);
    expect(primaries(veto)).toBe(0); // Bannen ist je Halle ruhig (danger), keine orange Hauptaktion
  });
  it("Terminwahl: 'Vorschlag machen' ist nur mit main orange, 'Dafür stimmen' immer ruhig", async () => {
    const { SchedulingPanel } = await import("../../src/app/lobby/[id]/SchedulingPanel");
    const teams = [{ id: "a", name: "Heim" }, { id: "b", name: "Gast" }];
    const options = [{ id: "o1", label: "Sa 20:00 Uhr", proposedBy: "system" as const, proposedByTeamId: null, votedTeamIds: [] }];
    const render = (main: boolean | undefined, myTeamId: string | null) => renderToStaticMarkup(createElement(SchedulingPanel, { matchId: "m", options, teams, myTeamId, deadlineText: "morgen", minStart: "2026-12-01T18:00", slots: [], dayText: null, ...(main === undefined ? {} : { main }) }));
    expect(primaries(render(true, "a"))).toBe(1);
    expect(primaries(render(false, "a"))).toBe(0);
    expect(primaries(render(undefined, "a"))).toBe(0);
    expect(primaries(render(true, null))).toBe(0); // Nicht-Captain hat keinen Vorschlag-Knopf
  });
  it("Fehlerzustand: die Zusammenfassung der anderen Karte ist kein Knopf mit Rahmen (summary ohne btn)", () => {
    const s = src(`${dir}/LobbyClient.tsx`);
    expect(s).toContain('<summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold underline">');
    expect(s).not.toMatch(/<summary[^>]*\bbtn\b/);
    expect(src(`${dir}/page.tsx`)).not.toMatch(/rounded-lg border/); // Hallen-Anfrage ohne Rahmen je Zeile
  });
});

describe("P1-2: Hauptaktion direkt unter Dein Stand (Reihenfolge der Blöcke, im Fluss)", () => {
  const page = src(`${dir}/page.tsx`);
  const at = (needle: string) => {
    const i = page.indexOf(needle);
    expect(i, needle).toBeGreaterThan(0);
    return i;
  };
  it("Dein Stand, dann Herausforderung, Veto, Terminwahl, FinalConfirm (nur bei Hauptaktion), MyActions und Captain-Leiste; erst danach Stepper, Spielort, Kosten, Teams", () => {
    const folge = ['data-testid="lobby-stand"', "{challengePending && (", "{veto && (", "{scheduling && !challengePending && (", 'stand.aktion === "final" && (', "<MyActions", "<LobbyCaptainBarFor", "<Steps ", "{hallCheck && (", "<VenueBox", 'data-testid="card-costs"', "{canSeeLights &&"].map(at);
    for (let i = 1; i < folge.length; i++) expect(folge[i], `Block ${i}`).toBeGreaterThan(folge[i - 1]);
  });
  it("FinalConfirm steht genau einmal je Zustand: oben als Hauptaktion, sonst unten ohne Hauptaktion", () => {
    expect(page.match(/<FinalConfirm/g)).toHaveLength(2);
    expect(page).toContain('{active && !open && stand.aktion === "final" && (');
    expect(page).toContain('{active && !open && stand.aktion !== "final" && (');
    expect(page).toContain("primary={false}");
  });
  it("keine feste Leiste: die Seite setzt weder position fixed noch sticky für die Hauptaktion", () => {
    expect(page).not.toMatch(/\bfixed\b|\bsticky\b/);
  });
  it("die Test-IDs der Lobby bleiben (AC-5)", () => {
    for (const id of ["lobby-stand", "match-status", "game-number", "ready-later", "charge-failed-captain", "captain-bar", "free-slot", "hall-check", "steps", "card-costs"]) {
      expect(page + src(`${dir}/Steps.tsx`) + src(`${dir}/LobbyCaptainBar.tsx`), id).toContain(`data-testid="${id}"`);
    }
  });
});
