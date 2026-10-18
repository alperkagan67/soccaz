import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Inhaltsrichtlinie nur in Produktion (die Entwicklung braucht eval für schnelles Neuladen).
// Einbettungen von Twitch, Kick und YouTube sind für die Stream-Funktion schon freigegeben.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://player.twitch.tv https://www.youtube-nocookie.com https://player.kick.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  // Dev: Zugriff über 127.0.0.1 und aus dem lokalen Netz (Handy-Tests) erlauben
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.*.*", "10.*.*.*"],
  // Schlankes Docker-Image: nur die benötigten Dateien werden ausgeliefert
  output: "standalone",
  serverExternalPackages: ["pg", "pg-boss", "web-push"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  experimental: {
    // Unsere Seiten lesen alle zur Anfragezeit Sitzung und Datenbank: Instant-Validierung nur dort, wo explizit gesetzt.
    instantInsights: { validationLevel: "manual-warning" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
