"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { MAX_WINDOWS } from "@/lib/matchmaking";
import { joinQueue, leaveQueue } from "./matchmaking";
import { proposeOption, voteOption, withdrawOption } from "./scheduling";
import { requireUser } from "./session";
import { banHall } from "./veto";
import { DomainError } from "./teams";

async function guarded(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  return { ok: true };
}

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

export async function joinQueueAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/matchmaking");
  const windows: { from: Date; to: Date }[] = [];
  for (let i = 1; i <= MAX_WINDOWS; i++) {
    const day = str(f, `day${i}`);
    const from = str(f, `from${i}`);
    const to = str(f, `to${i}`);
    if (!day && !from && !to) continue;
    const a = parseBerlinLocal(`${day}T${from}`);
    const b = parseBerlinLocal(`${day}T${to}`);
    if (!a || !b) return { error: `Zeitfenster ${i}: Bitte Tag, Von und Bis angeben.` };
    windows.push({ from: a, to: b });
  }
  const result = await guarded(async () => void (await joinQueue(user.id, { teamId: str(f, "teamId"), city: str(f, "city"), durationMin: Number(str(f, "durationMin")), windows })));
  revalidatePath("/matchmaking");
  return result;
}

export async function leaveQueueAction(teamId: string): Promise<ActionState> {
  const user = await requireUser("/matchmaking");
  const result = await guarded(() => leaveQueue(user.id, teamId));
  revalidatePath("/matchmaking");
  return result;
}

export async function proposeOptionAction(matchId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  const startsAt = parseBerlinLocal(str(f, "startsAt"));
  if (!startsAt) return { error: "Bitte gib Datum und Uhrzeit an." };
  const result = await guarded(() => proposeOption(user.id, matchId, { startsAt, venueId: str(f, "venueId") || null, venueText: str(f, "venueText") }));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function voteOptionAction(matchId: string, optionId: string): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => voteOption(user.id, matchId, optionId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function withdrawOptionAction(matchId: string, optionId: string): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => withdrawOption(user.id, matchId, optionId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function banHallAction(matchId: string, venueId: string): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => banHall(user.id, matchId, venueId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}
