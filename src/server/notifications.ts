import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import {
  deliveryLog,
  matchParticipants,
  matches,
  notificationPrefs,
  notifications,
  pushSubscriptions,
  teamMembers,
  users,
} from "@/db/schema";
import { emailsFor, isOptionalType, type NotificationType } from "@/lib/notification-types";
import { sendEmail } from "./providers/email";
import { sendPush } from "./providers/push";

type Exec = Pick<typeof db, "insert" | "select">;

export type NotificationInput = { type: NotificationType; title: string; body: string; url?: string };

// ---------------------------------------------------------------------------------------------
// Empfänger
// ---------------------------------------------------------------------------------------------

export async function teamAdminIds(exec: Exec, teamId: string): Promise<string[]> {
  const rows = await exec
    .select({ id: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin")));
  return rows.map((r) => r.id);
}

export async function matchParticipantIds(exec: Exec, matchId: string): Promise<string[]> {
  const rows = await exec.select({ id: matchParticipants.userId }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  return rows.map((r) => r.id);
}

/** Admins beider Teams eines Spiels. */
export async function matchAdminIds(exec: Exec, matchId: string): Promise<string[]> {
  const [m] = await exec.select({ home: matches.homeTeamId, away: matches.awayTeamId }).from(matches).where(eq(matches.id, matchId));
  if (!m) return [];
  return [...(await teamAdminIds(exec, m.home)), ...(await teamAdminIds(exec, m.away))];
}

export async function platformAdminIds(exec: Exec): Promise<string[]> {
  const rows = await exec.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), isNull(users.bannedAt)));
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------------------------
// Anlegen (Outbox: gespeichert in derselben Transaktion, zugestellt vom Job)
// ---------------------------------------------------------------------------------------------

export async function notifyUsers(userIds: string[], input: NotificationInput, exec: Exec = db, exceptUserId?: string | null) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
  if (ids.length === 0) return 0;

  let targets = ids;
  if (isOptionalType(input.type)) {
    const prefs = await exec.select().from(notificationPrefs).where(inArray(notificationPrefs.userId, ids));
    const off = new Set(prefs.filter((p) => p.disabledTypes.includes(input.type)).map((p) => p.userId));
    targets = ids.filter((id) => !off.has(id));
  }
  if (targets.length === 0) return 0;

  await exec.insert(notifications).values(targets.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body, url: input.url ?? null })));
  return targets.length;
}

// ---------------------------------------------------------------------------------------------
// Lesen für die Oberfläche
// ---------------------------------------------------------------------------------------------

export async function listNotifications(userId: string, limit = 50) {
  await connection();
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  await connection();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markAllRead(userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function getPrefs(userId: string) {
  await connection();
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  return row ?? { userId, push: true, email: true, disabledTypes: [] as string[] };
}

export async function savePrefs(userId: string, prefs: { push: boolean; email: boolean; disabledTypes: string[] }) {
  await db
    .insert(notificationPrefs)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: prefs });
}

// ---------------------------------------------------------------------------------------------
// Zustellung (Job)
// ---------------------------------------------------------------------------------------------

function absoluteUrl(path?: string | null): string {
  const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  return path ? `${base}${path}` : base;
}

/** Stellt ungesendete Benachrichtigungen per Push und E-Mail zu. Jede Benachrichtigung wird genau einmal versucht. */
export async function deliverPending(limit = 200): Promise<number> {
  const pending = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      email: users.email,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(isNull(notifications.deliveredAt))
    .orderBy(notifications.createdAt)
    .limit(limit);
  if (pending.length === 0) return 0;

  const userIds = [...new Set(pending.map((p) => p.userId))];
  const [prefRows, subRows] = await Promise.all([
    db.select().from(notificationPrefs).where(inArray(notificationPrefs.userId, userIds)),
    db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)),
  ]);
  const prefs = new Map(prefRows.map((p) => [p.userId, p]));

  for (const n of pending) {
    const pref = prefs.get(n.userId);
    const pushOn = pref?.push ?? true;
    const emailOn = (pref?.email ?? true) && emailsFor(n.type);
    const log = (channel: string, status: string, detail?: string) => db.insert(deliveryLog).values({ notificationId: n.id, channel, status, detail });

    if (!pushOn) {
      await log("push", "skipped", "Push in den Einstellungen abgeschaltet.");
    } else {
      const subs = subRows.filter((s) => s.userId === n.userId);
      if (subs.length === 0) await log("push", "skipped", "Kein Gerät registriert.");
      for (const s of subs) {
        const result = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { title: n.title, body: n.body, url: n.url ?? "/app", tag: n.type });
        await log("push", result.status, result.detail);
        if (result.gone) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      }
    }

    if (emailOn) {
      const link = absoluteUrl(n.url);
      const result = await sendEmail({ to: n.email, subject: n.title, text: `${n.body}\n\n${link}\n\nDu kannst Benachrichtigungen unter ${absoluteUrl("/app/einstellungen")} einstellen.` });
      await log("email", result.status, result.detail);
    }

    await db.update(notifications).set({ deliveredAt: new Date() }).where(eq(notifications.id, n.id));
  }
  return pending.length;
}

export async function savePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, ...sub })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent ?? null } });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
