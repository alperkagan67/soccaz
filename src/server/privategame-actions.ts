"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { createPrivateGame, parseRentInput } from "./privategame";
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
