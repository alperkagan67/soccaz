import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, matchParticipants, matchRequests, matchResults, matches, notifications, remindersSent } from "@/db/schema";
import { abortDeadline, dueReminders, fixDeadline, hasLongLead, lobbyDeadline, REMINDER_TEXT } from "@/lib/deadlines";
import { users } from "@/db/schema";
import { payments } from "@/db/schema-finance";
import { getAlerts } from "./finance";
import { cancelMatchTx } from "./lobby";
import { isDeadlineModel, leadStart, settleMatch } from "./wallet";
import { paymentsEnabled } from "./settings";
import { teamName } from "./names";
import { cancelUncoveredPrivateGames } from "./privategame";
import { notifyRegistrationDeadlines } from "./tournaments";
import { matchParticipantIds, notifyUsers, teamAdminIds } from "./notifications";

/** Erinnert Teilnehmer 24 Stunden, 2 Stunden und 30 Minuten vor dem Anstoß. Pro Spiel und Art genau einmal. */
export async function sendMatchReminders(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 3_600_000);
  const upcoming = await db
    .select()
    .from(matches)
    .where(and(inArray(matches.status, ["lobby", "confirmed"]), eq(matches.schedulingOpen, false), sql`${matches.startsAt} > ${now}`, sql`${matches.startsAt} <= ${horizon}`));

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
  const lobbies = await db.select().from(matches).where(and(eq(matches.status, "lobby"), eq(matches.schedulingOpen, false), sql`${matches.startsAt} > ${now}`));
  const pay = await paymentsEnabled();
  let cancelled = 0;
  for (const m of lobbies) {
    if (pay && isDeadlineModel(m)) continue; // neue Frist-Regel: 48-h-Schließung und 1-h-Abbruch (closeLobbiesAtDeadline), nicht mehr die 24-h-Prüfung
    if (lobbyDeadline(m.startsAt, m.createdAt).getTime() > now.getTime()) continue;
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(matches).where(eq(matches.id, m.id)).for("update");
      if (!fresh || fresh.status !== "lobby") return;
      await cancelMatchTx(tx, fresh, null, "Zu wenige bereite Spieler bis zur Frist.");
      await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
      cancelled += 1;
    });
  }
  // Altspiele (Privatspiel des alten Modells): Ist die Hallenmiete zum Prüfzeitpunkt nicht gedeckt, wird abgesagt und erstattet (je Spiel isoliert)
  cancelled += await cancelUncoveredPrivateGames(now);
  // Neue Frist-Regel für Privat- und Teamspiele: 48-h-Schließung und 1-h-Abbruch
  cancelled += await closeLobbiesAtDeadline(now);
  // Turniere: am Anmeldeschluss bekommt der Veranstalter einmalig eine Meldung (läuft im selben 5-Minuten-Takt)
  await notifyRegistrationDeadlines(now);
  return cancelled;
}

/**
 * Neue Frist-Regel für Privat- und Teamspiele (Verträge 006/008 v3), je Spiel in eigener Transaktion unter der Spielsperre:
 * - Anlage mit mindestens 48 Stunden Vorlauf: Zur Frist (Anstoß minus 48 Stunden) wird gebucht (abgerechnet), wenn alle bezahlt haben und beide
 *   Captains bereit sind; sonst wird abgesagt und alle bekommen ihren Anteil zurück. Es gibt keine 24-h-Prüfung und keinen 1-h-Abbruch.
 * - Anlage unter 48 Stunden Vorlauf: Gebucht wird sofort (finalConfirm); 1 Stunde vor Anstoß wird abgesagt, was dann noch nicht gebucht ist.
 * Nachholbar und idempotent: nur noch nicht abgerechnete, aktive Spiele vor dem Anstoß werden angefasst. Nur bei eingeschalteten Zahlungen.
 * "Gebucht" heißt hier abgerechnet (`settleMatch`): Das Geld liegt schon auf dem Konto revenue, es gibt noch keine Auszahlung an den Veranstalter.
 */
