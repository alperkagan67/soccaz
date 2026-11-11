# 012 – Zahlung in der Lobby: Karte hinterlegen, einmal abbuchen, kein Guthaben
Status: Freigegeben (G1 durch den Nutzer, 2026-11-11)
Version: 3 (Korrektur bei der Freigabe 2026-11-11: Auch im Turnier ist die Zusage der Halle Buchungsbedingung (wie in 011), weil das Geld direkt an die Halle geht; v3 2026-11-11: Gesamtnachtrag des Nutzers: Provision 10 % Startwert ohne Untergrenze, Turnier ohne Veranstalter-Konto, Anteil an der Hallenmiete direkt an die Halle, Konto `tournament` entfällt, E-Geld entfällt, Werkzeuge im Backlog; davor v2 2026-11-11: Antworten des Nutzers eingearbeitet: Erstattung immer auf die Karte, Stripe-Gebühr trägt Soccaz, Guthaben fällt ganz weg, "Anteil übernehmen", Nachzahlfenster, Testreihenfolge)

## Ziel
Beim Beitritt zu Teamspiel, Privatspiel oder Turnier hinterlegt der Spieler nur eine Karte (Zahlungsmittel); es wird nichts abgebucht. Der Anteil darf sich bis zum Fixieren frei ändern. Zur Frist (Buchung; 48 Stunden vor Anstoß, bei weniger Vorlauf sofort) wird der Endanteil einmal abgebucht. "Bereit" heißt "Karte hinterlegt", nicht "bezahlt". Erstattungen gehen immer auf die Karte. Es gibt kein internes Spielerguthaben mehr: Bezahlt wird nur per Stripe; keine Promo-Codes, keine Rabatte, kein Treueprogramm. Der 10er-Bonus ist die Provision der Halle an Soccaz und kein Vorteil für Spieler. Ersetzt in 006 und 008 den Zahlungsfluss; Frist-, Alles-oder-nichts-, Zusage- und Tausch-Regeln bleiben. Grundlage: ADR 0001.

## Nutzer und Rollen
Spieler (hinterlegt Karte, wird abgebucht), Captain ("Bereit"), Veranstalter, Admin 1 (Absage, Erstattung, Chargebacks, Kosten), Platform-Admin.

