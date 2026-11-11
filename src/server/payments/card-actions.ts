"use server";

import { requireUser } from "../session";
import { DomainError } from "../teams";
import { createCardSetup } from "./card-setup";
import { StoredCardInvalidError, applyStoredCard } from "./stored-card";

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

export type StoredCardState = { ok: true } | { ok: false; error: string; needsNewCard: boolean };

/**
 * Gespeicherte Karte für den eigenen Platz in dieser Lobby verwenden (Mandat je Platz, kein neues SetupIntent). Liefert needsNewCard, wenn die
 * gespeicherte Karte nicht mehr nutzbar ist: dann bleibt der Weg über createCardSetupAction.
 */
export async function applyStoredCardForLobby(matchId: string): Promise<StoredCardState> {
  const user = await requireUser("/app");
  try {
    await applyStoredCard(user.id, typeof matchId === "string" ? matchId : "");
    return { ok: true };
  } catch (error) {
    if (error instanceof StoredCardInvalidError) return { ok: false, error: error.message, needsNewCard: true };
    if (error instanceof DomainError) return { ok: false, error: error.message, needsNewCard: false };
    throw error;
  }
}
