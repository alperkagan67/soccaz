"use server";

import { revalidatePath } from "next/cache";
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
 * Hallenbetreiber: das Turnier im Namen der Halle ABLEHNEN (Backlog 161, erster Schnitt: nur Server; die Oberflaeche folgt in PR 2). Kategorie Pflicht, Anmerkung optional (bei "sonstiges" Pflicht).
 * Die Nutzer-ID kommt aus der Sitzung, die Berechtigung prueft der Server in der Transaktion; Fehler sind Meldungen.
 */
export async function declineTournamentVenueAction(tournamentId: string, input: { code?: string | null; text?: string | null }): Promise<ActionState> {
  const user = await requireUser("/halle");
  try {
    await declineTournamentVenue(user.id, typeof tournamentId === "string" ? tournamentId : "", { code: input?.code ?? null, text: input?.text ?? null });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/halle");
  revalidatePath(`/turniere/${tournamentId}`);
  return { ok: true };
}
