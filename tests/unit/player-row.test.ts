import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerRow } from "@/components/PlayerRow";
import { RATING, cardViewerFor, playerCardFor, ratedCard, type CardPerson, type CardViewer } from "@/lib/player-card";

// Vertrag 013 v3, AC-17 (Sichtbarkeit je Rolle auch in Listen) und AC-30 (einfache Zeilen, genau ein Stufen-Chip, keine Karte in der Karte, Stilregeln).
const person: CardPerson = { name: "Zorro Quasimodo", elo: 1236, position: "Angriff", teamColor: "blue", teamSlug: "die-wilden-kerle" }; // Wertung 80: Pokal
const none = { participant: false, teamAdmin: false, platformAdmin: false };
const viewers: Record<string, CardViewer> = {
  gast: cardViewerFor({ userId: null, hallOperator: false, ...none }),
  mitglied: cardViewerFor({ userId: "u1", hallOperator: false, participant: true, teamAdmin: false, platformAdmin: false }),
  hallenbetreiber: cardViewerFor({ userId: "u2", hallOperator: true, ...none }),
};
const html = (data: unknown, props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(PlayerRow, { data: data as never, ...props }));
const row = (v: CardViewer) => html(playerCardFor(v, person, RATING));
const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("PlayerRow je Rolle (Rohtext des HTML)", () => {
  it("Gast: nur Initialen; weder Name noch Wertung noch Stufe noch Position, auch nicht in den Test-IDs", () => {
    const out = row(viewers.gast);
    expect(out).toContain('data-kind="neutral"');
    expect(out).toContain("ZQ");
    for (const verboten of ["Zorro", "Quasimodo", "Angriff", "Pokal", "player-row-rating", "player-row-position", "player-card-tier", "data-tier"]) expect(out, verboten).not.toContain(verboten);
    expect(out).not.toMatch(/\bAN\b/);
  });

  it("Mitglied: Name, Position (Kürzel und Wort), Wertung als Zahl und genau EIN Stufen-Chip mit Wort", () => {
    const out = row(viewers.mitglied);
    expect(out).toContain("Zorro Quasimodo");
    expect(out).toContain("AN · Angriff");
    expect(out).toContain('data-testid="player-row-rating"');
    expect(out).toContain(">80<");
    expect(out.match(/data-testid="player-card-tier"/g)).toHaveLength(1);
    expect(out).toContain("Pokal");
  });

  it("Hallenbetreiber: namenfrei (weder Name noch Initialen), mit Wertung, Stufe und Position", () => {
    const out = row(viewers.hallenbetreiber);
    expect(out).toContain('data-kind="nameless"');
    for (const verboten of ["Zorro", "Quasimodo", "ZQ"]) expect(out, verboten).not.toContain(verboten);
    expect(out).toContain("Spieler");
    expect(out).toContain("Pokal");
    expect(out).toContain("Angriff");
  });

  it("kaputte oder untypisierte Objekte: nur Initialen (oder Fragezeichen), nie Wertung, Stufe, Position oder Name", () => {
    const kaputt: unknown[] = [
      undefined,
      null,
      {},
      "x",
      { kind: "x", rating: 80, tier: "pokal", name: "Zorro Quasimodo", position: "Angriff", initials: "ZQ" },
      { kind: "full", name: "Zorro Quasimodo", position: "Angriff" },
      { kind: "full", rating: 80, tier: "constructor", name: "Zorro Quasimodo", position: "Angriff" },
      { kind: "full", rating: Number.NaN, tier: "pokal", name: "Zorro Quasimodo", position: "Angriff" },
    ];
    for (const d of kaputt) {
      const out = html(d, { href: "/spieler/abc" }); // auch mit Link-Wunsch: ohne gültigen Namen kein Link auf ein Profil
      expect(out).toContain('data-kind="neutral"');
      for (const verboten of ["Zorro", "Quasimodo", "Angriff", "Pokal", "undefined", "NaN", "player-row-rating", "player-card-tier", "/spieler/abc"]) expect(out, verboten).not.toContain(verboten);
    }
  });

  it("ratedCard: nur full/nameless mit endlicher Wertung und eigener Stufe; Prototyp-Schlüssel sind keine Stufe", () => {
    expect(ratedCard(playerCardFor(viewers.mitglied, person, RATING))).not.toBeNull();
    expect(ratedCard(playerCardFor(viewers.hallenbetreiber, person, RATING))).not.toBeNull();
    expect(ratedCard(playerCardFor(viewers.gast, person, RATING))).toBeNull();
    for (const bad of [null, undefined, 5, {}, { kind: "full", rating: 1, tier: "__proto__" }, { kind: "full", rating: Number.POSITIVE_INFINITY, tier: "rasen" }]) expect(ratedCard(bad)).toBeNull();
  });

  it("Zusatzfelder: Link nur mit Namen (nie bei neutral/namenlos), Marke und Rolle erscheinen", () => {
    const full = html(playerCardFor(viewers.mitglied, person, RATING), { href: "/spieler/abc", badges: createElement("b", null, "Profi"), trailing: createElement("i", null, "Team-Admin") });
    expect(full).toContain('href="/spieler/abc"');
    expect(full).toContain("Profi");
    expect(full).toContain("Team-Admin");
    expect(html(playerCardFor(viewers.gast, person, RATING), { href: "/spieler/abc" })).not.toContain("/spieler/abc");
    expect(html(playerCardFor(viewers.hallenbetreiber, person, RATING), { href: "/spieler/abc" })).not.toContain("/spieler/abc");
  });
});

