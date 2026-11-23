// ENTWURF, Rechtsprüfung (Backlog, Rechtsliste): Beschriftung der Knöpfe, die eine Zahlungspflicht auslösen (§ 312j Abs. 3 BGB, "Button-Lösung"), und die Hinweiszeilen dazu. KEINE endgültige Rechtsaussage.
//
// EINE Stelle für den Wortlaut: alle Zahlungsknöpfe (Lobby, Karte, Anteil übernehmen, Turnier) nutzen NUR diese Konstanten; ein Test (tests/unit/zahlungspflicht-texte.test.ts) sperrt Streutext in den Komponenten.
// Ändert die Rechtsprüfung den Wortlaut, wird er hier geändert (und nur hier).
//
// Der Gesetzeswortlaut ist "zahlungspflichtig bestellen" oder eine entsprechend eindeutige Formulierung. Beide Varianten stehen hier als Entwurf; aktiv ist "zahlungspflichtig zusagen" bis zur Rechtsprüfung.
// Keine Logik-, Preis- oder Zahlungsänderung: die Konstanten ersetzen nur Beschriftungen.
export const ZAHLUNGSPFLICHT_VARIANTEN = { zusagen: "zahlungspflichtig zusagen", bestellen: "zahlungspflichtig bestellen" } as const;
export type ZahlungspflichtVariante = keyof typeof ZAHLUNGSPFLICHT_VARIANTEN;
export const ZAHLUNGSPFLICHT_AKTIV: ZahlungspflichtVariante = "zusagen";
export const ZAHLUNGSPFLICHT = ZAHLUNGSPFLICHT_VARIANTEN[ZAHLUNGSPFLICHT_AKTIV];

/** Knopfname = sichtbarer Text (kein abweichendes aria-label): Aktionswort, Gedankenstrich, Formel. Der Aktionswort-Anfang bleibt erhalten ("Ich bin bereit", "Bereit", "Anteil übernehmen"). */
export const mitZahlungspflicht = (aktion: string, variante: ZahlungspflichtVariante = ZAHLUNGSPFLICHT_AKTIV) => `${aktion} – ${ZAHLUNGSPFLICHT_VARIANTEN[variante]}`;

export const ZP = {
  /** Spiel: "Ich bin bereit" (der verbindliche Moment: Platz zugesagt, Anteil wird zur Frist abgebucht). Ohne Zahlung (Gratis, kostenloses Spiel) bleibt der schlichte Text. */
  gameReady: mitZahlungspflicht("Ich bin bereit"),
  gameReadyFree: "Ich bin bereit",
  gameNotReady: "Nicht mehr bereit",
  /** Turnier (Captain): Team bereit melden. */
  tournamentReady: mitZahlungspflicht("Bereit"),
  tournamentReadyFree: "Bereit",
  /** Spiel: letzte Bestätigung der Captains (M3 PR 1, #281): Preis bestätigen UND zahlungspflichtig zusagen. Wortlaut unverändert (E2E karte-finanzen, privatspiel), nur an einer Stelle. */
  finalConfirm: `Ja, mein Team ist komplett: Preis bestätigen und ${ZAHLUNGSPFLICHT}`,
  /** Dasselbe OHNE Zahlungspflicht (Gratisspiel, Zahlungen aus/pausiert, Altmodell): bisheriger Text, keine Zusage und keine Abbuchungszeile. */
  finalConfirmFree: "Ja, mein Team ist komplett: Spiel bestätigen",
  finalHeading: "Preis bestätigen und Zahlung zusagen",
  finalHeadingFree: "Letzte Bestätigung der Captains",
  /** Hinweis in der Lobby, solange der Preis fehlt (null): kein "es wird nichts abgebucht"-Versprechen, der Preis kann noch kommen. */
  priceUnknown: "Der Preis steht noch nicht fest. Du siehst ihn vor der Zusage.",
  gameFree: "Dieses Spiel ist kostenlos. Es wird nichts abgebucht.",
  /** Anteil eines Mitspielers übernehmen (Spiel und Turnier): Bestätigungsknopf im Dialog; der Auslöser (trigger) öffnet nur den Dialog. */
  coverTrigger: "Anteil übernehmen",
  coverConfirm: mitZahlungspflicht("Anteil übernehmen"),
  /** Karte hinterlegen: die Zustimmung (Mandat) ist die Erlaubnis zur späteren Abbuchung; jetzt wird nichts abgebucht. */
  cardSave: "Karte hinterlegen und Abbuchung erlauben",
  cardChange: "Karte ändern und Abbuchung erlauben",
  cardUseStored: "Karte für diese Lobby nutzen und Abbuchung erlauben",
  cardOther: "Andere Karte hinterlegen",
  /** Bank-Freigabe (3-D-Secure) einer bestehenden Zahlung: kein eigener Vertragsschluss, Text unverändert. */
  authorize: "Zahlung freigeben",
  /** Mittelbare Knöpfe (keine Abbuchung ohne Karte, Mandat und Bereit): Hinweiszeile statt Knopftext. */
  /** Turnier, Hinweis unter "Bereit" im pausierten Kartenfluss: die Pause nicht verschweigen. */
  tournamentReadyPause: "Zahlungen sind gerade pausiert: Bereit ist erst nach der Pause möglich.",
  hintLater: "Spielst du mit Bezahlung, brauchst du danach eine Karte. Dein Anteil wird erst zur Frist abgebucht, bis dahin nicht.",
  hintOrganizer: "Jeder Spieler zahlt seinen eigenen Anteil per Karte, abgebucht wird erst zur Frist.",
} as const;

/**
 * Betragszeile unter dem Knopf: nur wo der Betrag ohne Logikänderung vorliegt (Lobby: dieselbe Rechnung wie die Abbuchung, Seite berechnet sie mit shareDivisor und chargeAmount).
 * `fest` = Anteil ist mit dem zweiten Bereit fixiert; vorher nur aktuell (der Anteil ändert sich, bis beide Captains den Preis bestätigen; mindestens 0,50 Euro je Abbuchung). Wortlaut nach w4 R-T365: nie "wird abgebucht: X" vor dem Festpreis.
 */
export const betragszeile = (betragText: string | null, fest: boolean) =>
  betragText === null
    ? "Dein Anteil steht noch nicht fest. Er wird erst zur Frist abgebucht."
    : fest
      ? `Danach wird dein Anteil von ${betragText} zur Frist abgebucht.`
      : `Aktuell ${betragText}: der Anteil ändert sich, bis beide Captains den Preis bestätigen. Abgebucht wird erst zur Frist.`;

/** Turnier, Hinweis unter "Bereit" im pausierten Kartenfluss (Zahlungen pausiert): die Pause nicht verschweigen. */

/** Zeile unter dem letzten Bestätigen (Captains): Betrag aus payments.chargeCents (derselbe Betrag wie am Bereit-Knopf), nie "wird abgebucht: X" vor dem Festpreis. */
export const finalConfirmHinweis = (betragText: string | null) => (betragText ? `Abgebucht wird erst zur Frist: aktuell ${betragText}.` : "Abgebucht wird erst zur Frist.");

/** Turnier, "Bereit" des Captains: die Formel nur im Kartenfluss mit Preis und NICHT im pausierten Kartenfluss (dort ist Bereit ohnehin gesperrt). Rein rechnend (testbar). */
export const tournamentReadyLabel = (o: { cardMode: boolean; free: boolean; paused: boolean }) => (o.cardMode && !o.free && !o.paused ? ZP.tournamentReady : ZP.tournamentReadyFree);
