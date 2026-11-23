import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { playerStats } from "@/db/schema-community";
import { getTeamMemberElos, getTeamRosterView } from "@/server/profiles";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Vertrag 013 v3, AC-17 und AC-30 (C3a): der Gastpfad der Teamseite liest weiter KEINE Namen und KEINE Wertung; Angemeldete bekommen die Elo je Mitglied (für die Zeilen);
// die Teamwertung nutzt nur anonyme Zahlen.
afterAll(cleanup);

async function teamWith(n: number) {
  const admin = await makeUser("rvadm");
  const team = await makeTeam(admin.id, "Roster-Team");
  const others = [];
  for (let i = 1; i < n; i++) {
    const u = await makeUser("rvm");
    await db.insert(teamMembers).values({ teamId: team.id, userId: u.id, role: "player" });
    others.push(u);
  }
  return { admin, team, others };
}

describe("getTeamRosterView", () => {
  it("Gast (nicht angemeldet): nur die Anzahl, keine Namen, keine Kennungen, keine Elo", async () => {
    const t = await teamWith(4);
    await db.insert(playerStats).values({ userId: t.admin.id, elo: 1500 });
    const view = await getTeamRosterView(t.team.id, null);
    expect(view.count).toBe(4);
    expect(view.members).toEqual([]);
    const text = JSON.stringify(view);
    for (const verboten of [t.admin.id, "1500", "elo", "name", "position"]) expect(text, verboten).not.toContain(verboten.toString());
  });

  it("angemeldet: Name, Position, Rolle und Elo je Mitglied (ohne player_stats-Zeile gilt die Startwertung 1000)", async () => {
    const t = await teamWith(3);
    await db.insert(playerStats).values({ userId: t.admin.id, elo: 1350 });
    const view = await getTeamRosterView(t.team.id, t.admin.id);
    expect(view.count).toBe(3);
    const mine = view.members.find((m) => m.userId === t.admin.id)!;
    expect(mine.elo).toBe(1350);
    const other = view.members.find((m) => m.userId === t.others[0].id)!;
    expect(other.elo).toBe(1000);
    expect(other.name).toBeTruthy();
  });
});

describe("getTeamMemberElos (nur für die Teamwertung)", () => {
  it("liefert nur Zahlen, ohne Namen und Kennungen, auch ohne player_stats-Zeile (1000)", async () => {
    const t = await teamWith(3);
    await db.insert(playerStats).values({ userId: t.others[0].id, elo: 1111 });
    const elos = await getTeamMemberElos(t.team.id);
    expect(elos.sort((a, b) => a - b)).toEqual([1000, 1000, 1111]);
    expect(elos.every((e) => typeof e === "number")).toBe(true);
    const text = JSON.stringify(elos);
    expect(text).not.toContain(t.admin.id);
  });
});
