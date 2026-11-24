"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { parseEuro } from "@/lib/money";
import { parseBerlinLocal } from "@/lib/time";
import { requirePermission, requireUser } from "./session";
import { zahlungenAus } from "./zahlungen-aus";
import { DomainError } from "./teams";
import { setTournamentVenue } from "./tournament-venue";
import { triggerTournamentChargesInBackground } from "./payments/tournament-charge";
import { isPlatformAdmin } from "@/lib/roles";
import { releaseTournamentCover, takeOverTournamentShare } from "./tournament-card";
import { cancelTournament, closeWithJoinedTeams, createTournament, decideShootout, joinAsPlayer, leavePlayer, registerTeam, reopenRosters, setOrganizer, setPaidReady, setRosterComplete, withdrawTeam } from "./tournaments";

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

export async function createTournamentAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/app/turniere/neu");
  // Zahlungen AUS (Go-live, Entscheid t2q 2026-11-24): das Turnier ist IMMER kostenlos, ein von Hand gesendeter Preis wird ignoriert (sonst entstuende ein Turnier mit Preis im pausierten Kartenfluss, den das Formular nicht kennt);
  // das Teamlimit "bis 16" gilt hier serverseitig (Formular: max 16; der Kern bleibt bei 32 fuer bezahlte Turniere).
  const free = await zahlungenAus();
  if (free && Number(str(f, "maxTeams")) > 16) return { error: "Für dieses Turnier sind bis zu 16 Teams möglich.", fieldErrors: { maxTeams: "Höchstens 16 Teams." } };
  const hourly = free ? 0 : str(f, "hourlyRent") === "" ? undefined : parseEuro(str(f, "hourlyRent"));
  if (hourly === null) return { error: "Bitte gib den Hallenpreis als Betrag an, z. B. 80 oder 95,50.", fieldErrors: { hourlyRent: "Ungültiger Betrag." } };
  const hours = Number(str(f, "durationHours").replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0) return { error: "Bitte gib die Dauer der Halle in Stunden an, z. B. 3 oder 2,5.", fieldErrors: { durationHours: "Ungültige Dauer." } };
  const startsAt = parseBerlinLocal(str(f, "startsAt"));
  const deadline = parseBerlinLocal(str(f, "registrationDeadline"));
  if (!startsAt || !deadline) return { error: "Bitte gib Termin und Anmeldeschluss mit Datum und Uhrzeit an." };
  let id = "";
  const result = await guarded(async () => {
    const t = await createTournament(user.id, {
      name: str(f, "name"),
      city: str(f, "city"),
      venueText: str(f, "venueText"),
      venueId: str(f, "venueId") || undefined,
      startsAt,
      registrationDeadline: deadline,
      maxTeams: Number(str(f, "maxTeams")),
      durationMin: Math.round(hours * 60),
      hourlyCents: hourly ?? null,
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
/** Partnerhalle waehlen (Veranstalter, solange der Kader offen ist). */
export async function setTournamentVenueAction(tournamentId: string, venueId: string): Promise<ActionState> {
  const user = await requireUser(`/turniere/${tournamentId}`);
  const result = await guarded(() => setTournamentVenue(user.id, isPlatformAdmin(user), tournamentId, String(venueId)));
  revalidatePath(`/turniere/${tournamentId}`);
  return result;
}

/** "Anteil uebernehmen" im Turnier (Kartenmodell): der Uebernehmer kommt immer aus der Sitzung, nie vom Client; die Zustimmung erzwingt der Server noch einmal. */
export async function takeOverTournamentShareAction(tournamentId: string, targetUserId: string, consent: boolean): Promise<ActionState> {
  return touch(tournamentId, async (userId) => {
    await takeOverTournamentShare(userId, tournamentId, targetUserId, consent === true);
  });
}

/** Zuruecknehmen: nur die EIGENE Uebernahme der Sitzung (es gibt kein Ziel-Argument vom Client). */
export async function releaseTournamentCoverAction(tournamentId: string): Promise<ActionState> {
  return touch(tournamentId, async (userId) => {
    await releaseTournamentCover(userId, tournamentId);
  });
}

/** Der Captain meldet: Mein Team ist vollzählig (oder nimmt es zurück). */
export async function setRosterCompleteAction(tournamentId: string, complete: boolean): Promise<ActionState> {
  return touch(tournamentId, (uid) => setRosterComplete(uid, tournamentId, complete));
}
/** Der Captain drückt Bereit, nachdem sein Team vollständig bezahlt hat (Prüfung serverseitig). */
export async function setPaidReadyAction(tournamentId: string): Promise<ActionState> {
  const r = await touch(tournamentId, (uid) => setPaidReady(uid, tournamentId));
  // Kartenmodell (M5-4): ist das letzte Team bereit und kurzer Vorlauf, wird sofort abgebucht (im Hintergrund, nie auf Kosten von "Bereit"); der Job holt sonst nach
  if (r?.ok) void triggerTournamentChargesInBackground(tournamentId);
  return r;
}
export async function reopenRostersAction(tournamentId: string): Promise<ActionState> {
  return touch(tournamentId, (uid) => reopenRosters(uid, tournamentId));
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
