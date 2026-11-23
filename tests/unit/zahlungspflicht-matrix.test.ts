import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ZP, ZAHLUNGSPFLICHT, finalConfirmHinweis, tournamentReadyLabel } from "@/lib/zahlungspflicht-texte";

// TEST-MATRIX (t2q): je zahlungspflichtigem Text der erwartete Wortlaut (Formel oder schlicht) in jedem Zustand. ENTWURF, Rechtspruefung.
// Zustaende: Gratis (Zahlungen AUS), Pause (Karte AUS), Altspiel/stillgelegt (kein Kartenmodell), Preis 0, Preis unbekannt, Karte AN + Preis > 0, Anteil von anderem uebernommen, Gast/Dritter.
// Wie die Seite die Zustaende liefert: ausserhalb des Kartenmodells (Gratis, Pause, Altspiel) ist card = null und payable = false; im Kartenmodell kommt der Preis als priceCents (0 = kostenlos, null = unbekannt).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const noop = async () => undefined;
vi.mock("@/server/actions", () => Object.fromEntries(["assignSubstituteAction", "unassignParticipantAction", "cancelMatchAction", "joinAsSubstituteAction", "joinLobbyAction", "leaveLobbyAction", "removeParticipantAction", "setReadyAction", "setVenueAction", "finalConfirmAction", "acceptRequestAction", "takeOverShareAction", "releaseCoverAction"].map((n) => [n, noop])));
vi.mock("@/server/tournament-actions", () => Object.fromEntries(["registerTeamAction", "joinAsPlayerAction", "takeOverTournamentShareAction", "releaseTournamentCoverAction", "setPaidReadyAction"].map((n) => [n, noop])));
vi.mock("@/server/payments/authorize-actions", () => ({ createAuthorizationAction: noop, createTournamentAuthorizationAction: noop }));
vi.mock("@/server/payments/fake-card-actions", () => ({ fakeAuthorizeAction: noop, fakeAuthorizeTournamentAction: noop, fakeCardReadyAction: noop, fakeTournamentCardAction: noop }));

type Card = { ready: boolean; mandateText: string; fake: boolean; priceCents: number | null; estimateCents: number | null; estimateFixed: boolean; stored: null; failure: null };
const card = (o: Partial<Card> = {}): Card => ({ ready: true, mandateText: "Mandat", fake: false, priceCents: 6000, estimateCents: 1500, estimateFixed: false, stored: null, failure: null, ...o });
const FORMEL = /zahlungspflichtig/i;

async function lobby(mode: "participant" | "join" | "substitute" | "full" | "guest" | "none", c: Card | null, ready = false, hasTeam = true) {
  const { MyActions } = await import("../../src/app/lobby/[id]/LobbyClient");
  return renderToStaticMarkup(createElement(MyActions, { matchId: "m", mode, ready, hasTeam, card: c }));
}
async function final(payable: boolean, amountText: string | null, confirmed = false) {
  const { FinalConfirm } = await import("../../src/app/lobby/[id]/FinalConfirm");
  const team = (id: string) => ({ id, name: `Team ${id}`, confirmed, ready: 5, paid: 5, total: 5, complete: true });
  return renderToStaticMarkup(createElement(FinalConfirm, { matchId: "m", teams: [team("a"), team("b")], myTeamId: "a", paymentsOn: false, minPlayers: 4, payable, amountText }));
}

/** Zustaende der Lobby-Seite -> erwartet "Formel" oder "schlicht" fuer "Ich bin bereit" UND den letzten Bestaetigungsknopf. */
const ZUSTAENDE: { name: string; card: Card | null; payable: boolean; formel: boolean }[] = [
  { name: "Gratis (Zahlungen AUS: kein Kartenmodell)", card: null, payable: false, formel: false },
  { name: "Pause (Karte AUS: kein Kartenmodell)", card: null, payable: false, formel: false },
  { name: "Altspiel/stillgelegt (kein Kartenmodell)", card: null, payable: false, formel: false },
  { name: "Preis 0 im Kartenmodell (shareCents null)", card: card({ priceCents: 0, estimateCents: null }), payable: false, formel: false },
  { name: "Preis unbekannt (null) im Kartenmodell", card: card({ priceCents: null, estimateCents: null }), payable: false, formel: false },
  { name: "Karte AN, Preis > 0", card: card(), payable: true, formel: true },
  { name: "Karte AN, Preis > 0, Anteil fixiert", card: card({ estimateFixed: true }), payable: true, formel: true },
  { name: "Karte AN, Preis > 0, noch niemand eingeteilt (Betrag unbekannt)", card: card({ estimateCents: null }), payable: true, formel: true },
];

