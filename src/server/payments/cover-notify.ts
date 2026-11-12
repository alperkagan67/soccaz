// Benachrichtigungen zu "Anteil übernehmen" (Vertrag 012, M3c-3b). Empfänger sind NUR der Platz A, der Übernehmer B und der Captain/Veranstalter (Plan Abschnitt 7): nie Dritte.
// Die Texte nennen keinen Grund und keine Fehlschläge (AC-20); A erfährt den Namen von B nicht (neutral "ein Mitspieler"), der Captain sieht beide Namen.
// Aufruf NACH dem erfolgreichen Eintragen bzw. Zurücknehmen (eigene Aktion der Lobby); ein Fehler beim Benachrichtigen darf die Übernahme nie rückgängig machen oder melden.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, users } from "@/db/schema";
import { formatEuro } from "@/lib/money";
import { teamName } from "../names";
import { notifyUsers, teamAdminIds } from "../notifications";

// nur der Fehlername, nie Meldung oder Daten (kein Leck in Logs)
const logName = (error: unknown) => (error instanceof Error ? error.name : "unbekannt");
const nameOf = (u: { name: string; nickname: string | null } | undefined) => u?.nickname ?? u?.name ?? "Spieler";

async function context(matchId: string, payerId: string, targetId: string) {
  const [game] = await db.select({ home: matches.homeTeamId, away: matches.awayTeamId }).from(matches).where(eq(matches.id, matchId));
  if (!game) return null;
  const [seat] = await db.select({ teamId: matchParticipants.teamId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, targetId)));
  const people = await db.select({ id: users.id, name: users.name, nickname: users.nickname }).from(users).where(and(inArray(users.id, [payerId, targetId]), isNull(users.bannedAt)));
  const byId = new Map(people.map((p) => [p.id, p]));
  // Captain = Admin des Teams des Platzes; im Privatspiel (ohne Team) der Veranstalter = Admin des Heimteams
  const captains = (await teamAdminIds(db, seat?.teamId ?? game.home)).filter((id) => id !== payerId && id !== targetId);
  const label = `${await teamName(db, game.home)} gegen ${await teamName(db, game.away)}`;
  return { byId, captains, label, url: `/lobby/${matchId}` };
}

/** B hat den Anteil von A übernommen. */
export async function notifyCoverTaken(matchId: string, payerId: string, targetId: string, extraCents: number | null): Promise<void> {
  try {
    const c = await context(matchId, payerId, targetId);
    if (!c) return;
    const [payer, target] = [c.byId.get(payerId), c.byId.get(targetId)];
    const input = (title: string, body: string) => ({ type: "system" as const, title, body, url: c.url });
    if (target) await notifyUsers([targetId], input("Dein Anteil wird übernommen", `Ein Mitspieler übernimmt deinen Anteil für ${c.label}. Du musst nichts tun.`));
    if (payer) {
      const amount = extraCents !== null ? ` (voraussichtlich ${formatEuro(extraCents)})` : "";
      await notifyUsers([payerId], input("Du übernimmst einen Anteil", `Zur Frist wird zusätzlich der Anteil von ${nameOf(target)}${amount} von deiner Karte abgebucht (${c.label}). Bis dahin kannst du in der Lobby zurücknehmen.`));
    }
    if (c.captains.length > 0) await notifyUsers(c.captains, input("Anteil übernommen", `${nameOf(payer)} übernimmt den Anteil von ${nameOf(target)} (${c.label}).`));
  } catch (error) {
    console.error("notifyCoverTaken", logName(error));
  }
}

/** B hat die Übernahme zurückgenommen: A ist wieder offen. Der Übernehmer selbst bekommt keine Nachricht (eigene Aktion). */
export async function notifyCoverReleased(matchId: string, payerId: string, targetId: string): Promise<void> {
  try {
    const c = await context(matchId, payerId, targetId);
    if (!c) return;
    const [payer, target] = [c.byId.get(payerId), c.byId.get(targetId)];
    const input = (title: string, body: string) => ({ type: "system" as const, title, body, url: c.url });
    if (target) await notifyUsers([targetId], input("Dein Anteil wird nicht mehr übernommen", `Die Übernahme deines Anteils für ${c.label} wurde zurückgenommen. Hinterlege eine Karte, damit du dabei bist.`));
    if (c.captains.length > 0) await notifyUsers(c.captains, input("Übernahme zurückgenommen", `${nameOf(payer)} nimmt die Übernahme für ${nameOf(target)} zurück (${c.label}). ${nameOf(target)} braucht wieder eine eigene Karte.`));
  } catch (error) {
    console.error("notifyCoverReleased", logName(error));
  }
}
