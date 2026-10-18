import { describe, expect, it } from "vitest";
import { signStripePayload, verifyStripeSignature } from "@/lib/stripe-signature";

const secret = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = 1_800_000_000;

describe("Stripe-Webhook-Signatur", () => {
  it("akzeptiert eine gültige Signatur", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, secret, now), secret, now)).toBe(true);
  });
  it("lehnt veränderten Inhalt ab", () => {
    expect(verifyStripeSignature(body + " ", signStripePayload(body, secret, now), secret, now)).toBe(false);
  });
  it("lehnt falsches Geheimnis ab", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, "anderes", now), secret, now)).toBe(false);
  });
  it("lehnt zu alte und zukünftige Zeitstempel ab (Wiederholungsschutz)", () => {
    const old = signStripePayload(body, secret, now - 301);
    expect(verifyStripeSignature(body, old, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, signStripePayload(body, secret, now - 299), secret, now)).toBe(true);
    expect(verifyStripeSignature(body, signStripePayload(body, secret, now + 301), secret, now)).toBe(false);
  });
  it("lehnt fehlenden oder kaputten Header ab", () => {
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "", secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "t=abc,v1=zz", secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, secret, now)).toBe(false);
  });
  it("lehnt leeres Geheimnis ab", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, "", now), "", now)).toBe(false);
  });
  it("akzeptiert mehrere Signaturen, wenn eine passt (Schlüsselwechsel)", () => {
    const good = signStripePayload(body, secret, now).split("v1=")[1];
    expect(verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${good}`, secret, now)).toBe(true);
  });
});
