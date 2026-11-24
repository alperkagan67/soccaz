// Staging-Erkennung (Pilot): nur die Umgebungsvariable APP_ENV=staging, gesetzt von docker-compose.staging.yml. Produktion und lokale Entwicklung setzen sie nicht.
export const isStaging = (env: string | undefined = process.env.APP_ENV): boolean => env === "staging";

export const STAGING_BANNER_TEXT = "STAGING, Testmodus: nur Testkarten, keine echten Zahlungen";

/** Regeln der robots.txt: Produktion wie bisher, Staging schließt alles aus (zusätzlich zu X-Robots-Tag im Caddyfile.staging). */
export function robotsRules(staging: boolean): { userAgent: string; allow?: string; disallow: string | string[] }[] {
  if (staging) return [{ userAgent: "*", disallow: "/" }];
  return [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/lobby", "/dev", "/einladung", "/spieler/"] }];
}
