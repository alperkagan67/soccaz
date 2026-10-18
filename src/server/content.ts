import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { commentReports, comments, userWarnings, type CommentTarget } from "@/db/schema-content";
import { playerStats } from "@/db/schema-community";
import { audit } from "./audit";
import { notifyUsers } from "./notifications";
import { DomainError } from "./teams";

export const COMMENT_MAX = 500;
export const COMMENTS_PER_HOUR = 5;
export const AUTO_HIDE_REPORTERS = 3;

const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n");

async function targetExists(type: CommentTarget, id: string): Promise<boolean> {
  const table = type === "team" ? teams : type === "player" ? users : venues;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return Boolean(row);
}

/** Schreibt einen Kommentar (Team, Spieler) oder eine Hallenbewertung mit Sternen. Bewertungen ersetzen die eigene frühere. */
export async function postComment(userId: string, input: { targetType: CommentTarget; targetId: string; body: string; rating?: number | null }) {
  const body = stripControl(input.body).trim();
  if (body.length < 2) throw new DomainError("Bitte schreibe etwas.");
  if (body.length > COMMENT_MAX) throw new DomainError(`Maximal ${COMMENT_MAX} Zeichen.`);
  const isVenue = input.targetType === "venue";
  if (isVenue && !(Number.isInteger(input.rating) && input.rating! >= 1 && input.rating! <= 5)) throw new DomainError("Bitte vergib 1 bis 5 Sterne.");
  if (!/^[0-9a-f-]{36}$/i.test(input.targetId) || !(await targetExists(input.targetType, input.targetId))) throw new DomainError("Das Ziel gibt es nicht.");
  if (input.targetType === "player" && input.targetId === userId) throw new DomainError("Du kannst dein eigenes Profil nicht kommentieren.");

  const [author] = await db.select({ onboardedAt: users.onboardedAt, bannedAt: users.bannedAt }).from(users).where(eq(users.id, userId));
  if (!author?.onboardedAt || author.bannedAt) throw new DomainError("Du kannst gerade nicht kommentieren.");

  if (isVenue) {
    const [s] = await db.select({ matches: playerStats.matches }).from(playerStats).where(eq(playerStats.userId, userId));
    if (!s || s.matches < 1) throw new DomainError("Hallen kann bewerten, wer schon ein Spiel auf Socaz gespielt hat.");
  }

  const since = new Date(Date.now() - 3_600_000);
  const [{ n }] = await db.select({ n: count() }).from(comments).where(and(eq(comments.authorId, userId), gte(comments.createdAt, since)));
  if (n >= COMMENTS_PER_HOUR) throw new DomainError("Das waren viele Kommentare. Versuche es später noch einmal.");

  if (isVenue) {
    const [row] = await db
      .insert(comments)
      .values({ targetType: "venue", targetId: input.targetId, authorId: userId, body, rating: input.rating })
      .onConflictDoUpdate({
        target: [comments.targetId, comments.authorId],
        targetWhere: sql`${comments.targetType} = 'venue'`,
        set: { body, rating: input.rating, status: "visible", hiddenReason: null, updatedAt: new Date() },
      })
      .returning({ id: comments.id });
    return row.id;
  }
  const [row] = await db.insert(comments).values({ targetType: input.targetType, targetId: input.targetId, authorId: userId, body }).returning({ id: comments.id });
  return row.id;
}

export async function listComments(targetType: CommentTarget, targetId: string, viewerId?: string | null) {
  await connection();
  const rows = await db
    .select({ id: comments.id, body: comments.body, rating: comments.rating, createdAt: comments.createdAt, authorId: users.id, authorName: users.name })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId), eq(comments.status, "visible")))
    .orderBy(desc(comments.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, mine: r.authorId === viewerId }));
}

/** Eigenen Kommentar löschen; Moderation darf jeden entfernen. */
export async function deleteComment(userId: string, commentId: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!c || c.status === "removed") throw new DomainError("Kommentar nicht gefunden.");
  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  const mod = actor?.role === "admin" || actor?.role === "moderator";
  if (c.authorId !== userId && !mod) throw new DomainError("Das darfst du nicht.");
  await db.update(comments).set({ status: "removed", hiddenReason: c.authorId === userId ? "author" : "moderation", updatedAt: new Date() }).where(eq(comments.id, commentId));
  await audit(userId, "comment.delete", "comment", commentId, { before: { status: c.status } });
}

