"use server";

import { requireUser } from "../session";
import { DomainError } from "../teams";
import { createCardSetup } from "./card-setup";

export type CardSetupState = { ok: true; clientSecret: string } | { ok: false; error: string };

/** Startet das Hinterlegen einer Karte für den eingeloggten Nutzer selbst (eine fremde Nutzer-ID gibt es hier nicht). */
export async function createCardSetupAction(input: { matchId?: string; mandateAccepted: boolean }): Promise<CardSetupState> {
  const user = await requireUser("/app");
  try {
    const r = await createCardSetup(user.id, { matchId: typeof input?.matchId === "string" ? input.matchId : undefined, mandateAccepted: input?.mandateAccepted === true });
    return { ok: true, clientSecret: r.clientSecret };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}
