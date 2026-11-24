import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { isStaging, robotsRules } from "@/lib/staging";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection(); // APP_ENV und APP_URL zur Anfragezeit lesen, nicht beim Bauen
  const base = process.env.APP_URL ?? "http://localhost:3100";
  return { rules: robotsRules(isStaging()), sitemap: `${base}/sitemap.xml` };
}
