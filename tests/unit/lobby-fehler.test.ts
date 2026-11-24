import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { lobbyFehlerFall } from "@/lib/lobby-fehler";
import { lobbyStand } from "@/lib/lobby-stand";
import { LobbyCaptainBar } from "../../src/app/lobby/[id]/LobbyCaptainBar";

// 013 M3 PR 5b: Fehlerzustand "Abbuchung fehlgeschlagen" mit EINEM nächsten Schritt (AC-30, Impeccable-Befund 3) und die Captain-Leiste.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const noop = async () => undefined;
vi.mock("@/server/actions", () => Object.fromEntries(["assignSubstituteAction", "unassignParticipantAction", "cancelMatchAction", "joinAsSubstituteAction", "joinLobbyAction", "leaveLobbyAction", "removeParticipantAction", "setReadyAction", "setVenueAction", "finalConfirmAction", "randomSplitAction"].map((n) => [n, noop])));
vi.mock("@/server/payments/authorize-actions", () => ({ createAuthorizationAction: noop, createTournamentAuthorizationAction: noop }));
vi.mock("@/server/payments/fake-card-actions", () => ({ fakeAuthorizeAction: noop, fakeAuthorizeTournamentAction: noop, fakeCardReadyAction: noop, fakeTournamentCardAction: noop }));

const primaries = (html: string) => html.match(/\bbtn-primary\b/g)?.length ?? 0;
type Failure = { text: string; until: string | null; expired: boolean; authorize?: boolean };
const card = (failure: Failure | null, o: Record<string, unknown> = {}) => ({ ready: true, mandateText: "Mandat", fake: true, priceCents: 6000, estimateCents: 1500, estimateFixed: false, stored: null, failure, ...o });
// Kaltimport EINMAL vor den Tests und mit eigenem Zeitlimit (60 s): im ersten Test gezählt, überschritt die Transformation des großen Client-Baums unter Last die 5 s des Standards (Backlog, Berichte w1 und w2 2026-11-24)
let MyActions: typeof import("../../src/app/lobby/[id]/LobbyClient").MyActions;
beforeAll(async () => {
  ({ MyActions } = await import("../../src/app/lobby/[id]/LobbyClient"));
}, 60_000);
async function actions(failure: Failure | null, main: string | null, c?: Record<string, unknown> | null) {
  return renderToStaticMarkup(createElement(MyActions, { matchId: "m", mode: "participant", ready: true, hasTeam: true, main: main as never, card: (c === undefined ? card(failure) : c) as never }));
}
const frei: Failure = { text: "Die Bank braucht deine Freigabe der Zahlung.", until: "in 80 Min.", expired: false, authorize: true };
const aendern: Failure = { text: "Die Bank hat die Karte abgelehnt.", until: "in 80 Min.", expired: false, authorize: false };
const abgelaufen: Failure = { text: "Die Bank hat die Karte abgelehnt.", until: null, expired: true, authorize: false };

describe("lobbyFehlerFall: ein Fall je Zustand", () => {
  it("abgelaufen gewinnt, sonst Freigabe, sonst Karte", () => {
    expect(lobbyFehlerFall({ expired: true, authorize: true })).toBe("abgelaufen");
    expect(lobbyFehlerFall({ expired: false, authorize: true })).toBe("freigabe");
    expect(lobbyFehlerFall({ expired: false, authorize: false })).toBe("karte");
    expect(lobbyFehlerFall({ expired: false })).toBe("karte");
  });
});

