"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { REVIEW_CATEGORIES } from "@/lib/venue-review";
import { ReviewInputError, submitVenueReview } from "./venue-reviews";
import { requireUser } from "./session";
import { DomainError } from "./teams";

/**
 * Spieler: eine Halle bewerten (Vertrag 010 M1, AC-1). Felder: kind (match | tournament), targetId, die fünf Kategorien (floor, changingRooms, cleanliness, showers, parking) und body (optional).
 * Die Nutzer-ID kommt aus der Sitzung; Berechtigung, Frist und alle Regeln prüft der Server (neutrale Meldung). Eingabefehler kommen als fieldErrors (die Oberfläche behält den Text).
 */
export async function submitVenueReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app");
  const kind = formData.get("kind") === "tournament" ? "tournament" : "match";
  const scores = Object.fromEntries(REVIEW_CATEGORIES.map((c) => [c, formData.get(c)]));
  try {
    await submitVenueReview(user.id, { kind, id: String(formData.get("targetId") ?? ""), scores, text: String(formData.get("body") ?? "") });
  } catch (error) {
    if (error instanceof ReviewInputError) return { fieldErrors: error.fieldErrors };
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/app");
  return { ok: true };
}
