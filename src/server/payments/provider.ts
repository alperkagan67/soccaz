// Zahlungsanbieter hinter einer Schnittstelle (Vertrag 012, ADR 0001). M1a: Kunde, SetupIntent, Zahlungsmittel lesen/lösen, Webhook prüfen.
// Die Abbuchung (PaymentIntent mit off_session) kommt mit M2 hinzu. Nie Kartennummer, Ablaufdatum oder CVC serverseitig: die Karte gibt der Nutzer
// ausschließlich in Stripe Elements im Browser ein (M1b), hier laufen nur Stripe-IDs.
import { DomainError } from "../teams";

/** created = Zeitpunkt des Ereignisses bei Stripe (Unix-Sekunden), fuer die Reihenfolge von Streit-Ereignissen */
export type ProviderEvent = { id: string; type: string; object: Record<string, unknown>; created?: number };
export type CardDisplay = { id: string; brand: string | null; last4: string | null };

export type ChargeStatus = "succeeded" | "requires_action" | "processing" | "failed";
export type ChargeResult = { id: string; status: ChargeStatus; failureCode: string | null };

export type RefundStatus = "succeeded" | "pending" | "failed";
/** failureCode "charge_disputed": Stripe verweigert die Erstattung, weil die Zahlung angefochten ist (Dispute); "charge_already_refunded": bei Stripe schon erstattet. */
export type RefundResult = { id: string; status: RefundStatus; failureCode: string | null };
/** Ein bei Stripe gefundener PaymentIntent (Suche nach Spiel und Nutzer aus den Metadaten). Alle Werte sind ungeprüfte Eingabe. */
export type FoundIntent = { id: string; status: ChargeStatus | "other"; amountCents: number | null; currency: string | null; customerId: string | null; failureCode: string | null };

export interface PaymentProvider {
  readonly name: "stripe" | "fake";
  /** Legt den Kunden an. Gleicher idempotencyKey liefert denselben Kunden. */
  createCustomer(input: { userId: string; email: string; idempotencyKey: string }): Promise<{ id: string }>;
  /** SetupIntent für eine Karte (usage off_session). Das clientSecret geht nur an den Nutzer selbst. */
  createSetupIntent(input: { customerId: string; userId: string; idempotencyKey: string }): Promise<{ id: string; clientSecret: string }>;
  /** Nur Anzeigedaten (Marke, letzte vier Ziffern). */
  retrievePaymentMethod(id: string): Promise<CardDisplay>;
  detachPaymentMethod(id: string): Promise<void>;
  /**
   * Bucht einen Betrag mit dem gespeicherten Zahlungsmittel ab (off_session, sofort bestätigt, EUR). Der idempotencyKey (je Spieler und Spiel) verhindert
   * eine zweite Belastung bei Wiederholung. Abgelehnte oder authentifizierungspflichtige Karten liefern ein Ergebnis mit id und Status, keinen Fehler;
   * ein Fehler (Netz, Stripe) bedeutet "Ergebnis unbekannt".
   */
  createPaymentIntent(input: { customerId: string; paymentMethodId: string; amountCents: number; idempotencyKey: string; metadata: { matchId: string; userId: string } }): Promise<ChargeResult>;
  /**
   * Erstattet eine Abbuchung auf die Karte (voller gezahlter Betrag, EUR). Der idempotencyKey (je Abbuchungszeile) verhindert eine zweite Erstattung bei Wiederholung.
   * Eine von Stripe abgelehnte Erstattung (z. B. charge_disputed) ist ein Ergebnis mit status failed; ein Fehler (Netz, Stripe) bedeutet "Ergebnis unbekannt".
   */
  createRefund(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string; metadata: { matchId: string; userId: string; chargeId: string } }): Promise<RefundResult>;
  /**
   * Sucht PaymentIntents zu Spiel und Nutzer (Metadaten). Für Abbuchungen mit unbekanntem Ausgang: gibt es bei Stripe einen PaymentIntent, den wir nicht kennen?
   * Die Suche von Stripe ist verzögert konsistent: eine leere Antwort beweist nur etwas, wenn der Versuch schon eine Weile zurückliegt.
   */
  findPaymentIntents(input: { matchId: string; userId: string }): Promise<FoundIntent[]>;
  /**
   * Bricht einen offenen PaymentIntent ab (vor einem neuen Versuch im Nachzahlfenster: nie zwei offene Versuche). Ist er schon abgebrochen: canceled.
   * Hat er in der Zwischenzeit geklappt: succeeded (dann wird verbucht statt neu gesendet). Netzfehler werfen.
   */
  cancelPaymentIntent(paymentIntentId: string): Promise<{ status: "canceled" | "succeeded" | "other" }>;
  /**
   * Liest einen BEKANNTEN PaymentIntent (konsistent, anders als die Suche). null = bei Stripe nicht vorhanden. Fuer den Neuversuch im Nachzahlfenster:
   * die Suche ist verzoegert konsistent und bleibt unbekannten Ausgaengen (unknown_outcome) vorbehalten.
   */
  retrievePaymentIntent(paymentIntentId: string): Promise<FoundIntent | null>;
  /** Zahlungsstreit samt Balance-Transactions (M4a); null, wenn es ihn nicht gibt. Netzaufruf, nie in einer Transaktion. Das Ergebnis ist ungepruefte Eingabe (siehe dispute-parse.ts). */
  retrieveDispute(disputeId: string): Promise<Record<string, unknown> | null>;
  /**
   * Liest einen BEKANNTEN PaymentIntent samt clientSecret (nur fuer die 3-D-Secure-Freigabe des Betroffenen, M3c-1c). Das Secret geht nie in Logs, Audit, URLs oder Seiten-Props,
   * nur als Ergebnis der Server-Aktion an den Betroffenen. null = bei Stripe nicht vorhanden.
   */
  retrievePaymentIntentSecret(paymentIntentId: string): Promise<{ intent: FoundIntent; clientSecret: string } | null>;
  /** Echte Stripe-Gebühr der Zahlung in Cent (aus der balance_transaction), oder null, wenn noch nicht verfügbar. Nie geschätzt. */
  retrieveChargeFee(paymentIntentId: string): Promise<number | null>;
  /** Ist das Zahlungsmittel bei Stripe noch nutzbar: existiert, gehört noch zu diesem Kunden (nicht gelöst) und ist nicht abgelaufen? */
  isPaymentMethodUsable(id: string, customerId: string): Promise<boolean>;
  /** Prüft die Signatur des rohen Bodys und liefert das Ereignis. Wirft WebhookSignatureError bei falscher oder fehlender Signatur. */
  constructWebhookEvent(rawBody: string, signature: string | null): ProviderEvent;
}

/** Stripe meldet: derselbe Idempotenz-Schlüssel wurde mit anderen Parametern benutzt (z. B. Zahlungsmittel oder Kunde geändert). Kein unbekannter Ausgang: die Zeile ist nicht mehr sendbar. */
export class PaymentIdempotencyError extends Error {
  constructor() {
    super("Idempotenz-Konflikt");
    this.name = "PaymentIdempotencyError";
  }
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
