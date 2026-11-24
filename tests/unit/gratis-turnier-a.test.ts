import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ZP } from "@/lib/zahlungspflicht-texte";

// Gratis-Turnier PR A (Plan Gratis-Turnier, t2q 24.11.): bei Zahlungen AUS legt der Veranstalter ein Turnier ohne Preisangabe an (Voreinstellung 0), das Formular zeigt statt des Erklärkastens
// (Treuhandkonto, Zahlung vorab, Provision) den Gratis-Hinweis; die Turnierseite erklärt den Ablauf des kostenlosen Turniers. Zahlungstexte nur in zahlungspflicht-texte.ts.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/tournament-actions", () => ({ createTournamentAction: async () => ({}) }));
const src = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");

async function form(free: boolean) {
  const { TournamentForm } = await import("../../src/app/app/turniere/neu/TournamentForm");
  return renderToStaticMarkup(createElement(TournamentForm, { min: "2026-12-01T10:00", defaultCity: "Essen", standardHourly: null, commission: 10, partnerVenues: null, free }));
}

describe("Formular: Turnier anlegen", () => {
  it("Zahlungen AUS: kein Preisfeld (Voreinstellung 0), kein Erklärkasten mit Treuhandkonto/Zahlung vorab/Provision, dafür der Gratis-Hinweis; Teamlimit 16", async () => {
    const html = await form(true);
    expect(html).toContain('name="hourlyRent"');
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="hourlyRent"[^>]*value="0"|<input[^>]*name="hourlyRent"[^>]*type="hidden"[^>]*value="0"/);
    expect(html).not.toContain('data-testid="fee-explainer"');
    for (const verboten of ["Treuhandkonto", "Provision", "zahlt beim Beitritt vorab", "Hallenpreis pro Stunde", "abgebucht", "per Karte"]) expect(html, verboten).not.toContain(verboten);
    expect(html).toContain('data-testid="free-explainer"');
    expect(html).toContain(ZP.tournamentFreeNote);
    expect(html).toContain('max="16"');
    expect(html).toContain("bis 16 Teams");
  });
  it("Zahlungen AN: unverändert (Preisfeld, Erklärkasten, Hinweis des Veranstalters)", async () => {
    const html = await form(false);
    expect(html).toContain('data-testid="fee-explainer"');
    expect(html).toContain("Hallenpreis pro Stunde");
    expect(html).not.toContain('data-testid="free-explainer"');
    expect(html).toContain(ZP.hintOrganizer);
  });
});

describe("Texte nur zentral", () => {
  it("der Gratis-Hinweis nennt: kostenlos auf Soccaz, Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz", () => {
    expect(ZP.tournamentFreeNote).toMatch(/kostenlos/);
    expect(ZP.tournamentFreeNote).toMatch(/Teilnahmegebühr/);
    expect(ZP.tournamentFreeNote).toMatch(/außerhalb von Soccaz/);
  });
  it("die Seiten tragen den Satz nicht als Streutext, sondern über ZP", () => {
    for (const f of ["src/app/app/turniere/neu/TournamentForm.tsx", "src/app/turniere/[id]/page.tsx"]) {
      expect(src(f), f).not.toContain("außerhalb von Soccaz");
    }
    expect(src("src/app/turniere/[id]/page.tsx")).toContain("ZP.tournamentFreeNote");
  });
});

describe("Turnierseite: Ablauf eines kostenlosen Turniers", () => {
  it("Box 'free-flow' nur bei Preis 0 in Anmeldung und Zahlungsphase, mit den Schritten aus ZP", () => {
    const page = src("src/app/turniere/[id]/page.tsx");
    expect(page).toContain('data-testid="free-flow"');
    expect(page).toMatch(/\(inRegistration \|\| inPayment\) && free/);
    expect(page).toContain("ZP.tournamentFreeSteps");
    expect(ZP.tournamentFreeSteps.length).toBeGreaterThanOrEqual(4);
    for (const step of ZP.tournamentFreeSteps) expect(step).not.toMatch(/Karte|abgebucht|bezahl|Euro|erstattet/i); // Gratis: keine Zahlungsworte
  });
});
