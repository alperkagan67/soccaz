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

// Teamseite (security-reviewer zu PR 5a): auch Torjäger und Kader-Zeilen sind für den reinen Hallenbetreiber namenfrei, geprüft am gerenderten HTML.
import { PlayerRow } from "../../src/components/PlayerRow";
import { RATING, cardViewerFor, playerCardFor } from "@/lib/player-card";
import { TopScorers } from "../../src/app/teams/[slug]/TopScorers";

describe("Teamseite je Rolle: Torjäger und Kader-Zeilen", () => {
  const scorers = [{ id: "s1", name: "Torben Treffer", goals: 7 }, { id: "s2", name: "Gerda Gut", goals: 4 }];
  const viewerOf = (hallOperator: boolean, userId: string | null = "u9") => cardViewerFor({ userId, hallOperator, ...none });
  const scorerHtml = (v: ReturnType<typeof viewerOf>) => renderToStaticMarkup(createElement(TopScorers, { scorers, viewer: v }));
  it("Mitglied (angemeldet): Namen, Tore und Profil-Links", () => {
    const out = scorerHtml(viewerOf(false));
    for (const erwartet of ["Torben Treffer", "Gerda Gut", "7 Tore", 'href="/spieler/s1"']) expect(out, erwartet).toContain(erwartet);
  });
  it("reiner Hallenbetreiber: kein Torjäger-Block, weder Name noch Spieler-ID noch Link", () => {
    const out = scorerHtml(viewerOf(true));
    expect(out).toBe("");
    for (const verboten of ["Torben", "Gerda", "s1", "/spieler/"]) expect(out, verboten).not.toContain(verboten);
  });
  it("Gast: kein Block", () => expect(scorerHtml(viewerOf(false, null))).toBe(""));
  it("Kader-Zeile für den Hallenbetreiber: weder Name noch Initialen noch Link auf die Spielerseite", () => {
    const data = playerCardFor(viewerOf(true), { name: "Zorro Quasimodo", elo: 1236, position: "Angriff", teamColor: "blue", teamSlug: "x" }, RATING);
    const out = renderToStaticMarkup(createElement(PlayerRow, { data, href: "/spieler/m1" }));
    for (const verboten of ["Zorro", "Quasimodo", "ZQ", "/spieler/"]) expect(out, verboten).not.toContain(verboten);
  });
  it("die Seite rendert Torjäger nur über TopScorers (kein eigenes Mapping mit Namen)", () => {
    const team = src("src/app/teams/[slug]/page.tsx");
    expect(team).toContain("<TopScorers scorers={profile.topScorers} viewer={viewer} />");
    expect(team).not.toContain("topScorers.map");
  });
});

describe("Captain-Leiste: nur Team-Admin, Veranstalter und Plattform-Admin (5b)", () => {
  it("die Seite rendert die Leiste nur für diese Rollen; Fehlerzeilen kommen nur aus cardDisplays (Server-Sicht je Betrachter), nie aus Rohdaten", () => {
    const lobby = src("src/app/lobby/[id]/page.tsx");
    expect(lobby).toContain("<LobbyCaptainBarFor");
    expect(lobby).toContain("role={{ active, canManage: v.canManage, adminTeams: v.adminOf.length, platformAdmin: v.platformAdmin }}");
    expect(lobby).toContain("const failedForManager = Object.entries(cardDisplays).filter(([id, d]) => d.status === \"failed\" && id !== user?.id)");
    expect(lobby).toContain("cardDisplays = cardOn ? await getCardDisplays(match.id, (p) => audienceFor(cardViewer, p)) : {}");
    expect(lobby).not.toContain("data-testid=\"charge-failed-captain\""); // das Test-ID-Markup liegt in der Komponente, die Seite hat keinen zweiten Fehlerblock
  });
  it("kein Fehlerblock für Gäste und Hallenbetreiber: die Leiste und der eigene Fehlerblock hängen an Rollen, nicht an der Anmeldung allein", () => {
    const lobby = src("src/app/lobby/[id]/page.tsx");
    expect(lobby).toContain("const myDisplay = user ? cardDisplays[user.id] : undefined;");
  });
});

// Captain-Leiste je Rolle am echten HTML (security-reviewer zu PR 5b): ohne Berechtigung KEIN Markup, keine Namen, keine Fehlerzeile.
import { LobbyCaptainBarFor } from "../../src/app/lobby/[id]/LobbyCaptainBar";

describe("LobbyCaptainBarFor je Rolle (gerendertes HTML)", () => {
  const failures = [{ userId: "u1", name: "Anna Beispiel", text: "Die Karte wurde gesperrt.", until: "bis 21:10 Uhr", authorizing: false, step: null }];
  const teams = [{ id: "t1", name: "Heim FC", count: 5, ready: 3, cardsReady: true }];
  const html = (role: { active: boolean; canManage: boolean; adminTeams: number; platformAdmin: boolean }) => renderToStaticMarkup(createElement(LobbyCaptainBarFor, { role, teams, failures }));
  const roles = {
    gast: { active: true, canManage: false, adminTeams: 0, platformAdmin: false },
    spielerOhneRolle: { active: true, canManage: false, adminTeams: 0, platformAdmin: false },
    captain: { active: true, canManage: false, adminTeams: 1, platformAdmin: false },
    veranstalter: { active: true, canManage: true, adminTeams: 0, platformAdmin: false },
    plattformAdmin: { active: true, canManage: false, adminTeams: 0, platformAdmin: true },
  };
  it("Gast und Spieler ohne Captain-Rolle (auch Hallenbetreiber): kein captain-bar, weder Name noch Fehlerzeile noch Teamstand", () => {
    for (const r of [roles.gast, roles.spielerOhneRolle]) {
      const out = html(r);
      expect(out).toBe("");
      for (const verboten of ["captain-bar", "Anna", "Beispiel", "charge-failed", "Heim FC"]) expect(out, verboten).not.toContain(verboten);
    }
  });
  it("Captain, Veranstalter und Plattform-Admin: genau eine Leiste mit der Fehlerzeile", () => {
    for (const r of [roles.captain, roles.veranstalter, roles.plattformAdmin]) {
      const out = html(r);
      expect(out.match(/data-testid="captain-bar"/g)).toHaveLength(1);
      expect(out).toContain("Anna Beispiel");
      expect(out).toContain('data-testid="charge-failed-captain"');
    }
  });
  it("beendetes oder abgesagtes Spiel (active false): auch für Captains keine Leiste", () => {
    expect(html({ ...roles.captain, active: false })).toBe("");
  });
});
