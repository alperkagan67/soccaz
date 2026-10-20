"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signOut } from "@/auth";
import { isOldEnough } from "@/lib/age";
import { ActionState, onboardingSchema, requestSchema, teamSchema, zodToState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { audit } from "./audit";
import { requireLoggedIn, requireUser } from "./session";
import { InsufficientFunds } from "./ledger";
import * as lobby from "./lobby";
import * as results from "./results";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { markAllRead, removePushSubscription, savePrefs, savePushSubscription } from "./notifications";
import { acceptRequest, cancelRequest, createRequest } from "./requests";
import { castMvpVote, markNoShow } from "./stats";
import { createInvite, createTeam, DomainError, joinWithInvite } from "./teams";

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function completeOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireLoggedIn();
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);

  const birth = new Date(parsed.data.birthDate);
  if (!isOldEnough(birth)) {
    // Mindestalter 16: Konto wird gelöscht, das Geburtsdatum wird nie gespeichert.
    await db.delete(users).where(eq(users.id, user.id));
    await signOut({ redirectTo: "/unter-16" });
    return;
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      name: parsed.data.name,
      city: parsed.data.city,
      position: parsed.data.position,
      ageConfirmedAt: now,
      termsAcceptedAt: now,
      onboardedAt: now,
    })
    .where(eq(users.id, user.id));
  await audit(user.id, "user.onboarded", "user", user.id);
  redirect(safeNext(formData.get("next")));
}

export async function createTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/teams/neu");
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);

  let slug: string;
  try {
    slug = (await createTeam(user.id, parsed.data)).slug;
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, fieldErrors: { name: error.message } };
    throw error;
  }
  redirect(`/teams/${slug}`);
}

export async function createInviteAction(teamId: string): Promise<{ token?: string; error?: string }> {
  const user = await requireUser();
  try {
    const { token } = await createInvite(user.id, teamId);
    return { token };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function joinTeamAction(token: string): Promise<ActionState> {
  const user = await requireUser(`/einladung/${token}`);
  let slug: string;
  try {
    slug = (await joinWithInvite(user.id, token)).teamSlug;
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect(`/teams/${slug}`);
}

export async function createRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/suche/neu");
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);

  const startsAt = parseBerlinLocal(parsed.data.startsAt);
  if (!startsAt) return { error: "Ungültiges Datum.", fieldErrors: { startsAt: "Ungültiges Datum." } };

  let id: string;
  try {
    id = (
      await createRequest(user.id, {
        ...parsed.data,
        startsAt,
        durationMin: parsed.data.durationMin as 60 | 90,
      })
    ).id;
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, fieldErrors: { startsAt: error.message } };
    throw error;
  }
  redirect(`/suche/${id}`);
}

export async function acceptRequestAction(requestId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(`/suche/${requestId}`);
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) return { error: "Bitte wähle dein Team." };
  let matchId: string;
  try {
    matchId = (await acceptRequest(user.id, requestId, teamId)).id;
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect(`/lobby/${matchId}`);
}

