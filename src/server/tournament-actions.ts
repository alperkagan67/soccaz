"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { parseEuro } from "@/lib/money";
import { parseBerlinLocal } from "@/lib/time";
import { InsufficientFunds } from "./ledger";
import { requirePermission, requireUser } from "./session";
import { DomainError } from "./teams";
import { cancelTournament, closeWithJoinedTeams, createTournament, decideShootout, joinAsPlayer, leavePlayer, payEntry, registerTeam, setOrganizer, setTeamReady, withdrawTeam } from "./tournaments";

async function guarded(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof InsufficientFunds) return { error: error.message, needsTopupCents: error.neededCents - error.balanceCents };
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  return { ok: true };
}

const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

export async function createTournamentAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/app/turniere/neu");
  const fee = str(f, "entryFee") === "" ? 0 : parseEuro(str(f, "entryFee"));
  if (fee === null) return { error: "Bitte gib den Eintritt als Betrag an, z. B. 15 oder 12,50.", fieldErrors: { entryFee: "Ungültiger Betrag." } };
  const startsAt = parseBerlinLocal(str(f, "startsAt"));
  const deadline = parseBerlinLocal(str(f, "registrationDeadline"));
  if (!startsAt || !deadline) return { error: "Bitte gib Termin und Anmeldeschluss mit Datum und Uhrzeit an." };
  let id = "";
  const result = await guarded(async () => {
    const t = await createTournament(user.id, {
      name: str(f, "name"),
      city: str(f, "city"),
      venueText: str(f, "venueText"),
      startsAt,
      registrationDeadline: deadline,
      maxTeams: Number(str(f, "maxTeams")),
      playerFeeCents: fee,
      isPrivate: str(f, "public") !== "on",
      matchMinutes: Number(str(f, "matchMinutes") || 15),
    });
    id = t.id;
  });
  if (!result?.ok) return result;
  redirect(`/turniere/${id}`);
}

async function touch(id: string, action: (userId: string) => Promise<void>): Promise<ActionState> {
  const user = await requireUser(`/turniere/${id}`);
  const result = await guarded(() => action(user.id));
  revalidatePath(`/turniere/${id}`);
  revalidatePath("/turniere");
  return result;
}

export async function registerTeamAction(tournamentId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  return touch(tournamentId, (uid) => registerTeam(uid, tournamentId, str(f, "teamId")));
}
export async function joinAsPlayerAction(tournamentId: string, teamId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => joinAsPlayer(uid, tournamentId, teamId));
}
export async function leavePlayerAction(tournamentId: string, targetUserId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => leavePlayer(uid, tournamentId, targetUserId));
}
export async function payEntryAction(tournamentId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => payEntry(uid, tournamentId));
}
export async function setTeamReadyAction(tournamentId: string, ready: boolean): Promise<ActionState> {
  return touch(tournamentId, (uid) => setTeamReady(uid, tournamentId, ready));
}
export async function withdrawTeamAction(tournamentId: string, teamId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => withdrawTeam(uid, tournamentId, teamId));
}
export async function closeWithJoinedAction(tournamentId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => closeWithJoinedTeams(uid, tournamentId));
}
export async function cancelTournamentAction(tournamentId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => cancelTournament(uid, tournamentId));
}
export async function decideShootoutAction(tournamentId: string, tournamentMatchId: string, winnerTeamId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => decideShootout(uid, tournamentId, tournamentMatchId, winnerTeamId));
}

export async function setOrganizerAction(userId: string, value: boolean): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/nutzer");
  const result = await guarded(() => setOrganizer(admin.id, userId, value));
  revalidatePath("/admin/nutzer");
  return result;
}
