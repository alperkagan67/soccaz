import { describe, expect, it } from "vitest";
import { KOMMT_BALD_TEXT, pfadGesperrt, turnierOnlyOn } from "@/lib/turnier-only";

// Turnier 12.12.: TURNIER_ONLY=1 (ausdrückliches Opt-in, Standard AUS überall) sperrt die Spiel-Bereiche; Turniere, Teams, Profil, Hilfe und Rechtliches bleiben offen.
describe("turnierOnlyOn: nur ausdrücklich '1' schaltet ein", () => {
  it("Standard aus (auch in Produktion), nur TURNIER_ONLY=1 ein", () => {
    expect(turnierOnlyOn({})).toBe(false);
    expect(turnierOnlyOn({ NODE_ENV: "production" } as never)).toBe(false);
    expect(turnierOnlyOn({ TURNIER_ONLY: "0" })).toBe(false);
    expect(turnierOnlyOn({ TURNIER_ONLY: "true" })).toBe(false);
    expect(turnierOnlyOn({ TURNIER_ONLY: "" })).toBe(false);
    expect(turnierOnlyOn({ TURNIER_ONLY: "1" })).toBe(true);
  });
});

describe("pfadGesperrt: Bereiche der Spielvermittlung gesperrt, Turnier-Wege offen", () => {
  const gesperrt = ["/matchmaking", "/suche", "/suche/abc", "/hallen", "/hallen/1", "/halle", "/halle/anfragen", "/rangliste", "/mitspieler", "/ligen", "/ligen/x", "/overlay", "/overlay/abc", "/profitag", "/lobby/abc", "/lobby/offen/1", "/spiel/token123", "/spiele", "/app/privatspiel/neu", "/app/suche/neu", "/app/guthaben", "/api/lobby/1/events", "/api/spiele/stream", "/api/spiele/1/events", "/api/spiele/1/live"];
  const offen = ["/", "/turniere", "/turniere/abc", "/app", "/app/turniere/neu", "/app/teams/neu", "/app/einstellungen", "/app/benachrichtigungen", "/teams", "/teams/foo", "/spieler", "/spieler/abc", "/hilfe", "/kontakt", "/impressum", "/datenschutz", "/agb", "/hausordnung", "/unter-16", "/anmelden", "/willkommen", "/einladung/abc", "/admin", "/admin/spiele", "/api/health", "/api/auth/signin", "/api/stripe/webhook", "/api/media/1", "/offline"];
  for (const p of gesperrt) it(`gesperrt: ${p}`, () => expect(pfadGesperrt(p), p).toBe(true));
  for (const p of offen) it(`offen: ${p}`, () => expect(pfadGesperrt(p), p).toBe(false));
  it("/spiele/<id> ist NICHT pauschal gesperrt: Turnier-Spiele laufen darüber (Entscheidung nach Spielart auf der Seite), die Liste /spiele schon", () => {
    expect(pfadGesperrt("/spiele/abc")).toBe(false);
    expect(pfadGesperrt("/spiele")).toBe(true);
  });
  it("ein Präfix sperrt keine Nachbarn mit gleichem Anfang (/spieler bleibt offen, /spiel/ ist nur die Einladung)", () => {
    expect(pfadGesperrt("/spieler/abc")).toBe(false);
    expect(pfadGesperrt("/spielplan")).toBe(false);
    expect(pfadGesperrt("/halleluja")).toBe(false);
    expect(pfadGesperrt("/hallen-x")).toBe(false);
  });
});

describe("Text", () => {
  it("neutral, ohne Versprechen und Termin", () => {
    expect(KOMMT_BALD_TEXT).toMatch(/kommt bald/i);
    expect(KOMMT_BALD_TEXT).not.toMatch(/\d{1,2}\.\s?\d{1,2}\./);
  });
});

describe("Revanche und PWA-Startmenü (Review R-T425)", () => {
  it("Spielseite: Revanche-Link nur bei Nicht-Turnier-Spielen", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/app/spiele/[id]/page.tsx", "utf8")).toMatch(/v\?\.mySide && match\.status === "played" && match\.kind !== "tournament" && \(/);
  });
  it("manifest: bei TURNIER_ONLY=1 keine Shortcuts auf gesperrte Bereiche, sonst unverändert", async () => {
    const manifest = (await import("@/app/manifest")).default;
    const alt = process.env.TURNIER_ONLY;
    try {
      process.env.TURNIER_ONLY = "1";
      const urls = (manifest().shortcuts ?? []).map((x) => x.url);
      expect(urls).toEqual(["/turniere", "/app"]);
      for (const u of urls) expect(pfadGesperrt(u)).toBe(false);
      delete process.env.TURNIER_ONLY;
      expect((manifest().shortcuts ?? []).map((x) => x.url)).toEqual(["/matchmaking", "/spiele", "/app"]);
    } finally {
      if (alt === undefined) delete process.env.TURNIER_ONLY; else process.env.TURNIER_ONLY = alt;
    }
  });
});
