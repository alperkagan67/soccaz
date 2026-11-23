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

  it("Betragszeile: fest nach dem zweiten Bereit, vorher voraussichtlich (aendert sich mit der Spielerzahl), ohne Betrag neutral", () => {
    expect(betragszeile("8,00 €", true)).toBe("Danach wird dein Anteil von 8,00 € zur Frist abgebucht.");
    expect(betragszeile("8,00 €", false)).toBe("Aktuell 8,00 €: der Anteil ändert sich, bis beide Captains den Preis bestätigen. Abgebucht wird erst zur Frist.");
    expect(betragszeile(null, false)).toBe("Dein Anteil steht noch nicht fest. Er wird erst zur Frist abgebucht.");
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
  // Zeichenketten in jeder Anfuehrungsart (" ' `) und JSX-Attributwerte: die Formel oder die Beschriftungen der Zahlungsknoepfe dort sind verboten (ausser in der Konstanten-Datei, Kommentare zaehlen nicht)
  // GRENZE (bewusst): Schutz vor VERSEHENTLICHEM Streutext, kein Beweis gegen Absicht: aufgeteilte Zeichenketten ('Ich bin ' + 'bereit') und dynamisch gebaute Texte erkennt die Sperre nicht.
  const JSX_KIND = />([^<>{}\n]*(ich bin bereit|zahlungspflichtig)[^<>{}\n]*)</gi; // Kindtext im JSX (zwischen Tags)
  const LITERAL = /(["'`])((?:(?!\1)[^\n\\]|\\.)*)\1/g;
  const VERBOTEN = [/zahlungspflichtig/i, /ich bin bereit/i, /abbuchung erlauben/i, /^Bereit$/, /^nicht mehr bereit$/i, /^karte (hinterlegen|ändern)$/i, /^karte für diese lobby nutzen$/i, /^anteil übernehmen$/i, /^zahlung freigeben$/i];
  const ALLOWED_STATUS_WORDS = ["src/components/PlayerLight.tsx", "src/server/tournaments.ts"]; // Statusworte (Ampel "Bereit", Anzeige), keine Zahlungsknoepfe
  it("kein Streutext in src: keine Zeichenkette (alle Anfuehrungsarten) mit Formel oder Knopf-Beschriftung ausser in der Konstanten-Datei", () => {
    const hits: string[] = [];
    for (const f of [...walk("src/app"), ...walk("src/components"), ...walk("src/server"), ...walk("src/lib")]) {
      if (ALLOWED_STATUS_WORDS.includes(f)) continue; // "Bereit" als Statuswort einer Ampel/Anzeige, kein Knopf
      if (f.startsWith("src/app/dev/") || f === "src/lib/zahlungspflicht-texte.ts" || f === "src/lib/i18n.ts") continue; // Entwickler-Vorschau, Konstanten-Datei, Uebersetzungstabelle (eigener Rechtsentwurf, cover.mandate)
      const text = code(read(f));
      for (const m of text.matchAll(LITERAL)) if (VERBOTEN.some((r) => r.test(m[2]))) hits.push(`${f}: ${m[0].slice(0, 60)}`);
      for (const m of text.matchAll(JSX_KIND)) hits.push(`${f}: JSX-Text ${m[1].slice(0, 60)}`);
    }
    expect(hits).toEqual([]);
  });

  it("die Sperre erkennt Umgehungen (einfache Anfuehrungszeichen, Template, Grossschreibung, neues Label mit der Formel)", () => {
    for (const sample of ["const a = 'Ich bin bereit';", "const b = `Bereit`;", "const c = \"Karte hinterlegen\";", "const d = 'Weiter - zahlungspflichtig zusagen';", "const e = \"ICH BIN BEREIT\";"]) {
      const hit = [...sample.matchAll(LITERAL)].some((m) => VERBOTEN.some((r) => r.test(m[2])));
      expect(hit, sample).toBe(true);
    }
    expect([...'<p>Ich bin bereit - zahlungspflichtig</p>'.matchAll(JSX_KIND)]).toHaveLength(1); // JSX-Kindtext wird erkannt
    expect([...'<p>Alle sind bereit</p>'.matchAll(JSX_KIND)]).toHaveLength(0);
    expect([...'const x = "Alle sind bereit";'.matchAll(LITERAL)].some((m) => VERBOTEN.some((r) => r.test(m[2])))).toBe(false); // normaler Satz bleibt erlaubt
  });

  it("die Komponenten importieren die Konstanten (Lobby, Karte, Anteil uebernehmen, Turnier)", () => {
    for (const f of ["src/app/lobby/[id]/LobbyClient.tsx", "src/app/lobby/[id]/CardForm.tsx", "src/app/lobby/[id]/CoverShare.tsx", "src/app/turniere/[id]/TournamentCard.tsx", "src/app/turniere/[id]/page.tsx", "src/app/lobby/[id]/AuthorizeButton.tsx"]) {
      expect(read(f), f).toContain('from "@/lib/zahlungspflicht-texte"');
    }
  });

  it("Turnier: im pausierten Kartenfluss keine Formel und ein Hinweis, der die Pause nennt; Anteil uebernehmen zeigt den Betrag, wo er vorliegt (dieselbe Rechnung wie die Abbuchung)", () => {
    const page = read("src/app/turniere/[id]/page.tsx");
    expect(page).toContain("data.cardMode && !free && !data.paymentsPaused ? ZP.tournamentReady : ZP.tournamentReadyFree");
    expect(page).toContain("data.paymentsPaused ? ZP.tournamentReadyPause");
    expect(page).toContain("chargeAmount(pricing.totalCents ?? null, pricing.shareCents)");
    expect(read("src/app/turniere/[id]/TournamentCard.tsx")).toContain("consequence={coverAmounts ? coverConsequence(m.name, coverAmounts) : undefined}");
    expect(ZP.tournamentReadyPause).toContain("pausiert");
    const lobby = read("src/app/lobby/[id]/page.tsx");
    expect(lobby).toContain("shareDivisor(match, assignedCount)"); // Betrag der Lobby: dieselbe Funktion wie die Abbuchung (nicht dupliziert)
    expect(lobby).toContain("chargeAmount(payments.priceCents");
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

describe("Lobby: Ich bin bereit (Formen wie die Seite sie liefert: shareCents ist nie 0, sondern null bei Preis 0/null oder niemand eingeteilt)", () => {
  type Card = { ready: boolean; mandateText: string; fake: boolean; shareCents: number | null; priceCents: number | null; estimateCents: number | null; estimateFixed: boolean; stored: null; failure: null };
  const card = (o: Partial<Card>): Card => ({ ready: true, mandateText: "Mandat", fake: false, shareCents: null, priceCents: null, estimateCents: null, estimateFixed: false, stored: null, failure: null, ...o });
  const render = async (c: Card | null) => {
    const { MyActions } = await import("../../src/app/lobby/[id]/LobbyClient");
    return renderToStaticMarkup(createElement(MyActions, { matchId: "m", mode: "participant", ready: false, hasTeam: true, card: c }));
  };

  it("Preis > 0, Anteil noch nicht fixiert: Formel und 'Aktuell ...' mit dem Betrag der Abbuchungsrechnung", async () => {
    const m = await render(card({ priceCents: 6000, shareCents: 600, estimateCents: 1500, estimateFixed: false }));
    expect(m).toContain(`>${ZP.gameReady}<`);
    expect(m).toContain("Aktuell 15,00");
    expect(m).toContain("bis beide Captains den Preis bestätigen");
    expect(m).not.toContain("wird dein Anteil von"); // nie \"wird abgebucht: X\" vor dem Festpreis (card-hint und Betragszeile)
  });

  it("Preis > 0, Anteil fixiert (zweites Bereit): Formel und fester Betrag", async () => {
    const m = await render(card({ priceCents: 6000, shareCents: 600, estimateCents: 1500, estimateFixed: true }));
    expect(m).toContain(`>${ZP.gameReady}<`);
    expect(m).toContain("Danach wird dein Anteil von 15,00");
    expect(m).not.toContain("Aktuell");
  });

  it("Preis > 0, noch niemand eingeteilt (Betrag unbekannt): Formel, neutrale Zeile ohne Betrag", async () => {
    const m = await render(card({ priceCents: 6000, shareCents: null, estimateCents: null }));
    expect(m).toContain(`>${ZP.gameReady}<`);
    expect(m).toContain(betragszeile(null, false));
  });

  it("GRATISSPIEL im Kartenmodell (Preis 0, shareCents null wie in der Produktion): schlichter Text, KEINE Formel, keine Abbuchungs-Zusage", async () => {
    const m = await render(card({ priceCents: 0, shareCents: null, estimateCents: null }));
    expect(m).toContain(`>${ZP.gameReadyFree}<`);
    expect(m).not.toContain("zahlungspflichtig");
    expect(m).not.toContain("ready-amount");
    expect(m).not.toContain("abgebucht");
  });

  it("Preis noch nicht bekannt (null): schlichter Text, keine Zusage; ohne Kartenmodell (card null) ebenso", async () => {
    for (const c of [card({ priceCents: null }), null]) {
      const m = await render(c);
      expect(m).toContain(`>${ZP.gameReadyFree}<`);
      expect(m).not.toContain("zahlungspflichtig");
      expect(m).not.toContain("ready-amount");
    }
  });
}, 60_000);
