"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { requireUser } from "./session";
import { setStreamUrl } from "./streams";
import { DomainError } from "./teams";
import { assertSpielOffen } from "./turnier-only";

export async function setStreamAction(matchId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSpielOffen(matchId); // TURNIER_ONLY: gesperrter Bereich (Lobby-Spiel)
  const user = await requireUser(`/spiele/${matchId}`);
  try {
    await setStreamUrl(user.id, matchId, String(formData.get("url") ?? ""));
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/spiele/${matchId}`);
  return { ok: true };
}