describe("Matrix: Ich bin bereit (Lobby)", () => {
  for (const z of ZUSTAENDE) {
    it(`${z.name}: ${z.formel ? "Formel" : "schlichter Text"}`, async () => {
      const m = await lobby("participant", z.card);
      if (z.formel) {
        expect(m).toContain(`>${ZP.gameReady}<`);
        expect(m).toContain("ready-amount");
      } else {
        expect(m).toContain(`>${ZP.gameReadyFree}<`);
        expect(m).not.toMatch(FORMEL);
        expect(m).not.toContain("ready-amount");
      }
    }, 60_000);
  }

  it("bereits bereit: 'Nicht mehr bereit' ohne Formel in jedem Zustand (Zurueckziehen ist keine Zusage)", async () => {
    for (const z of ZUSTAENDE) {
      const m = await lobby("participant", z.card, true);
      expect(m, z.name).toContain(`>${ZP.gameNotReady}<`);
      expect(m, z.name).not.toMatch(FORMEL);
    }
  }, 60_000);

  it("Anteil von einem anderen uebernommen (Platz gedeckt, eigene Karte fehlt): der eigene Bereit-Knopf folgt derselben Regel (kein eigener Zusatztext); die Zusage steckt im Bestaetigungsknopf des UEBERNEHMERS", async () => {
    const m = await lobby("participant", card({ ready: true, priceCents: 6000 }));
    expect(m).toContain(`>${ZP.gameReady}<`);
  }, 60_000);

  it("Gast/Dritter (keine Teilnahme): kein Zahlungsknopf, keine Formel, kein Betrag", async () => {
    for (const mode of ["guest", "none", "full"] as const) {
      const m = await lobby(mode, card());
      expect(m, mode).not.toMatch(FORMEL);
      expect(m, mode).not.toContain("ready-amount");
      expect(m, mode).not.toContain(ZP.gameReadyFree);
    }
  }, 60_000);

  it("Beitreten (Spieler und Ersatz): schlichter Knopf plus neutrale Hinweiszeile, nie die Formel", async () => {
    const j = await lobby("join", card());
    expect(j).toContain("Dem Spiel beitreten");
    expect(j).toContain(ZP.hintLater);
    expect(j).not.toMatch(FORMEL);
    const s = await lobby("substitute", card());
    expect(s).not.toMatch(FORMEL);
  }, 60_000);

  it("Kartenhinweis: Preis 0 -> kostenlos, Preis unbekannt -> Preis steht noch nicht fest; beides ohne 'wird abgebucht'", async () => {
    const free = await lobby("participant", card({ ready: false, priceCents: 0, estimateCents: null }));
    expect(free).toContain(ZP.gameFree);
    expect(free).not.toContain("Dein Anteil wird zur Frist");
    const unknown = await lobby("participant", card({ ready: false, priceCents: null, estimateCents: null }));
    expect(unknown).toContain(ZP.priceUnknown);
    const paid = await lobby("participant", card({ ready: false, priceCents: 6000, estimateCents: 1500 }));
    expect(paid).toContain("Schritt 1: Karte hinterlegen.");
    expect(paid).toContain("Aktuell 15,00");
  }, 60_000);
});

describe("Matrix: letzte Bestaetigung der Captains (FinalConfirm)", () => {
  for (const z of ZUSTAENDE) {
    it(`${z.name}: ${z.payable ? "Formel und Hinweiszeile" : "bisheriger Text ohne Zusage und ohne Abbuchungszeile"}`, async () => {
      const m = await final(z.payable, z.payable ? "15,00 €" : null);
      if (z.payable) {
        expect(m).toContain(`>${ZP.finalConfirm}<`);
        expect(m).toContain("final-confirm-pay-note");
        expect(m).toContain(finalConfirmHinweis("15,00 €"));
        expect(m).toContain(ZP.finalHeading);
      } else {
        expect(m).toContain(`>${ZP.finalConfirmFree}<`);
        expect(m).not.toMatch(FORMEL);
        expect(m).not.toContain("final-confirm-pay-note");
        expect(m).not.toContain("abgebucht");
        expect(m).not.toContain(ZP.finalHeading);
        expect(m).toContain(ZP.finalHeadingFree);
      }
    }, 60_000);
  }

  it("Hinweiszeile nennt den Betrag als 'aktuell' (nie 'wird abgebucht: X') und ohne Betrag nur den Zeitpunkt", () => {
    expect(finalConfirmHinweis("15,00 €")).toBe("Abgebucht wird erst zur Frist: aktuell 15,00 €.");
    expect(finalConfirmHinweis(null)).toBe("Abgebucht wird erst zur Frist.");
  });

  it("bereits bestaetigt: kein Knopf, keine Formel", async () => {
    const m = await final(true, "15,00 €", true);
    expect(m).not.toContain(ZP.finalConfirm);
    expect(m).not.toContain("final-confirm-pay-note");
  }, 60_000);
});

