import { describe, expect, it } from "vitest";
import { lobbyStand, type LobbyStandInput } from "@/lib/lobby-stand";

// 013 M3 PR 5a: "Dein Stand" und die EINE Hauptaktion je Rolle und Zustand (AC-30). Zustand-Matrix wie bei den Zahlungstexten: Gratis/AUS, Pause, Altspiel (alle ohne Kartenmodell), Preis 0, Dritter.
const basis: LobbyStandInput = {
  signedIn: true, status: "lobby", active: true, planning: false, challengePending: false, challengeRole: "viewer",
  participant: true, hasTeam: true, ready: false, canJoin: false, canJoinAsSubstitute: false, teamFull: false,
  cardOn: false, cardReady: false, chargeFailure: null, minReady: 4, finalTeam: null,
};
const mit = (o: Partial<LobbyStandInput>) => lobbyStand({ ...basis, ...o });

describe("lobbyStand: Hauptaktion je Rolle", () => {
  it("Gast: Anmelden", () => expect(mit({ signedIn: false, participant: false }).aktion).toBe("anmelden"));
  it("Angemeldet, nicht dabei: Beitreten, sonst Ersatzspieler, sonst keine", () => {
    expect(mit({ participant: false, canJoin: true }).aktion).toBe("beitreten");
    expect(mit({ participant: false, canJoinAsSubstitute: true }).aktion).toBe("ersatz");
    expect(mit({ participant: false, teamFull: true }).aktion).toBeNull();
    expect(mit({ participant: false }).aktion).toBeNull();
  });
  it("Teilnehmer nicht bereit: ohne Kartenmodell Bereit; im Kartenmodell erst Karte, danach Bereit", () => {
    expect(mit({}).aktion).toBe("bereit");
    expect(mit({ cardOn: true, cardReady: false }).aktion).toBe("karte");
    expect(mit({ cardOn: true, cardReady: true }).aktion).toBe("bereit");
  });
  it("Planung (Uhrzeit, Halle) und Herausforderung: nur Captains handeln, Teilnehmer ohne Hauptaktion; das herausgeforderte Team nimmt an", () => {
    expect(mit({ planning: true }).aktion).toBeNull();
    expect(mit({ challengePending: true, challengeRole: "target", participant: false }).aktion).toBe("annehmen");
    expect(mit({ challengePending: true, challengeRole: "challenger", participant: false }).aktion).toBeNull();
  });
  it("Captain: Letzte Bestätigung erst bei komplett bereitem Team, auch ohne selbst in der Lobby zu stehen; danach keine Aktion", () => {
    expect(mit({ ready: true, finalTeam: { confirmed: false, complete: true } }).aktion).toBe("final");
    expect(mit({ participant: false, finalTeam: { confirmed: false, complete: true } }).aktion).toBe("final");
    expect(mit({ ready: true, finalTeam: { confirmed: false, complete: false } }).aktion).toBeNull();
    expect(mit({ ready: true, finalTeam: { confirmed: true, complete: true } }).aktion).toBeNull();
  });
  it("Abgesagt: keine Aktion; vorbei: Zur Spielseite; eigener Abbuchungsfehler: EIN Schritt je Fall (5b)", () => {
    expect(mit({ status: "cancelled", active: false }).aktion).toBeNull();
    expect(mit({ status: "played", active: false }).aktion).toBe("spielseite");
    expect(mit({ cardOn: true, chargeFailure: "abgelaufen" }).aktion).toBeNull(); // nichts zu tun, der Platz wird neu vergeben
    expect(mit({ cardOn: true, chargeFailure: "freigabe" }).aktion).toBe("freigeben");
    expect(mit({ cardOn: true, chargeFailure: "karte" }).aktion).toBe("karte");
  });
});

describe("lobbyStand: Zeile ohne Rechtsfolge, in jedem Zustand der Matrix", () => {
  const zustaende: [string, Partial<LobbyStandInput>][] = [
    ["Gratis (Zahlungen AUS)", { cardOn: false }],
    ["Pause (Karte AUS)", { cardOn: false, ready: true }],
    ["Altspiel (kein Kartenmodell)", { cardOn: false, finalTeam: { confirmed: false, complete: false } }],
    ["Preis 0 im Kartenmodell", { cardOn: true, cardReady: true }],
    ["Karte fehlt", { cardOn: true, cardReady: false }],
    ["Dritter (nicht dabei)", { participant: false, canJoin: true }],
    ["Gast", { signedIn: false, participant: false }],
    ["Captain komplett", { ready: true, finalTeam: { confirmed: false, complete: true } }],
    ["Captain bestätigt", { ready: true, finalTeam: { confirmed: true, complete: true } }],
    ["Fehlerzustand abgelaufen", { cardOn: true, chargeFailure: "abgelaufen" }],
    ["Fehlerzustand Freigabe", { cardOn: true, chargeFailure: "freigabe" }],
    ["Fehlerzustand Karte", { cardOn: true, chargeFailure: "karte" }],
  ];
  for (const [name, o] of zustaende) {
    it(name, () => {
      const r = mit(o);
      expect(r.zeile.length).toBeGreaterThan(10);
      expect(r.zeile).not.toMatch(/zahlungspflichtig|abgebucht|€|Euro|kostenpflichtig|Preis steht/i); // Preis- und Zusagetexte nur aus zahlungspflicht-texte.ts
    });
  }
});
