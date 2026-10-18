"use server";

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
import { acceptRequest, cancelRequest, createRequest } from "./requests";
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
