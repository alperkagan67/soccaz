// Zahlungsanbieter hinter einer Schnittstelle (Vertrag 012, ADR 0001). M1a: Kunde, SetupIntent, Zahlungsmittel lesen/lösen, Webhook prüfen.
// Die Abbuchung (PaymentIntent mit off_session) kommt mit M2 hinzu. Nie Kartennummer, Ablaufdatum oder CVC serverseitig: die Karte gibt der Nutzer
// ausschließlich in Stripe Elements im Browser ein (M1b), hier laufen nur Stripe-IDs.
import { DomainError } from "../teams";

export type ProviderEvent = { id: string; type: string; object: Record<string, unknown> };
export type CardDisplay = { id: string; brand: string | null; last4: string | null };

export interface PaymentProvider {
  readonly name: "stripe" | "fake";
  /** Legt den Kunden an. Gleicher idempotencyKey liefert denselben Kunden. */
  createCustomer(input: { userId: string; email: string; idempotencyKey: string }): Promise<{ id: string }>;
  /** SetupIntent für eine Karte (usage off_session). Das clientSecret geht nur an den Nutzer selbst. */
  createSetupIntent(input: { customerId: string; userId: string; idempotencyKey: string }): Promise<{ id: string; clientSecret: string }>;
  /** Nur Anzeigedaten (Marke, letzte vier Ziffern). */
  retrievePaymentMethod(id: string): Promise<CardDisplay>;
  detachPaymentMethod(id: string): Promise<void>;
  /** Prüft die Signatur des rohen Bodys und liefert das Ereignis. Wirft WebhookSignatureError bei falscher oder fehlender Signatur. */
  constructWebhookEvent(rawBody: string, signature: string | null): ProviderEvent;
}

export class WebhookSignatureError extends Error {
  constructor() {
    super("Ungültige Signatur");
    this.name = "WebhookSignatureError";
  }
}

/** Kartenzahlung nicht eingerichtet (Schlüssel fehlt). Kontrollierter Fehler statt Absturz, der Build bleibt unberührt. */
export class PaymentsUnavailableError extends DomainError {
  constructor() {
    super("Die Kartenzahlung ist gerade nicht verfügbar.");
    this.name = "PaymentsUnavailableError";
  }
}

/**
 * Harter Fehler (kein DomainError, kein stilles Weiterlaufen): PAYMENTS_FAKE=1 darf in Produktion nie gesetzt sein, sonst gälte das bekannte Fake-Geheimnis.
 * Greift bei jedem Zugriff auf den Anbieter und damit vor jeder Kartenzahlung und jedem Webhook; ein eigener Startpfad (instrumentation.ts) ist dafür nicht nötig.
 */
export function assertNoFakeInProduction() {
  if (process.env.NODE_ENV === "production" && process.env.PAYMENTS_FAKE === "1") {
    throw new Error("PAYMENTS_FAKE=1 ist in Produktion verboten. Die Variable nur in Tests und CI setzen, nie in Staging oder Produktion.");
  }
}

let override: PaymentProvider | null = null;
let cached: PaymentProvider | null = null;

/** Nur für Tests: festen Anbieter setzen (null = zurück zur Umgebung). */
export function setPaymentProviderForTests(provider: PaymentProvider | null) {
  override = provider;
}

/**
 * Der aktive Anbieter. Mit STRIPE_SECRET_KEY: Stripe. Ohne Schlüssel nur mit ausdrücklichem PAYMENTS_FAKE=1 (Tests, CI, lokale Entwicklung): der
 * FakeProvider mit dem bekannten Fake-Geheimnis. Sonst überall (auch auf Staging) PaymentsUnavailableError. Die Umgebungsvariablen werden erst hier gelesen, nie beim Import.
 */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  assertNoFakeInProduction();
  if (override) return override;
  if (cached) return cached;
  if (process.env.STRIPE_SECRET_KEY) {
    const { StripeProvider } = await import("./stripe");
    cached = new StripeProvider();
  } else if (process.env.PAYMENTS_FAKE === "1") {
    const { FakeProvider } = await import("./fake");
    cached = new FakeProvider();
  } else {
    throw new PaymentsUnavailableError();
  }
  return cached;
}
