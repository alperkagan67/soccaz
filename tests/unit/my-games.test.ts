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

describe("matchBadge: Ergebnis offen ist in der Liste bewusst unerreichbar (keine Ergebnisdaten)", () => {
  it("begonnenes Spiel ohne Endstand: Laeuft; gespieltes: Gespielt; nie Ergebnis offen", () => {
    for (const h of [-1, -30]) expect(matchBadge({ status: "confirmed", startsAt: at(h) }, now).label).toBe("Läuft");
    expect(matchBadge({ status: "played", startsAt: at(-30) }, now).label).toBe("Gespielt");
    for (const status of ["lobby", "confirmed", "played", "disputed", "cancelled"] as const) for (const h of [-30, -1, 5]) expect(matchBadge({ status, startsAt: at(h) }, now).label).not.toBe("Ergebnis offen");
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
  describe("Dringlichkeit (Entscheid t2q 2026-11-24): früherer Stichtag gewinnt, Spiel innerhalb 24 h und Gleichstand: Spiel", () => {
    const NOW = new Date("2026-12-01T12:00:00Z");
    const H = 3_600_000;
    const inH = (h: number) => new Date(NOW.getTime() + h * H);
    const g = (h: number | null) => ({ ...game, startsAt: inH(h ?? 5), timeOpen: h === null });
    const ch = (deadlineH: number | null, id = "r1") => ({ id, fromTeam: "Heim", toTeam: "Gast", startsAt: inH(48), ...(deadlineH === null ? {} : { href: `/lobby/${id}` }), deadline: deadlineH === null ? null : inH(deadlineH) });
    const st = (games: ReturnType<typeof g>[], incoming: ReturnType<typeof ch>[]) => dashboardStand({ games, open: [], teamCount: 1, incoming, now: NOW }, fmt);

    // Matrix: {Spiel in 2 h, Spiel in 3 Tagen} x {Herausforderung läuft in 1 h ab, in 2 Tagen, ohne Frist} x {1, 2 Herausforderungen}
    for (const spielH of [2, 72]) {
      for (const frist of [1, 48, null] as const) {
        for (const n of [1, 2]) {
          const incoming = n === 1 ? [ch(frist)] : [ch(frist), ch(frist === null ? null : frist + 5, "r2")];
          const erwartetSpiel = spielH === 2 || frist === null; // Spiel innerhalb 24 h oder Herausforderung ohne Frist: Spiel
          const stand = st([g(spielH)], incoming);
          it(`Spiel in ${spielH} h, Herausforderung ${frist === null ? "ohne Frist" : `Frist in ${frist} h`}, ${n} Herausforderung(en) -> ${erwartetSpiel ? "Spiel" : "Herausforderung"} ist die Hauptaktion`, () => {
            const label = n > 1 ? `Herausforderungen ansehen (${n})` : "Herausforderung ansehen";
            if (erwartetSpiel) {
              expect(stand.action).toEqual({ label: "Zur Lobby", href: "/lobby/g1" });
              expect(stand.second?.action.label).toBe(label); // die Herausforderung bleibt sichtbar (nie verdeckt)
            } else {
              expect(stand.action.label).toBe(label);
              expect(stand.second?.action).toEqual({ label: "Zur Lobby", href: "/lobby/g1" }); // das Spiel bleibt sichtbar
            }
          });
        }
      }
    }
    it("die Lobby der Herausforderung selbst ist kein zweites Spiel: keine zweite Zeile mit demselben Spiel", () => {
      const s = st([{ ...g(72), id: "r1" }], [ch(48)]); // ch() trägt href /lobby/r1
      expect(s.second).toBeUndefined();
      expect(s.action.label).toBe("Herausforderung ansehen");
      expect(st([{ ...g(72), id: "r1" }, { ...g(100), id: "g9" }], [ch(48)]).second?.action.href).toBe("/lobby/g9"); // ein echtes eigenes Spiel bleibt
    });
    it("Ziele: eine Herausforderung führt direkt hin, mehrere zur Liste auf /app", () => {
      expect(st([], [ch(48)]).action.href).toBe("/lobby/r1");
      expect(st([], [ch(null)]).action.href).toBe("/suche/r1");
      expect(st([], [ch(48), ch(60, "r2")]).action).toEqual({ label: "Herausforderungen ansehen (2)", href: "/app#herausforderungen" });
    });
    it("Gleichstand der Stichtage: das Spiel; Uhrzeit des Spiels offen: die Herausforderung mit Frist, ohne Frist das Spiel", () => {
      expect(st([g(72)], [ch(72)]).action.label).toBe("Zur Lobby");
      expect(st([g(72)], [ch(71)]).action.label).toBe("Herausforderung ansehen");
      expect(st([g(null)], [ch(48)]).action.label).toBe("Herausforderung ansehen");
      expect(st([g(null)], [ch(null)]).action.label).toBe("Zur Lobby");
    });
    it("bei mehreren Herausforderungen zählt die früheste Frist; ohne Herausforderung oder ohne Spiel wie bisher (kein zweiter Eintrag)", () => {
      expect(st([g(72)], [ch(100), ch(30, "r2")]).action.label).toBe("Herausforderungen ansehen (2)"); // 30 h < 72 h
      expect(st([], [ch(100), { ...ch(30, "r2"), fromTeam: "Frueh" }]).line).toContain("Frueh"); // die Zeile nennt die Herausforderung mit der frühesten Frist
      const nurSpiel = st([g(72)], []);
      expect(nurSpiel.second).toBeUndefined();
      expect(nurSpiel.action.href).toBe("/lobby/g1");
      const nurHerausforderung = st([], [ch(48)]);
      expect(nurHerausforderung.second).toBeUndefined();
      expect(nurHerausforderung.line).toBe("Dein Team ist herausgefordert: Heim gegen Gast");
    });
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
    expect(src("src/components/GameModes.tsx")).toMatch(/quiet \? "btn btn-ghost !py-2" : "btn btn-primary !py-2"/);
  });
  it("Distill: /app rendert MyGames nicht mehr (das Spiel stünde viermal: Stand, Kasten, Liste, Knöpfe); offene Lobbys stehen in der Liste", () => {
    expect(page).not.toMatch(/<MyGames\b/);
    expect(page).toMatch(/data-testid="my-open-lobby"/);
  });
  it("Schriftgroessen (AC-30 e, wie C3a): nie text-xs, hoechstens 4 verschiedene Groessen in Seite, MyGames und GameModes (StatusBadge text-xs: geteilter Baustein, bekannte Grenze)", () => {
    const sizes = new Set<string>();
    for (const code of [page, myGames, src("src/components/GameModes.tsx")]) {
      expect(code).not.toMatch(/\btext-xs\b/);
      for (const m of code.matchAll(/\btext-(sm|base|lg|xl|2xl|3xl|4xl)\b/g)) sizes.add(m[1]);
    }
    expect(sizes.size).toBeLessThanOrEqual(4);
    expect(sizes.size).toBeGreaterThan(0);
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
  it("Dringlichkeit in der Seite: zweite Zeile stand-second mit ruhigem Knopf, Anker für die Liste der Herausforderungen", () => {
    const page = readFileSync(join(process.cwd(), "src/app/app/page.tsx"), "utf8");
    expect(page).toContain('data-testid="stand-second"');
    expect(page).toMatch(/<LinkButton href={stand.second.action.href} size="sm">/);
    expect(readFileSync(join(process.cwd(), "src/components/Challenges.tsx"), "utf8")).toContain('id="herausforderungen"');
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
