"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import type { ActionState } from "@/lib/validation";
import { requireUser } from "./session";
import { dissolveTeam, leaveTeam, removeMember, revokeInvites, setMemberRole, updateTeam } from "./team-admin";
import { DomainError } from "./teams";

async function slugOf(teamId: string): Promise<string | null> {
  const [t] = await db.select({ slug: teams.slug }).from(teams).where(eq(teams.id, teamId));
  return t?.slug ?? null;
}

async function guarded(teamId: string, fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  const slug = await slugOf(teamId);
  if (slug) revalidatePath(`/teams/${slug}`);
  revalidatePath("/app");
  return { ok: true };
}

export async function updateTeamAction(teamId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/app");
  return guarded(teamId, () => updateTeam(user.id, teamId, { name: String(f.get("name") ?? ""), city: String(f.get("city") ?? ""), strength: Number(f.get("strength")), bio: String(f.get("bio") ?? "") }));
}

export async function setMemberRoleAction(teamId: string, targetId: string, role: "admin" | "player"): Promise<ActionState> {
  const user = await requireUser("/app");
  return guarded(teamId, () => setMemberRole(user.id, teamId, targetId, role));
}

export async function removeMemberAction(teamId: string, targetId: string): Promise<ActionState> {
  const user = await requireUser("/app");
  return guarded(teamId, () => removeMember(user.id, teamId, targetId));
}

export async function revokeInvitesAction(teamId: string): Promise<ActionState> {
  const user = await requireUser("/app");
  return guarded(teamId, () => revokeInvites(user.id, teamId));
}

export async function leaveTeamAction(teamId: string): Promise<ActionState> {
  const user = await requireUser("/app");
  return guarded(teamId, () => leaveTeam(user.id, teamId));
}

export async function dissolveTeamAction(teamId: string): Promise<ActionState> {
  const user = await requireUser("/app");
  return guarded(teamId, () => dissolveTeam(user.id, teamId));
}
