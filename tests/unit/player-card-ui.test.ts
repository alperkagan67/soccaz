import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerCard } from "@/components/PlayerCard";
import { TeamCard } from "@/components/TeamCard";
import { TEAM_COLORS, contrast } from "@/lib/color";
import { RATING, cardViewerFor, playerCardFor, teamCardFor, type CardPerson, type CardViewer } from "@/lib/player-card";
import { RATING_TIERS, TIER_LABELS, type Tier } from "@/lib/rating";
import { TIER_COLOR, TIER_INK } from "@/lib/tier-style";

// Vertrag 013 v3, AC-17 (Karten je Rolle im ECHTEN HTML und in den Props), AC-19 (Kontrast), DESIGN.md "Stufen der Spielerkarte" (Tabelle = TIER_COLOR).
const person: CardPerson = { name: "Zorro Quasimodo", elo: 1236, position: "Angriff", teamColor: "blue", teamSlug: "die-wilden-kerle" }; // Wertung 80: Stufe Pokal
const none = { participant: false, teamAdmin: false, platformAdmin: false };
const viewers: Record<string, CardViewer> = {
  gast: cardViewerFor({ userId: null, hallOperator: false, ...none }),
  mitspieler: cardViewerFor({ userId: "u1", hallOperator: false, participant: true, teamAdmin: false, platformAdmin: false }),
  hallenbetreiber: cardViewerFor({ userId: "u2", hallOperator: true, ...none }),
  ueberlappung: cardViewerFor({ userId: "u3", hallOperator: true, participant: true, teamAdmin: false, platformAdmin: false }), // Hallenbetreiber UND Mitspieler: sieht Namen
};
const html = (v: CardViewer) => renderToStaticMarkup(createElement(PlayerCard, { data: playerCardFor(v, person, RATING) }));
const props = (v: CardViewer) => JSON.stringify({ data: playerCardFor(v, person, RATING) }); // was über eine Client-Grenze ginge (RSC-Nutzlast der Props)

describe("PlayerCard je Rolle (AC-17), Rohtext des HTML und der Props, nicht nur das sichtbare DOM", () => {
  it("Gast: weder Name noch Wertung noch Stufe noch Position, nur Initialen und Hinweis", () => {
    for (const key of ["rating", "tier", "position", "name", "elo"]) expect(props(viewers.gast), `Schlüssel ${key}`).not.toContain(`"${key}"`);
    for (const out of [html(viewers.gast), props(viewers.gast)]) {
      for (const verboten of ["Zorro", "Quasimodo", "Angriff", "Pokal", "pokal", "1236", "player-card-rating", "player-card-name", "player-card-tier", "player-card-position", "data-tier", "border-rim px-2.5"]) {
        expect(out, verboten).not.toContain(verboten);
      }
      expect(out).not.toMatch(/\bAN\b/); // das Positionskürzel
      expect(out).not.toMatch(/Wertung\s*\d/); // keine Wertung als Text (strukturell, unabhängig von einzelnen Ziffern)
    }
    expect(html(viewers.gast)).toContain('data-kind="neutral"');
    expect(html(viewers.gast)).toContain("ZQ");
  });

  it("Mitspieler: Name, Wertung, Stufe (Wort), Position (Kürzel und Wort)", () => {
    const out = html(viewers.mitspieler);
    expect(out).toContain("Zorro Quasimodo");
    expect(out).toMatch(/data-testid="player-card-rating"[^>]*>80</);
    expect(out).toContain("Pokal");
    expect(out).toMatch(/\bAN\b/);
    expect(out).toContain("Angriff");
    expect(out).toContain('data-kind="full"');
  });

  it("Hallenbetreiber: namenfrei (weder Name noch Initialen), aber Wertung, Stufe, Position", () => {
    for (const out of [html(viewers.hallenbetreiber), props(viewers.hallenbetreiber)]) {
      for (const verboten of ["Zorro", "Quasimodo", "ZQ", "initials", "player-card-name"]) expect(out, verboten).not.toContain(verboten);
    }
    const out = html(viewers.hallenbetreiber);
    expect(out).toContain('data-kind="nameless"');
    expect(out).toMatch(/data-testid="player-card-rating"[^>]*>80</);
    expect(out).toContain("Pokal");
    expect(out).toContain("Angriff");
  });

  it("Überlappung Hallenbetreiber und Mitspieler: der Mitspieler gewinnt, der Name ist sichtbar", () => {
    expect(html(viewers.ueberlappung)).toContain("Zorro Quasimodo");
    expect(html(viewers.ueberlappung)).toContain('data-kind="full"');
  });

  it("fehlerhafter Betrachter: neutrale Karte, kein 500 (fail-closed bis ins HTML)", () => {
    const out = renderToStaticMarkup(createElement(PlayerCard, { data: playerCardFor(undefined as never, person, RATING) }));
    expect(out).toContain('data-kind="neutral"');
    expect(out).not.toContain("Zorro");
  });

  it("fail-closed im Rendern: kaputte oder untypisierte Objekte (leer, null, JSON ohne kind, unbekannte Art mit Wertung/Name, kind full ohne Wertung) zeigen NICHTS davon im HTML", () => {
    const kaputt: unknown[] = [
      {},
      null,
      undefined,
      "karte",
      { rating: 80, tier: "pokal", name: "Zorro Quasimodo", position: "Angriff", colorKey: "blue" }, // JSON ohne kind
      { kind: "x", rating: 80, tier: "pokal", name: "Zorro Quasimodo", position: "Angriff", initials: "ZQ", colorKey: "blue" },
      { kind: "full", name: "Zorro Quasimodo", position: "Angriff", colorKey: "blue" }, // full ohne Wertung und Stufe
      { kind: "full", rating: 80, tier: "gold", name: "Zorro Quasimodo", position: "Angriff", colorKey: "blue" }, // unbekannte Stufe
      { kind: "full", rating: 80, tier: "constructor", name: "Zorro Quasimodo", position: "Angriff", colorKey: "blue" }, // Prototypkette
      { kind: "nameless", rating: 80, tier: "__proto__", position: "Angriff", colorKey: "blue" },
      { kind: "full", rating: Number.NaN, tier: "pokal", name: "Zorro Quasimodo", position: "Angriff", colorKey: "blue" },
      { kind: "full", rating: Number.POSITIVE_INFINITY, tier: "pokal", name: "Zorro Quasimodo", position: "Angriff", colorKey: "blue" },
    ];
    for (const d of kaputt) {
      const out = renderToStaticMarkup(createElement(PlayerCard, { data: d as never }));
      expect(out).toContain('data-kind="neutral"');
      for (const verboten of ["Zorro", "Quasimodo", "Angriff", "Pokal", "undefined", "NaN", "player-card-rating", "player-card-name", "player-card-tier", "player-card-position", "data-tier"]) expect(out, verboten).not.toContain(verboten);
      expect(out).not.toMatch(/Wertung\s*\d/);
    }
  });

  it("jede Karte hat eine Textfassung (aria-label) mit Wertung und Stufe, wo sie sichtbar sind; Stufe steht nie nur als Farbe", () => {
    expect(html(viewers.mitspieler)).toContain('aria-label="Zorro Quasimodo, Wertung 80, Stufe Pokal, Position Angriff"');
    expect(html(viewers.hallenbetreiber)).toContain('aria-label="Spieler, Wertung 80, Stufe Pokal, Position Angriff"');
    expect(html(viewers.gast)).not.toMatch(/Wertung \d/);
  });
});

