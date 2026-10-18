import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_TOLERANCE_SECONDS = 300;

/**
 * Prüft die Signatur eines Stripe-Webhooks (Schema v1): HMAC-SHA256 über "<Zeitstempel>.<roher Text>".
 * Lehnt ab bei falscher Signatur, fehlendem Header und Zeitstempeln außerhalb der Toleranz (Schutz vor Wiederholung).
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > STRIPE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Erzeugt einen gültigen Signatur-Header (für Tests). */
export function signStripePayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}
