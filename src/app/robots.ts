import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3100";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/lobby", "/dev", "/einladung"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
