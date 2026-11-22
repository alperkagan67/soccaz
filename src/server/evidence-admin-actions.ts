"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { switchEvidence } from "./evidence-admin";
import { requirePermission } from "./session";
import { DomainError } from "./teams";

/** Admin 1: „Uhrenquelle auf Datenbank“ oder „Beweispflicht einschalten“ (011 M2a). Der Akteur ist immer das angemeldete Konto, es gibt kein Feld dafür. */
export async function switchEvidenceAction(step: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("owner", "/admin/beweis");
  try {
    await switchEvidence(user.id, step, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof DomainError) return { fieldErrors: { reason: error.message } };
    throw error;
  }
  revalidatePath("/admin/beweis");
  return { ok: true };
}
