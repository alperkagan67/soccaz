"use server";

import { revalidatePath } from "next/cache";
import { planDecline } from "@/lib/hall-decline";
import type { ActionState } from "@/lib/validation";
import { confirmTournamentVenue, declineTournamentVenue } from "./tournament-confirm";
import { requireUser } from "./session";
import { DomainError } from "./teams";

/**
 * Hallenbetreiber: das Turnier im Namen der Halle zusagen (M5-7b). Die Nutzer-ID kommt aus der Sitzung, die Berechtigung (aktiver Zugang zur Halle des Turniers) prueft der Server in
 * der Transaktion. Fehler sind Meldungen (DomainError), nie Details.
 */
export async function confirmTournamentVenueAction(tournamentId: string): Promise<ActionState> {
  const user = await requireUser("/halle");
  try {
    await confirmTournamentVenue(user.id, typeof tournamentId === "string" ? tournamentId : "");
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/halle");
  revalidatePath(`/turniere/${tournamentId}`);
  return { ok: true };
}

/**
 * Hallenbetreiber: das Turnier im Namen der Halle ABLEHNEN (Backlog 161). Formular `HallDeclineForm`: Kategorie (reasonCode, Pflicht) und Anmerkung (reason, optional, bei "sonstiges" Pflicht); Fehler am Feld
 * (erste Stufe, planDecline), die Berechtigung und alle Regeln prueft der Server in der Transaktion (neutrale Meldung). Die Nutzer-ID kommt aus der Sitzung.
 */
export async function declineTournamentVenueFormAction(tournamentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/halle");
  const plan = planDecline({ code: String(formData.get("reasonCode") ?? ""), text: String(formData.get("reason") ?? "") });
  if (plan.kind === "invalid") return { fieldErrors: plan.fieldErrors };
  if (plan.kind === "not-wired") return { error: plan.error };
  try {
    await declineTournamentVenue(user.id, typeof tournamentId === "string" ? tournamentId : "", { code: plan.code, text: plan.text });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/halle");
  revalidatePath(`/turniere/${tournamentId}`);
  return { ok: true };
}
