"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { createPrivateGame, parseRentInput, regenerateGameInvite, revokeGameInvite } from "./privategame";
import { requireUser } from "./session";
import { DomainError } from "./teams";

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

export async function createPrivateGameAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/app/privatspiel/neu");
  const startsAt = parseBerlinLocal(str(f, "startsAt"));
  if (!startsAt) return { error: "Bitte gib Datum und Uhrzeit an." };
  let id = "";
  try {
    // Miete ist Pflicht: ausdrücklich ein Betrag oder "kostenlos" (rentMode), nie ein leeres Feld
    const rent = parseRentInput(str(f, "rentMode"), str(f, "rent"));
    const { match } = await createPrivateGame(user.id, {
      city: str(f, "city"),
      venueText: str(f, "venueText"),
      startsAt,
      durationMin: Number(str(f, "durationMin")),
      maxPlayers: Number(str(f, "maxPlayers") || 10),
      rentCents: rent,
    });
    id = match.id;
  } catch (error) {
    if (error instanceof DomainError) return /Hallenmiete/.test(error.message) ? { error: error.message, fieldErrors: { rent: error.message } } : { error: error.message };
    throw error;
  }
  redirect(`/lobby/${id}`);
}

async function inviteAction(matchId: string, run: (userId: string) => Promise<unknown>): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  try {
    await run(user.id); // die Rechteprüfung (nur der Veranstalter) läuft im Server, nicht in der Oberfläche
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/lobby/${matchId}`);
  return { ok: true };
}

/** Der Veranstalter zieht den Einladungslink zurück. */
export async function revokeGameInviteAction(matchId: string): Promise<ActionState> {
  return inviteAction(matchId, (uid) => revokeGameInvite(uid, matchId));
}

/** Der Veranstalter erzeugt einen neuen Einladungslink; der alte wird ungültig. */
export async function regenerateGameInviteAction(matchId: string): Promise<ActionState> {
  return inviteAction(matchId, (uid) => regenerateGameInvite(uid, matchId));
}
