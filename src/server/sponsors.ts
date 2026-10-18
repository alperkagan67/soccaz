import { and, asc, desc, eq, isNull, lte, or, gte, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { sponsors, teamSponsors, type SponsorKind } from "@/db/schema-league";
import { audit } from "./audit";
import { DomainError } from "./teams";

const isDay = (s: string | null | undefined) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)));

/** Nur https-Adressen ohne Zugangsdaten. Klicks laufen über /api/sponsor/<id>, nie direkt. */
export function cleanSponsorUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new DomainError("Die Adresse ist ungültig.");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new DomainError("Erlaubt sind nur https-Adressen ohne Zugangsdaten.");
  return url.toString();
}

export type SponsorInput = { name: string; url: string; kind: SponsorKind; tagline?: string; startsOn?: string | null; endsOn?: string | null };

export async function createSponsor(actorId: string, input: SponsorInput) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) throw new DomainError("Der Name braucht 2 bis 60 Zeichen.");
  if (input.kind !== "sponsor" && input.kind !== "jersey") throw new DomainError("Ungültige Art.");
  if (!isDay(input.startsOn) || !isDay(input.endsOn)) throw new DomainError("Ungültiges Datum.");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) throw new DomainError("Das Ende liegt vor dem Start.");
  const [row] = await db
    .insert(sponsors)
    .values({ name, url: cleanSponsorUrl(input.url), kind: input.kind, tagline: input.tagline?.trim().slice(0, 120) || null, startsOn: input.startsOn || null, endsOn: input.endsOn || null })
    .returning();
  await audit(actorId, "sponsor.create", "sponsor", row.id, { after: row });
  return row;
}

export async function setSponsorActive(actorId: string, id: string, active: boolean) {
  const [row] = await db.update(sponsors).set({ active }).where(eq(sponsors.id, id)).returning({ id: sponsors.id });
  if (!row) throw new DomainError("Sponsor nicht gefunden.");
  await audit(actorId, active ? "sponsor.activate" : "sponsor.deactivate", "sponsor", id, {});
}

export async function listSponsors() {
  await connection();
  return db.select().from(sponsors).orderBy(desc(sponsors.active), asc(sponsors.name));
}

const today = () => new Date().toISOString().slice(0, 10);
const running = () => and(eq(sponsors.active, true), or(isNull(sponsors.startsOn), lte(sponsors.startsOn, today())), or(isNull(sponsors.endsOn), gte(sponsors.endsOn, today())));

export async function activeSponsors(kind: SponsorKind = "sponsor") {
  await connection();
  return db.select({ id: sponsors.id, name: sponsors.name, tagline: sponsors.tagline }).from(sponsors).where(and(eq(sponsors.kind, kind), running())).orderBy(sql`random()`).limit(4);
}

export async function sponsorsOfTeam(teamId: string) {
  await connection();
  return db
    .select({ id: sponsors.id, name: sponsors.name })
    .from(teamSponsors)
    .innerJoin(sponsors, eq(sponsors.id, teamSponsors.sponsorId))
    .where(and(eq(teamSponsors.teamId, teamId), running()));
}

export async function assignJersey(actorId: string, teamId: string, sponsorId: string) {
  const [s] = await db.select({ kind: sponsors.kind }).from(sponsors).where(eq(sponsors.id, sponsorId));
  if (!s) throw new DomainError("Sponsor nicht gefunden.");
  if (s.kind !== "jersey") throw new DomainError("Das ist kein Trikot-Partner.");
  await db.insert(teamSponsors).values({ teamId, sponsorId }).onConflictDoNothing();
  await audit(actorId, "sponsor.assign_jersey", "team", teamId, { after: { sponsorId } });
}

export async function removeJersey(actorId: string, teamId: string, sponsorId: string) {
  await db.delete(teamSponsors).where(and(eq(teamSponsors.teamId, teamId), eq(teamSponsors.sponsorId, sponsorId)));
  await audit(actorId, "sponsor.remove_jersey", "team", teamId, { before: { sponsorId } });
}

/** Zählt einen Klick und liefert das Ziel. Nur für laufende Sponsoren. */
export async function registerClick(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.update(sponsors).set({ clicks: sql`${sponsors.clicks} + 1` }).where(and(eq(sponsors.id, id), running())).returning({ url: sponsors.url });
  return row?.url ?? null;
}
