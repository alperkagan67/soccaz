// Inhaltsrichtlinie (CSP). Nur in Produktion aktiv (die Entwicklung braucht eval für schnelles Neuladen).
// Einbettungen von Twitch, Kick und YouTube sind für die Stream-Funktion freigegeben.
// Stripe (Elements/Stripe.js), Quelle: https://docs.stripe.com/security/guide (Abschnitt Stripe.js):
//  - script-src https://js.stripe.com: lädt Stripe.js
//  - frame-src https://js.stripe.com: die Elements-Felder laufen in Stripe-Frames
//  - frame-src https://hooks.stripe.com: 3-D-Secure-Weiterleitung bei Karten
//  - connect-src https://api.stripe.com: Stripe.js ruft die Stripe-API direkt auf
// Bewusst NICHT enthalten: https://checkout.stripe.com (gehostetes Checkout ist eine Weiterleitung, kein Frame/Skript auf
// unserer Seite), maps.googleapis.com (Address Element), link.com (Link), *.js.stripe.com (nur Leistungsoptimierung).
// img-src erlaubt schon https:.

export function buildCsp(isProd: boolean): string | null {
  if (!isProd) return null;
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self'",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com",
    "frame-src https://player.twitch.tv https://www.youtube-nocookie.com https://player.kick.com https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
  ].join("; ");
}
