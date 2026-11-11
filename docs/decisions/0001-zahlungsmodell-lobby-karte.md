# 0001 – Zahlungsmodell der Lobby: Karte hinterlegen, einmal abbuchen (B) statt Vorab-Zahlung aus Guthaben (A)
Status: akzeptiert (G1 durch den Nutzer, 2026-11-12)
Datum: 2026-11-11

## Kontext und Problem
Heute zahlen Spieler ihren Anteil beim Beitritt aus dem internen Guthaben (Parken, später Escrow E10). Ändert sich die Spielerzahl, folgen Rück- und Nachforderungen (`recalcShares`, `fixShare`, `reserveShare` in `src/server/wallet.ts`). Echtes Geld parken verlangt einen Zahlungsdienstleister (GO-LIVE-AUDIT E3). Nutzerwunsch: Beim Beitritt nur ein Zahlungsmittel hinterlegen, der Anteil bleibt bis zum Fixieren frei änderbar, 48 h vor Anstoß einmal berechnen und einmal abbuchen (weniger Vorlauf: sofort). "Bereit" heißt "Zahlungsmittel hinterlegt".

## Betrachtete Optionen
- A: Vorab-Zahlung aus Guthaben (heute) mit Escrow-Konto.
- B: Zahlungsmittel hinterlegen (Stripe SetupIntent), einmal abbuchen (PaymentIntent, off-session) zur Frist; Nachzahlfenster 1 bis 2 h, dann Nachrücker oder Absage.
- C: B plus Kartenreservierung (Hold) nur bei höchstens 7 Tagen Vorlauf (Standard-Haltezeit etwa 7 Tage, verlängerbar bis etwa 30 Tage je nach Kartennetz und Preismodell; Stripe-Doku "extended authorization").

## Entscheidung (Vorschlag)
Gewählt: B, ohne Hold. C bleibt ein späterer Schalter, wenn die Quote gescheiterter Abbuchungen über etwa 5 % liegt oder Hallen eine Zahlungsgarantie verlangen. Nachtrag des Nutzers (2026-11-11): Das interne Guthaben fällt ganz weg (Soccaz ist nicht live, nur Testdaten): Erstattung immer auf die Karte, Stripe-Gebühr trägt Soccaz (Provision inklusive Zahlungsabwicklung), keine Promo-Codes, Rabatte oder Treueprogramme. Das ersetzt die Council-Empfehlung "Guthaben bleibt", die auf einem Live-Bestand an Guthaben und auf E3 bis E6 beruhte; mit Testdaten und ohne Live-Betrieb entfällt der Grund. Details und Reihenfolge: Vertrag 012 v2.

Begründung (Belege):
- B bucht einmal zur Frist statt Geld zu bewegen und zu korrigieren (`wallet.ts:181-262`); Fristlogik, Anteilsrechnung, Hauptbuch und Absage/Erstattung bleiben (`src/lib/deadlines.ts:36-72`, `wallet.ts:124-139`, `ledger.ts:41,105`, `scheduled.ts:107`).
- Das Parken von Fremdgeld entfällt weitgehend, das entlastet E3 bis E6; Soccaz bucht kurz vor dem Spiel ab.
- Stripe-Ablauf (Quellen: docs.stripe.com/payments/setup-intents, support.stripe.com "Saving payment methods ... SCA"): Karte beim Speichern authentifizieren (SetupIntent, `usage: off_session`), später PaymentIntent mit `off_session: true`; die Abbuchung kann trotzdem `authentication_required` liefern, dann muss der Spieler zurückgeholt werden.
- Stripe Connect (Quellen: docs.stripe.com/connect/charges-transfers, /connect/destination-charges): Karte wird bei der Plattform belastet, Auszahlung an die Halle per Transfer (getrennte Belastungen und Transfers oder Destination Charges); Provision durch geringeren Transfer. Vereinbar mit B. Gebühren je Abbuchung: Stripe-Gebühren werden in Vertrag 012 als Kostenfrage geführt, Tarif ist vom Nutzer mit Stripe zu klären (nicht im Repo belegt).

## Konsequenzen
Gut: weniger Geldbewegungen, kein Nachforderungs-Ping-Pong, planbarer Zahlungsdienstleister, Hauptbuch bleibt kompatibel.
Schlecht: "Bereit" ist kein Zahlungsnachweis; Abbuchung kann scheitern (leere Karte, 3-D-Secure, Ablauf) → Zustandsautomat, Nachzahlfenster, Nachrücker; Mandatstext und Kunden-ID müssen gespeichert werden (DSGVO, Export/Löschung); Chargebacks (Webhook meldet heute nur an Admin, `webhooks/stripe/route.ts:47-52`); Rückerstattung nach Abbuchung läuft immer über Stripe auf die Karte (Gebühr der Abbuchung bleibt bei Soccaz), Dispute 20 €; zwei Zahlwege im Übergang (Altspiele nach A).
Wann neu prüfen: Quote gescheiterter Abbuchungen über etwa 5 %; Hallen verlangen Garantie (dann C); Antworten Steuerberater (E4) oder Stripe-Connect-Onboarding (E6) weichen ab.

## Council-Stimmen (kurz)
Antwort 1: B in zwei Stufen (erst B ohne Hold), kleinste Migration über zweites Flag `payModel` neben `legacyShareModel` (`drizzle/0034`), Turniere später umstellen, Guthaben bleibt. Antwort 2: B nur mit klarem Ausfallpfad, Rundungsregel und Mandatstext; C erst bei Messwerten; Guthaben nicht entfernen, bevor E3 bis E6 geklärt sind; kein belegtes Sicherheitsrisiko im heutigen Code. Antwort 3: B als Zielmodell, Guthaben bleibt optionale Quelle, C kein Teil des Modells. Einigkeit: B ohne Hold, Guthaben bleibt, C später. Nicht belegt (Annahme): Wartelisten-Nachrücken in `lobby.ts`.
