export type Provider = "dev" | "stripe";

/** Welcher Anbieter ist aktiv? Stripe, sobald ein Schlüssel gesetzt ist. Lokal und in Tests der Entwicklungs-Anbieter. In Produktion ohne Schlüssel: keiner. (012 M6b: Aufladung, Rabattcodes und Checkout sind entfernt; nur diese Anzeige in den Einstellungen bleibt.) */
export function activeProvider(): Provider | null {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.NODE_ENV !== "production" || process.env.PAYMENTS_DEV_PROVIDER === "1") return "dev";
  return null;
}
