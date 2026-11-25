import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { zahlungsWorte } from "@/lib/zahlungen-aus";

// Gratis-Turnier PR C (R-T436): AC-30 (eine Hauptaktion je Ansicht) im Turnierspiel mit Abpfiff, Wortscan der neuen Texte (keine Zahlungswörter), Abpfiff-Hinweis bei Unentschieden.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const noop = async () => undefined;
vi.mock("@/server/actions", () => Object.fromEntries(["castMvpVoteAction", "confirmResultAction", "decideResultAction", "disputeResultAction", "endMatchAction", "markNoShowAction", "recordEventAction", "submitResultAction", "submitScoreAction", "undoLastEventAction"].map((n) => [n, noop])));
const src = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");
const hauptaktionen = (html: string) => (html.match(/btn-primary|bg-accent text-accent-ink/g) ?? []).length;
const ohneDialoge = (html: string) => html.split("<dialog").map((teil, i) => (i === 0 ? teil : teil.slice(teil.indexOf("</dialog>") + 9))).join("");

describe("AC-30: im Turnierspiel mit Abpfiff genau EINE Hauptaktion", () => {
  it("Abpfiff ist primary; die Handeingabe (Ergebnis eintragen / Endergebnis eintragen) ist im ruhigen Zustand ohne Hauptknopf", async () => {
    const { EndMatchPanel, SubmitResultForm } = await import("../../src/app/spiele/[id]/MatchClient");
    const { ScoreDialog } = await import("../../src/app/lobby/[id]/uebersicht/ScoreDialog");
    const abpfiff = renderToStaticMarkup(createElement(EndMatchPanel, { matchId: "m", home: "A", away: "B", homeScore: 2, awayScore: 1, final: true }));
    const ruhig =
      renderToStaticMarkup(createElement(SubmitResultForm, { matchId: "m", home: "A", away: "B", homeScore: 2, awayScore: 1, final: true, quiet: true })) +
      renderToStaticMarkup(createElement(ScoreDialog, { matchId: "m", home: { id: "h", name: "A" }, away: { id: "g", name: "B" }, players: [], existing: [], quiet: true }));
    expect(hauptaktionen(ohneDialoge(abpfiff))).toBe(1);
    expect(hauptaktionen(ohneDialoge(ruhig))).toBe(0); // die Knöpfe IM (geschlossenen) Dialog zählen nicht
  });
  it("ohne Abpfiff (Team-Spiel) bleibt die Handeingabe die Hauptaktion (unverändert)", async () => {
    const { SubmitResultForm } = await import("../../src/app/spiele/[id]/MatchClient");
    expect(hauptaktionen(ohneDialoge(renderToStaticMarkup(createElement(SubmitResultForm, { matchId: "m", home: "A", away: "B", homeScore: 0, awayScore: 0 }))))).toBe(1);
  });
  it("Seite: Die Handeingabe liegt bei Abpfiff in einem eingeklappten 'Ergebnis von Hand eintragen'", () => {
    const p = src("src/app/spiele/[id]/page.tsx");
    expect(p).toContain('data-testid="manual-result"');
    expect(p).toContain("Ergebnis von Hand eintragen");
    expect(p).toContain("quiet={abpfiff}");
    // CI #387: Captains behalten ihr Formular mit sichtbaren Feldern (die E2E-Strecken fuellen sie); Abpfiff und Eingeklapptes nur fuer Veranstalter/Admin
    expect(p).toContain('const abpfiff = Boolean(v?.canRecord) && match.kind === "tournament" && !v?.mySide && Boolean(v?.canManage);');
  });
});

describe("Texte: kein Zahlungswort, Hinweis bei Unentschieden", () => {
  it("Abpfiff, Endergebnis, Kampflos: Wortscan sauber (src/lib/zahlungen-aus.ts); die Texte stehen bewusst inline (keine Zahlung, keine Rechtsfolge)", async () => {
    const { EndMatchPanel, SubmitResultForm } = await import("../../src/app/spiele/[id]/MatchClient");
    const html =
      renderToStaticMarkup(createElement(EndMatchPanel, { matchId: "m", home: "Rot", away: "Blau", homeScore: 1, awayScore: 1, final: true })) +
      renderToStaticMarkup(createElement(SubmitResultForm, { matchId: "m", home: "Rot", away: "Blau", homeScore: 1, awayScore: 0, final: true }));
    expect(zahlungsWorte(html.replace(/<[^>]+>/g, " "))).toEqual([]);
    expect(zahlungsWorte(src("src/app/turniere/[id]/BracketView.tsx").split("Kampflos werten")[1].slice(0, 700))).toEqual([]);
  });
  it("Abpfiff bei Gleichstand: Hinweis Unentschieden / Golden Goal oder Neunmeter, 0:0 mit Hinweis ohne Tore; bei Vorsprung nicht", async () => {
    const { EndMatchPanel } = await import("../../src/app/spiele/[id]/MatchClient");
    const gleich = renderToStaticMarkup(createElement(EndMatchPanel, { matchId: "m", home: "A", away: "B", homeScore: 0, awayScore: 0, final: true }));
    expect(gleich).toContain('data-testid="end-match-draw"');
    expect(gleich).toMatch(/Golden Goal oder Neunmeter/);
    expect(gleich).toContain("Keine Tore erfasst");
    expect(renderToStaticMarkup(createElement(EndMatchPanel, { matchId: "m", home: "A", away: "B", homeScore: 1, awayScore: 0, final: true }))).not.toContain("end-match-draw");
  });
});
