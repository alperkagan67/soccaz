import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ZAHLUNGSPFLICHT, ZAHLUNGSPFLICHT_AKTIV, ZAHLUNGSPFLICHT_VARIANTEN, ZP, betragszeile, mitZahlungspflicht } from "@/lib/zahlungspflicht-texte";

// § 312j Abs. 3 BGB (Button-Loesung), ENTWURF, Rechtspruefung (Backlog, Rechtsliste): ein Wortlaut je Funktion in EINER Datei (src/lib/zahlungspflicht-texte.ts); die Zahlungsknoepfe nutzen nur diese Konstanten.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions", () => Object.fromEntries(["assignSubstituteAction", "unassignParticipantAction", "cancelMatchAction", "joinAsSubstituteAction", "joinLobbyAction", "leaveLobbyAction", "removeParticipantAction", "setReadyAction", "setVenueAction"].map((n) => [n, async () => undefined]))); // Server-Aktionen sind hier nicht gefragt (nur das Markup)
vi.mock("@/server/payments/authorize-actions", () => ({ createAuthorizationAction: async () => undefined, createTournamentAuthorizationAction: async () => undefined }));
vi.mock("@/server/payments/fake-card-actions", () => ({ fakeAuthorizeAction: async () => undefined, fakeAuthorizeTournamentAction: async () => undefined, fakeCardReadyAction: async () => undefined, fakeTournamentCardAction: async () => undefined }));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("Konstanten", () => {
  it("beide Varianten des Gesetzeswortlauts stehen als Entwurf da, aktiv ist 'zahlungspflichtig zusagen'", () => {
    expect(ZAHLUNGSPFLICHT_VARIANTEN).toEqual({ zusagen: "zahlungspflichtig zusagen", bestellen: "zahlungspflichtig bestellen" });
    expect(ZAHLUNGSPFLICHT_AKTIV).toBe("zusagen");
    expect(ZAHLUNGSPFLICHT).toBe("zahlungspflichtig zusagen");
    expect(mitZahlungspflicht("Ich bin bereit", "bestellen")).toBe("Ich bin bereit – zahlungspflichtig bestellen");
  });

  it("die Datei ist als Entwurf der Rechtspruefung gekennzeichnet", () => {
    expect(read("src/lib/zahlungspflicht-texte.ts")).toMatch(/^\/\/ ENTWURF, Rechtsprüfung \(Backlog, Rechtsliste\)/);
  });

  it("jede Zahlungspflicht-Beschriftung enthaelt die Formel und behaelt den Aktionswort-Anfang (Knopfname = sichtbarer Text, Tests finden den Knopf weiter)", () => {
    for (const [label, start] of [[ZP.gameReady, "Ich bin bereit"], [ZP.tournamentReady, "Bereit"], [ZP.coverConfirm, "Anteil übernehmen"]] as const) {
      expect(label.startsWith(start), label).toBe(true);
      expect(label.endsWith(ZAHLUNGSPFLICHT), label).toBe(true);
    }
    expect(ZP.gameReadyFree).toBe("Ich bin bereit"); // ohne Zahlung kein Zahlungspflicht-Zusatz
    expect(ZP.tournamentReadyFree).toBe("Bereit");
    for (const l of [ZP.cardSave, ZP.cardChange, ZP.cardUseStored]) expect(l.endsWith("und Abbuchung erlauben"), l).toBe(true); // Mandat: Erlaubnis, jetzt wird nichts abgebucht
  });

  it("Betragszeile nur mit vorhandenem Betrag, sonst ohne", () => {
    expect(betragszeile("8,00 €")).toBe("Danach wird dein Anteil von 8,00 € zur Frist abgebucht.");
    expect(betragszeile(null)).toBe("Danach wird dein Anteil zur Frist abgebucht.");
  });
});

