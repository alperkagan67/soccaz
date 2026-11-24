import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 013 M3 PR 2, AC-30 auf Start und Turnierliste (Quelltext, wie player-row.test.ts):
// (b) höchstens eine Hauptaktion (btn-primary) und nur die Leuchtfarbe, (c) keine Karte in der Karte, (e) höchstens vier Schriftgrößen je Ansicht.
// Gezählt werden die Dateien dieses Umbaus. Bekannte Grenze: geteilte ältere Komponenten auf der Startseite (MyGames, BoardSection mit den offenen Lobbys, LiveIndicator) bringen eigene Größen mit; ihre Vereinheitlichung gehört zu PR 4 und zum DESIGN-F-Umbau.
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");

const START = ["src/app/page.tsx", "src/components/GameModes.tsx", "src/components/HowItWorks.tsx"];
const TURNIERE = ["src/app/turniere/page.tsx"];
const sizes = (files: string[]) => new Set([...files.map(src).join("\n").matchAll(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g)].map((m) => m[1]));
const count = (files: string[], re: RegExp) => files.map(src).join("\n").match(re)?.length ?? 0;

describe("AC-30 e: höchstens vier Schriftgrößen (base als Fließtext zählt mit)", () => {
  it("Start: 4xl Titel, lg Abschnitte und Zahlen, sm Zusatztext (plus base)", () => {
    const used = sizes(START);
    expect([...used].sort()).toEqual(["4xl", "lg", "sm"]);
    expect(used.size + 1).toBeLessThanOrEqual(4);
  });
  it("Turnierliste: 3xl Titel, sm Zusatztext (plus base)", () => {
    const used = sizes(TURNIERE);
    expect([...used].sort()).toEqual(["3xl", "sm"]);
    expect(used.size + 1).toBeLessThanOrEqual(4);
  });
});

describe("AC-30 b: eine Hauptaktion je Ansicht", () => {
  it("Start: genau ein btn-primary (Angemeldete: Weiter zu Meine Spiele, Gäste: Jetzt starten), GameModes und HowItWorks keins", () => {
    expect(count(["src/app/page.tsx", "src/components/HowItWorks.tsx"], /\bbtn-primary\b/g)).toBe(1);
    expect(src("src/app/page.tsx")).toMatch(/btn btn-primary" data-testid="home-main-action"/);
    expect(count(["src/components/HowItWorks.tsx"], /\bbtn-primary\b/g)).toBe(0);
    // GameModes hat btn-primary nur im Nicht-quiet-Zweig (PR 4); die Startseite setzt quiet
    expect(src("src/app/page.tsx")).toMatch(/<GameModes signedIn=\{Boolean\(user\)\} quiet \/>/);
  });
  it("Turnierliste: keine Hauptaktion in den Zeilen (Team anmelden ist ruhig)", () => {
    expect(count(TURNIERE, /\bbtn-primary\b/g)).toBe(0);
  });
  it("nur die Leuchtfarbe als Akzent (text-accent-fg), keine Statusfarbe als Fläche", () => {
    for (const f of [...START, ...TURNIERE]) expect(src(f), f).not.toMatch(/\b(bg|border)-(ok|warn|danger|info)\b/);
  });
});

describe("AC-30 c: keine Karte in der Karte (Turnierliste)", () => {
  it("die Liste ist EINE card, die Zeilen haben keine card-Klasse", () => {
    const s = src("src/app/turniere/page.tsx");
    expect(s).toMatch(/<ul className="card divide-y/);
    const li = s.slice(s.indexOf("<li "), s.indexOf(">", s.indexOf("<li ")));
    expect(li).not.toMatch(/\bcard\b/);
    expect((s.match(/className="[^"]*\bcard\b[^"]*"/g) ?? []).length).toBe(2); // Liste und der Leerzustand (nie gleichzeitig)
  });
});

describe("AC-5: Test-IDs und Wortlaut der Start-Bindungen bleiben", () => {
  it("game-modes, mode-team, mode-private, mode-tournament, how-it-works, platform-stats und die Linktexte", () => {
    const gm = src("src/components/GameModes.tsx");
    for (const id of ["game-modes", "mode-team", "mode-private", "mode-tournament"]) expect(gm).toContain(`data-testid="${id}"`);
    for (const t of ["Lobby aufmachen", "Privatspiel anlegen", "Turniere ansehen", "Turnier veranstalten"]) expect(gm).toContain(t);
    const how = src("src/components/HowItWorks.tsx");
    expect(how).toContain('data-testid="how-it-works"');
    expect(how).toContain('data-testid="platform-stats"');
  });
});

describe("Turnier-Anmelden: nur Captain und offen (Anzeige), Hinweis für alle anderen", () => {
  it("die Liste zeigt 'Team anmelden' nur bei offener, nicht voller Anmeldung und Captain; sonst 'Nur Captains melden Teams an'", () => {
    const s = src("src/app/turniere/page.tsx");
    expect(s).toContain('t.status === "registration" && t.teams < t.maxTeams');
    expect(s).toContain('t.teams < t.maxTeams && !t.deadlinePassed'); // nach Anmeldeschluss kein Knopf (R-T370 a)
    expect(src("src/server/tournaments.ts")).toContain("deadlinePassed: sql<boolean>"); // Liste liefert den Anmeldeschluss
    expect(s).toMatch(/captain \? \(/);
    expect(s).toContain("Nur Captains melden Teams an");
    expect(s).toContain('data-testid="tournament-register"');
    expect(s).toContain("isCaptainOfAnyTeam");
  });
});
