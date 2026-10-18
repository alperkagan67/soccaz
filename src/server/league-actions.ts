"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import type { ActionState } from "@/lib/validation";
import { parseBerlinLocal } from "@/lib/time";
import { addTeamToLeague, createLeague, finishLeague, joinLeague, leaveLeague, removeTeamFromLeague } from "./leagues";
import { applyToProEvent, cancelProEvent, createProEvent, drawProEvent, withdrawProApplication } from "./pro-events";
import { requirePermission, requireUser } from "./session";
import { assignJersey, createSponsor, removeJersey, setSponsorActive } from "./sponsors";
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

async function teamIdBySlug(slug: string): Promise<string> {
  const [t] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug.toLowerCase()));
  if (!t) throw new DomainError(`Team „${slug}" nicht gefunden. Bitte den Teamnamen aus der Adresse (/teams/…) eintragen.`);
  return t.id;
}

// ---- Ligen -----------------------------------------------------------------------------------

export async function createLeagueAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/ligen");
  const result = await guarded(async () => void (await createLeague(admin.id, { name: str(f, "name"), city: str(f, "city") || null, startsOn: str(f, "startsOn"), endsOn: str(f, "endsOn"), openJoin: f.get("openJoin") === "on" })));
  revalidatePath("/admin/ligen");
  revalidatePath("/ligen");
  return result;
}

export async function addLeagueTeamAction(leagueId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/ligen");
  const result = await guarded(async () => {
    if (!(await addTeamToLeague(admin.id, leagueId, await teamIdBySlug(str(f, "slug"))))) throw new DomainError("Das Team ist schon dabei.");
  });
  revalidatePath("/admin/ligen");
  revalidatePath(`/ligen/${leagueId}`);
  return result;
}

export async function removeLeagueTeamAction(leagueId: string, teamId: string): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/ligen");
  const result = await guarded(() => removeTeamFromLeague(admin.id, leagueId, teamId));
  revalidatePath("/admin/ligen");
  revalidatePath(`/ligen/${leagueId}`);
  return result;
}

export async function finishLeagueAction(leagueId: string): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/ligen");
  const result = await guarded(async () => void (await finishLeague(admin.id, leagueId)));
  revalidatePath("/admin/ligen");
  revalidatePath(`/ligen/${leagueId}`);
  revalidatePath("/ligen");
  return result;
}

export async function joinLeagueAction(leagueId: string, teamId: string): Promise<ActionState> {
  const user = await requireUser(`/ligen/${leagueId}`);
  const result = await guarded(() => joinLeague(user.id, leagueId, teamId));
  revalidatePath(`/ligen/${leagueId}`);
  return result;
}

export async function leaveLeagueAction(leagueId: string, teamId: string): Promise<ActionState> {
  const user = await requireUser(`/ligen/${leagueId}`);
  const result = await guarded(() => leaveLeague(user.id, leagueId, teamId));
  revalidatePath(`/ligen/${leagueId}`);
  return result;
}

// ---- Profi-Tag -------------------------------------------------------------------------------

export async function createProEventAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/profitag");
  const result = await guarded(async () => {
    const startsAt = parseBerlinLocal(str(f, "startsAt"));
    const applyUntil = parseBerlinLocal(str(f, "applyUntil"));
    if (!startsAt || !applyUntil) throw new DomainError("Bitte gib Beginn und Bewerbungsfrist an.");
    await createProEvent(admin.id, {
      title: str(f, "title"),
      description: str(f, "description"),
      proTeamId: await teamIdBySlug(str(f, "proSlug")),
      city: str(f, "city"),
      startsAt,
      applyUntil,
      slots: Number(str(f, "slots")),
      slotMinutes: Number(str(f, "slotMinutes")) as 60 | 90,
    });
  });
  revalidatePath("/admin/profitag");
  revalidatePath("/profitag");
  return result;
}

export async function drawProEventAction(eventId: string): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/profitag");
  const result = await guarded(async () => void (await drawProEvent(admin.id, eventId)));
  revalidatePath("/admin/profitag");
  revalidatePath(`/profitag/${eventId}`);
  return result;
}

export async function cancelProEventAction(eventId: string): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/profitag");
  const result = await guarded(() => cancelProEvent(admin.id, eventId));
  revalidatePath("/admin/profitag");
  revalidatePath(`/profitag/${eventId}`);
  return result;
}

export async function applyProEventAction(eventId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser(`/profitag/${eventId}`);
  const result = await guarded(() => applyToProEvent(user.id, eventId, str(f, "teamId")));
  revalidatePath(`/profitag/${eventId}`);
  return result;
}

export async function withdrawProApplicationAction(eventId: string, teamId: string): Promise<ActionState> {
  const user = await requireUser(`/profitag/${eventId}`);
  const result = await guarded(() => withdrawProApplication(user.id, eventId, teamId));
  revalidatePath(`/profitag/${eventId}`);
  return result;
}

// ---- Sponsoren -------------------------------------------------------------------------------

export async function createSponsorAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/sponsoren");
  const result = await guarded(async () =>
    void (await createSponsor(admin.id, { name: str(f, "name"), url: str(f, "url"), kind: str(f, "kind") as "sponsor" | "jersey", tagline: str(f, "tagline"), startsOn: str(f, "startsOn") || null, endsOn: str(f, "endsOn") || null })),
  );
  revalidatePath("/admin/sponsoren");
  return result;
}

export async function toggleSponsorAction(id: string, active: boolean): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/sponsoren");
  const result = await guarded(() => setSponsorActive(admin.id, id, active));
  revalidatePath("/admin/sponsoren");
  return result;
}

export async function assignJerseyAction(sponsorId: string, _prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/sponsoren");
  const result = await guarded(async () => assignJersey(admin.id, await teamIdBySlug(str(f, "slug")), sponsorId));
  revalidatePath("/admin/sponsoren");
  return result;
}

export async function removeJerseyAction(sponsorId: string, teamId: string): Promise<ActionState> {
  const admin = await requirePermission("admin", "/admin/sponsoren");
  const result = await guarded(() => removeJersey(admin.id, teamId, sponsorId));
  revalidatePath("/admin/sponsoren");
  return result;
}
