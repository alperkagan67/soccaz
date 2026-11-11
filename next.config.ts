import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/csp";

const isProd = process.env.NODE_ENV === "production";

const csp = buildCsp(isProd);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(csp ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  // Dev: Zugriff über 127.0.0.1 und aus dem lokalen Netz (Handy-Tests) erlauben
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.*.*", "10.*.*.*"],
  // Schlankes Docker-Image: nur die benötigten Dateien werden ausgeliefert
  output: "standalone",
  serverExternalPackages: ["pg", "pg-boss", "web-push", "@react-pdf/renderer"],
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
