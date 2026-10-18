import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev: Zugriff über 127.0.0.1 und aus dem lokalen Netz (Handy-Tests) erlauben
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.*.*", "10.*.*.*"],
  cacheComponents: true,
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
