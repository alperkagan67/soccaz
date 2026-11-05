"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { parseEuro } from "@/lib/money";
import { parseBerlinLocal } from "@/lib/time";
import { createPrivateGame } from "./privategame";
import { requireUser } from "./session";
import { DomainError } from "./teams";

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

export async function createPrivateGameAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/app/privatspiel/neu");
  const startsAt = parseBerlinLocal(str(f, "startsAt"));
  if (!startsAt) return { error: "Bitte gib Datum und Uhrzeit an." };
  const rent = str(f, "rent") === "" ? null : parseEuro(str(f, "rent"));
  if (rent === undefined || (str(f, "rent") !== "" && rent === null)) return { error: "Bitte gib die Hallenmiete als Betrag an, z. B. 120 oder 95,50.", fieldErrors: { rent: "Ungültiger Betrag." } };
  let id = "";
  try {
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
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect(`/lobby/${id}`);
}
