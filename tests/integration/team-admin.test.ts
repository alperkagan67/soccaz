import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invites, matchRequests, teamMembers, teams } from "@/db/schema";
import { dissolveTeam, leaveTeam, removeMember, revokeInvites, setMemberRole, updateTeam } from "@/server/team-admin";
import { createInvite, joinWithInvite, listMyTeams } from "@/server/teams";
import { createRequest } from "@/server/requests";
import { addPlayer, cleanup, makeMatch, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

async function teamWith(n: number) {
  const admin = await makeUser("ta");
  const team = await makeTeam(admin.id, "Verwaltung");
  const members = [];
  for (let i = 0; i < n; i++) {
    const u = await makeUser(`tm${i}`);
    await db.insert(teamMembers).values({ teamId: team.id, userId: u.id, role: "player" });
    members.push(u);
  }
  return { admin, team, members };
}

const roleOf = async (teamId: string, userId: string) => (await db.select().from(teamMembers).where(eq(teamMembers.userId, userId))).find((m) => m.teamId === teamId)?.role;

describe("Team bearbeiten", () => {
  it("nur Admins, Name eindeutig, Adresse bleibt gleich", async () => {
    const { admin, team, members } = await teamWith(1);
    const other = await makeTeam((await makeUser("x")).id, "Anderes Team");
    await expect(updateTeam(members[0].id, team.id, { name: "Neuer Name", city: "Essen", strength: 4 })).rejects.toThrow(/Team-Admins/);
    await expect(updateTeam(admin.id, team.id, { name: "ab", city: "Essen", strength: 4 })).rejects.toThrow(/3 bis 40/);
    await expect(updateTeam(admin.id, team.id, { name: "Neuer Name", city: "Mars", strength: 4 })).rejects.toThrow(/Stadt/);
    await expect(updateTeam(admin.id, team.id, { name: "Neuer Name", city: "Essen", strength: 9 })).rejects.toThrow(/1 bis 5/);
    await expect(updateTeam(admin.id, team.id, { name: other.name.toUpperCase(), city: "Essen", strength: 4 })).rejects.toThrow(/vergeben/);
    await updateTeam(admin.id, team.id, { name: "Neuer Name", city: "Dortmund", strength: 4 });
    expect((await db.select().from(teams).where(eq(teams.id, team.id)))[0]).toMatchObject({ name: "Neuer Name", city: "Dortmund", strength: 4, slug: team.slug });
  });
});

describe("Rollen und Mitglieder", () => {
  it("Admin ernennen, letzten Admin nicht abwählen, Mitglied entfernen", async () => {
    const { admin, team, members } = await teamWith(2);
    await expect(setMemberRole(members[0].id, team.id, members[1].id, "admin")).rejects.toThrow(/Team-Admins/);
    await expect(setMemberRole(admin.id, team.id, admin.id, "player")).rejects.toThrow(/mindestens einen Admin/);
    await setMemberRole(admin.id, team.id, members[0].id, "admin");
    expect(await roleOf(team.id, members[0].id)).toBe("admin");
    await setMemberRole(admin.id, team.id, admin.id, "player"); // jetzt möglich
    expect(await roleOf(team.id, admin.id)).toBe("player");

    await expect(removeMember(members[0].id, team.id, members[0].id)).rejects.toThrow(/verlassen/);
    await expect(removeMember(members[0].id, team.id, admin.id)).resolves.toBeUndefined();
    expect(await roleOf(team.id, admin.id)).toBeUndefined();
    await expect(removeMember(members[0].id, team.id, members[0].id)).rejects.toThrow(/verlassen/);
    // Admins werden nicht entfernt
    await setMemberRole(members[0].id, team.id, members[1].id, "admin");
    await expect(removeMember(members[0].id, team.id, members[1].id)).rejects.toThrow(/Admin-Rolle weg/);
  });

  it("wer in einer kommenden Lobby steht, kann nicht entfernt werden", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    const p = await addPlayer(m.match.id, m.home.id, "lobbyp");
    await db.insert(teamMembers).values({ teamId: m.home.id, userId: p.id, role: "player" }).onConflictDoNothing();
    await expect(removeMember(m.adminA.id, m.home.id, p.id)).rejects.toThrow(/kommenden Lobby/);
    await expect(leaveTeam(p.id, m.home.id)).rejects.toThrow(/kommenden Lobby/);
  });
});

describe("Team verlassen und auflösen", () => {
  it("Mitglied verlässt das Team, Teams verschwinden aus seiner Liste", async () => {
    const { admin, team, members } = await teamWith(1);
    await leaveTeam(members[0].id, team.id);
    expect(await listMyTeams(members[0].id)).toHaveLength(0);
    expect((await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id))).map((m) => m.userId)).toEqual([admin.id]);
    await expect(leaveTeam(members[0].id, team.id)).rejects.toThrow(/nicht in diesem Team/);
  });

  it("einziger Admin eines Teams mit Mitgliedern muss erst übergeben", async () => {
    const { admin, team, members } = await teamWith(1);
    await expect(leaveTeam(admin.id, team.id)).rejects.toThrow(/einzige Admin/);
    await setMemberRole(admin.id, team.id, members[0].id, "admin");
    await leaveTeam(admin.id, team.id);
    expect(await roleOf(team.id, members[0].id)).toBe("admin");
  });

  it("letztes Mitglied löst das Team auf, offene Suchen enden", async () => {
    const { admin, team } = await teamWith(0);
    const when = new Date(Date.now() + 5 * 86_400_000);
    await createRequest(admin.id, { teamId: team.id, city: "Essen", startsAt: when, durationMin: 60, strength: 3, visibility: "public" });
    await leaveTeam(admin.id, team.id);
    expect((await db.select().from(teams).where(eq(teams.id, team.id)))[0].archivedAt).not.toBeNull();
    expect((await db.select().from(matchRequests).where(eq(matchRequests.teamId, team.id)))[0].status).toBe("cancelled");
    expect(await listMyTeams(admin.id)).toHaveLength(0);
  });

  it("Auflösen nur durch Admins und nur ohne kommende Spiele; Einladungen verfallen", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    await expect(dissolveTeam(m.adminA.id, m.home.id)).rejects.toThrow(/kommende Spiele/);
    const { admin, team, members } = await teamWith(1);
    await expect(dissolveTeam(members[0].id, team.id)).rejects.toThrow(/Team-Admins/);
    const inv = await createInvite(admin.id, team.id);
    await dissolveTeam(admin.id, team.id);
    expect((await db.select().from(teams).where(eq(teams.id, team.id)))[0].archivedAt).not.toBeNull();
    expect(await db.select().from(invites).where(eq(invites.token, inv.token))).toHaveLength(0);
    await expect(dissolveTeam(admin.id, team.id)).rejects.toThrow(/nicht gefunden/);
    expect(await listMyTeams(members[0].id)).toHaveLength(0);
  });
});

describe("Einladungen", () => {
  it("alle Links widerrufen, danach funktioniert kein Link mehr", async () => {
    const { admin, team, members } = await teamWith(1);
    const inv = await createInvite(admin.id, team.id);
    await expect(revokeInvites(members[0].id, team.id)).rejects.toThrow(/Team-Admins/);
    await revokeInvites(admin.id, team.id);
    const newcomer = await makeUser("newcomer");
    await expect(joinWithInvite(newcomer.id, inv.token)).rejects.toThrow();
  });
});
