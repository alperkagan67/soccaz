"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/validation";
import { deleteComment, moderateComment, postComment, reportComment, type ModerationDecision } from "./content";
import { requirePermission, requireUser } from "./session";
import { DomainError } from "./teams";

const postSchema = z.object({
  targetType: z.enum(["team", "player", "venue"]),
  targetId: z.string().uuid(),
  body: z.string().max(2000),
  rating: z.coerce.number().int().optional(),
  path: z.string().startsWith("/"),
});

function safePath(path: string): string {
  return path.startsWith("//") ? "/" : path;
}

export async function postCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = postSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bitte prüfe deine Eingabe." };
  const user = await requireUser(safePath(parsed.data.path));
  try {
    await postComment(user.id, { targetType: parsed.data.targetType, targetId: parsed.data.targetId, body: parsed.data.body, rating: parsed.data.rating ?? null });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(safePath(parsed.data.path));
  return { ok: true };
}

export async function deleteCommentAction(commentId: string, path: string): Promise<ActionState> {
  const user = await requireUser(safePath(path));
  try {
    await deleteComment(user.id, commentId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(safePath(path));
}

export async function reportCommentAction(commentId: string, path: string, reason: string): Promise<ActionState> {
  const user = await requireUser(safePath(path));
  try {
    await reportComment(user.id, commentId, reason);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(safePath(path));
  return { ok: true };
}

export async function moderateCommentAction(commentId: string, decision: ModerationDecision, note?: string): Promise<ActionState> {
  const user = await requirePermission("moderation", "/admin/moderation");
  try {
    await moderateComment(user.id, commentId, decision, note);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/moderation");
}