describe("Stilregeln AC-30 (Quelltext der Listenkomponenten und der Teamseite)", () => {
  const files = ["src/components/PlayerRow.tsx", "src/components/TierChip.tsx"];

  it("keine Karte in der Karte: die Zeile hat keine card-Klasse; auf der Teamseite hat nur die Liste EINEN Rahmen, die Einträge keinen", () => {
    expect(src("src/components/PlayerRow.tsx")).not.toMatch(/className=[^\n]*\bcard\b/); // auch in Template-Strings
    const page = src("src/app/teams/[slug]/page.tsx");
    const kader = page.slice(page.indexOf('data-testid="roster"'), page.indexOf("</ul>", page.indexOf('data-testid="roster"')));
    expect(kader.match(/\bcard\b/g) ?? []).toHaveLength(0); // der Rahmen steht im öffnenden ul davor
    expect(page).toContain('<ul className="card divide-y divide-line" data-testid="roster">');
    const li = /<li [^>]*data-testid="member"/.exec(page)![0];
    expect(li).not.toMatch(/\bcard\b/);
  });

  it("kein farbiger Seitenstreifen über 1 px (border-l/r-2 und stärker) und keine Stufenfarbe außerhalb des Chips", () => {
    for (const f of files) {
      const text = src(f);
      expect(text, f).not.toMatch(/border-[lr]-(2|4|8)\b/);
      expect(text, f).not.toMatch(/border-[lr]-\[/);
    }
    expect(src("src/components/PlayerRow.tsx")).not.toMatch(/TIER_COLOR|tier-style/);
  });

  it("höchstens vier Schriftgrößen in der Zeile samt Chip, nur Akzent: Leuchtfarbe beim Hover, Teamfarbe nur über die Liste (keine weitere Farbe)", () => {
    const text = files.map(src).join("\n");
    const sizes = new Set([...text.matchAll(/\btext-(xs|sm|base|lg|xl|2xl|3xl)\b/g)].map((m) => m[1]));
    expect(sizes.size).toBeLessThanOrEqual(4);
    const accents = new Set([...text.matchAll(/\b(?:bg|text|border)-(accent[a-z-]*|ok|warn|danger|info|card-red|card-yellow)\b/g)].map((m) => m[0]));
    expect([...accents].sort()).toEqual(["text-accent-fg"]);
  });

  it("Abstände nur aus der Skala: nur diese Tailwind-Abstandsklassen in der Zeile und im Chip", () => {
    const text = files.map(src).join("\n");
    const used = [...text.matchAll(/\b(?:gap|px|py|pl|pr|mt|mb|ml|mr|p|m)-(\[[^\]]*\]|\d+(?:\.\d+)?)/g)].map((m) => m[1]);
    for (const v of used) expect(["1", "2", "3", "0.5", "2.5"], `Abstand ${v}`).toContain(v);
  });
});
