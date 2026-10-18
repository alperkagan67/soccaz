"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/auth";
import type { ActionState } from "@/lib/validation";
import { deleteAccount, updateProfile } from "./account";
import { requireUser } from "./session";
import { DomainError } from "./teams";

const profileSchema = z.object({
  name: z.string(),
  city: z.string(),
  position: z.string(),
  profilePublic: z.string().optional(),
});

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/einstellungen");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bitte prüfe deine Eingabe." };
  try {
    await updateProfile(user.id, { ...parsed.data, profilePublic: parsed.data.profilePublic === "on" });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/app/einstellungen");
  revalidatePath(`/spieler/${user.id}`);
  return { ok: true };
}

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/einstellungen");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "LÖSCHEN") return { error: "Bitte tippe LÖSCHEN zur Bestätigung." };
  try {
    await deleteAccount(user.id);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  await signOut({ redirectTo: "/?konto=geloescht" });
  redirect("/");
}
