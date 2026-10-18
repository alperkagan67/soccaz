import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, matchRequests, matchResults, matches, notifications, remindersSent } from "@/db/schema";
import { dueReminders, lobbyDeadline, REMINDER_TEXT } from "@/lib/deadlines";
import { cancelMatchTx } from "./lobby";
import { teamName } from "./names";
import { matchParticipantIds, notifyUsers, teamAdminIds } from "./notifications";

/** Erinnert Teilnehmer 24 Stunden, 2 Stunden und 30 Minuten vor dem Anstoß. Pro Spiel und Art genau einmal. */
export async function sendMatchReminders(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 3_600_000);
  const upcoming = await db
    .select()
    .from(matches)
    .where(and(inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.startsAt} > ${now}`, sql`${matches.startsAt} <= ${horizon}`));

  let sent = 0;
  for (const match of upcoming) {
    const due = dueReminders(match.startsAt, now);
    if (due.length === 0) continue;
    await db.transaction(async (tx) => {
      // alle fälligen Arten als versendet markieren, aber nur für die dringendste wirklich benachrichtigen
      const inserted = await tx
        .insert(remindersSent)
        .values(due.map((kind) => ({ matchId: match.id, kind })))
        .onConflictDoNothing()
        .returning({ kind: remindersSent.kind });
      const newlyDue = inserted.map((r) => r.kind);
      const mostUrgent = due.find((k) => newlyDue.includes(k));
      if (!mostUrgent) return;
      const [home, away] = [await teamName(tx, match.homeTeamId), await teamName(tx, match.awayTeamId)];
      const where = match.venueText ? ` in ${match.venueText}` : "";
      await notifyUsers(
        await matchParticipantIds(tx, match.id),
        { type: "match.reminder", title: REMINDER_TEXT[mostUrgent], body: `${home} gegen ${away}${where}. Bist du bereit?`, url: `/lobby/${match.id}` },
        tx,
      );
      sent += 1;
    });
  }
  return sent;
}

/** Sagt Lobbys ab, die ihre Frist erreicht haben, ohne dass beide Teams genug bereite Spieler hatten. */
export async function cancelUnderfilledLobbies(now: Date = new Date()): Promise<number> {
  const lobbies = await db.select().from(matches).where(and(eq(matches.status, "lobby"), sql`${matches.startsAt} > ${now}`));
  let cancelled = 0;
  for (const m of lobbies) {
    if (lobbyDeadline(m.startsAt, m.createdAt).getTime() > now.getTime()) continue;
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(matches).where(eq(matches.id, m.id)).for("update");
      if (!fresh || fresh.status !== "lobby") return;
      await cancelMatchTx(tx, fresh, null, "Zu wenige bereite Spieler bis zur Frist.");
      await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
      cancelled += 1;
    });
  }
  return cancelled;
}

/** Offene Spielsuchen, deren Anstoß vorbei ist, werden als abgelaufen markiert. */
export async function expireOldRequests(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(matchRequests)
    .set({ status: "expired" })
    .where(and(eq(matchRequests.status, "open"), lt(matchRequests.startsAt, now)))
    .returning({ id: matchRequests.id });
  return rows.length;
}

/** Erinnert das andere Team nach 24 Stunden, ein gemeldetes Ergebnis zu bestätigen. */
export async function sendResultReminders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const pending = await db
    .select({ result: matchResults, match: matches })
    .from(matchResults)
    .innerJoin(matches, eq(matches.id, matchResults.matchId))
    .where(
      and(
        lt(matchResults.submittedAt, cutoff),
        eq(matchResults.disputed, false),
        inArray(matches.status, ["lobby", "confirmed"]),
        isNotNull(matchResults.confirmDeadline),
        sql`not (${matchResults.confirmedHome} and ${matchResults.confirmedAway})`,
      ),
    );

  let sent = 0;
  for (const { result, match } of pending) {
    await db.transaction(async (tx) => {
      const [mark] = await tx.insert(remindersSent).values({ matchId: match.id, kind: "result-24h" }).onConflictDoNothing().returning();
      if (!mark) return;
      const submitterHome = result.confirmedHome && !result.confirmedAway;
      const otherTeam = submitterHome ? match.awayTeamId : match.homeTeamId;
      await notifyUsers(
        await teamAdminIds(tx, otherTeam),
        { type: "result.reminder", title: "Erinnerung: Ergebnis bestätigen", body: "Das gemeldete Ergebnis wartet auf deine Bestätigung. Nach 48 Stunden gilt es automatisch.", url: `/spiele/${match.id}` },
        tx,
      );
      sent += 1;
    });
  }
  return sent;
}

/** Räumt Altlasten auf: lange abgelaufene Einladungen und alte, gelesene Benachrichtigungen. */
export async function cleanup(now: Date = new Date()): Promise<{ invites: number; notifications: number }> {
  const inviteCutoff = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const noteCutoff = new Date(now.getTime() - 90 * 24 * 3_600_000);
  const oldInvites = await db.delete(invites).where(lt(invites.expiresAt, inviteCutoff)).returning({ t: invites.token });
  const oldNotes = await db.delete(notifications).where(and(isNotNull(notifications.readAt), lt(notifications.createdAt, noteCutoff))).returning({ id: notifications.id });
  return { invites: oldInvites.length, notifications: oldNotes.length };
}
