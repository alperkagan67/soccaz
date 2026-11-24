// Anmeldung mit Apple (Turnier 12.12.): reine Hilfen ohne Datenbank und ohne Auth.js-Import (testbar). Der Schalter ist FAIL CLOSED: ohne APPLE_LOGIN_ENABLED=1 UND Services ID UND Secret
// gibt es weder Anbieter noch Knopf noch geänderte Cookies. Quelle der Zusammenhänge: docs/design/apple-anmeldung-anleitung.md.

type Env = Record<string, string | undefined>;

/** Nur "1" schaltet ein (wie TURNIER_ONLY); zusätzlich müssen AUTH_APPLE_ID (Services ID) und AUTH_APPLE_SECRET (Client-Secret als JWT) gesetzt sein. */
export function appleLoginEnabled(env: Env): boolean {
  return env.APPLE_LOGIN_ENABLED === "1" && Boolean(env.AUTH_APPLE_ID) && Boolean(env.AUTH_APPLE_SECRET);
}

/** Text bei einer Anmeldung mit Apple, deren E-Mail schon zu einem anderen Konto gehört. Neutral: nennt weder die Adresse noch einen bestimmten Anbieter (die Kollision kann ein Google-, Apple- oder Entwicklungs-Konto sein); verrät nur, dass es zu der Adresse ein Konto gibt. */
export const APPLE_ABWEISUNG = "Zu dieser E-Mail-Adresse gibt es schon ein Konto. Bitte melde dich mit der Anmeldeart an, mit der du es angelegt hast.";
export const APPLE_KEINE_EMAIL = "Apple hat keine bestätigte E-Mail-Adresse geliefert. Bitte melde dich mit Google an oder erlaube Soccaz die E-Mail in den Apple-Einstellungen.";
/** users.name ist Pflicht; Apple liefert den Namen nur beim ALLERERSTEN Login. Fehlt er, steht dieser Platzhalter, bis das Onboarding (Schritt "spieler") den Namen erfragt. */
export const APPLE_NAME_PLATZHALTER = "Neuer Spieler";

type CookieSpec = { name: string; options: { httpOnly: true; sameSite: "none"; path: "/"; secure: true } };
export type AppleCookies = { state: CookieSpec; pkceCodeVerifier: CookieSpec; nonce: CookieSpec };

/**
 * Apple liefert das Ergebnis per cross-site POST (response_mode=form_post). Damit die Auth.js-Zustands-Cookies dabei mitgesendet werden, brauchen state, pkce und nonce SameSite=None; Secure
 * (Quelle: @auth/core 0.41.3 lib/utils/cookie.js: Standard ist sameSite "lax"). Nur wenn Apple aktiv UND https (sonst verwirft der Browser das Cookie); das Sitzungs-Cookie bleibt Standard.
 */
export function appleCookies(env: Env, https: boolean): AppleCookies | undefined {
  if (!appleLoginEnabled(env) || !https) return undefined;
  const spec = (name: string): CookieSpec => ({ name: `__Secure-${name}`, options: { httpOnly: true, sameSite: "none", path: "/", secure: true } });
  return { state: spec("authjs.state"), pkceCodeVerifier: spec("authjs.pkce.code_verifier"), nonce: spec("authjs.nonce") };
}

/** Name aus dem `user`-Feld von Apple (nur beim ersten Login). Ohne brauchbaren Namen: Platzhalter, nie die (Relay-)E-Mail als Name. */
export function appleNameAusProfil(profile: { user?: { name?: { firstName?: string; lastName?: string } } }): string {
  const n = profile.user?.name;
  const voll = [n?.firstName, n?.lastName].map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).join(" ");
  return voll ? voll.slice(0, 80) : APPLE_NAME_PLATZHALTER;
}