describe("Streutext-Sperre: die Zahlungsknoepfe nutzen NUR die Konstanten", () => {
  const walk = (dir: string, out: string[] = []) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const code = (t: string) => t.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n"); // Kommentarzeilen zaehlen nicht
  // alte Beschriftungen als Literal (mit Anfuehrungszeichen bzw. als Attributwert): ausser in der Konstanten-Datei darf keines mehr stehen
  const STREU = ['"Ich bin bereit"', '"Nicht mehr bereit"', '"Karte hinterlegen"', '"Karte ändern"', '"Karte für diese Lobby nutzen"', 'label="Bereit"', 'confirmLabel="Anteil übernehmen"', '>Andere Karte hinterlegen<', '"Zahlung freigeben"', 'label: "Anteil übernehmen"'];
  it("kein Streutext in src (ausser der Konstanten-Datei)", () => {
    const hits: string[] = [];
    for (const f of [...walk("src/app"), ...walk("src/components")]) {
      if (f.startsWith("src/app/dev/")) continue; // Entwickler-Vorschau der Bausteine, keine Produktseite
      const text = code(read(f));
      for (const s of STREU) if (text.includes(s)) hits.push(`${f}: ${s}`);
    }
    expect(hits).toEqual([]);
  });

  it("die Komponenten importieren die Konstanten (Lobby, Karte, Anteil uebernehmen, Turnier)", () => {
    for (const f of ["src/app/lobby/[id]/LobbyClient.tsx", "src/app/lobby/[id]/CardForm.tsx", "src/app/lobby/[id]/CoverShare.tsx", "src/app/turniere/[id]/TournamentCard.tsx", "src/app/turniere/[id]/page.tsx", "src/app/lobby/[id]/AuthorizeButton.tsx"]) {
      expect(read(f), f).toContain('from "@/lib/zahlungspflicht-texte"');
    }
  });

  it("Barrierefreiheit: kein abweichendes aria-label an den Zahlungsknoepfen (Knopfname = sichtbarer Text)", () => {
    for (const f of ["src/app/lobby/[id]/LobbyClient.tsx", "src/app/lobby/[id]/CardForm.tsx", "src/app/lobby/[id]/AuthorizeButton.tsx", "src/app/lobby/[id]/CoverShare.tsx", "src/app/turniere/[id]/TournamentCard.tsx", "src/app/turniere/[id]/page.tsx"]) {
      const lines = read(f).split("\n");
      lines.forEach((l, i) => {
        if (/\bZP\.(gameReady|gameReadyFree|tournamentReady|tournamentReadyFree|coverConfirm|cardSave|cardChange|cardUseStored|authorize)\b/.test(l)) {
          const near = lines.slice(Math.max(0, i - 4), i + 2).join("\n");
          expect(near, `${f}:${i + 1}`).not.toMatch(/aria-label=/); // Knopfname = sichtbarer Text
        }
      });
    }
  });
});

describe("Lobby: Ich bin bereit", () => {
  const card = (shareCents: number | null) => ({ ready: true, mandateText: "Mandat", fake: false, shareCents, stored: null, failure: null });
  const render = async (c: ReturnType<typeof card> | null) => {
    const { MyActions } = await import("../../src/app/lobby/[id]/LobbyClient");
    return renderToStaticMarkup(createElement(MyActions, { matchId: "m", mode: "participant", ready: false, hasTeam: true, card: c }));
  };

  it("im Kartenmodell mit Anteil: Knopf mit der Formel und Betragszeile", async () => {
    const m = await render(card(800));
    expect(m).toContain(`>${ZP.gameReady}<`);
    expect(m).toContain("Danach wird dein Anteil von 8,00");
    expect(m).toContain("zur Frist abgebucht.");
  });

  it("Anteil noch unbekannt: Formel, Betragszeile ohne Betrag", async () => {
    const m = await render(card(null));
    expect(m).toContain(`>${ZP.gameReady}<`);
    expect(m).toContain(`>${betragszeile(null)}<`);
  });

  it("ohne Zahlungspflicht (kein Kartenmodell, kostenloses Spiel): schlichter Text, keine Betragszeile", async () => {
    for (const c of [null, card(0)]) {
      const m = await render(c);
      expect(m).toContain(`>${ZP.gameReadyFree}<`);
      expect(m).not.toContain("zahlungspflichtig");
      expect(m).not.toContain("ready-amount");
    }
  });
}, 60_000);
