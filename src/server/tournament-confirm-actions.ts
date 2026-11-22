"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { confirmTournamentVenue } from "./tournament-confirm";
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
