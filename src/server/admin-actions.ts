"use server";

import { revalidatePath } from "next/cache";
import { ASSIGNABLE_ROLES, type Role } from "@/lib/roles";
import type { ActionState } from "@/lib/validation";
import * as admin from "./admin";
import { requirePermission } from "./session";
import { DomainError } from "./teams";

async function adminAction(path: string, fn: (actorId: string) => Promise<void>, permission: "admin" | "owner" = "admin"): Promise<ActionState> {
  const user = await requirePermission(permission);
  try {
    await fn(user.id);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(path);
  return { error: undefined };
}

export async function setBannedAction(userId: string, banned: boolean, reason: string) {
  return adminAction("/admin/nutzer", (id) => admin.setBanned(id, userId, banned, reason));
}

export async function setRoleAction(userId: string, role: string) {
  if (!ASSIGNABLE_ROLES.includes(role as Role)) return { error: "Unbekannte Rolle." } satisfies ActionState;
  return adminAction("/admin/nutzer", (id) => admin.setRole(id, userId, role as Role), "owner"); // nur Admin 1 vergibt Rollen
}

export async function setProBadgeAction(userId: string, value: boolean) {
  return adminAction("/admin/nutzer", (id) => admin.setProBadge(id, userId, value));
}

export async function setTeamVerifiedAction(teamId: string, value: boolean) {
  return adminAction("/admin/teams", (id) => admin.setTeamVerified(id, teamId, value));
}

export async function mergeTeamsAction(sourceId: string, targetId: string) {
  return adminAction("/admin/teams", (id) => admin.mergeTeams(id, sourceId, targetId));
}