/** Meldet einen Kommentar. Ab drei verschiedenen Meldenden wird er vorläufig ausgeblendet. */
export async function reportComment(userId: string, commentId: string, reason: string) {
  const text = stripControl(reason).trim().slice(0, 200) || "Ohne Begründung";
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
    if (!c || c.status === "removed") throw new DomainError("Kommentar nicht gefunden.");
    if (c.authorId === userId) throw new DomainError("Eigene Kommentare kannst du löschen statt melden.");
    await tx.insert(commentReports).values({ commentId, reporterId: userId, reason: text }).onConflictDoNothing();
    const [{ n }] = await tx.select({ n: count() }).from(commentReports).where(and(eq(commentReports.commentId, commentId), sql`${commentReports.resolvedAt} is null`));
    let hidden = false;
    if (n >= AUTO_HIDE_REPORTERS && c.status === "visible") {
      await tx.update(comments).set({ status: "hidden", hiddenReason: "reports" }).where(eq(comments.id, commentId));
      await audit(null, "comment.auto_hide", "comment", commentId, { after: { reports: n } }, tx);
      hidden = true;
    }
    return { reports: n, hidden };
  });
}

// ---------------------------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------------------------

export async function moderationQueue() {
  await connection();
  return db.execute<{
    id: string; body: string; status: string; target_type: string; target_id: string; author_id: string; author_name: string;
    reports: number; reasons: string[]; warnings: number; created_at: Date;
  }>(sql`
    select c.id, c.body, c.status, c.target_type, c.target_id, c.author_id, u.name as author_name, c.created_at,
      (select count(*)::int from comment_reports r where r.comment_id = c.id and r.resolved_at is null) as reports,
      coalesce((select array_agg(r.reason) from comment_reports r where r.comment_id = c.id and r.resolved_at is null), '{}') as reasons,
      (select count(*)::int from user_warnings w where w.user_id = c.author_id) as warnings
    from comments c join users u on u.id = c.author_id
    where c.status <> 'removed' and (c.status = 'hidden' or exists (select 1 from comment_reports r where r.comment_id = c.id and r.resolved_at is null))
    order by c.created_at desc limit 100`);
}

export type ModerationDecision = "restore" | "remove" | "remove_and_warn";

export async function moderateComment(actorId: string, commentId: string, decision: ModerationDecision, note?: string) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(comments).where(eq(comments.id, commentId)).for("update");
    if (!c) throw new DomainError("Kommentar nicht gefunden.");
    await tx.update(commentReports).set({ resolvedAt: new Date() }).where(and(eq(commentReports.commentId, commentId), sql`${commentReports.resolvedAt} is null`));
    if (decision === "restore") {
      await tx.update(comments).set({ status: "visible", hiddenReason: null }).where(eq(comments.id, commentId));
    } else {
      await tx.update(comments).set({ status: "removed", hiddenReason: "moderation" }).where(eq(comments.id, commentId));
      if (decision === "remove_and_warn") {
        const reason = (note?.trim() || "Verstoß gegen die Hausordnung").slice(0, 200);
        await tx.insert(userWarnings).values({ userId: c.authorId, byId: actorId, reason });
        await notifyUsers([c.authorId], { type: "system", title: "Verwarnung", body: `Ein Kommentar von dir wurde entfernt: ${reason}. Bitte beachte die Hausordnung.`, url: "/hausordnung" }, tx);
      }
    }
    await audit(actorId, `comment.${decision}`, "comment", commentId, { after: { status: decision === "restore" ? "visible" : "removed" } }, tx);
  });
}

export async function warningCounts(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select({ userId: userWarnings.userId, n: count() }).from(userWarnings).where(inArray(userWarnings.userId, userIds)).groupBy(userWarnings.userId);
  return new Map(rows.map((r) => [r.userId, r.n]));
}