export async function cancelRequestAction(requestId: string): Promise<ActionState> {
  const user = await requireUser(`/suche/${requestId}`);
  try {
    await cancelRequest(user.id, requestId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect("/app");
}

// ---------------------------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------------------------

async function lobbyAction(matchId: string, fn: (userId: string) => Promise<void>): Promise<ActionState> {
  const user = await requireUser(`/lobby/${matchId}`);
  try {
    await fn(user.id);
  } catch (error) {
    if (error instanceof InsufficientFunds) return { error: error.message, needsTopupCents: error.neededCents - error.balanceCents };
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/lobby/${matchId}`);
}

export async function joinLobbyAction(matchId: string) {
  return lobbyAction(matchId, (id) => lobby.joinLobby(id, matchId));
}
export async function leaveLobbyAction(matchId: string) {
  return lobbyAction(matchId, (id) => lobby.leaveLobby(id, matchId));
}
export async function setReadyAction(matchId: string, ready: boolean) {
  return lobbyAction(matchId, (id) => lobby.setReady(id, matchId, ready));
}
export async function payShareAction(matchId: string) {
  return lobbyAction(matchId, (id) => lobby.payShare(id, matchId));
}
export async function setVenueAction(matchId: string, venue: string) {
  return lobbyAction(matchId, (id) => lobby.setVenue(id, matchId, venue));
}
export async function joinAsSubstituteAction(matchId: string) {
  return lobbyAction(matchId, (id) => lobby.joinAsSubstitute(id, matchId));
}
export async function assignSubstituteAction(matchId: string, targetUserId: string, teamId: string) {
  return lobbyAction(matchId, (id) => lobby.assignSubstitute(id, matchId, targetUserId, teamId));
}
export async function removeParticipantAction(matchId: string, targetUserId: string) {
  return lobbyAction(matchId, (id) => lobby.removeParticipant(id, matchId, targetUserId));
}
export async function cancelMatchAction(matchId: string, reason: string) {
  return lobbyAction(matchId, (id) => lobby.cancelMatch(id, matchId, reason));
}

// ---------------------------------------------------------------------------------------------
// Spieltag: Ereignisse und Ergebnis
// ---------------------------------------------------------------------------------------------

async function matchAction(matchId: string, fn: (userId: string) => Promise<void>): Promise<ActionState> {
  const user = await requireUser(`/spiele/${matchId}`);
  try {
    await fn(user.id);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/spiele/${matchId}`);
  revalidatePath(`/lobby/${matchId}`);
}

export async function recordEventAction(matchId: string, input: results.EventInput) {
  return matchAction(matchId, (id) => results.recordEvent(id, matchId, input));
}
export async function undoLastEventAction(matchId: string) {
  return matchAction(matchId, (id) => results.undoLastEvent(id, matchId));
}
export async function submitResultAction(matchId: string, home: number, away: number) {
  return matchAction(matchId, (id) => results.submitResult(id, matchId, home, away));
}
export async function confirmResultAction(matchId: string) {
  return matchAction(matchId, (id) => results.confirmResult(id, matchId));
}
export async function disputeResultAction(matchId: string, reason: string) {
  return matchAction(matchId, (id) => results.disputeResult(id, matchId, reason));
}
export async function decideResultAction(matchId: string, home: number, away: number, reason: string) {
  return matchAction(matchId, (id) => results.decideResult(id, matchId, home, away, reason));
}

// ---------------------------------------------------------------------------------------------
// Benachrichtigungen und Einstellungen
// ---------------------------------------------------------------------------------------------

export async function markNotificationsReadAction() {
  const user = await requireUser("/app/benachrichtigungen");
  await markAllRead(user.id);
  revalidatePath("/app/benachrichtigungen");
}

export async function savePrefsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/app/einstellungen");
  const optional = (Object.keys(NOTIFICATION_TYPES) as (keyof typeof NOTIFICATION_TYPES)[]).filter((t) => NOTIFICATION_TYPES[t].optional);
  const disabledTypes = optional.filter((t) => formData.get(`type:${t}`) !== "on");
  await savePrefs(user.id, { push: formData.get("push") === "on", email: formData.get("email") === "on", disabledTypes });
  revalidatePath("/app/einstellungen");
  return { error: undefined };
}

export async function savePushSubscriptionAction(sub: { endpoint: string; p256dh: string; auth: string }, userAgent: string | null) {
  const user = await requireUser("/app/einstellungen");
  if (!sub.endpoint.startsWith("https://")) return { error: "Ungültiges Push-Abo." };
  await savePushSubscription(user.id, { ...sub, userAgent });
  revalidatePath("/app/einstellungen");
  return { error: undefined };
}

export async function removePushSubscriptionAction(endpoint: string) {
  const user = await requireUser("/app/einstellungen");
  await removePushSubscription(user.id, endpoint);
  revalidatePath("/app/einstellungen");
}

// ---------------------------------------------------------------------------------------------
// Nach dem Spiel: Spieler des Spiels, nicht erschienen
// ---------------------------------------------------------------------------------------------

export async function castMvpVoteAction(matchId: string, candidateId: string): Promise<ActionState> {
  const user = await requireUser(`/spiele/${matchId}`);
  try {
    await castMvpVote(user.id, matchId, candidateId);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/spiele/${matchId}`);
}

export async function markNoShowAction(matchId: string, userId: string, value: boolean): Promise<ActionState> {
  const user = await requireUser(`/spiele/${matchId}`);
  try {
    await markNoShow(user.id, matchId, userId, value);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/spiele/${matchId}`);
}
