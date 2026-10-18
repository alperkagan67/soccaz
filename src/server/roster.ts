import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { playerStats } from "@/db/schema-community";
import { initialTeamElo } from "@/lib/elo";
import { teamStats } from "@/db/schema-community";

export type RosterMember = { userId: string; name: string; position: string | null; isVerifiedPro: boolean; isAdmin: boolean; elo: number | null; matches: number };

/** Alle Mitglieder eines Teams mit Position und Spielstärke, Admins zuerst. Öffentlich sichtbar wie die Teamseite. */
export async function teamRoster(teamId: string): Promise<RosterMember[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, position: users.position, isVerifiedPro: users.isVerifiedPro, role: teamMembers.role, elo: playerStats.elo, matches: playerStats.matches, profilePublic: users.profilePublic })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .leftJoin(playerStats, eq(playerStats.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.role), asc(users.name));
  return rows.map((r) => ({ userId: r.userId, name: r.name, position: r.position, isVerifiedPro: r.isVerifiedPro, isAdmin: r.role === "admin", elo: r.matches ? r.elo : null, matches: r.matches ?? 0 }));
}

export async function teamStrength(teamId: string): Promise<{ elo: number; matches: number }> {
  const [s] = await db.select({ elo: teamStats.elo, matches: teamStats.matches }).from(teamStats).where(eq(teamStats.teamId, teamId));
  if (s) return s;
  const [t] = await db.select({ strength: teams.strength }).from(teams).where(eq(teams.id, teamId));
  return { elo: initialTeamElo(t?.strength ?? 3), matches: 0 };
}
