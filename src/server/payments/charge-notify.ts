// Benachrichtigung bei fehlgeschlagener Abbuchung (Vertrag 012, M3b AC-1). Empfänger sind NUR der Betroffene und der Captain/Veranstalter seines Teams
// (AC-12/AC-20: nie Dritte). Die Nachricht landet in der Outbox (notifications) in der Transaktion des Aufrufers; Push und Mail verschickt der Zustell-Job,
// hier gibt es keinen Netzaufruf.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { matchParticipants, matches, users } from "@/db/schema";
import { chargeFailureText, needsBankConfirmation } from "@/lib/charge-failure-text";
import { formatEuro } from "@/lib/money";
import { teamName } from "../names";
import { notifyUsers, teamAdminIds } from "../notifications";
import type { Tx } from "../tx";

/** Gesperrte Nutzer bekommen keine Nachricht (weder Eintrag noch Push noch Mail). */
async function notBanned(tx: Tx, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), isNull(users.bannedAt)));
  return rows.map((r) => r.id);
}

export async function notifyChargeProblem(tx: Tx, row: { matchId: string; userId: string; amountCents: number }, code: string | null): Promise<void> {
  const [game] = await tx.select({ home: matches.homeTeamId, away: matches.awayTeamId }).from(matches).where(eq(matches.id, row.matchId));
  if (!game) return;
  const [seat] = await tx.select({ teamId: matchParticipants.teamId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, row.matchId), eq(matchParticipants.userId, row.userId)));
  // Captain = Admin des Teams des Betroffenen; ohne Team (Privatspiel, noch nicht eingeteilt) der Veranstalter = Admin des Heimteams
  const captains = await notBanned(tx, await teamAdminIds(tx, seat?.teamId ?? game.home));
  const [victimActive] = await notBanned(tx, [row.userId]);
  const [victim] = await tx.select({ name: users.name, nickname: users.nickname }).from(users).where(eq(users.id, row.userId));
  const [home, away] = [await teamName(tx, game.home), await teamName(tx, game.away)];
  const reason = chargeFailureText(code);
  const bank = needsBankConfirmation(code);
  const amount = formatEuro(row.amountCents);
  const url = `/lobby/${row.matchId}`;
  const label = `${home} gegen ${away}`;

  await notifyUsers(
    victimActive ? [victimActive] : [],
    {
      type: "payment",
      title: bank ? "Bestätigung deiner Zahlung nötig" : "Abbuchung fehlgeschlagen",
      body: `${label}: Die Abbuchung von ${amount} ist nicht durchgegangen. ${reason} Öffne die Lobby und ändere deine Karte (Karte ändern), damit du dabei bleibst.`,
      url,
    },
    tx,
  );
  await notifyUsers(
    captains.filter((id) => id !== row.userId),
    {
      type: "payment",
      title: bank ? "Zahlung braucht Bestätigung" : "Abbuchung fehlgeschlagen",
      body: `${label}: Bei ${victim?.nickname ?? victim?.name ?? "einem Spieler"} ist die Abbuchung von ${amount} nicht durchgegangen. ${reason} Der Spieler kann in der Lobby seine Karte ändern.`,
      url,
    },
    tx,
  );
}
