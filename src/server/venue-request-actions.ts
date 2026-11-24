"use server";

import { revalidatePath } from "next/cache";
import { parseOnboarding, werteAusFormData } from "@/lib/venue-onboarding";
import type { ActionState } from "@/lib/validation";
import { requireUser } from "./session";
import { DomainError } from "./teams";
import { requestVenue, resubmitVenue } from "./venue-approval";
import { assertBereichOffen } from "./turnier-only";

// Hallen-Anfrage ("Anfrage senden", 013 v3 AC-25/AC-31). Die Aktion prueft NICHTS selbst: Sitzung (requireUser), dann ausschliesslich die gemeinsame Quelle der Oberflaeche
// (src/lib/venue-onboarding.ts: werteAusFormData + parseOnboarding), dann requestVenue (Rate-Limit 5 pro Stunde, Obergrenze offener Anfragen, Admin-/Sperr-Ausschluss, alles in einer Transaktion).
const INVALID = "Bitte prüfe die markierten Felder.";

export async function requestVenueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/halle/anfragen");
  const parsed = parseOnboarding(werteAusFormData(formData));
  if (!parsed.ok) return { error: INVALID, fieldErrors: { ...parsed.errors } };
  try {
    await requestVenue(user.id, parsed.input);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/halle");
  return { ok: true };
}

/** Erneute Anfrage nach einer Ablehnung (nach einer Aenderung der Angaben): nur der Betreiber, nur aus "abgelehnt". */
export async function resubmitVenueAction(venueId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/halle/anfragen");
  const parsed = parseOnboarding(werteAusFormData(formData));
  if (!parsed.ok) return { error: INVALID, fieldErrors: { ...parsed.errors } };
  try {
    await resubmitVenue(user.id, venueId, parsed.input);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/halle");
  return { ok: true };
}
