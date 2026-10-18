"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { parseEuro } from "@/lib/money";
import { InsufficientFunds } from "./ledger";
import { requirePermission, requireUser } from "./session";
import { DomainError } from "./teams";
import { cancelTournament, createTournament, registerTeam, reportResult, setOrganizer, startTournament, withdrawTeam } from "./tournaments";

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
  if (fee === null) return { error: "Bitte gib das Startgeld als Betrag an, z. B. 15 oder 12,50.", fieldErrors: { entryFee: "Ungültiger Betrag." } };
  let id = "";
  const result = await guarded(async () => {
    const t = await createTournament(user.id, {
      name: str(f, "name"),
      city: str(f, "city"),
      venueText: str(f, "venueText"),
      startsOn: str(f, "startsOn"),
      format: str(f, "format") as "round_robin" | "knockout" | "groups_ko",
      maxTeams: Number(str(f, "maxTeams")),
      entryFeeCents: fee,
    });
    id = t.id;
  });
  if (!result?.ok) return result;
  redirect(`/turniere/${id}`);
}

function touch(id: string) {
  revalidatePath(`/turniere/${id}`);
  revalidatePath("/turniere");
}

export async function registerTeamAction(tournamentId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser(`/turniere/${tournamentId}`);
  const result = await guarded(() => registerTeam(user.id, tournamentId, str(f, "teamId")));
  touch(tournamentId);
  return result;
}

export async function withdrawTeamAction(tournamentId: string, teamId: string): Promise<ActionState> {
  const user = await requireUser(`/turniere/${tournamentId}`);
  const result = await guarded(() => withdrawTeam(user.id, tournamentId, teamId));
  touch(tournamentId);
  return result;
}

export async function startTournamentAction(tournamentId: string): Promise<ActionState> {
  const user = await requireUser(`/turniere/${tournamentId}`);
  const result = await guarded(() => startTournament(user.id, tournamentId));
  touch(tournamentId);
  return result;
}

export async function cancelTournamentAction(tournamentId: string): Promise<ActionState> {
  const user = await requireUser(`/turniere/${tournamentId}`);
  const result = await guarded(() => cancelTournament(user.id, tournamentId));
  touch(tournamentId);
  return result;
}

export async function reportResultAction(tournamentId: string, matchId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser(`/turniere/${tournamentId}`);
  const scoreA = Number(str(f, "scoreA"));
  const scoreB = Number(str(f, "scoreB"));
  if (str(f, "scoreA") === "" || str(f, "scoreB") === "") return { error: "Bitte gib beide Ergebnisse ein." };
  const result = await guarded(() => reportResult(user.id, tournamentId, matchId, { scoreA, scoreB, shootoutWinner: str(f, "shootoutWinner") || null }));
  touch(tournamentId);
  return result;
}

export async function setOrganizerAction(userId: string, value: boolean): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/nutzer");
  const result = await guarded(() => setOrganizer(admin.id, userId, value));
  revalidatePath("/admin/nutzer");
  return result;
}
