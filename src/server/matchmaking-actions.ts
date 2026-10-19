"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { MAX_WINDOWS } from "@/lib/matchmaking";
import { redirect } from "next/navigation";
import { acceptSearch, joinQueue, leaveQueue } from "./matchmaking";
import { proposeOption, voteOption, withdrawOption } from "./scheduling";
import { requireUser } from "./session";
import { banHall } from "./veto";
import { acceptChallenge, challengeTeam, declineChallenge } from "./challenges";
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
  const result = await guarded(async () => void (await joinQueue(user.id, { teamId: str(f, "teamId"), city: str(f, "city"), durationMin: Number(str(f, "durationMin")), windows, note: str(f, "note"), wantStrengthMin: str(f, "wantMin") ? Number(str(f, "wantMin")) : null, wantStrengthMax: str(f, "wantMax") ? Number(str(f, "wantMax")) : null })));
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

/** Nimmt eine offene Suche an und führt bei Erfolg direkt in die Lobby. */
export async function acceptSearchAction(entryId: string, teamId: string): Promise<ActionState> {
  const user = await requireUser("/matchmaking");
  let matchId: string;
  try {
    matchId = await acceptSearch(user.id, entryId, teamId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/matchmaking");
  revalidatePath("/suche");
  redirect(`/lobby/${matchId}`);
}

/** Direkt-Herausforderung: Ein Klick erzeugt die Lobby und führt dorthin. */
export async function challengeTeamAction(myTeamId: string, targetTeamId: string): Promise<ActionState> {
  const user = await requireUser("/suche");
  let matchId: string;
  try {
    matchId = await challengeTeam(user.id, myTeamId, targetTeamId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/suche");
  revalidatePath("/");
  redirect(`/lobby/${matchId}`);
}

export async function acceptChallengeAction(matchId: string): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => acceptChallenge(user.id, matchId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function declineChallengeAction(matchId: string): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => declineChallenge(user.id, matchId));
  revalidatePath(`/lobby/${matchId}`);
  revalidatePath("/suche");
  return result;
}
