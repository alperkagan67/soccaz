import { describe, expect, it } from "vitest";
import { TEAM_COLORS, contrast } from "@/lib/color";
import { initialsOf, playerCardFor, teamCardFor, type CardPerson, type PlayerCardData, type RatingApi } from "@/lib/player-card";

// Vertrag 013 v3, AC-17 (Sichtbarkeit der Spielerkarte) und AC-19 (Teamkarte, Kontrast). Wertung/Stufe sind hier eine Attrappe mit fester Signatur (rating.ts kommt von w2).
const rating: RatingApi = { ratingFromElo: (e) => Math.max(0, Math.min(99, Math.round((e - 500) / 20))), tierFor: (r) => (r >= 75 ? "Pokal" : r >= 50 ? "Rasen" : "Kreide") };
const person: CardPerson = { name: "Zorro Quasimodo", elo: 1540, position: "ST", teamColor: "blue", teamSlug: "die-wilden-kerle" }; // Wertung 52, Stufe Rasen

const guest = { userId: null };
const member = { userId: "u1" };
const hall = { userId: "u2", hallOperator: true };

describe("playerCardFor (AC-17): Sichtbarkeit je Betrachter", () => {
  it("Gast: neutrale Karte, nur Initialen und Teamfarbe; im serialisierten Objekt (HTML/RSC-Vorlage) steht weder Name noch Wertung noch Position noch Stufe", () => {
    const d = playerCardFor(guest, person, rating);
    expect(d).toEqual({ kind: "neutral", initials: "ZQ", colorKey: "blue" });
    const text = JSON.stringify(d);
    for (const verboten of ["Zorro", "Quasimodo", "ST", "52", "Rasen", "rating", "tier", "position", "name\"", "1540", "elo"]) expect(text).not.toContain(verboten);
  });

  it("angemeldet (Mitspieler, Teamkamerad, Captain/Admin, fremder Nutzer sind auf der Karte gleich): Name, Wertung, Stufe, Position", () => {
    expect(playerCardFor(member, person, rating)).toEqual({ kind: "full", initials: "ZQ", name: "Zorro Quasimodo", rating: 52, tier: "Rasen", position: "ST", colorKey: "blue" });
  });

  it("Hallenbetreiber: namenfrei (weder Name noch Initialen), aber Wertung, Stufe und Position", () => {
    const d = playerCardFor(hall, person, rating);
    expect(d).toEqual({ kind: "nameless", rating: 52, tier: "Rasen", position: "ST", colorKey: "blue" });
    const text = JSON.stringify(d);
    for (const verboten of ["Zorro", "Quasimodo", "ZQ", '"name"', "initials"]) expect(text).not.toContain(verboten);
  });

  it("Hallenbetreiber-Flag ohne Anmeldung ändert nichts: nicht angemeldet bleibt neutral", () => {
    expect(playerCardFor({ userId: null, hallOperator: true }, person, rating).kind).toBe("neutral");
  });

  it("die Typen verhindern den Zugriff auf Felder, die es für die Variante nicht gibt (tsc prüft diese Zeilen)", () => {
    const d: PlayerCardData = playerCardFor(guest, person, rating);
    if (d.kind === "neutral") {
      // @ts-expect-error neutrale Karte hat keine Wertung
      void d.rating;
      // @ts-expect-error neutrale Karte hat keinen Namen
      void d.name;
    }
    const n: PlayerCardData = playerCardFor(hall, person, rating);
    if (n.kind === "nameless") {
      // @ts-expect-error namenlose Karte hat keinen Namen
      void n.name;
      // @ts-expect-error namenlose Karte hat keine Initialen
      void n.initials;
    }
    expect(true).toBe(true);
  });

  it("Teamfarbe: gewählte Farbe, sonst die Standardfarbe aus dem Slug (immer ein gültiger Schlüssel)", () => {
    expect(playerCardFor(member, { ...person, teamColor: "green" }, rating)).toMatchObject({ colorKey: "green" });
    const fallback = playerCardFor(member, { ...person, teamColor: null }, rating);
    expect(TEAM_COLORS.map((c) => c.key)).toContain(fallback.colorKey);
  });

  it("Wertung folgt der Elo (Startwert 1000 = Wertung der Attrappe), Neuling bekommt eine Wertung und Stufe", () => {
    const d = playerCardFor(member, { ...person, elo: 1000 }, rating);
    expect(d).toMatchObject({ kind: "full", rating: 25, tier: "Kreide" });
  });
});

describe("initialsOf", () => {
  it("zwei Wörter, groß; ein Wort ein Buchstabe; leer ein Fragezeichen; Unicode bleibt ganz", () => {
    expect(initialsOf("zorro quasimodo")).toBe("ZQ");
    expect(initialsOf("Zorro")).toBe("Z");
    expect(initialsOf("  ")).toBe("?");
    expect(initialsOf("Özgür Çelik Demir")).toBe("ÖÇ");
  });
});

describe("teamCardFor (AC-19)", () => {
  const team = { name: "Die Wilden Kerle", slug: "die-wilden-kerle", color: "yellow", memberElos: [1000, 1500, 2000] };

  it("Teamwertung = Durchschnitt der Mitglieder-Wertungen (nur eine Zahl), keine Einzelwertungen im Objekt", () => {
    const d = teamCardFor(team, rating);
    expect(d).toMatchObject({ name: "Die Wilden Kerle", initials: "DW", colorKey: "yellow", teamRating: 50, members: 3 }); // (25 + 50 + 75) / 3
    expect(JSON.stringify(d)).not.toContain("memberElos");
    expect(JSON.stringify(d)).not.toContain("1500");
  });

  it("leeres Team: keine Teamwertung (null), keine Division durch null", () => {
    expect(teamCardFor({ ...team, memberElos: [] }, rating)).toMatchObject({ teamRating: null, members: 0 });
  });

  it("Textfarbe auf JEDER der 12 Teamfarben: Kontrast mindestens 4,5:1 (Text) bei hellen wie dunklen Farben", () => {
    for (const c of TEAM_COLORS) {
      const d = teamCardFor({ ...team, color: c.key }, rating);
      expect(d.hex).toBe(c.hex);
      expect(contrast(d.hex, d.textColor), c.key).toBeGreaterThanOrEqual(4.5);
    }
  });
});
