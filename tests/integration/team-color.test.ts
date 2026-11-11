import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, teamMembers, teams } from "@/db/schema";
import { COLOR_KEYS, defaultColorKey } from "@/lib/team-color";
import { getTeamProfile } from "@/server/profiles";
import { setTeamColor } from "@/server/team-admin";
import { listMyTeams } from "@/server/teams";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

const colorOf = async (teamId: string) => (await db.select({ color: teams.color }).from(teams).where(eq(teams.id, teamId)))[0].color;

async function teamWithMember() {
  const admin = await makeUser("cadmin");
  const team = await makeTeam(admin.id, "Farbe");
  const member = await makeUser("cmember");
  await db.insert(teamMembers).values({ teamId: team.id, userId: member.id, role: "player" });
  return { admin, team, member };
}

describe("AC-13: Migration und Constraint", () => {
  it("teams.color ist nullable, neue Teams haben null", async () => {
    const { team } = await teamWithMember();
    expect(await colorOf(team.id)).toBeNull();
    const [col] = (await db.execute(sql`select is_nullable from information_schema.columns where table_name = 'teams' and column_name = 'color'`)).rows as { is_nullable: string }[];
    expect(col.is_nullable).toBe("YES");
  });

  it("der Check-Constraint lehnt jeden Wert außerhalb der 12 Schlüssel ab und lässt alle 12 und null zu", async () => {
    const { team } = await teamWithMember();
    for (const bad of ["orange", "#c8102e", "RED", "red ", "", "<script>alert(1)</script>"]) {
      await expect(db.update(teams).set({ color: bad }).where(eq(teams.id, team.id)), bad).rejects.toThrow();
    }
    for (const k of COLOR_KEYS) {
      await db.update(teams).set({ color: k }).where(eq(teams.id, team.id));
      expect(await colorOf(team.id)).toBe(k);
    }
    await db.update(teams).set({ color: null }).where(eq(teams.id, team.id));
    expect(await colorOf(team.id)).toBeNull();
  });

  it("der Constraint existiert unter dem Namen teams_color_check", async () => {
    const rows = (await db.execute(sql`select conname from pg_constraint where conname = 'teams_color_check'`)).rows;
    expect(rows).toHaveLength(1);
  });
});

describe("AC-11: Teamfarbe ändern (Server-Aktion)", () => {
  it("Team-Admin kann jede der 12 Farben wählen; gespeichert und im Audit-Log", async () => {
    const { admin, team } = await teamWithMember();
    for (const k of COLOR_KEYS) {
      await setTeamColor(admin.id, team.id, k);
      expect(await colorOf(team.id)).toBe(k);
    }
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, team.id));
    expect(audits.filter((a) => a.action === "team.color")).toHaveLength(COLOR_KEYS.length);
  });

  it("Mitglied ohne Admin-Rolle, fremder Nutzer und unbekannte Nutzer-ID werden abgelehnt, nichts ändert sich", async () => {
    const { team, member } = await teamWithMember();
    const stranger = await makeUser("cfremd");
    await expect(setTeamColor(member.id, team.id, "red")).rejects.toThrow(/Team-Admins/);
    await expect(setTeamColor(stranger.id, team.id, "red")).rejects.toThrow(/Team-Admins/);
    await expect(setTeamColor("00000000-0000-0000-0000-000000000000", team.id, "red")).rejects.toThrow();
    expect(await colorOf(team.id)).toBeNull();
  });

  it("ungültige Schlüssel (nicht in der Palette, Hex, Skript-Text, Orange, leer, falscher Typ) werden abgelehnt, die bisherige Farbe bleibt", async () => {
    const { admin, team } = await teamWithMember();
    await setTeamColor(admin.id, team.id, "green");
    for (const bad of ["orange", "#c8102e", "<script>alert(1)</script>", "", "RED", " red", "__proto__", "red; drop table teams", null, undefined, 3, {}]) {
      await expect(setTeamColor(admin.id, team.id, bad as unknown as string), String(bad)).rejects.toThrow(/Farbe/);
      expect(await colorOf(team.id)).toBe("green");
    }
  });

  it("Rechte werden vor der Wertprüfung nicht umgangen: ein Nicht-Admin mit ungültigem Wert wird ebenfalls abgelehnt, nichts gespeichert", async () => {
    const { team, member } = await teamWithMember();
    await expect(setTeamColor(member.id, team.id, "#ff0000")).rejects.toThrow();
    expect(await colorOf(team.id)).toBeNull();
  });

  it("Admin eines anderen Teams darf diese Farbe nicht ändern", async () => {
    const a = await teamWithMember();
    const b = await teamWithMember();
    await expect(setTeamColor(a.admin.id, b.team.id, "blue")).rejects.toThrow(/Team-Admins/);
    expect(await colorOf(b.team.id)).toBeNull();
  });

  it("Privatspiel-Team (kind = private): Farbe ist über diese Aktion nicht änderbar, auch nicht für den Ersteller und Admin", async () => {
    const admin = await makeUser("cpriv");
    const team = await makeTeam(admin.id, "Privat");
    await db.update(teams).set({ kind: "private" }).where(eq(teams.id, team.id));
    await expect(setTeamColor(admin.id, team.id, "red")).rejects.toThrow(/nicht gefunden/);
    expect(await colorOf(team.id)).toBeNull();
  });

  it("archiviertes Team: nicht änderbar", async () => {
    const { admin, team } = await teamWithMember();
    await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, team.id));
    await expect(setTeamColor(admin.id, team.id, "red")).rejects.toThrow(/nicht gefunden/);
  });

  it("Privatspiel-Team ist weder über die Teamseite noch über Listen auffindbar und liefert keine Farbe", async () => {
    const admin = await makeUser("cpriv2");
    const team = await makeTeam(admin.id, "Privat2");
    await db.update(teams).set({ kind: "private", color: "red" }).where(eq(teams.id, team.id));
    expect(await getTeamProfile(team.slug)).toBeNull();
    expect((await listMyTeams(admin.id)).some((t) => t.id === team.id)).toBe(false);
  });

  it("Teamseite und Teamliste liefern die gewählte Farbe bzw. die Standardfarbe aus dem Slug; keine personenbezogenen Daten im Farbwert", async () => {
    const { admin, team } = await teamWithMember();
    const mine = (await listMyTeams(admin.id)).find((t) => t.id === team.id)!;
    expect(mine.color).toBeNull();
    const profile = await getTeamProfile(team.slug);
    expect(profile?.team.color).toBeNull();
    expect(defaultColorKey(team.slug)).toBeTruthy();
    await setTeamColor(admin.id, team.id, "pink");
    expect((await listMyTeams(admin.id)).find((t) => t.id === team.id)!.color).toBe("pink");
    expect((await getTeamProfile(team.slug))?.team.color).toBe("pink");
    const audit = (await db.select().from(auditLog).where(eq(auditLog.entityId, team.id))).find((a) => a.action === "team.color")!;
    expect(JSON.stringify(audit)).not.toContain(admin.email);
  });
});