## Entscheidungen (vom Nutzer, 2026-11-11, über den Planer)
- Modell B "Karte hinterlegen, einmal abbuchen", ohne Hold (Kartenreservierung).
- Erstattung geht immer auf die Karte.
- Die Stripe-Gebühr trägt Soccaz und bleibt bei Erstattungen hängen. Die Provision pro Halle muss sie decken ("Provision inklusive Zahlungsabwicklung"). Admin 1 stellt sie je Halle ein (Vertrag 009), 10 % Startwert, keine feste Untergrenze. Der Admin-Bereich zeigt je Halle und je Spiel: Provision, Stripe-Gebühren, Rest; Warnung, wenn die Provision die echten Gebühren (Karte, 0,25 € je Spieler, Auszahlung) nicht deckt oder eine Halle im Minus liegt (Teil von Vertrag 009).
- Turnier: Kein Stripe-Konto für den Veranstalter. Die Spieler zahlen ihren Anteil an der Hallenmiete; das Geld geht direkt an die Halle abzüglich Provision. Der Veranstalter organisiert nur und bekommt kein Geld. Auch im Turnier ist die Zusage der Halle Buchungsbedingung (falls die Halle einen Zugang hat, Vertrag 011): Das Bracket entsteht erst, wenn alle Teams voll bezahlt und bereit sind und die Halle zugesagt hat; ohne Zusage bis zur Frist fällt das Turnier aus und alle werden auf die Karte erstattet. Keine Preisgelder aus Einsätzen vorerst. Die Veranstalter-Auszahlung (`tournaments.ts:558-559`) und das Hauptbuch-Konto `tournament` entfallen.
- Werkzeuge (Backlog, bremsen den Zahlungs-Umbau nicht): Stripe CLI (Nutzer installiert selbst), Stripe-Skills, Review-Skills, claude-security vor Geld-PRs und Go-live, CodeQL in der CI. Details im Backlog-Eintrag.
- Kein Guthaben mehr (Soccaz ist nicht live, nur Testdaten): kein Auslaufen, keine Auszahlung, keine Frist. Promo-Codes, Rabatte, Treueprogramme gibt es nicht. Alle Stellen in 006, 008, 009, 010, 011 werden bereinigt.
- "Anteil übernehmen": Lobby-Ampel grün (Karte hinterlegt) oder rot (noch nicht). Neben roten Spielern ein Knopf: Wer ihn drückt, übernimmt den Endanteil dieses Spielers und wird zur Frist (Buchung) dafür belastet (nicht sofort). Möglich, bis der Countdown "Lobby schließt" abläuft. Bei Absage geht die Erstattung an den Übernehmer. Die bestehende "Zahlung füreinander" (Turnier, PR #36) wird wiederverwendet.
- Abbuchung scheitert: Nachzahlfenster 2 Stunden, bei Sofortbuchung höchstens bis 1 Stunde vor Anstoß; danach Nachrücker von der Warteliste, sonst Absage mit Erstattung.
- Reihenfolge: Nicht auf Messwerte im Echtbetrieb warten. Erst Teamspiel (und Privatspiel) umstellen und im Stripe-Testmodus alle Fälle durchspielen (Karte hinterlegen, Abbuchung zur Frist (Buchung), abgelehnte Karte mit Nachzahlfenster, Authentifizierung nötig, "Anteil übernehmen", Erstattung auf die Karte, Sofortbuchung). Sind diese E2E-Tests grün, direkt danach das Turnier umstellen, dann das Guthaben komplett entfernen. Bis zur Turnier-Umstellung bleibt das Guthaben technisch im Code (Testdaten), in Lobbys aber nicht mehr sichtbar.

## Annahmen (Orchestrator-Vorschlag nach Council, ADR 0001)
- Technik: Stripe SetupIntent (`usage: off_session`, Karte wird beim Hinterlegen authentifiziert, Mandatstext und Zeitpunkt werden gespeichert), Abbuchung als PaymentIntent mit `off_session: true`, Idempotency-Key je Spieler und Spiel; Ergebnis über Webhook (`setup_intent.succeeded`, `payment_intent.succeeded`, `payment_intent.payment_failed`). Keine Kartendaten im Repo, nur Stripe-IDs.
- Zustand je Teilnehmer: `card_ready`, `charge_pending`, `charged`, `failed` (`charge_due_at`, `grace_until`, `covered_by_user_id` für "Anteil übernehmen").
- Scheitern (`authentication_required` oder Ablehnung): Push und Mail mit Link zum Nachzahlen (Karte wechseln, 3-D-Secure im Browser). Nach dem Fenster gilt der Spieler als ausgefallen: Platz geht an den Ersten der Warteliste, der sofort abgebucht wird; ohne Nachrücker Absage und Erstattung. Die Lobby bleibt bis zum Ende des Fensters offen; Captain und Spieler sehen "Zahlung ausstehend bei {Initialen}" (Gäste nur Initialen). Entschieden (2026-11-11): Das Nachzahlfenster ist min(2 h ab Fehler, Anstoß minus 1 h); bei weniger als 1 h Restzeit gibt es kein Fenster, es geht direkt zu Nachrücker oder Absage. Nachrücker-Reihenfolge = Warteliste (nicht eingeteilte Teilnehmer MIT Karte) nach Beitrittszeit; der Captain kann sie nicht ändern. Der Nachrücker wird sofort abgebucht; scheitert er, kommt der Nächste, höchstens 3 Versuche, dann Absage.
- Rundung: Anteil = aufgerundet Miete ÷ Spielerzahl (`shareCents`); der Überschuss (< Spielerzahl Cent) bleibt bei Soccaz.
- Mindestbetrag: Abbuchung je Spieler = max(Endanteil, 0,50 EUR) bei Miete > 0 (AC-19); der Überschuss bleibt bei Soccaz, kostenlose Spiele werden nicht abgebucht.
- Erstattung: Stripe-Refund auf die Zahlungsmethode, in Höhe des je Spieler gezahlten Betrags (inklusive auf 0,50 EUR angehobenem Mindestbetrag und Rundungsanteil); bei Absage bleibt kein Plattform-Überschuss. Entschieden (2026-11-11): Stripe erstattet die Gebühr der Abbuchung NICHT, Soccaz trägt sie (Stripe-Tarif vor Go-live prüfen, G13-012).
- Umschaltung nach Spielart: Teamspiel und Privatspiel zuerst (M1 bis M4), Turnier danach (M5); vorhandene Testspiele dürfen zurückgesetzt werden (Soccaz ist nicht live). Kein dauerhaftes Doppelmodell, daher kein Flag `pay_model`.
- Hauptbuch (`ledger_entries`) bleibt als Buchhaltung: Karte (Stripe) → Lobby-Geld → Halle/Provision; Erstattung als Gegenbuchung. E-Geld (E4/E5) entfällt, weil kein Spielerguthaben mehr existiert; offen für den Anwalt: Geld liegt zwischen Abbuchung und Auszahlung bei Stripe (Stripe Connect, E3 bis E6).
- Escrow-Konto (E10) entfällt für Lobbys.

## Kosten (Stripe Deutschland, Stand stripe.com/de am 2026-11-11, vor Umsetzung nochmal prüfen)
- Karten aus dem EWR: 1,5 % + 0,25 € je Abbuchung; Premium-Karten 2,8 % + 0,25 €; UK-Karten 2,5 % + 0,25 €; andere internationale Karten 3,15 % + 0,25 €; SEPA-Lastschrift 0,35 €; Dispute 20 € Gebühr; Währungsumrechnung +2 %.
- Stripe Connect (wenn die Plattform die Preise bestimmt): 2 € je monatlich aktivem verbundenem Konto (Halle mit Auszahlung) plus 0,25 % + 0,10 € je Auszahlung.
- Rechenbeispiel: Halle 100 €, 10 Spieler → 10 € je Spieler.
  - Standardkarte: je Spieler 0,15 + 0,25 = 0,40 €, zusammen 4,00 € (4,0 %); Auszahlung 0,25 + 0,10 = 0,35 €; zusammen 4,35 € (4,35 %) zuzüglich Anteil der 2 € Konto-Monatsgebühr.
  - Alle Premium-Karten: 0,28 + 0,25 = 0,53 € je Spieler, zusammen 5,30 €; mit Auszahlung 5,65 €.
  - Internationale Karten: 0,315 + 0,25 = 0,565 €, zusammen 5,65 €; mit Auszahlung 6,00 €.
  - Extremfall 22 Spieler, 100 € Halle, internationale Karten: 22 × 0,25 + 3,15 € = 8,65 €, mit Auszahlung 9,00 € (9 %). Gleichzeitig bleibt Stripe-Gebühr bei Erstattung hängen, und ein Dispute kostet 20 €.
- Folge: Eine Provision von 10 % deckt den Normalfall (etwa 4 bis 6 %) mit Reserve, im Extremfall (viele Spieler, internationale Karten) aber knapp. Die feste Gebühr von 0,25 € je Spieler macht große Gruppen und billige Hallen teurer. Entscheidung des Nutzers: 10 % Startwert, keine feste Untergrenze; der Admin-Bereich warnt (009), wenn die Provision die echten Gebühren nicht deckt oder eine Halle im Minus liegt.

## Nicht-Ziele
- Hold (Option C), Mischzahlung "Guthaben zuerst", Auszahlung an Hallen über Stripe Connect (E3 bis E6), Tarifverhandlung mit Stripe.
- Änderung der Frist-, Zusage- und Tausch-Regeln aus 006, 008 und 011.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Spieler tritt einer Lobby bei | Hinterlegt eine Karte (SetupIntent erfolgreich) | Status `card_ready`, nichts abgebucht, kein Ledger-Eintrag; Mandatstext und Zeitpunkt gespeichert | tests/integration/card-setup.test.ts |
| AC-2 | Kein Zahlungsmittel | "Bereit" wird versucht | Abgelehnt; mit Karte gelingt "Bereit" | tests/integration/card-setup.test.ts |
| AC-3 | Spielerzahl ändert sich vor dem Fixieren | Beitritt, Austritt oder Rauswurf | Anteil neu angezeigt, keine Geldbewegung | tests/integration/card-setup.test.ts |
| AC-4 | Vorlauf mindestens 48 h, Frist erreicht, alle `card_ready`, beide Captains bereit (und Zusage der Halle, falls Zugang) | Frist-Job läuft (auch doppelt) | Jeder wird genau einmal mit dem fixierten Endanteil abgebucht (Idempotency-Key je Spieler und Spiel), Hauptbuch ausgeglichen, Spiel gebucht | tests/integration/card-charge.test.ts |
| AC-5 | Vorlauf unter 48 h | Alle `card_ready`, beide Captains bereit | Sofortige Abbuchung wie AC-4 | tests/integration/card-charge.test.ts |
| AC-6 | Abbuchung scheitert (abgelehnt oder `authentication_required`) | Webhook `payment_failed` | Status `failed`, Push und Mail mit Nachzahl-Link, Nachzahlfenster = min(2 h ab Fehler, Anstoß minus 1 h) beginnt, Lobby bleibt offen; bei weniger als 1 h Restzeit gibt es kein Fenster (direkt Nachrücker oder Absage) | tests/integration/card-grace.test.ts |
| AC-7 | Spieler zahlt im Fenster nach | Neue Karte oder 3-D-Secure bestanden | Abbuchung gelingt, Status `charged`, Spiel gebucht, wenn alle gezahlt haben | tests/integration/card-grace.test.ts |
| AC-8 | Fenster abgelaufen, Warteliste nicht leer | Job läuft | Platz geht an den Ersten der Warteliste (nicht eingeteilte Teilnehmer mit Karte, nach Beitrittszeit; der Captain kann die Reihenfolge nicht ändern), der sofort abgebucht wird; scheitert er, kommt der Nächste, höchstens 3 Versuche, dann Absage (AC-9); Anteil und Fixierung unverändert | tests/integration/card-substitute.test.ts |
| AC-9 | Fenster abgelaufen, keine Nachrücker | Job läuft | Spiel automatisch abgesagt (System-Absage ohne Rollenprüfung, Ablauf: AC-21), alle bereits Abgebuchten per Stripe-Refund auf die Karte erstattet, je Spieler in Höhe des gezahlten Betrags (inklusive angehobenem Mindestbetrag und Rundungsanteil), kein Plattform-Überschuss; die Stripe-Gebühr wird nicht erstattet und bleibt bei Soccaz; Hauptbuch ausgeglichen | tests/integration/card-refund.test.ts |
| AC-10 | Webhook doppelt oder verspätet | `payment_intent.succeeded` | Einmal verbucht, keine doppelte Abbuchung | tests/integration/card-charge.test.ts |
| AC-11 | Dispute | `charge.dispute.created` | Konto `chargeback` gebucht, Admin 1 benachrichtigt, Spieler im Admin markiert | tests/integration/card-charge.test.ts |
| AC-12 | Lobby mit Spielern ohne Karte | Ampel und Knopf | Spieler mit Karte grün, ohne Karte rot; neben roten Spielern der Knopf "Anteil übernehmen". Für Dritte trägt die rote Ampel neutral „Zahlung ausstehend“ (Form und Wort, ohne Grund); nur der Betroffene und der Captain (bzw. Veranstalter) sehen „Abbuchung fehlgeschlagen“ (AC-20) | tests/e2e/payments.spec.ts |
| AC-13 | Spieler B übernimmt den Anteil von rotem Spieler A | Frist erreicht (Abbuchung) | B wird für A zusätzlich belastet, nicht sofort; bis zum Ablauf des Countdowns "Lobby schließt" möglich, danach abgelehnt; Eintrag `covered_by_user_id`; der Übernehmer braucht eine eigene Karte (Ampel grün); es entstehen zwei Posten (je mit dem Mindestbetrag); einmal je Platz, keine Kette | tests/integration/card-cover.test.ts |
| AC-14 | Übernahme, Spiel wird abgesagt | Erstattung | Erstattung geht je Posten an den Übernehmer (nicht an A); nach Ablauf des Fensters mit Nachrücker: Übernahme verfällt | tests/integration/card-cover.test.ts |
| AC-15 | Lobbys (Team, Privat; später Turnier) | Oberfläche und Texte | Kein Guthaben, keine Aufladung, keine Codes, keine Rabatte sichtbar; Texte nennen Karte | tests/e2e/payments.spec.ts |
| AC-16 | Nutzerkonto löschen oder exportieren | DSGVO-Anfrage | Stripe-Kunden-ID im Export; Löschung entfernt Kunde und Zahlungsmittel bei Stripe, Buchungsdaten bleiben anonymisiert | tests/integration/account.test.ts |
| AC-17 | Teamspiel im Stripe-Testmodus | Testkarten durchspielen (erfolgreich, abgelehnt, Authentifizierung nötig) | Alle Fälle aus AC-1 bis AC-14 grün | tests/e2e/payments.spec.ts |
| AC-18 | Alle Umstellungen fertig (M5) | Entfernen des Guthabens (M6) | Keine Aufladung, kein Wallet-Konto, keine Promo-Tabellen im Code; Hauptbuch bleibt ausgeglichen; Tests angepasst | tests/integration/ledger.test.ts |
| AC-19 | Mindestbetrag: Miete > 0, Endanteil unter 0,50 EUR (Abbuchung, M2) | Abbuchung zur Frist | Abbuchungsbetrag je Spieler = max(Endanteil, 0,50 EUR); der Überschuss bleibt bei der Plattform (wie der Rundungsüberschuss, Hauptbuch ausgeglichen); kostenlose Spiele (Miete 0) werden nicht abgebucht und nicht angehoben. Anzeige und Mandatstext nennen „Mindestbetrag 0,50 EUR“ (Soll-Wortlaut; die Mandatstext-Konstante im Code passen worker-1/2 an) | tests/integration/card-run.test.ts |
| AC-20 | Abbuchung eines Spielers ist fehlgeschlagen (Status `failed`, M3) | Lobby-Ansicht von Betroffenem, Captain (bzw. Veranstalter) und allen anderen | Betroffener und Captain (bzw. Veranstalter) sehen „Abbuchung fehlgeschlagen“ mit dem Nachzahl-Weg; alle anderen sehen nur die neutrale rote Ampel „Zahlung ausstehend“ (Form und Wort) und keinen Grund; der Nachrücker-Hinweis ist neutral formuliert (kein Hinweis auf eine fehlgeschlagene Abbuchung); der Grund ist auch in Seitenaufrufen, Antworten und Benachrichtigungen an Dritte nicht enthalten (Datenschutz) | tests/integration/card-charge.test.ts, tests/e2e/payments.spec.ts |
| AC-21 | Absage eines Spiels mit Abbuchungen (M3) | Absage durch Berechtigte | Nach der ersten Abbuchung nur durch Admin 1 (nach 009 die Rolle `owner`; Admin 2, Rolle `admin`, kann nur vorschlagen), ausgenommen die automatische Absage nach AC-9 (System, ohne Akteur und ohne Rollenprüfung); der Captain nur VOR der ersten Abbuchung. Stand heute prüft `adminCancelMatch` (PR 83) `users.role === 'admin'`, weil `owner` im Schema noch fehlt (Backlog 48). Die Absage ist erst abgeschlossen (`cancelled`), wenn alle erfolgreichen Abbuchungen erstattet sind (`cancel_requested_at`, Phasen 1 bis 4); Abbuchungen mit unbekanntem Ausgang werden per Stripe-Suche aufgelöst, späte erfolgreiche Abbuchungen automatisch erstattet | tests/integration/card-refund.test.ts |

## Meilensteine (seriell, Schema-Änderungen nie parallel, security-reviewer Pflicht)
- M1: Stripe-Kunde, Zahlungsmittel, SetupIntent, Webhook-Events, Mandat, "Bereit" = Karte, Ampel (AC-1, 2, 3, 12, 15 teilweise)
- M2: Abbuchungs-Job, Idempotenz, Hauptbuch, Mindestbetrag (AC-4, 5, 10, 19)
- M3: Scheitern, Nachzahlfenster, Nachrücker, Absage, "Anteil übernehmen", Sichtbarkeit des Scheiterns (AC-6, 7, 8, 9, 13, 14, 20, 21)
- M4: Dispute, DSGVO, E2E im Stripe-Testmodus für Team- und Privatspiel (AC-11, 16, 17)

M3-Anforderungen aus den Reviews (zusätzlich zu den AC; Backlog 42, 46, 47):
- `unknown_outcome` (Ausgang unklar) per Stripe-Suche auflösen, nicht raten.
- Zweiter erfolgreicher PaymentIntent zur selben Zeile: Abgleich und Erstattung (die Zeile bleibt an den ersten PI gebunden).
- Absage mit Stripe-Refund; die Sperre bei Abbuchungszeilen dafür lockern.
- Teil-Erfolg und Nachzahlfenster (einzelne Spieler gebucht, andere ausstehend).
- Zeilen `after_start` (Anstoß schon vorbei) und eine Admin-Liste dafür.
- Nachzahl-Neuversuch nie mit neuem Schlüssel, ohne vorher bei Stripe zu suchen (`attempt_expired`).
- Parameter-Mismatch (`StripeIdempotencyError`) behandeln.
- M5: Turnier auf dasselbe Muster (direkt nach grünen E2E aus M4)
- M6: Guthaben komplett entfernen (AC-15 ganz, AC-18); Umfang gemäß Schätzung in der Backlog-Beschreibung

## Betroffene Bereiche
`src/server/payments.ts`, `src/server/wallet.ts` (`reserveShare`, `recalcShares`, `fixShare` entfallen im Lobby-Pfad), `src/server/scheduled.ts`, `src/server/lobby.ts`, `src/server/tournaments.ts`, `src/server/ledger.ts` (Konten), `src/server/finance.ts`, `src/server/promo.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/lib/deadlines.ts`, `src/app/app/guthaben`, `src/app/admin/codes`, Lobby-Oberfläche, `src/db/schema.ts`, Tests. Migrationen additiv bzw. am Ende (M6) entfernend, GO-LIVE-AUDIT.

## Umfang der Guthaben-Entfernung (Schätzung aus einer Code-Zählung, nicht gemessen)
- Das Wallet ist das Zahlungs-Rückgrat: Spielanteil, Turnier-Einsatz und Erstattung laufen über `debitWallet`/`creditWallet` im Hauptbuch. Nur die Aufladung zu streichen reicht nicht.
- Etwa 60 Dateien mit Treffern in Code und Tests (ohne Doku und Migrations-Snapshots): Schema und Migration (5 Dateien), Server (17 Dateien, rund 2.400 Zeilen), Oberfläche (15 Dateien, rund 900 Zeilen), Tests (18 Dateien plus 2 Seed-Skripte, rund 5.000 Zeilen betroffen, fast alle setzen ein aufgeladenes Wallet als Fixture voraus). Gesamtaufwand rund 12 bis 18 Task-Tage, davon etwa 7 bis 10 in M6 (Entfernen), der Rest in M1 bis M5.
- Ganz löschen: `wallet-actions.ts`, `promo.ts`, `promo-rules.ts`, `app/guthaben`, `admin/codes`, Wallet-Tests und `payments.spec.ts` (neu schreiben). Umbauen: `wallet.ts`, `payments.ts`, `ledger.ts`, `finance.ts`, `lobby.ts`, `tournaments.ts`, `admin-finance-actions.ts`, Header und Lobby-Oberfläche.
- Riskanteste Stellen: (1) `wallet.ts` `reserveShare`/`fixShare`/`recalcShares`/`settleMatch` (entfallen im Lobby-Pfad), (2) Konten und Guards im Hauptbuch (`drizzle/0007`), Buchhaltung 009 hängt am Konto `wallet`, (3) Zahlungsfluss ohne Wallet (Races, Zahlung ohne Platz), (4) Turnier-Einsatz, Erstattung und eventuelle Gutschriften aus dem Turnier (zu prüfen: gibt es Preisgelder? Ohne Wallet gäbe es keinen Auszahlungsweg), (5) Postgres-Enum-Werte lassen sich nicht einfach löschen; bestehende Ledger-Historie ist aufbewahrungspflichtig (archivieren statt droppen; Testdaten dürfen zurückgesetzt werden).
- Dev-Provider und E2E-Fixtures (`tests/e2e/helpers-db.ts`) werden durch Stripe-Testmodus bzw. einen Mock ersetzt; Benachrichtigungen verlinken heute auf `/app/guthaben`.
- Rechtstexte (AGB, Widerruf, Erstattung) werden juristisch geprüft (GO-LIVE-AUDIT).

## Risiken und Randfälle
- Ausfall erst nach der Hallenbuchung: Alles-oder-nichts, Nachrücker oder Absage mit Erstattung.
- 3-D-Secure ohne Spieler: Nachzahl-Link ist Pflicht; Quote nicht gemessen.
- Kartenablauf zwischen Beitritt und Frist: Prüfung bei "Bereit" und Erinnerung vor der Frist.
- Job oder Webhook doppelt: Idempotency-Key, Zeilensperre auf dem Spiel.
- Chargeback "nicht autorisiert": Mandatstext, Zeitpunkt und Gerätedaten speichern.
- Nachzahlfenster kollidiert mit dem 1-h-Abbruch: Fenster endet spätestens 1 h vor Anstoß.
- "Anteil übernehmen": Übernehmer scheitert selbst bei der Abbuchung: dann zählt A als ausgefallen, B bekommt dieselbe Nachzahlung; keine Kettenübernahme (nur einmal pro Platz).
- Stripe-Gebühr bei Erstattung bleibt hängen; Dispute 20 €.
- Rundung: Summe der Anteile deckt die Miete.
- Entfernen des Guthabens berührt viele Stellen (siehe Schätzung); Testdaten zurücksetzen statt migrieren.

## Datenschutz / Sicherheit
Security-Review Pflicht (Zahlung, Webhook, Geheimnisse). Nur Stripe-IDs gespeichert, Webhook-Signatur geprüft. Mandat und Kunden-ID in DSGVO-Export und Löschung. Stripe als Auftragsverarbeiter (GO-LIVE-AUDIT).

## Offene Fragen
- Turnier-Anteil (entschieden, Berechnungsweg): Anteil je Spieler = aufgerundet Hallenmiete des Turniers ÷ tatsächliche Spielerzahl (`shareCents`, wie `finalShareCents` heute in `maybeFixPrice`), abgebucht zur Frist (Buchung). Die Provision der Halle (009) wird von der Hallenmiete abgezogen, das Geld geht an die Halle. Die globale Turnier-Kommission (`tournament_commission_percent`) und `splitEntryFees` entfallen, ebenso `entryFeeCents` als Einsatz (nur noch als Fallback ohne Hallenpreis zu klären; Annahme: ohne Hallenpreis kann das Turnier nicht fixiert werden). Vertrag 005 wird angepasst.
- Für den Anwalt (GO-LIVE): Geld liegt zwischen Abbuchung und Auszahlung bei Stripe; ob dafür eine Erlaubnis nötig ist, klärt der Anwalt. E-Geld (E4/E5) entfällt, weil kein Spielerguthaben mehr existiert (entschieden). Preisgelder aus Einsätzen (inklusive Glücksspielrecht), falls später gewünscht: eigener Prüfpunkt für den Anwalt.
- Tarife: vor der Umsetzung gegen stripe.com/de/pricing und stripe.com/de/connect/pricing prüfen und im Vertrag eintragen.

## End-to-End-Nachweis
`tests/e2e/payments.spec.ts` (Stripe-Testmodus): Beitritt mit Testkarte, "Bereit", Fixieren, Abbuchung, Spiel gebucht; zweiter Lauf mit abgelehnter Karte, Nachzahlfenster und Nachrücker; dritter Lauf mit "Anteil übernehmen"; Absage mit Erstattung auf die Karte.
