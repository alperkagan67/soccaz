import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isStaging, robotsRules, STAGING_BANNER_TEXT } from "@/lib/staging";

// Staging-Schutz (Pilot): Zugangsschutz fail closed, noindex nur in Staging, Banner nur bei APP_ENV=staging, Produktion unverändert.
const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");

describe("Umgebungsschalter APP_ENV", () => {
  it("nur der Wert 'staging' gilt als Staging (kein Treffer bei leer, 'production', 'Staging', 'true')", () => {
    expect(isStaging("staging")).toBe(true);
    for (const v of [undefined, "", "production", "Staging", "true", "1"]) expect(isStaging(v)).toBe(false);
  });
});

describe("robots.txt: beide Zweige", () => {
  it("Staging: alles ausgeschlossen, keine Freigabe, keine Teilpfade", () => {
    expect(robotsRules(true)).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
  it("Produktion: unverändert (Freigabe der Wurzel, die bekannten Sperrpfade)", () => {
    expect(robotsRules(false)).toEqual([{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/lobby", "/dev", "/einladung", "/spieler/"] }]);
  });
  it("robots.ts nutzt den Schalter zur Anfragezeit", () => {
    const r = src("src/app/robots.ts");
    expect(r).toContain("await connection()");
    expect(r).toContain("robotsRules(isStaging())");
  });
});

describe("Banner", () => {
  it("Text nennt Staging und Testmodus; Komponente zeigt nichts außerhalb von Staging, liest zur Anfragezeit", () => {
    expect(STAGING_BANNER_TEXT).toMatch(/STAGING/);
    expect(STAGING_BANNER_TEXT).toMatch(/Testmodus/);
    const c = src("src/components/StagingBanner.tsx");
    expect(c).toContain("await connection()");
    expect(c).toContain("if (!isStaging()) return null;");
    expect(c).toContain("text-ink"); // nur Tokens (AC-27), keine eigenen Farben
    expect(c).not.toMatch(/#[0-9a-fA-F]{3,6}|rgb\(/);
    expect(c).toContain("text-sm"); // 14 px, nicht die 12-px-Stufe
  });
  it("Layout bindet das Banner ein (ganz oben, in Suspense)", () => {
    expect(src("src/app/layout.tsx")).toMatch(/<Suspense fallback=\{null\}>\s*<StagingBanner \/>/);
  });
});

describe("Caddyfile.staging und Compose-Override (Zugangsschutz, fail closed)", () => {
  const caddy = src("Caddyfile.staging");
  const comp = src("docker-compose.staging.yml");
  it("Basic-Auth mit Benutzer und Hash NUR aus der Umgebung, kein eingetragenes Passwort oder Hash", () => {
    expect(caddy).toContain("basic_auth @geschuetzt");
    expect(caddy).toContain("{$STAGING_BASIC_AUTH_USER} {$STAGING_BASIC_AUTH_HASH}");
    expect(caddy).not.toMatch(/\$2[aby]\$/); // kein bcrypt-Hash im Repository
  });
  it("Ausnahmen genau: Webhook (Signaturprüfung) und Health; sonst alles geschützt, auch die Anmeldung (Google-Rückleitung braucht keine Ausnahme)", () => {
    expect(caddy).toContain("@geschuetzt not path /api/stripe/webhook /api/health");
    expect(caddy).not.toMatch(/path[^\n]*\/api\/auth/);
    expect(caddy).not.toMatch(/path[^\n]*\/api\/jobs/);
  });
  it("noindex im Kopf, Sicherheitsköpfe wie in der Produktion, Live-Kanäle nicht gepuffert", () => {
    expect(caddy).toContain('X-Robots-Tag "noindex, nofollow"');
    const prod = src("Caddyfile");
    for (const h of ["X-Content-Type-Options nosniff", "X-Frame-Options DENY", "Strict-Transport-Security", "-Server", "flush_interval -1"]) {
      expect(caddy, h).toContain(h);
      expect(prod, h).toContain(h);
    }
  });
  it("Produktion unverändert: kein Zugangsschutz, kein noindex im Caddyfile", () => {
    const prod = src("Caddyfile");
    expect(prod).not.toContain("basic_auth");
    expect(prod).not.toContain("X-Robots-Tag");
  });
  it("Compose-Override: Variablen ohne Standardwert mit ':?' (ohne sie bricht Compose ab), Caddyfile.staging eingebunden, APP_ENV=staging nur hier", () => {
    expect(comp).toContain("${STAGING_BASIC_AUTH_USER:?");
    expect(comp).toContain("${STAGING_BASIC_AUTH_HASH:?");
    expect(comp).not.toMatch(/STAGING_BASIC_AUTH_(USER|HASH):\s*\$\{[A-Z_]+:-/); // kein Standardwert
    expect(comp).toContain("./Caddyfile.staging:/etc/caddy/Caddyfile:ro");
    expect(comp).toContain("APP_ENV: staging");
    expect(src("docker-compose.yml")).not.toContain("APP_ENV");
  });
});