describe("Fehlerzustand in MyActions: genau EIN Primary je Fall", () => {
  it("Freigabe: ein Primary (Zahlung freigeben), die andere Karte nur eingeklappt und ruhig, kein Bereit-Knopf", async () => {
    const out = await actions(frei, "freigeben");
    expect(primaries(out)).toBe(1);
    expect(out).toContain('data-testid="authorize-fake"');
    expect(out).toMatch(/<details[^>]*data-testid="charge-failed-other-card"/);
    expect(out).not.toMatch(/btn-primary[^>]*data-testid="card-fake"/); // der Karten-Knopf der anderen Karte ist nicht primary
    expect(out).not.toContain("Ich bin bereit");
    expect(out).not.toContain("Nicht mehr bereit");
  });
  it("Karte ändern: ein Primary (CardForm), kein Freigabe-Knopf, kein zweiter Weg", async () => {
    const out = await actions(aendern, "karte");
    expect(primaries(out)).toBe(1);
    expect(out).not.toContain("authorize-fake");
    expect(out).not.toContain("charge-failed-other-card");
    expect(out).not.toContain("bereit");
  });
  it("abgelaufen: kein Primary und kein Schritt, nur der Grund und der Satz zur Neuvergabe", async () => {
    const out = await actions(abgelaufen, null);
    expect(primaries(out)).toBe(0);
    expect(out).toContain("Dein Platz wird neu vergeben");
    expect(out).not.toContain("authorize-fake");
  });
  it("ohne Hauptaktion von außen bleibt auch im Fehlerzustand alles ruhig (Besitzer der Hauptaktion ist allein dein Stand)", async () => {
    expect(primaries(await actions(frei, null))).toBe(0);
    expect(primaries(await actions(aendern, null))).toBe(0);
  });
  it("kein Fehlerzustand ohne Kartenmodell (Gratis, Pause, Altspiel: card = null) und keiner ohne Fehler (Preis 0, Karte ok)", async () => {
    expect(await actions(null, "bereit", null)).not.toContain("charge-failed");
    expect(await actions(null, "bereit", card(null, { priceCents: 0 }))).not.toContain("charge-failed");
    expect(await actions(null, "bereit", card(null))).not.toContain("charge-failed");
  });
  it("Dein Stand und der Fehlerzustand nennen denselben Schritt", () => {
    const base = { signedIn: true, status: "lobby", active: true, planning: false, challengePending: false, challengeRole: "viewer" as const, participant: true, hasTeam: true, ready: true, canJoin: false, canJoinAsSubstitute: false, teamFull: false, cardOn: true, cardReady: true, minReady: 4, finalTeam: null };
    expect(lobbyStand({ ...base, chargeFailure: lobbyFehlerFall(frei) }).aktion).toBe("freigeben");
    expect(lobbyStand({ ...base, chargeFailure: lobbyFehlerFall(aendern) }).aktion).toBe("karte");
    expect(lobbyStand({ ...base, chargeFailure: lobbyFehlerFall(abgelaufen) }).aktion).toBeNull();
  });
});

describe("Captain-Leiste (reine Darstellung, die Seite entscheidet, wer sie bekommt)", () => {
  const teams = [{ id: "t1", name: "Heim FC", count: 5, ready: 3, cardsReady: false }, { id: "t2", name: "Gast FC", count: 4, ready: 4, cardsReady: null }];
  it("Team-Stand je Team, Karten nur im Kartenmodell", () => {
    const out = renderToStaticMarkup(createElement(LobbyCaptainBar, { teams, failures: [] }));
    expect(out).toContain("Heim FC");
    expect(out).toContain("3 von 5 bereit, nicht alle Karten hinterlegt");
    expect(out).toContain("4 von 4 bereit</li>");
    expect(out).not.toContain("charge-failed-captain");
  });
  it("Fehlerzeile mit EINEM Schritt: Anteil übernehmen, sonst die Frist des Spielers, sonst Neuvergabe", () => {
    const out = renderToStaticMarkup(
      createElement(LobbyCaptainBar, {
        teams: [],
        failures: [
          { userId: "u1", name: "Anna", text: "Die Karte ist abgelaufen.", until: "in 80 Min.", authorizing: false, step: createElement("button", { type: "button" }, "Anteil übernehmen") },
          { userId: "u2", name: "Bernd", text: "Die Bank braucht deine Freigabe.", until: "bis 21:10 Uhr", authorizing: true, step: null },
          { userId: "u3", name: "Cem", text: "Die Karte wurde gesperrt.", until: null, authorizing: false, step: null },
        ],
      }),
    );
    expect(out.match(/data-testid="charge-failed-player"/g)).toHaveLength(3);
    expect(out).toContain("Nächster Schritt: den Anteil übernehmen.");
    expect(out.match(/Anteil übernehmen<\/button>/g)).toHaveLength(1);
    expect(out).toContain("Der Spieler hat bis 21:10 Uhr Zeit (die Bank braucht eine Freigabe).");
    expect(out).toContain("Der Platz wird neu vergeben.");
    expect(primaries(out)).toBe(0);
  });
});

describe("Fehlerzustand: Zugänglichkeit (R-T377)", () => {
  it("role=alert nur an der Meldung (Titel und Grund), nicht am ganzen Bereich mit Formular", async () => {
    const out = await actions(frei, "freigeben");
    expect(out.match(/role="alert"/g)).toHaveLength(1);
    expect(out).toMatch(/<div role="alert"[^>]*><p[^>]*>Abbuchung fehlgeschlagen<\/p><p[^>]*data-testid="charge-failed-reason"/);
    expect(out).not.toMatch(/role="alert"[^>]*data-testid="charge-failed"/);
  });
  it("die eingeklappte andere Karte zeigt Plus beziehungsweise Minus (Aufklappen nicht nur am Text erkennbar)", async () => {
    const out = await actions(frei, "freigeben");
    expect(out).toContain('class="group-open:hidden">+</span>');
    expect(out).toContain('group-open:inline">−</span>');
  });
});
