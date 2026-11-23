import { describe, expect, it } from "vitest";
import { TEAM_COLORS, contrast } from "@/lib/color";
import { TEAM_RATING_MIN_MEMBERS, cardViewerFor, initialsOf, playerCardFor, teamCardFor, type CardPerson, type CardViewer, type PlayerCardData, type RatingApi } from "@/lib/player-card";

// Vertrag 013 v3, AC-17 (Sichtbarkeit der Spielerkarte) und AC-19 (Teamkarte, Kontrast). Wertung/Stufe sind hier eine Attrappe mit fester Signatur (rating.ts kommt von w2).
const rating: RatingApi = { ratingFromElo: (e) => Math.max(0, Math.min(99, Math.round((e - 500) / 20))), tierFor: (r) => (r >= 75 ? "Pokal" : r >= 50 ? "Rasen" : "Kreide") };
const person: CardPerson = { name: "Zorro Quasimodo", elo: 1540, position: "ST", teamColor: "blue", teamSlug: "die-wilden-kerle" }; // Wertung 52, Stufe Rasen

const guest: CardViewer = { kind: "guest" };
const member: CardViewer = { kind: "member" };
const hall: CardViewer = { kind: "hall" };

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

  it("cardViewerFor: ohne Anmeldung Gast (auch leere Kennung), angemeldet member, reiner Hallenbetreiber hall", () => {
    expect(cardViewerFor({ userId: null, hallOperator: true, participant: false, teamAdmin: false, platformAdmin: false })).toEqual({ kind: "guest" });
    expect(cardViewerFor({ userId: "", hallOperator: false, participant: false, teamAdmin: false, platformAdmin: false })).toEqual({ kind: "guest" });
    expect(cardViewerFor({ userId: "u1", hallOperator: false, participant: false, teamAdmin: false, platformAdmin: false })).toEqual({ kind: "member" });
    expect(cardViewerFor({ userId: "u2", hallOperator: true, participant: false, teamAdmin: false, platformAdmin: false })).toEqual({ kind: "hall" });
    expect(cardViewerFor(undefined as never)).toEqual({ kind: "guest" }); // Laufzeit-Fehleingabe: kein Absturz, restriktivste Sicht
  });

  it("Überlappung: Hallenbetreiber, der zugleich Mitspieler, Team-Admin oder Plattform-Admin ist, sieht Namen (member); nur der reine Hallenbetreiber ist namenfrei", () => {
    for (const role of ["participant", "teamAdmin", "platformAdmin"] as const) {
      const v = cardViewerFor({ userId: "u3", hallOperator: true, participant: false, teamAdmin: false, platformAdmin: false, [role]: true });
      expect(v, role).toEqual({ kind: "member" });
      expect(playerCardFor(v, person, rating), role).toMatchObject({ kind: "full", name: "Zorro Quasimodo" });
    }
    const pure = cardViewerFor({ userId: "u4", hallOperator: true, participant: false, teamAdmin: false, platformAdmin: false });
    expect(playerCardFor(pure, person, rating).kind).toBe("nameless");
  });

  it("fail-closed: fehlender, unbekannter oder kaputter Betrachter bekommt die neutrale Karte, nie die volle", () => {
    for (const v of [undefined, null, {}, { kind: "admin" }, { kind: "" }, "member", 7] as unknown[]) expect(playerCardFor(v as CardViewer, person, rating).kind, String(JSON.stringify(v))).toBe("neutral");
  });

  it("die Feldmenge je Variante ist exakt festgelegt (AC-17 strukturell): kein zusätzliches Feld kann unbemerkt auf die Karte kommen", () => {
    expect(Object.keys(playerCardFor(guest, person, rating)).sort()).toEqual(["colorKey", "initials", "kind"]);
    expect(Object.keys(playerCardFor(hall, person, rating)).sort()).toEqual(["colorKey", "kind", "position", "rating", "tier"]);
    expect(Object.keys(playerCardFor(member, person, rating)).sort()).toEqual(["colorKey", "initials", "kind", "name", "position", "rating", "tier"]);
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
    expect(Object.keys(d).sort()).toEqual(["colorKey", "hex", "initials", "members", "name", "teamRating", "textColor"]);
    expect(JSON.stringify(d)).not.toContain("memberElos");
    expect(JSON.stringify(d)).not.toContain("1500");
  });

  it("leeres Team: keine Teamwertung (null), keine Division durch null", () => {
    expect(teamCardFor({ ...team, memberElos: [] }, rating)).toMatchObject({ teamRating: null, members: 0 });
  });

  it("kleine Teams verraten keine Einzelwertung: unter dem Mindestmaß an Mitgliedern keine Teamwertung (1 Mitglied wäre genau seine Wertung), ab dem Mindestmaß eine", () => {
    expect(TEAM_RATING_MIN_MEMBERS).toBe(3);
    expect(teamCardFor({ ...team, memberElos: [1800] }, rating).teamRating).toBeNull();
    expect(teamCardFor({ ...team, memberElos: [1800, 1000] }, rating).teamRating).toBeNull();
    expect(teamCardFor({ ...team, memberElos: [1800, 1000, 1400] }, rating).teamRating).not.toBeNull();
  });

  it("ungültige Teamfarbe stürzt nicht ab: es gilt die Standardfarbe", () => {
    const d = teamCardFor({ ...team, color: "orange-kaputt" }, rating);
    expect(TEAM_COLORS.map((c) => c.key)).toContain(d.colorKey);
    expect(d.colorKey).toBe(teamCardFor({ ...team, color: null }, rating).colorKey); // dieselbe Standardfarbe wie ohne Wahl (aus dem Slug)
  });

  it("Textfarbe auf JEDER der 12 Teamfarben: Kontrast mindestens 4,5:1 (Text) bei hellen wie dunklen Farben", () => {
    for (const c of TEAM_COLORS) {
      const d = teamCardFor({ ...team, color: c.key }, rating);
      expect(d.hex).toBe(c.hex);
      expect(contrast(d.hex, d.textColor), c.key).toBeGreaterThanOrEqual(4.5);
    }
  });
});
