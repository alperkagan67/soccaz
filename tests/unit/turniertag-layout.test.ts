import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PR 2 "Turniertag-Layout" (Sichtung Handy 390 px): Quelltext-Pins; die Seiten laufen in den E2E-Strecken.
const src = (p: string) => readFileSync(p, "utf8");

describe("M1 Bracket", () => {
  const b = src("src/app/turniere/[id]/BracketView.tsx");
  it("schmale Spalten (zwei Runden passen auf 390 px: 2 x 160 + 32 = 352) und Wisch-Hinweis ab drei Runden", () => {
    expect(b).toContain("minmax(160px, 1fr)");
    expect(b).toContain("rounds.length * 160 + (rounds.length - 1) * 32");
    expect(b).toMatch(/rounds\.length > 2 && <p className="mb-2 text-xs text-muted sm:hidden" data-testid="bracket-hint">/);
  });
  it("Abstand der Spalten bleibt 32 px (die Verbindungslinien sind je 16 px lang)", () => {
    expect(b).toContain("gap-x-8");
    expect(b).toContain('<span className="min-w-0 break-words">{name ??'); // lange Teamnamen brechen um statt mit Auslassungspunkten abgeschnitten zu werden
    expect(b).not.toContain('<span className="truncate">{name ??');
    expect(b).not.toMatch(/min-h-8/); // Siebenmeter-Sieger-Knöpfe 44 px
    expect(b.match(/btn btn-primary !min-h-11 !px-2 text-xs/g)?.length).toBe(2);
    expect(b).toContain("-right-4 top-1/2 h-px w-4");
  });
});

describe("M3, N1 Formular", () => {
  const f = src("src/app/app/turniere/neu/TournamentForm.tsx");
  it("Termin und Anmeldeschluss untereinander auf dem Handy, nebeneinander ab sm", () => {
    expect(f).toMatch(/grid grid-cols-1 gap-3 sm:grid-cols-2">\s*<div>\s*<label className="label" htmlFor="startsAt">/);
  });
  it("Fehler ohne Feldbezug werden ins Bild geholt und tragen role=alert", () => {
    expect(f).toContain('errorRef.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })'); // ohne Animation bei reduzierter Bewegung
    expect(f).toMatch(/<p ref=\{errorRef\} className="error" role="alert" tabIndex=\{-1\}>/);
  });
  it("Checkbox 'Öffentlich zeigen': die ganze Zeile ist mindestens 44 px hoch", () => {
    expect(f).toContain('<label className="flex min-h-11 items-start gap-3 text-sm">');
  });
});

describe("M5 Tippflächen", () => {
  it("ActionButton-Standard ist 44 px hoch (vorher 36); Footer-Links mindestens 44 px breit; Aufklapper-Zeilen 44 px", () => {
    expect(src("src/components/ActionButton.tsx")).toContain('className = "btn btn-ghost !min-h-11 !px-3 text-xs"');
    expect(src("src/components/ActionButton.tsx")).not.toContain("!min-h-9");
    expect(src("src/components/Footer.tsx")).not.toMatch(/inline-flex min-h-11 items-center hover/);
    expect(src("src/components/Footer.tsx")).toContain("inline-flex min-h-11 min-w-11 items-center justify-center hover:text-ink");
    for (const [p, t] of [["src/app/teams/[slug]/TeamManage.tsx", "Team verwalten"], ["src/app/spiele/[id]/StreamForm.tsx", "Live-Stream eintragen"], ["src/app/spiele/[id]/MatchClient.tsx", "Nicht erschienen markieren"]]) {
      expect(src(p), p).toContain(`<summary className="flex min-h-11 cursor-pointer items-center font-semibold">${t}</summary>`);
    }
  });
});

describe("M6, N3, N4 Spielseite", () => {
  const p = src("src/app/spiele/[id]/page.tsx");
  const m = src("src/app/spiele/[id]/MatchClient.tsx");
  it("Veranstalter-Entscheidung für den Turnier-Veranstalter, Plattform-Entscheidung sonst (nur Beschriftung)", () => {
    expect(m).toContain('{organizer ? "Veranstalter-Entscheidung" : "Plattform-Entscheidung"}');
    expect(p).toContain("organizer={Boolean(v?.tournamentOrganizer)}");
    expect(src("src/server/results.ts")).toMatch(/canManage,\n\s+tournamentOrganizer,/);
  });
  it("Spielseite hat eine h1 (nur für Vorlese-Programme), ein Tor ohne Schützen heißt nur 'Tor'", () => {
    expect(p).toContain('<h1 className="sr-only">{match.homeName} gegen {match.awayName}</h1>');
    expect(p).not.toContain('"Unbekannt"');
  });
});

describe("N8 Anmeldung geschlossen", () => {
  const p = src("src/app/turniere/[id]/page.tsx");
  it("nach dem Anmeldeschluss: Hinweis statt 'Anmelden und mitmachen', Gäste mit Team finden den Weg zur Anmeldung", () => {
    expect(p).toContain('data-testid="anmeldung-geschlossen"');
    expect(p).toContain("Die Anmeldung ist geschlossen.");
    expect(p).toContain("Anmelden und zu deinem Team");
    expect(p).toContain("v.registerableTeams.length > 0 && !data.deadlinePassed && <RegisterForm"); // kein Anmelde-Formular nach dem Anmeldeschluss
    expect(p).toContain("Der Anmeldeschluss ist vorbei. Du kannst jetzt starten oder das Turnier absagen."); // Veranstalter: kein Widerspruch zum Knopf "Anmeldung schließen und starten"
    expect(p).toMatch(/\{inRegistration && data\.deadlinePassed && \(/);
  });
});