describe("Matrix: Turnier, Bereit des Captains", () => {
  const cases: { name: string; cardMode: boolean; free: boolean; paused: boolean; formel: boolean }[] = [
    { name: "Gratis/Altmodell (kein Kartenfluss)", cardMode: false, free: false, paused: false, formel: false },
    { name: "Kartenfluss, Preis > 0", cardMode: true, free: false, paused: false, formel: true },
    { name: "Kartenfluss, kostenlos", cardMode: true, free: true, paused: false, formel: false },
    { name: "Pause (Karte AUS, Kartenfluss eingefroren)", cardMode: true, free: false, paused: true, formel: false },
    { name: "Pause und kostenlos", cardMode: true, free: true, paused: true, formel: false },
  ];
  for (const c of cases) {
    it(`${c.name}: ${c.formel ? "Formel" : "schlicht"}`, () => {
      expect(tournamentReadyLabel(c)).toBe(c.formel ? ZP.tournamentReady : ZP.tournamentReadyFree);
    });
  }
  it("die Formel endet auf den aktiven Wortlaut (Entwurf)", () => {
    expect(ZP.tournamentReady.endsWith(ZAHLUNGSPFLICHT)).toBe(true);
    expect(ZP.tournamentReadyFree).not.toMatch(FORMEL);
  });
});

describe("Matrix: Anteil uebernehmen (Spiel und Turnier)", () => {
  it("Bestaetigungsknopf im Dialog traegt die Formel (Spiel); der Oeffner bleibt schlicht; Zustimmung (Mandatszusatz) ist Pflicht-Haken", async () => {
    const { CoverButton } = await import("../../src/app/lobby/[id]/CoverShare");
    const m = renderToStaticMarkup(createElement(CoverButton, { matchId: "m", targetUserId: "u", targetName: "Alex", amounts: { own: "15,00 €", target: "15,00 €", total: "30,00 €", estimated: true }, mandateText: "Zusatz" }));
    expect(m).toContain(`>${ZP.coverTrigger}<`);
    expect(m).not.toContain(`>${ZP.coverTrigger}<`.replace(">", "> ").trim() + "x"); // Oeffner ohne Formel
    expect(m).toContain(`>${ZP.coverConfirm}<`);
    expect(m).toMatch(/disabled=""[^>]*>[^<]*zahlungspflichtig/); // ohne Zustimmung gesperrt
  }, 60_000);

  it("Turnier: dieselben Konstanten (Oeffner schlicht, Bestaetigung mit Formel), Betrag nur wo vorhanden", async () => {
    const { TournamentCard } = await import("../../src/app/turniere/[id]/TournamentCard");
    const base = { tournamentId: "t", hasOwnCard: true, mandateText: "M", coverMandateText: "Z", fake: false, teammates: [{ userId: "u", name: "Alex", hasCard: false, covered: false }], coveringName: null, canCover: true };
    const mit = renderToStaticMarkup(createElement(TournamentCard, { ...base, coverAmounts: { own: "10,00 €", target: "10,00 €", total: "20,00 €", estimated: false } }));
    const ohne = renderToStaticMarkup(createElement(TournamentCard, base));
    for (const m of [mit, ohne]) {
      expect(m).toContain(`>${ZP.coverTrigger}<`);
      expect(m).toContain(`>${ZP.coverConfirm}<`);
    }
    expect(mit).toContain("10,00");
    expect(ohne).not.toContain("10,00");
  }, 60_000);

  it("kein Uebernehmen-Knopf fuer Gast/Dritte: ohne canCover/rote Plaetze keine Formel im Turnier", async () => {
    const { TournamentCard } = await import("../../src/app/turniere/[id]/TournamentCard");
    const m = renderToStaticMarkup(createElement(TournamentCard, { tournamentId: "t", hasOwnCard: true, mandateText: "M", coverMandateText: "Z", fake: false, teammates: [], coveringName: null, canCover: true }));
    expect(m).not.toContain(ZP.coverConfirm);
  }, 60_000);
});

describe("Matrix: mittelbare Knoepfe zeigen eine neutrale Hinweiszeile statt Knopftext", () => {
  it("Team anmelden (Turnier) und Spiel annehmen: schlichter Knopf, Hinweis, nie die Formel", async () => {
    const { RegisterForm } = await import("../../src/app/turniere/[id]/RegisterForm");
    const { AcceptForm } = await import("../../src/app/suche/[id]/AcceptForm");
    const teams = [{ id: "t1", name: "Team 1" }];
    const reg = renderToStaticMarkup(createElement(RegisterForm, { tournamentId: "t", teams }));
    const acc = renderToStaticMarkup(createElement(AcceptForm, { requestId: "r", teams }));
    for (const m of [reg, acc]) {
      expect(m).toContain(ZP.hintLater);
      expect(m).not.toMatch(FORMEL);
    }
    expect(reg).toContain(">Team anmelden<");
    expect(acc).toContain(">Spiel annehmen<");
  }, 60_000);
});
