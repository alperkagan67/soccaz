import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, users } from "@/db/schema";
import { matchClips } from "@/db/schema-matchmaking";
import { audit } from "./audit";
import { DomainError } from "./teams";

export const MAX_CLIPS_PER_USER = 10;

/** Nur https-Links; gibt die bereinigte Adresse zurück. */
export function cleanClipUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new DomainError("Das ist kein gültiger Link.");
  }
  if (u.protocol !== "https:") throw new DomainError("Der Link muss mit https:// beginnen.");
  if (u.href.length > 300) throw new DomainError("Der Link ist zu lang.");
  return u.href;
}

export async function listClips(matchId: string) {
  return db
    .select({ id: matchClips.id, url: matchClips.url, title: matchClips.title, createdAt: matchClips.createdAt, userId: users.id, author: users.nickname, name: users.name })
    .from(matchClips)
    .innerJoin(users, eq(users.id, matchClips.userId))
    .where(eq(matchClips.matchId, matchId))
    .orderBy(asc(matchClips.createdAt));
}

/** Spieler des Spiels stellen nach dem Anstoß Clips ein (Link zu YouTube, Instagram, TikTok …). */
export async function addClip(userId: string, matchId: string, input: { url: string; title: string }) {
  const [m] = await db.select({ startsAt: matches.startsAt, status: matches.status }).from(matches).where(eq(matches.id, matchId));
  if (!m) throw new DomainError("Spiel nicht gefunden.");
  if (m.status === "cancelled") throw new DomainError("Dieses Spiel wurde abgesagt.");
  if (m.startsAt.getTime() > Date.now()) throw new DomainError("Clips kannst du ab dem Anstoß einstellen.");
  const [p] = await db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
  if (!p) throw new DomainError("Nur Spieler dieses Spiels können Clips einstellen.");
  const title = input.title.replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 80);
  if (!title) throw new DomainError("Bitte gib dem Clip einen Titel.");
  const url = cleanClipUrl(input.url);
  const [{ n }] = await db.select({ n: count() }).from(matchClips).where(and(eq(matchClips.matchId, matchId), eq(matchClips.userId, userId)));
  if (n >= MAX_CLIPS_PER_USER) throw new DomainError(`Du kannst höchstens ${MAX_CLIPS_PER_USER} Clips pro Spiel einstellen.`);
  const [clip] = await db.insert(matchClips).values({ matchId, userId, url, title }).returning({ id: matchClips.id });
  await audit(userId, "clip.add", "match", matchId, { after: { clipId: clip.id, url } });
}

export async function deleteClip(userId: string, clipId: string, platformAdmin: boolean) {
  const [c] = await db.select().from(matchClips).where(eq(matchClips.id, clipId));
  if (!c) throw new DomainError("Clip nicht gefunden.");
  if (c.userId !== userId && !platformAdmin) throw new DomainError("Du kannst nur eigene Clips löschen.");
  await db.delete(matchClips).where(eq(matchClips.id, clipId));
  await audit(userId, "clip.delete", "match", c.matchId, { before: { clipId, url: c.url } });
}
