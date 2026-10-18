import { and, count, desc, eq, ne } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams, users } from "@/db/schema";
import { media, type MediaKind } from "@/db/schema-content";
import { audit } from "./audit";
import { DomainError } from "./teams";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_MATCH = 8;
const ACCEPTED = new Set(["jpeg", "png", "webp"]);
const SIZES: Record<MediaKind, { width: number; height: number; fit: "cover" | "inside" }> = {
  avatar: { width: 256, height: 256, fit: "cover" },
  team_logo: { width: 256, height: 256, fit: "cover" },
  match_photo: { width: 1280, height: 1280, fit: "inside" },
};

/** Prüft, dass es wirklich ein Bild ist, und kodiert es neu: richtige Ausrichtung, feste Größe, keine Metadaten (EXIF/GPS), WebP. */
export async function processImage(input: Buffer, kind: MediaKind): Promise<Buffer> {
  if (input.length === 0) throw new DomainError("Die Datei ist leer.");
  if (input.length > MAX_UPLOAD_BYTES) throw new DomainError("Das Bild ist größer als 5 MB.");
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) throw new DomainError("Erlaubt sind JPEG, PNG und WebP.");
    const size = SIZES[kind];
    return await image.rotate().resize({ width: size.width, height: size.height, fit: size.fit, withoutEnlargement: size.fit === "inside" }).webp({ quality: 82 }).toBuffer();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("Das Bild konnte nicht gelesen werden.");
  }
}

async function canUpload(actor: { id: string; role: string }, kind: MediaKind, refId: string): Promise<boolean> {
  if (kind === "avatar") return refId === actor.id;
  if (kind === "team_logo") {
    if (actor.role === "admin") return true;
    const [m] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, refId), eq(teamMembers.userId, actor.id)));
    return m?.role === "admin";
  }
  const [p] = await db
    .select({ status: matches.status, startsAt: matches.startsAt })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(eq(matchParticipants.matchId, refId), eq(matchParticipants.userId, actor.id)));
  return Boolean(p && p.status !== "cancelled" && p.startsAt.getTime() <= Date.now());
}

export async function storeImage(actor: { id: string; role: string }, kind: MediaKind, refId: string, file: Buffer): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(refId)) throw new DomainError("Ungültiges Ziel.");
  if (!(await canUpload(actor, kind, refId))) throw new DomainError("Dafür fehlt dir die Berechtigung.");
  const data = await processImage(file, kind);

  return db.transaction(async (tx) => {
    if (kind === "match_photo") {
      const [{ n }] = await tx.select({ n: count() }).from(media).where(and(eq(media.kind, kind), eq(media.refId, refId), eq(media.status, "visible")));
      if (n >= MAX_PHOTOS_PER_MATCH) throw new DomainError(`Maximal ${MAX_PHOTOS_PER_MATCH} Fotos pro Spiel.`);
    }
    const [row] = await tx.insert(media).values({ ownerId: actor.id, kind, refId, mime: "image/webp", data }).returning({ id: media.id });
    const url = `/api/media/${row.id}`;
    if (kind === "avatar") await tx.update(users).set({ avatarUrl: url }).where(eq(users.id, refId));
    if (kind === "team_logo") await tx.update(teams).set({ logoUrl: url }).where(eq(teams.id, refId));
    if (kind !== "match_photo") await tx.delete(media).where(and(eq(media.kind, kind), eq(media.refId, refId), ne(media.id, row.id))); // nur das aktuelle Bild behalten
    await audit(actor.id, "media.upload", "media", row.id, { after: { kind, refId, bytes: data.length } }, tx);
    return url;
  });
}

export async function getMedia(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select({ data: media.data, mime: media.mime, status: media.status }).from(media).where(eq(media.id, id));
  return row && row.status === "visible" ? row : null;
}

export async function listMatchPhotos(matchId: string) {
  return db.select({ id: media.id, ownerId: media.ownerId }).from(media).where(and(eq(media.kind, "match_photo"), eq(media.refId, matchId), eq(media.status, "visible"))).orderBy(desc(media.createdAt));
}

export async function removeMedia(actor: { id: string; role: string }, id: string) {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row || row.status === "removed") throw new DomainError("Bild nicht gefunden.");
  const mod = actor.role === "admin" || actor.role === "moderator";
  if (row.ownerId !== actor.id && !mod) throw new DomainError("Das darfst du nicht.");
  await db.update(media).set({ status: "removed" }).where(eq(media.id, id));
  if (row.kind === "avatar") await db.update(users).set({ avatarUrl: null }).where(eq(users.id, row.refId));
  if (row.kind === "team_logo") await db.update(teams).set({ logoUrl: null }).where(eq(teams.id, row.refId));
  await audit(actor.id, "media.remove", "media", id, { before: { kind: row.kind } });
}
