import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LobbyRoster, ParticipantName } from "../../src/app/lobby/[id]/LobbyRoster";
import { lobbySicht, personLabel, type LobbySicht } from "@/lib/lobby-namen";

// 013 M3 PR 5a, AC-17 (Backlog 216): was die Lobby je Rolle von Personen zeigt (Rohtext des HTML). Hallenbetreiber: namenfrei; wer zugleich Teilnehmer, Team-Admin oder Plattform-Admin ist, sieht wie jeder Teilnehmer.
const none = { participant: false, teamAdmin: false, platformAdmin: false };
const rollen = {
  gast: lobbySicht({ userId: null, hallOperator: false, ...none }),
  spieler: lobbySicht({ userId: "u1", hallOperator: false, participant: true, teamAdmin: false, platformAdmin: false }),
  captain: lobbySicht({ userId: "u2", hallOperator: false, participant: true, teamAdmin: true, platformAdmin: false }),
  angemeldet: lobbySicht({ userId: "u3", hallOperator: false, ...none }),
  hallenbetreiber: lobbySicht({ userId: "u4", hallOperator: true, ...none }),
  betreiberUndSpieler: lobbySicht({ userId: "u5", hallOperator: true, participant: true, teamAdmin: false, platformAdmin: false }),
  betreiberUndTeamAdmin: lobbySicht({ userId: "u6", hallOperator: true, participant: false, teamAdmin: true, platformAdmin: false }),
  betreiberUndPlattformAdmin: lobbySicht({ userId: "u7", hallOperator: true, participant: false, teamAdmin: false, platformAdmin: true }),
};
const members = [
  { userId: "m1", name: "Zorro Quasimodo", position: "Angriff", elo: 1236, isAdmin: true },
  { userId: "m2", name: "Berta Beispiel", position: "Tor", elo: null, isAdmin: false },
];
const roster = (s: LobbySicht) => renderToStaticMarkup(createElement(LobbyRoster, { teamSlug: "die-wilden", members, sicht: s }));
const name = (s: LobbySicht) => renderToStaticMarkup(createElement(ParticipantName, { name: "Zorro Quasimodo", sicht: s, index: 2 }));
const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("Sicht je Rolle", () => {
  it("Gast und reiner Hallenbetreiber sind getrennt; Überlappung gewinnt für Teilnehmer, Team-Admin, Plattform-Admin", () => {
    expect(rollen).toEqual({ gast: "guest", spieler: "member", captain: "member", angemeldet: "member", hallenbetreiber: "hall", betreiberUndSpieler: "member", betreiberUndTeamAdmin: "member", betreiberUndPlattformAdmin: "member" });
  });
});

describe("Teilnehmername in der Liste", () => {
  it("Mitglied sieht den Namen", () => expect(name("member")).toContain("Zorro Quasimodo"));
  it("Gast sieht nur Initialen", () => {
    const out = name("guest");
    expect(out).toContain("ZQ");
    expect(out).not.toContain("Zorro");
  });
  it("Hallenbetreiber: weder Name noch Initialen (namenfrei)", () => {
    const out = name("hall");
    expect(out).toContain("Spieler 3");
    for (const verboten of ["Zorro", "Quasimodo", "ZQ"]) expect(out, verboten).not.toContain(verboten);
  });
  it("personLabel: dieselbe Regel ohne Markup", () => {
    expect(personLabel("Max Muster", "member", 0)).toBe("Max Muster");
    expect(personLabel("Max Muster", "guest", 0)).toBe("MM");
    expect(personLabel("Max Muster", "hall", 0)).toBe("Spieler 1");
  });
});

describe("Rest-Kader (noch nicht in der Lobby)", () => {
  it("Mitglied: Namen, Links auf die Spielerseite, Position, Elo, Admin", () => {
    const out = roster("member");
    expect(out).toContain("Zorro Quasimodo");
    expect(out).toContain('href="/spieler/m1"');
    expect(out).toContain("Angriff");
    expect(out).toContain("Elo 1236");
  });
  it("Gast: Anzahl und Initialen, keine Namen, Links, Positionen, Elo", () => {
    const out = roster("guest");
    expect(out).toContain("2 · ZQ BB");
    for (const verboten of ["Zorro", "Berta", "/spieler/", "Angriff", "Elo", "Admin"]) expect(out, verboten).not.toContain(verboten);
  });
  it("Hallenbetreiber: nur die Anzahl, keine Namen, Initialen, Links, Positionen, Elo", () => {
    const out = roster("hall");
    expect(out).toContain("(noch nicht in der Lobby): 2<");
    for (const verboten of ["Zorro", "Berta", "ZQ", "BB", "/spieler/", "Angriff", "Elo", "Admin"]) expect(out, verboten).not.toContain(verboten);
  });
  it("leere Liste: nichts", () => expect(renderToStaticMarkup(createElement(LobbyRoster, { teamSlug: "x", members: [], sicht: "member" }))).toBe(""));
});

describe("Verdrahtung (Quelltext)", () => {
  it("Lobby und Teamseite speisen hallOperator aus venue_access (isVenueManager), nicht mehr fest false; die Abfrage läuft nur ohne Teilnahme und Admin-Rolle", () => {
    const lobby = src("src/app/lobby/[id]/page.tsx");
    expect(lobby).toContain("isVenueManager(user.id)");
    expect(lobby).toContain("const mayBeHall = Boolean(user) && !v.participant && v.adminOf.length === 0 && !v.platformAdmin;");
    expect(lobby).toContain("sicht={sicht}");
    expect(lobby).not.toContain("initialsOf(");
    const team = src("src/app/teams/[slug]/page.tsx");
    expect(team).toContain("isVenueManager(user.id)");
    expect(team).not.toContain("hallOperator: false");
  });
});
