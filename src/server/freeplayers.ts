import { and, asc, count, eq, gte, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { freePlayerPosts } from "@/db/schema-content";
import { toBerlinInputValue } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { notifyUsers } from "./notifications";
import { DomainError } from "./teams";

export const MAX_OPEN_POSTS = 3;
const MAX_DAYS_AHEAD = 60;
const today = () => toBerlinInputValue(new Date()).slice(0, 10);

export async function createPost(userId: string, input: { city: string; day: string; note?: string }) {
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || Number.isNaN(Date.parse(`${input.day}T00:00:00Z`))) throw new DomainError("Bitte wähle einen Tag.");
  const limit = toBerlinInputValue(new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000)).slice(0, 10);
  if (input.day < today()) throw new DomainError("Der Tag liegt in der Vergangenheit.");
  if (input.day > limit) throw new DomainError(`Höchstens ${MAX_DAYS_AHEAD} Tage im Voraus.`);
  const note = input.note?.replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 200) || null;

  const [{ n }] = await db.select({ n: count() }).from(freePlayerPosts).where(and(eq(freePlayerPosts.userId, userId), eq(freePlayerPosts.status, "open")));
  if (n >= MAX_OPEN_POSTS) throw new DomainError(`Du hast schon ${MAX_OPEN_POSTS} offene Einträge.`);
  const [row] = await db.insert(freePlayerPosts).values({ userId, city: input.city, day: input.day, note }).onConflictDoNothing().returning();
  if (!row) throw new DomainError("Für diesen Tag hast du dich schon eingetragen.");
  await audit(userId, "free_player.create", "free_player_post", row.id, { after: row });
  return row;
}

export async function closePost(userId: string, id: string) {
  const [row] = await db.update(freePlayerPosts).set({ status: "closed" }).where(and(eq(freePlayerPosts.id, id), eq(freePlayerPosts.userId, userId))).returning({ id: freePlayerPosts.id });
  if (!row) throw new DomainError("Eintrag nicht gefunden.");
}

export async function listPosts(filter: { city?: string }) {
  await connection();
  return db
    .select({ id: freePlayerPosts.id, userId: users.id, name: users.name, position: users.position, city: freePlayerPosts.city, day: freePlayerPosts.day, note: freePlayerPosts.note })
    .from(freePlayerPosts)
    .innerJoin(users, eq(users.id, freePlayerPosts.userId))
    .where(and(eq(freePlayerPosts.status, "open"), gte(freePlayerPosts.day, today()), eq(users.profilePublic, true), filter.city ? eq(freePlayerPosts.city, filter.city) : undefined))
    .orderBy(asc(freePlayerPosts.day), asc(freePlayerPosts.createdAt))
    .limit(60);
}

/** Team-Admin fragt einen eingetragenen Spieler an. Der Spieler bekommt eine Nachricht mit dem Teamlink. */
export async function requestPlayer(adminId: string, postId: string, teamId: string) {
  const [post] = await db.select().from(freePlayerPosts).where(eq(freePlayerPosts.id, postId));
  if (!post || post.status !== "open") throw new DomainError("Dieser Eintrag ist nicht mehr offen.");
  const [row] = await db
    .select({ name: teams.name, slug: teams.slug })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, adminId), eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin"), isNull(teams.archivedAt)));
  if (!row) throw new DomainError("Nur Team-Admins können Spieler anfragen.");
  await notifyUsers([post.userId], { type: "player.request", title: "Ein Team sucht dich", body: `${row.name} würde dich am ${post.day} gern mitspielen lassen. Schau dir das Team an.`, url: `/teams/${row.slug}` });
  await audit(adminId, "free_player.request", "free_player_post", postId, { after: { teamId } });
}
