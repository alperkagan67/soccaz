import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { coverConsequence, coverDialogBody } from "@/lib/cover-text";
import { DEFAULT_LOCALE, MESSAGES, translate } from "@/lib/i18n";

// Die Server-Aktionen brauchen Sitzung und Datenbank: für die Markup-Tests durch Attrappen ersetzt (Verhalten: Integrationstests und E2E).
vi.mock("@/server/actions", () => ({ takeOverShareAction: vi.fn(), releaseCoverAction: vi.fn() }));
const { CoverButton, CoverCoveringCard, ReleaseCover } = await import("../../src/app/lobby/[id]/CoverShare");

const mandate = translate(DEFAULT_LOCALE, "cover.mandate.v1.entwurf");
const amounts = { own: "6,00 €", target: "6,00 €", total: "12,00 €", estimated: false };
const button = (o: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(CoverButton, { matchId: "m-1", targetUserId: "u-a", targetName: "Alex", amounts, mandateText: mandate, ...o }));

describe("Text vor der Übernahme (Vorgabe t9)", () => {
  const body = coverDialogBody("Alex");
  it("nennt den Zusatzposten zur Frist mit der Karte von B (nicht sofort)", () => {
    expect(body).toContain("zusätzlich der Anteil von Alex von deiner Karte abgebucht");
    expect(body).toContain("Zusatzposten");
    expect(body).toContain("nicht sofort");
  });
  it("sagt: scheitert der Posten, verfällt der Platz, B verliert nur diesen Posten", () => {
    expect(body).toContain("Scheitert dieser Posten, verfällt der Platz von Alex");
    expect(body).toContain("du verlierst nur diesen Posten");
  });
  it("sagt: neue Karte im Fenster, dann einmal erneut (Wiederholen nur nach neuer Karte)", () => {
    expect(body).toContain("kannst du innerhalb des Fensters eine andere Karte hinterlegen; dann versuchen wir es einmal erneut");
  });
  it("sagt: Zurücknehmen bis zur Frist möglich", () => {
    expect(body).toContain("Bis zur Frist kannst du die Übernahme hier zurücknehmen");
  });
  it("kein Fremdwort zum Grund: nie ein Hinweis auf eine fehlgeschlagene Abbuchung des anderen Spielers", () => {
    expect(body).not.toMatch(/abgelehnt|declined|Grund/i);
  });
});

describe("Betrag im Dialog", () => {
  it("nach Preis steht fest: beide Posten und Summe, kein Vorbehalt", () => {
    const c = coverConsequence("Alex", amounts);
    expect(c).toContain("dein Anteil 6,00 €");
    expect(c).toContain("Anteil von Alex 6,00 €");
    expect(c).toContain("zusammen 12,00 €");
    expect(c).not.toMatch(/Voraussichtlich/);
  });
  it("vor Preis steht fest: voraussichtlich, mit Hinweis wann es endgültig ist", () => {
    const c = coverConsequence("Alex", { ...amounts, estimated: true });
    expect(c).toMatch(/^Voraussichtlich/);
    expect(c).toContain("Preis steht fest");
  });
});

describe("Mandatszusatz (i18n, Entwurf)", () => {
  it("steht als Schlüssel cover.mandate.v1.entwurf in beiden Sprachen und ist als Entwurf gekennzeichnet", () => {
    expect(MESSAGES.de["cover.mandate.v1.entwurf"]).toContain("Entwurf, Rechtstext durch Anwalt");
    expect(MESSAGES.en["cover.mandate.v1.entwurf"]).toMatch(/Draft, legal text by a lawyer/);
  });
  it("nennt Mindestbetrag, Zusatzposten, neue Karte im Fenster und Zurücknehmen", () => {
    const m = MESSAGES.de["cover.mandate.v1.entwurf"];
    for (const part of ["Mindestbetrag 0,50 EUR je Posten", "Zusatzposten", "andere Karte", "zurücknehmen"]) expect(m).toContain(part);
  });
  it("Wortlaut unveränderlich (Schlüssel versioniert): der Schlüssel trägt v1", () => {
    expect(Object.keys(MESSAGES.de).filter((k) => k.startsWith("cover.mandate."))).toEqual(["cover.mandate.v1.entwurf"]);
  });
});

describe("CoverButton (Markup)", () => {
  it("Knopf mit dem Pflichtwort Anteil übernehmen, Dialog mit Titel, Text, Betrag und Zustimmung", () => {
    const m = button();
    expect(m).toContain(">Anteil übernehmen<");
    expect(m).toContain("Anteil von Alex übernehmen?");
    expect(m).toContain("data-testid=\"confirm-consequence\"");
    expect(m).toContain("zusammen 12,00 €");
    expect(m).toContain('type="checkbox"');
    expect(m).toContain("Entwurf, Rechtstext durch Anwalt");
    expect(m).toContain("verfällt der Platz von Alex");
  });
  it("die Bestätigung ist ohne Zustimmung gesperrt (Pflicht-Haken)", () => {
    const d = button().slice(button().indexOf("<dialog"));
    expect(d).toMatch(/<button[^>]*disabled=""[^>]*>Anteil übernehmen<\/button>/);
  });
  it("kein Preis bekannt (kostenlos): Dialog ohne Betragszeile, aber mit Text und Zustimmung", () => {
    const m = button({ amounts: null });
    expect(m).not.toContain("confirm-consequence");
    expect(m).toContain('type="checkbox"');
  });
  it("der Text für den Mitspieler nennt keinen Grund (kein fehlgeschlagen, kein abgelehnt)", () => {
    expect(button()).not.toMatch(/fehlgeschlagen|abgelehnt/i);
  });
});

describe("ReleaseCover (Markup)", () => {
  it("Knopf Zurücknehmen, nur ein Knopf", () => {
    const m = renderToStaticMarkup(createElement(ReleaseCover, { matchId: "m-1" }));
    expect(m).toContain(">Zurücknehmen<");
    expect(m).toContain('data-testid="cover-release"');
    expect((m.match(/<button/g) ?? []).length).toBe(1);
  });
});

describe("CoverCoveringCard (Backlog 72)", () => {
  it("ist ein Sprungziel (tabIndex -1, kein Tab-Stopp), ohne eigenen Fokusrahmen, mit Test-ID und Inhalt", () => {
    const m = renderToStaticMarkup(createElement(CoverCoveringCard, null, "Du übernimmst den Anteil von Alex."));
    expect(m).toContain('tabindex="-1"');
    expect(m).toContain('data-testid="cover-covering"');
    expect(m).toContain("outline-none");
    expect(m).toContain("Du übernimmst den Anteil von Alex.");
  });
});