export async function closeLobbiesAtDeadline(now: Date = new Date()): Promise<number> {
  if (!(await paymentsEnabled())) return 0;
  const candidates = await db
    .select()
    .from(matches)
    .where(and(inArray(matches.kind, ["private", "team"]), eq(matches.legacyShareModel, false), inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.settledAt} is null`, eq(matches.schedulingOpen, false), sql`${matches.startsAt} > ${now}`));
  let cancelled = 0;
  for (const c of candidates) {
    const due = hasLongLead(c.startsAt, await leadStart(db, c)) ? fixDeadline(c.startsAt) : abortDeadline(c.startsAt);
    if (due.getTime() > now.getTime()) continue;
    try {
      await db.transaction(async (tx) => {
        const [m] = await tx.select().from(matches).where(eq(matches.id, c.id)).for("update");
        if (!m || m.settledAt || (m.status !== "lobby" && m.status !== "confirmed") || m.startsAt.getTime() <= now.getTime()) return;
        // Gebucht ist erst, wenn `settleMatch` es bestätigt (kostenlos: nichts zu buchen). Meldet es false (Unterdeckung, Status), wird wie bei
        // "nicht buchbar" abgesagt und alle erstattet: nie ein Fehlbetrag zu Lasten der Plattform, nie Geld ohne Beleg auf revenue.
        const free = !m.priceCents || m.finalShareCents === 0;
        if ((await bookable(tx, m)) && (free || (await settleMatch(tx, m)))) {
          await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
          return;
        }
        const reason = hasLongLead(m.startsAt, await leadStart(tx, m)) ? "Zur Frist 48 Stunden vor Anstoß hatten nicht alle bezahlt oder nicht beide Captains bereit gedrückt. Alle bekommen ihren Anteil zurück." : "Eine Stunde vor Anstoß hatten nicht alle bezahlt oder nicht beide Captains bereit gedrückt. Alle bekommen ihren Anteil zurück.";
        await cancelMatchTx(tx, m, null, reason);
        await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
        cancelled += 1;
      });
    } catch (error) {
      console.error("closeLobbiesAtDeadline: Fehler bei Spiel", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return cancelled;
}

/** Können wir buchen? Beide Captains bereit, der Preis steht fest und alle eingeteilten Spieler haben ihren Anteil bezahlt (kostenlos: nur "Bereit"). */
async function bookable(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], m: typeof matches.$inferSelect): Promise<boolean> {
  if (!m.homeFinalAt || !m.awayFinalAt || m.finalShareCents === null) return false;
  if (!m.priceCents || m.finalShareCents === 0) return true;
  const seated = await tx.select({ paid: matchParticipants.paidCents }).from(matchParticipants).where(and(eq(matchParticipants.matchId, m.id), isNotNull(matchParticipants.teamId)));
  // alle haben ihren Anteil bezahlt UND die Summe deckt den Preis (zu wenige eingeteilte Spieler ergeben sonst einen Fehlbetrag)
  return seated.length > 0 && seated.every((p) => p.paid >= (m.finalShareCents ?? 0)) && seated.reduce((sum, p) => sum + p.paid, 0) >= m.priceCents;
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

/** Rechnet bestätigte Spiele ab, sobald ihre Lobby-Frist erreicht ist: Hallenpreis geteilt durch die zahlenden Spieler. */
export async function settleDueMatches(now: Date = new Date()): Promise<number> {
  const candidates = await db.select().from(matches).where(and(eq(matches.status, "confirmed"), sql`${matches.settledAt} is null`));
  let settled = 0;
  for (const m of candidates) {
    if (isDeadlineModel(m)) continue; // neue Frist-Regel: gebucht wird zur 48-h-Frist bzw. sofort (closeLobbiesAtDeadline, finalConfirm)
    if (lobbyDeadline(m.startsAt, m.createdAt).getTime() > now.getTime()) continue;
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(matches).where(eq(matches.id, m.id)).for("update");
      if (!fresh || fresh.settledAt || fresh.status !== "confirmed") return;
      if (await settleMatch(tx, fresh)) {
        await tx.execute(sql`select pg_notify('lobby', ${m.id})`);
        settled += 1;
      }
    });
  }
  return settled;
}

/** Offene Zahlungen, die nach 24 Stunden nicht abgeschlossen wurden, gelten als abgebrochen. */
export async function expireStalePayments(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const rows = await db
    .update(payments)
    .set({ status: "canceled", failureReason: "Nicht abgeschlossen (24 Stunden)", completedAt: now })
    .where(and(eq(payments.status, "pending"), lt(payments.createdAt, cutoff)))
    .returning({ id: payments.id });
  return rows.length;
}

/** Meldet Finanz-Alarme einmal pro Tag an Plattform-Admins und Finanz-Rolle. */
export async function notifyFinanceAlerts(): Promise<number> {
  const alerts = await getAlerts();
  if (alerts.length === 0) return 0;
  const staff = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "finance"]));
  const since = new Date(Date.now() - 20 * 3_600_000);
  const already = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(and(eq(notifications.title, "Finanz-Alarme"), sql`${notifications.createdAt} > ${since}`));
  const done = new Set(already.map((r) => r.userId));
  const targets = staff.map((u) => u.id).filter((id) => !done.has(id));
  const high = alerts.filter((a) => a.severity === "high").length;
  await notifyUsers(targets, { type: "admin.task", title: "Finanz-Alarme", body: `${alerts.length} Auffälligkeit(en)${high ? `, davon ${high} dringend` : ""}. ${alerts[0].title}`, url: "/admin/finanzen" });
  return targets.length;
}
