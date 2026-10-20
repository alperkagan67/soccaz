"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { addClip, deleteClip } from "./clips";
import { requireUser } from "./session";
import { DomainError } from "./teams";

async function guarded(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  return { ok: true };
}

export async function addClipAction(matchId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}/uebersicht`);
  const result = await guarded(() => addClip(user.id, matchId, { url: String(f.get("url") ?? ""), title: String(f.get("title") ?? "") }));
  revalidatePath(`/lobby/${matchId}/uebersicht`);
  return result;
}

export async function deleteClipAction(matchId: string, clipId: string): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}/uebersicht`);
  const result = await guarded(() => deleteClip(user.id, clipId, user.role === "admin"));
  revalidatePath(`/lobby/${matchId}/uebersicht`);
  return result;
}