describe("TeamCard (AC-19)", () => {
  const team = { name: "Die Wilden Kerle", slug: "die-wilden-kerle", color: "yellow", memberElos: [1000, 1100, 1400] };

  it("zeigt Teamname, Initialen, Teamfarbe als Fläche mit lesbarer Schrift und die Teamwertung als Zahl; keine Einzelwertungen", () => {
    const d = teamCardFor(team);
    const out = renderToStaticMarkup(createElement(TeamCard, { data: d }));
    expect(out).toContain("Die Wilden Kerle");
    expect(out).toContain(`background-color:${d.hex}`);
    expect(out).toContain(`color:${d.textColor}`);
    expect(out).toMatch(/data-testid="team-card-rating"[^>]*>\d+</);
    for (const e of team.memberElos) expect(out).not.toContain(String(e));
    expect(out).toContain("DK"); // erster und letzter Namensteil ("Die Wilden Kerle"), alt "DW" (C3a: eine Initialen-Regel)
  });

  it("kleines Team: keine Zahl, ein Hinweis (die Teamwertung wäre sonst eine Einzelwertung)", () => {
    const out = renderToStaticMarkup(createElement(TeamCard, { data: teamCardFor({ ...team, memberElos: [1900] }) }));
    expect(out).not.toContain("team-card-rating");
    expect(out).toContain("Teamwertung ab 3 Spielern");
  });

  it("auf jeder der 12 Teamfarben ist die Schrift des Kartenobjekts lesbar (>= 4,5:1)", () => {
    for (const c of TEAM_COLORS) {
      const d = teamCardFor({ ...team, color: c.key });
      expect(contrast(d.hex, d.textColor), c.key).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Stufenfarben (DESIGN.md)", () => {
  const design = readFileSync(path.join(process.cwd(), "DESIGN.md"), "utf8");

  it("jede Stufe aus rating.ts hat Farbe und Wort; die Tabelle in DESIGN.md stimmt mit TIER_COLOR und TIER_INK überein", () => {
    for (const t of RATING_TIERS) {
      expect(TIER_COLOR[t.tier], t.tier).toMatch(/^#[0-9a-f]{6}$/);
      const row = new RegExp(`\\|\\s*${TIER_LABELS[t.tier]}\\s*\\|\\s*${t.from}\\s*\\|\\s*\`(#[0-9a-fA-F]{6})\`\\s*\\|\\s*\`(#[0-9a-fA-F]{6})\``).exec(design);
      expect(row, `Zeile ${t.tier} in DESIGN.md`).not.toBeNull();
      expect(row![1].toLowerCase()).toBe(TIER_COLOR[t.tier]);
      expect(row![2].toLowerCase()).toBe(TIER_INK);
    }
    expect(Object.keys(TIER_COLOR).sort()).toEqual(RATING_TIERS.map((t) => t.tier).sort());
  });

  it("Schrift auf dem Chip >= 4,5:1; der Chip hebt sich von der dunklen Kartenfläche ab (>= 3:1)", () => {
    const panelDark = "#1b2a23"; // --panel (globals.css)
    for (const t of Object.keys(TIER_COLOR) as Tier[]) {
      expect(contrast(TIER_COLOR[t], TIER_INK), `${t} Schrift`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(TIER_COLOR[t], panelDark), `${t} Fläche`).toBeGreaterThanOrEqual(3);
    }
  });

  it("der Chip jeder Stufe wird mit Wort und Stufenfarbe gerendert", () => {
    for (const t of RATING_TIERS) {
      const elo = 1000 + (t.from - 50) * 8; // Wertung t.from
      const out = renderToStaticMarkup(createElement(PlayerCard, { data: playerCardFor(viewers.mitspieler, { ...person, elo }, RATING) }));
      expect(out, t.tier).toContain(`data-tier="${t.tier}"`);
      expect(out, t.tier).toContain(TIER_LABELS[t.tier]);
      expect(out, t.tier).toContain(`background-color:${TIER_COLOR[t.tier]}`);
    }
  });
});

describe("Stufenfarbe NUR als Chip (AC-30) und Kontrast hell", () => {
  const root = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx|css)$/.test(e.name) ? [path.join(dir, e.name)] : []));

  it("tier-style und TIER_COLOR kommen in src/ nur in tier-style.ts und der Chip-Komponente TierChip.tsx vor (PlayerCard und PlayerRow nutzen den Chip, lesen die Farbe nicht selbst); in TierChip.tsx genau einmal als backgroundColor des Chips (data-testid player-card-tier)", () => {
    const erlaubt = new Set(["src/lib/tier-style.ts", "src/components/TierChip.tsx"]);
    for (const file of walk(path.join(root, "src"))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      const text = readFileSync(file, "utf8");
      if (/tier-style|TIER_COLOR/.test(text)) expect(erlaubt.has(rel), `${rel} darf die Stufenfarbe nicht lesen`).toBe(true);
    }
    const card = readFileSync(path.join(root, "src/components/TierChip.tsx"), "utf8");
    expect(card.match(/\bTIER_COLOR\b/g)).toHaveLength(2); // Import und genau EINE Verwendung (der Chip), egal in welcher Schreibweise
    expect(card.match(/TIER_COLOR\[/g)).toHaveLength(1);
    const chip = /data-testid="player-card-tier"[\s\S]*?style=\{\{[^}]*TIER_COLOR\[[^}]*\}\}/.exec(card);
    expect(chip, "TIER_COLOR steht im Element mit data-testid player-card-tier").not.toBeNull();
    expect(chip![0]).toContain("backgroundColor");
  });

  it("Gegenprobe: das Markup OHNE den Chip enthält keinen der fünf Stufen-Hexwerte", () => {
    const out = html(viewers.mitspieler);
    const ohneChip = out.replace(/<span data-testid="player-card-tier"[\s\S]*?<\/span>/, "");
    expect(ohneChip).not.toBe(out); // der Chip war da
    for (const hex of Object.values(TIER_COLOR)) expect(ohneChip.toLowerCase(), hex).not.toContain(hex.toLowerCase());
    expect(out.toLowerCase()).toContain(TIER_COLOR.pokal); // und im Chip steht die Farbe
  });

  it("Kontrast HELL: der Rahmen border-rim des Chips (--rim hell) gegen die Kartenfläche (--panel hell) >= 3:1; Werte aus globals.css gelesen, Markup trägt border-rim am Chip", () => {
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    const light = /@media \(prefers-color-scheme: light\) \{\s*:root \{([\s\S]*?)\n  \}/.exec(css);
    expect(light, "heller Block in globals.css").not.toBeNull();
    const val = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(light![1])?.[1];
    const rim = val("rim");
    const panel = val("panel");
    expect(rim && panel).toBeTruthy();
    expect(contrast(rim!, panel!)).toBeGreaterThanOrEqual(3);
    const chipTag = /<span data-testid="player-card-tier"[^>]*>/.exec(html(viewers.mitspieler));
    expect(chipTag![0]).toContain("border-rim");
    expect(chipTag![0]).toContain("border ");
  });
});
