import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dashboardStand, groupByKind, matchBadge, matchHref, type MatchKind, type MatchStatus } from "@/lib/my-games";

// 013 M3 PR 4 (/app, „Meine Spiele“): Gruppen nach Spielart, Zustandswörter, „Dein Stand“ mit der einen Hauptaktion (AC-30: höchstens eine Hauptaktion je Ansicht).
const now = new Date("2030-01-10T12:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000);
const row = (id: string, kind: MatchKind, hours: number, status: MatchStatus = "lobby") => ({ id, kind, startsAt: at(hours), status, durationMin: 60, homeName: "A", awayName: "B" });

describe("groupByKind", () => {
  it("feste Reihenfolge Teamspiele, Privatspiele, Turniere; leere Gruppen entfallen", () => {
    const groups = groupByKind([row("t", "tournament", 5), row("p", "private", 5), row("g", "team", 5)], now);
    expect(groups.map((g) => g.label)).toEqual(["Teamspiele", "Privatspiele", "Turniere"]);
    expect(groupByKind([row("p", "private", 5)], now).map((g) => g.kind)).toEqual(["private"]);
    expect(groupByKind([], now)).toEqual([]);
  });

  it("kommende Spiele zuerst (nächster Anstoß zuerst), dann vergangene (jüngstes zuerst)", () => {
    const [g] = groupByKind([row("alt", "team", -48, "played"), row("spaet", "team", 72), row("bald", "team", 2), row("gestern", "team", -24, "played")], now);
    expect(g.rows.map((r) => r.id)).toEqual(["bald", "spaet", "gestern", "alt"]);
  });
});

describe("matchBadge (immer ein Wort, nie nur Farbe)", () => {
  it("Zustandswörter nach begriffe.md", () => {
    expect(matchBadge({ status: "confirmed", startsAt: at(5) }, now)).toEqual({ tone: "ok", label: "Spiel ist angesetzt" });
    expect(matchBadge({ status: "lobby", startsAt: at(5) }, now)).toEqual({ tone: "warn", label: "Wartet auf Spieler" });
    expect(matchBadge({ status: "confirmed", startsAt: at(-1) }, now).label).toBe("Läuft");
    expect(matchBadge({ status: "played", startsAt: at(-5) }, now)).toEqual({ tone: "neutral", label: "Gespielt" });
    expect(matchBadge({ status: "disputed", startsAt: at(-5) }, now).tone).toBe("danger");
    expect(matchBadge({ status: "cancelled", startsAt: at(5) }, now)).toEqual({ tone: "neutral", label: "Abgesagt" });
  });
  it("jeder Zustand hat ein nicht leeres Wort", () => {
    for (const status of ["lobby", "confirmed", "played", "disputed", "cancelled"] as const) for (const h of [-5, 5]) expect(matchBadge({ status, startsAt: at(h) }, now).label.length).toBeGreaterThan(0);
  });
});

describe("matchHref", () => {
  it("kommende Spiele in die Lobby, alle anderen auf die Spielseite", () => {
    expect(matchHref({ id: "x", status: "lobby", startsAt: at(5) }, now)).toBe("/lobby/x");
    expect(matchHref({ id: "x", status: "confirmed", startsAt: at(5) }, now)).toBe("/lobby/x");
    expect(matchHref({ id: "x", status: "confirmed", startsAt: at(-1) }, now)).toBe("/spiele/x");
    expect(matchHref({ id: "x", status: "played", startsAt: at(-5) }, now)).toBe("/spiele/x");
  });
});

describe("dashboardStand: Dein Stand und die eine Hauptaktion", () => {
  const fmt = () => "10.01. 18:00";
  const game = { id: "g1", number: 7, home: "Heim", away: "Gast", startsAt: at(5), timeOpen: false, phase: "Bereit machen und bezahlen" };
  it("mit Spiel: nächstes Spiel, Aktion Zur Lobby", () => {
    const s = dashboardStand({ games: [game], open: [], teamCount: 1 }, fmt);
    expect(s.line).toContain("#7 Heim gegen Gast");
    expect(s.detail).toContain("10.01. 18:00 Uhr");
    expect(s.action).toEqual({ label: "Zur Lobby", href: "/lobby/g1" });
  });
  it("Uhrzeit offen wird benannt", () => {
    expect(dashboardStand({ games: [{ ...game, timeOpen: true }], open: [], teamCount: 1 }, fmt).detail).toContain("Uhrzeit noch offen");
  });
  it("ohne Spiel mit offener Lobby: Zur Lobby (offen)", () => {
    const s = dashboardStand({ games: [], open: [{ id: "o1", number: 3, team: "Heim" }], teamCount: 1 }, fmt);
    expect(s.action).toEqual({ label: "Zur Lobby", href: "/lobby/offen/o1" });
  });
  it("ohne Team: Team gründen; mit Team aber ohne Spiel: Spiel suchen", () => {
    expect(dashboardStand({ games: [], open: [], teamCount: 0 }, fmt).action).toEqual({ label: "Team gründen", href: "/app/teams/neu" });
    expect(dashboardStand({ games: [], open: [], teamCount: 2 }, fmt).action).toEqual({ label: "Spiel suchen", href: "/suche" });
  });
  it("nie ein Guthaben im Stand", () => {
    const s = dashboardStand({ games: [game], open: [], teamCount: 1 }, fmt);
    expect(JSON.stringify(s)).not.toMatch(/Guthaben|Aufladen/);
  });
});

describe("Stilregel /app (AC-30): höchstens eine Hauptaktion, kein Guthaben, Test-IDs bleiben (AC-5)", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const page = src("src/app/app/page.tsx");
  const myGames = src("src/components/MyGames.tsx");
  it("die Seite und ihre Bausteine haben keinen weiteren orangen Knopf (btn-primary / variant primary)", () => {
    for (const code of [page, myGames]) {
      expect(code).not.toMatch(/btn-primary/);
      expect(code).not.toMatch(/variant="primary"/);
    }
    expect(page).toMatch(/<GameModes signedIn quiet \/>/); // GameModes ruhig: kein oranger Knopf neben der Hauptaktion
    expect(src("src/components/GameModes.tsx")).toMatch(/quiet \? "btn btn-ghost" : "btn btn-primary"/);
  });
  it("Distill: /app rendert MyGames nicht mehr (das Spiel stünde viermal: Stand, Kasten, Liste, Knöpfe); offene Lobbys stehen in der Liste", () => {
    expect(page).not.toMatch(/<MyGames\b/);
    expect(page).toMatch(/data-testid="my-open-lobby"/);
  });
  it("die Hauptaktion steht im Seitenkopf (PageHeader action), genau einmal", () => {
    expect((page.match(/<PageHeader\b/g) ?? []).length).toBe(1);
    expect(page).toMatch(/action=\{stand\.action\}/);
  });
  it("kein Guthaben, keine Schnellzugriff-Kachel „Lobby aufmachen“ mehr (die Spielarten stehen in GameModes)", () => {
    expect(page).not.toMatch(/Guthaben|Aufladen/);
    const nav = /<nav aria-label="Schnellzugriff"[\s\S]*?<\/nav>/.exec(page)?.[0] ?? "";
    expect(nav).not.toBe("");
    expect(nav).not.toContain("Lobby aufmachen");
  });
  it("bestehende Test-IDs bleiben: my-games, my-game, my-open-lobby (MyGames), first-steps, game-modes, mode-*", () => {
    expect(myGames).toMatch(/data-testid="my-games"/);
    expect(myGames).toMatch(/data-testid="my-game"/);
    expect(myGames).toMatch(/data-testid="my-open-lobby"/);
    expect(page).toMatch(/data-testid="first-steps"/);
    const modes = src("src/components/GameModes.tsx");
    for (const id of ["game-modes", "mode-team", "mode-private", "mode-tournament"]) expect(modes).toContain(`data-testid="${id}"`);
  });
});
