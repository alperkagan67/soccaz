"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { MAX_WINDOWS } from "@/lib/matchmaking";
import { redirect } from "next/navigation";
import { acceptSearch, joinQueue, leaveQueue, setOpenLobbyJoined } from "./matchmaking";
import { db } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { matchmakingQueue } from "@/db/schema-matchmaking";
import { proposeOption, voteOption, withdrawOption } from "./scheduling";
import { requireUser } from "./session";
import { answerHallRequest, banHall, type HallAnswerResult } from "./veto";
import { HALL_TEXTS, describeHallDbFailure, pgCodeOf } from "@/lib/hall-answer-errors";
import { acceptChallenge, challengeTeam, declineChallenge } from "./challenges";
import { DomainError } from "./teams";
import { planDecline } from "@/lib/hall-decline";
import { assertBereichOffen } from "./turnier-only";

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
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
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
  if (result?.error) return result;
  // Weiter zur Übersicht der eigenen offenen Lobby
  const [entry] = await db
    .select({ id: matchmakingQueue.id })
    .from(matchmakingQueue)
    .where(and(eq(matchmakingQueue.teamId, str(f, "teamId")), eq(matchmakingQueue.status, "waiting")))
    .orderBy(desc(matchmakingQueue.createdAt))
    .limit(1);
  if (entry) redirect(`/lobby/offen/${entry.id}`);
  return result;
}

export async function leaveQueueAction(teamId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/matchmaking");
  const result = await guarded(() => leaveQueue(user.id, teamId));
  revalidatePath("/matchmaking");
  revalidatePath("/suche");
  revalidatePath("/lobby/offen/[entryId]", "page");
  return result;
}

export async function proposeOptionAction(matchId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/${matchId}`);
  const startsAt = parseBerlinLocal(str(f, "startsAt"));
  if (!startsAt) return { error: "Bitte gib Datum und Uhrzeit an." };
  const result = await guarded(() => proposeOption(user.id, matchId, { startsAt }));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function voteOptionAction(matchId: string, optionId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => voteOption(user.id, matchId, optionId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function withdrawOptionAction(matchId: string, optionId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => withdrawOption(user.id, matchId, optionId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function banHallAction(matchId: string, venueId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => banHall(user.id, matchId, venueId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

/** Nimmt eine offene Suche an und führt bei Erfolg direkt in die Lobby. */
export async function acceptSearchAction(entryId: string, teamId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
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
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
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
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => acceptChallenge(user.id, matchId));
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

export async function declineChallengeAction(matchId: string): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/${matchId}`);
  const result = await guarded(() => declineChallenge(user.id, matchId));
  revalidatePath(`/lobby/${matchId}`);
  revalidatePath("/suche");
  return result;
}

/**
 * Antwort des Betreibers in einen Text für die Seite übersetzen (Plan 011 M2, 12.4): zu spät → neutraler Text; DomainError (veraltet, schon beantwortet, Zugang, Eingabe) → sein Text;
 * Datenbankfehler (EV001 bis EV004) → neutraler Text, nie die Datenbankmeldung (kann Freitext enthalten).
 */
async function hallAnswer(fn: () => Promise<HallAnswerResult>): Promise<ActionState> {
  try {
    const r = await fn();
    if (r.status === "late") return { error: HALL_TEXTS.late };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("hallAnswer:", pgCodeOf(error) ?? "Fehler"); // nur der Fehlercode, nie Meldung oder Freitext
    return { error: describeHallDbFailure(error).text };
  }
  return { ok: true };
}

/** Hallenbetreiber: Anfrage bestätigen (frei). `round` ist die Runde, die der Betreiber gesehen hat (veraltete Seiten werden abgelehnt). */
export async function answerHallAction(matchId: string, venueId: string, accept: boolean, round: number | null): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/halle");
  const result = await hallAnswer(() => answerHallRequest(user.id, matchId, venueId, accept, { round: round ?? undefined }));
  revalidatePath("/halle");
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

/**
 * Hallenbetreiber lehnt mit Grund ab (011 M2b/M2a-2): Eingabe prüfen (erste Stufe, Fehler am Feld), dann answerHallRequest mit Kategorie, Anmerkung und Runde.
 * Die Weiche HALL_DECLINE_WIRED (R-T238) ist an: Grund und Runde werden gespeichert/geprüft; ohne Anbindung hätte die Aktion nur „Ablehnen mit Grund folgt“ gemeldet.
 */
export async function declineHallAction(matchId: string, venueId: string, round: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser("/halle");
  const plan = planDecline({ code: String(formData.get("reasonCode") ?? ""), text: String(formData.get("reason") ?? "") });
  if (plan.kind === "invalid") return { fieldErrors: plan.fieldErrors }; // nur am Feld: `Form` zeigt dazu den Hinweis, ein zweiter Alarm würde doppelt vorgelesen
  if (plan.kind === "not-wired") return { error: plan.error };
  const result = await hallAnswer(() => answerHallRequest(user.id, matchId, venueId, false, { reasonCode: plan.code, reason: plan.text, round: round ?? undefined }));
  revalidatePath("/halle");
  revalidatePath(`/lobby/${matchId}`);
  return result;
}

/** Teammitglied tritt der offenen Lobby bei oder verlässt sie. */
export async function openLobbyJoinAction(entryId: string, join: boolean): Promise<ActionState> {
  await assertBereichOffen(); // TURNIER_ONLY: gesperrter Bereich
  const user = await requireUser(`/lobby/offen/${entryId}`);
  const result = await guarded(() => setOpenLobbyJoined(user.id, entryId, join));
  revalidatePath(`/lobby/offen/${entryId}`);
  return result;
}
