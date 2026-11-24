/** Angaben zum Betreiber kommen aus der Umgebung, damit nichts Erfundenes im Code steht. */
export function operator() {
  const name = process.env.OPERATOR_NAME?.trim();
  const address = process.env.OPERATOR_ADDRESS?.trim();
  const email = process.env.OPERATOR_EMAIL?.trim();
  return { name, address, email, complete: Boolean(name && address && email) };
}

/**
 * Platzhalter für Rechtstexte (Go-live): Fehlt eine Betreiberangabe, steht an ihrer Stelle ein klar markierter Platzhalter in eckigen Klammern (nie ein erfundener Wert).
 * Der Betreiber ersetzt sie über OPERATOR_NAME, OPERATOR_ADDRESS und OPERATOR_EMAIL; rechtliche Angaben ohne Umgebungswert (Steuer-ID, Aufsichtsbehörde) trägt er nach der Rechtsprüfung ein.
 */
export const PLATZHALTER = {
  name: "[PLATZHALTER: Name oder Firma des Betreibers]",
  address: "[PLATZHALTER: Anschrift des Betreibers (Straße, Postleitzahl, Ort)]",
  email: "[PLATZHALTER: E-Mail-Adresse des Betreibers]",
  steuerId: "[PLATZHALTER: Umsatzsteuer-Identifikationsnummer, falls vorhanden]",
  aufsicht: "[PLATZHALTER: zuständige Datenschutzaufsichtsbehörde und, falls vorhanden, Datenschutzbeauftragter]",
  streit: "[PLATZHALTER: Angabe zur Verbraucherstreitbeilegung, nach Rechtsprüfung durch den Betreiber]",
} as const;

/** Die Betreiberangaben je Feld: Wert oder Platzhalter (`platzhalter` = true, wenn der Platzhalter steht). */
export function operatorFelder() {
  const op = operator();
  return {
    name: { text: op.name || PLATZHALTER.name, platzhalter: !op.name },
    address: { text: op.address || PLATZHALTER.address, platzhalter: !op.address },
    email: { text: op.email || PLATZHALTER.email, platzhalter: !op.email },
    complete: op.complete,
  };
}

/** "Mit Apple anmelden" ist eingeschaltet (Schalter APPLE_LOGIN_ENABLED=1; Name mit der Auth-Konfiguration abgleichen). Nur für Texte, nicht für die Anmeldung selbst. */
export function appleLoginAktiv(): boolean {
  return process.env.APPLE_LOGIN_ENABLED === "1";
}
