import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 013 M3 PR 3 (Spiel suchen und Einladung), AC-30 und AC-5 auf Quelltext-Ebene (wie seiten-stil-start-turniere.test.ts).
// Bekannte Grenze: geteilte ältere Komponenten auf /suche (MyGames, Challenges, BoardSection/LobbyBoard) bringen eigene Schriftgrößen und Knöpfe mit; ihre Vereinheitlichung gehört zu PR 4 und zum DESIGN-F-Umbau.
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const SUCHE = "src/app/suche/page.tsx";
const EINLADUNG = "src/app/einladung/[token]/page.tsx";
const sizes = (f: string) => new Set([...src(f).matchAll(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g)].map((m) => m[1]));
const primaries = (f: string) => src(f).match(/\bbtn-primary\b/g)?.length ?? 0;

describe("AC-30 e: höchstens vier Schriftgrößen (base als Fließtext zählt mit)", () => {
  it("/suche: 2xl Titel, lg Abschnitt, sm Zusatztext", () => {
    expect([...sizes(SUCHE)].sort()).toEqual(["2xl", "lg", "sm"]);
    expect(sizes(SUCHE).size + 1).toBeLessThanOrEqual(4);
  });
  it("Einladung: 3xl Titel (2xl nur im Fehlerzustand), sm Zusatztext", () => {
    expect([...sizes(EINLADUNG)].sort()).toEqual(["2xl", "3xl", "sm"]);
    expect(sizes(EINLADUNG).size + 1).toBeLessThanOrEqual(4);
  });
});

describe("AC-30 b: eine Hauptaktion je Ansicht", () => {
  it("/suche: genau ein btn-primary (Lobby aufmachen), Filtern und die anderen Wege sind ruhig", () => {
    expect(primaries(SUCHE)).toBe(1);
    expect(src(SUCHE)).toMatch(/btn btn-primary">Lobby aufmachen</);
    expect(src(SUCHE)).toMatch(/btn btn-ghost flex-1">Filtern</);
  });
  it("Einladung: höchstens ein btn-primary je Zustand (Gast: Anmelden und beitreten; angemeldet: Team beitreten im Formular)", () => {
    expect(primaries(EINLADUNG)).toBe(1);
  });
});

describe("Auswahlschritt Spiel suchen (ohne neue URL, AC-5)", () => {
  it("search-modes mit Teamspiel, Privatspiel und Turnier führt auf bestehende Adressen", () => {
    const s = src(SUCHE);
    expect(s).toContain('data-testid="search-modes"');
    for (const id of ["search-mode-team", "search-mode-private", "search-mode-tournament"]) expect(s).toContain(`data-testid="${id}"`);
    for (const href of ['"/matchmaking"', '"/turniere"', "/app/privatspiel/neu"]) expect(s).toContain(href);
    expect(s).toContain("Lobby aufmachen");
    expect(s).toContain("Privatspiel anlegen");
    expect(s).toContain("Turniere ansehen");
  });
  it("die Überschrift enthält weiter 'Offene Lobbys' (basics.spec bindet sie), das Formular behält seine Felder-IDs", () => {
    const s = src(SUCHE);
    expect(s).toContain("Offene Lobbys anderer Teams");
    for (const id of ["city", "date", "durationMin", "art", "minStrength", "maxStrength"]) expect(s).toContain(`id="${id}"`);
  });
  it("Wortlaut: kein 'steht' für den Spielzustand in der Art-Auswahl (Begriffe aus PR 1)", () => {
    expect(src(SUCHE)).not.toContain("Spiel steht");
    expect(src(SUCHE)).toContain("Nur Lobbys (Gegner gefunden)");
  });
});

describe("Einladung für Neulinge", () => {
  it("Gast sieht die nächsten Schritte (anmelden, einrichten, beitreten); Wortlaut der Knöpfe bleibt (team-invite.spec)", () => {
    const s = src(EINLADUNG);
    expect(s).toContain('data-testid="invite-steps"');
    expect(s).toContain("Anmelden und beitreten");
    expect(src("src/app/einladung/[token]/JoinForm.tsx")).toContain("Team beitreten");
    expect(s).toContain("redirect(`/willkommen?next="); // Neuling: erst einrichten, dann zurück zur Einladung
  });
});
