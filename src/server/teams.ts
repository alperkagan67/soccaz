import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, teamMembers, teams, users } from "@/db/schema";
import { slugify } from "@/lib/slug";
import { audit } from "./audit";

export const MAX_TEAMS_CREATED_PER_USER = 5;
export const MAX_TEAM_MEMBERS = 20; // offene Entscheidung, bis dahin großzügig
export const INVITE_TTL_DAYS = 7;

export class DomainError extends Error {}

export async function createTeam(userId: string, input: { name: string; city: string; strength: number }) {
  const slug = slugify(input.name);
  if (slug.length < 3) throw new DomainError("Der Teamname enthält zu wenige gültige Zeichen.");

  return db.transaction(async (tx) => {
    const [{ created }] = await tx
      .select({ created: count() })
      .from(teams)
      .where(eq(teams.createdBy, userId));
    if (created >= MAX_TEAMS_CREATED_PER_USER) {
      throw new DomainError(`Du kannst höchstens ${MAX_TEAMS_CREATED_PER_USER} Teams gründen.`);
    }

    const [taken] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(sql`${teams.slug} = ${slug} or lower(${teams.name}) = lower(${input.name})`);
    if (taken) throw new DomainError("Dieser Teamname ist bereits vergeben.");

    const [team] = await tx
      .insert(teams)
      .values({ name: input.name, slug, city: input.city, strength: input.strength, createdBy: userId })
      .returning();
    await tx.insert(teamMembers).values({ teamId: team.id, userId, role: "admin" });
    await audit(userId, "team.create", "team", team.id, { after: team }, tx);
    return team;
  });
}

export async function getTeamBySlug(slug: string) {
  const [team] = await db.select().from(teams).where(eq(teams.slug, slug));
  return team ?? null;
}

export async function getTeamMembers(teamId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      position: users.position,
      role: teamMembers.role,
      isVerifiedPro: users.isVerifiedPro,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(teamMembers.role, teamMembers.joinedAt);
}

export async function listMyTeams(userId: string) {
  return db
    .select({ id: teams.id, name: teams.name, slug: teams.slug, city: teams.city, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
    .orderBy(desc(teamMembers.joinedAt));
}

export async function isTeamAdmin(userId: string, teamId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return row?.role === "admin";
}

export async function createInvite(userId: string, teamId: string) {
  if (!(await isTeamAdmin(userId, teamId))) throw new DomainError("Nur Team-Admins können Einladungen erstellen.");
  const token = randomBytes(16).toString("base64url"); // 128 Bit
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(invites).values({ token, teamId, createdBy: userId, expiresAt });
  await audit(userId, "invite.create", "team", teamId, { after: { expiresAt } });
  return { token, expiresAt };
}

export async function getInvitePreview(token: string) {
  await connection();
  const [row] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      city: teams.city,
      logoUrl: teams.logoUrl,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .innerJoin(teams, eq(teams.id, invites.teamId))
    .where(eq(invites.token, token));
  if (!row) return { status: "invalid" as const };
  if (row.expiresAt.getTime() < Date.now()) return { status: "expired" as const, team: row };
  const [{ members }] = await db.select({ members: count() }).from(teamMembers).where(eq(teamMembers.teamId, row.teamId));
  return { status: "valid" as const, team: row, members };
}

export async function joinWithInvite(userId: string, token: string) {
  const preview = await getInvitePreview(token);
  if (preview.status === "invalid") throw new DomainError("Dieser Einladungslink ist ungültig.");
  if (preview.status === "expired") throw new DomainError("Dieser Einladungslink ist abgelaufen. Bitte den Team-Admin um einen neuen.");
  const { team, members } = preview;

  const [existing] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.teamId), eq(teamMembers.userId, userId)));
  if (existing) return { teamSlug: team.teamSlug, alreadyMember: true };

  if (members >= MAX_TEAM_MEMBERS) throw new DomainError("Dieses Team ist voll.");

  await db.transaction(async (tx) => {
    await tx.insert(teamMembers).values({ teamId: team.teamId, userId, role: "player" }).onConflictDoNothing();
    await audit(userId, "team.join", "team", team.teamId, { after: { via: "invite" } }, tx);
  });
  return { teamSlug: team.teamSlug, alreadyMember: false };
}

export async function activeInvites(teamId: string) {
  return db
    .select({ token: invites.token, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.teamId, teamId), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.expiresAt));
}
