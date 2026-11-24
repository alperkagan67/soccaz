"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { closePost, createPost, requestPlayer } from "./freeplayers";
import { requireUser } from "./session";
import { DomainError } from "./teams";
import { assertBereichOffen } from "./turnier-only";

export async function createPostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/mitspieler");
  try {
    await createPost(user.id, { city: String(formData.get("city") ?? ""), day: String(formData.get("day") ?? ""), note: String(formData.get("note") ?? "") });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/mitspieler");
  return { ok: true };
}

export async function closePostAction(id: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/mitspieler");
  try {
    await closePost(user.id, id);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/mitspieler");
}

export async function requestPlayerAction(postId: string, teamId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/mitspieler");
  try {
    await requestPlayer(user.id, postId, teamId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  return { ok: true };
}
