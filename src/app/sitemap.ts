import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { venues } from "@/db/schema-finance";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = process.env.APP_URL ?? "http://localhost:3100";
  const fixed = ["", "/suche", "/spiele", "/rangliste", "/spieler", "/hallen", "/impressum", "/datenschutz", "/agb", "/hausordnung"].map((p) => ({ url: `${base}${p}` }));
  const teamRows = await db.select({ slug: teams.slug }).from(teams).where(isNull(teams.archivedAt)).limit(5000);
  const venueRows = await db.select({ id: venues.id }).from(venues).where(eq(venues.active, true)).limit(1000);
  return [...fixed, ...teamRows.map((t) => ({ url: `${base}/teams/${t.slug}` })), ...venueRows.map((v) => ({ url: `${base}/hallen/${v.id}` }))];
}
