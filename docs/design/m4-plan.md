# 012 M4: Plan (Dispute, DSGVO, E2E im Stripe-Testmodus)

Stand: Plan, nicht umgesetzt. Grundlage: Vertrag `docs/contracts/012-zahlung-karte-lobby.md` v3 (AC-11, AC-16, AC-17), ADR 0001, GO-LIVE G4-012, Code auf `main` 760d67d plus M3c-3a (Branch `feat/charge-m3c3`, Migration 0041).
Rechts- und Steuerfragen beantwortet dieser Plan nicht; sie sind mit **[FRAGE-RECHT]** markiert, Produktentscheide mit **[FRAGE-PRODUKT]**.

## 1. Ziel und Abgrenzung

| Teil | AC | Inhalt |
|---|---|---|
| M4a | AC-11 | Dispute (`charge.dispute.*`) im Kartenwebhook: Buchung auf Konto `chargeback`, Admin 1 benachrichtigt, Spieler im Admin markiert, Beweis-Ansicht |
| M4b | AC-16 | DSGVO: Export mit Stripe-Kunden-ID und Kartendaten, Löschung entfernt Kunde und Zahlungsmittel bei Stripe, Buchungsdaten bleiben anonymisiert |
| M4c | AC-17 | E2E im Stripe-Testmodus für Teamspiel und Privatspiel, alle Fälle aus AC-1 bis AC-14 |

Nicht Teil von M4: Turnier (M5), Guthaben entfernen (M6), Hallen-Auszahlung, Anwaltstexte (nur Platzhalter markiert).
Begriffsfalle: In der Codebasis heißt `disputed` auch ein **strittiges Spielergebnis** (`matches.disputed`, `disputeResultAction`). Der Kartenstreit heißt in M4 durchgehend **Zahlungsstreit** (Tabelle `payment_disputes`), damit nichts verwechselt wird.

## 2. Ist-Stand (aus dem Code)

- Der **alte** Webhook `/api/webhooks/stripe` (Guthaben, entfällt mit M6) behandelt `charge.dispute.created` nur mit einer Admin-Nachricht „Rückbuchung eingegangen“, ohne Buchung, ohne Zuordnung. Der **neue** Kartenwebhook `/api/stripe/webhook` (`src/server/payments/webhook.ts`) kennt kein `charge.dispute.*`; BETRIEB.md kündigt „später `charge.dispute.*`“ an.
- Hauptbuch: Konto `chargeback` und Art `chargeback` existieren (`schema-finance.ts`, `ledger.ts`), `finance.ts` summiert `chargebacks` in der Übersicht. Gebucht wird heute nichts davon automatisch. Konten sind ein Enum: ein neues Konto bräuchte eine Migration (nicht geplant).
- Zuordnung Zahlung zu Spiel/Spieler: `payment_charges` (eine Zeile je Platz, `payment_intent_id`, bei „Anteil übernehmen“ `payer_user_id` = Zahler), Historie `payment_charge_attempts`. Ein Zahlungsstreit trifft den **Zahler**, nicht den Platz (Variante B, M3c-3).
- `exportMyData` (`src/server/account.ts`) enthält Ledger, Zahlungen (Guthaben), Belege; **nichts** aus `payment_profiles`, `payment_setup_intents`, `payment_charges`, `payment_refunds`, Übernahmen.
- `deleteAccount` anonymisiert die Nutzerzeile (Name, E-Mail, …) und löscht persönliche Daten, **lässt aber `payment_profiles` (Stripe-Kunden-ID, Zahlungsmittel-ID, Marke, letzte vier Ziffern, Mandat) bestehen** und ruft Stripe nicht auf. Die Zeile würde nur bei einem echten `DELETE FROM users` per Cascade fallen, das nie passiert. **Lücke gegenüber AC-16.** Außerdem blockiert `hasChargeRows` die Löschung bei offenen Spielen mit Abbuchung (gewollt, bleibt).
- Der Anbieter (`provider.ts`) hat `detachPaymentMethod`, aber kein `deleteCustomer`. Fake und Stripe-Anbieter müssen gleich erweitert werden.
- E2E: `payments.spec.ts` ist das alte Guthaben-Spec; `karte-*.spec.ts` laufen mit `PAYMENTS_FAKE=1`. Es gibt **keinen** E2E gegen echtes Stripe. Worker-Doku (BETRIEB.md) beschreibt `stripe listen --forward-to localhost:<Port>/api/stripe/webhook` und Testschlüssel in der `.env.local` des Nutzers.

## 3. Etappenschnitt und Reihenfolge

Strikt seriell bei Migrationen (0042, 0043 nach 0041; nie parallel zu anderen Tasks mit Schema-Annahmen, CLAUDE.md). Voraussetzung: M3c-3a gemergt (0041 auf `main`).

| Etappe | Inhalt | Migration | PR-Art |
|---|---|---|---|
| M4a-1 | Tabelle `payment_disputes`, Webhook-Verarbeitung, Hauptbuch, Admin-Benachrichtigung | 0042 | Geld/Webhook: security-reviewer Pflicht, Eintrag GO-LIVE-AUDIT |
| M4a-2 | Admin-Oberfläche (Liste, Detail, Beweis-Ansicht, Markierung am Spieler) | keine | UI, Impeccable-Belege |
| M4b-1 | Export erweitert, Provider `deleteCustomer`, Lösch-Auftrag und Job | 0043 | Datenschutz/Geheimnis: security-reviewer Pflicht |
| M4b-2 | `account.test.ts` (AC-16), Doku | keine | Test/Doku |
| M4c-1 | Infrastruktur Stripe-Testmodus-E2E + Teamspiel-Szenarien | keine | Test, lokal/manuell, nicht in CI |
| M4c-2 | Privatspiel-Szenarien | keine | Test |

Abhängigkeiten: M4c nutzt `deleteCustomer` aus M4b zum Aufräumen der Testkunden bei Stripe, daher M4b vor M4c. M4a ist unabhängig und kann vor M4b laufen. Reihenfolge-Vorschlag: M4a-1, M4a-2, M4b-1, M4b-2, M4c-1, M4c-2. Zwei Writer parallel nur dort, wo keine Migration im Spiel ist (M4a-2 neben M4b-1 ist möglich, wenn 0042 gemergt ist).

## 4. M4a: Zahlungsstreit (AC-11)

### 4.1 Ereignisse und Verhalten
Neu im Kartenwebhook (`isCardEvent` erweitern), alle idempotent über `stripe_events`:

| Ereignis | Wirkung |
|---|---|
| `charge.dispute.created` | Zeile in `payment_disputes` (status aus Stripe), Zuordnung über `dispute.payment_intent` (sonst über `charge` per Anbieter-Abruf) auf `payment_charges`/Historie; Hauptbuch-Buchung (4.3); Admin-Benachrichtigung; Audit |
| `charge.dispute.updated` | Status und `evidence_due_by` nachziehen, keine Buchung |
| `charge.dispute.funds_withdrawn` / `charge.dispute.funds_reinstated` | Buchung bzw. Rückbuchung, wenn Stripe die Mittel bewegt (maßgeblich für das Geld, statt nur `created`) |
| `charge.dispute.closed` | Ausgang `won`/`lost`: Status setzen; bei `won` Rückbuchung (falls nicht schon über `funds_reinstated`), Admin-Nachricht |

Regeln wie bei Abbuchung und Erstattung: **nie** einem Wert aus dem Ereignis trauen. Betrag und Währung (EUR) müssen zur Abbuchungszeile passen, sonst ignorieren **und** Admin-Alarm (hier geht Geld verloren, ein stilles Ignorieren ist falsch). Unbekannter PaymentIntent (kein Treffer): Zeile `payment_disputes` ohne Zuordnung (`charge_id` NULL), Admin-Alarm. Ereignisse können in beliebiger Reihenfolge kommen: Rangfolge am Status (`closed` überschreibt nie zurück), Buchungen über feste Schlüssel.

### 4.2 Datenmodell (Migration 0042, additiv)
`payment_disputes`: `id`, `dispute_id` text UNIQUE (Stripe `dp_…`), `charge_id` FK `payment_charges` (NULL erlaubt, NO ACTION), `payment_intent_id`, `match_id` FK, `payer_user_id` FK (Zahler, NO ACTION; Nutzerzeile bleibt anonymisiert bestehen), `amount_cents` > 0, `currency`, `reason` (nur Stripe-Code aus Liste, sonst „unknown“), `status` CHECK (needs_response, under_review, won, lost, warning_*), `evidence_due_by`, `fee_cents`, `withdrawn_at`, `reinstated_at`, `closed_at`, `created_at`, `updated_at`. Indizes: `payer_user_id`, `status`. Keine Freitexte von Stripe, keine Karteninhaberdaten.
Ledger-Schlüssel: `dispute:<dp>:withdrawn`, `dispute:<dp>:fee`, `dispute:<dp>:reinstated`.
**Rollback 0042** (vorher offene Fälle klären): `drop table payment_disputes;` (rein additiv, nichts hängt davon ab, solange der alte Code läuft).

### 4.3 Hauptbuch
- Abgezogen (`funds_withdrawn`): Soll `chargeback`, Haben `clearing`, Betrag der angefochtenen Abbuchung, Art `chargeback`, `matchId` gesetzt.
- Gebühr 20 € (laut Vertrag/G3-012, vor Go-live gegen die Stripe-Preisseite prüfen): Soll `fees`, Haben `clearing`, Art `fee`.
- Gewonnen (`funds_reinstated`): Soll `clearing`, Haben `chargeback` (Gegenbuchung). Ob Stripe die Gebühr bei Sieg erstattet, ist **[FRAGE-PRODUKT]** (gegen Stripe-Doku bei Umsetzung prüfen); bis dahin wird nur gebucht, was Stripe als Bewegung meldet.
- Das Hauptbuch bleibt ausgeglichen (`trialBalance`), Test Pflicht.
- Wechselwirkung mit Erstattung: Hat eine Abbuchung einen offenen Zahlungsstreit, wird **keine** Erstattung (Absage, später Erfolg) dafür gesendet (Doppelverlust); die Erstattungszeile bleibt `pending` mit Admin-Alarm, bis der Streit entschieden ist. **[FRAGE-PRODUKT]** Soll die Absage in dem Fall warten oder trotzdem abschließen?

### 4.4 Admin und Datenschutz
- Admin 1 (Rolle `owner`) bekommt eine In-App-Nachricht (`admin.task`) mit Link auf die Detailseite; Admin 2 sieht die Liste lesend. Keine Karteninhaberdaten, nur Name des Zahlers im Admin (Admin darf das schon).
- „Spieler im Admin markiert“: **abgeleitet** aus `payment_disputes` (Anzeige „Zahlungsstreit offen/verloren“ in Spielerliste und Detail), keine neue Spalte an `users`. Konsequenzen für den Spieler (Beitrittssperre, Kartenmodell aus) sind **[FRAGE-PRODUKT]**; M4 liefert nur die Markierung.
- Beweis-Ansicht (G4-012): Mandatstext und -zeit (`payment_setup_intents`), ggf. Übernahme-Zusatz (`cover_mandate_text`), Spielteilnahme (Bereit-Zeit), Abbuchungsbeleg, Zeit der Abbuchung. Hochladen der Beweise erfolgt **manuell im Stripe-Dashboard** (kein API-Upload in M4). **[FRAGE-PRODUKT]** reicht das, oder soll später ein Export (PDF/ZIP) kommen?
- Alter Webhook: `charge.dispute.created` dort im Stripe-Dashboard abmelden und den Zweig in der alten Route entfernen, damit nicht doppelt gemeldet wird (Ausrollschritt in BETRIEB.md).

### 4.5 Dateiliste M4a
`src/db/schema.ts` (+ `drizzle/0042_*.sql`, Snapshot, Journal), `src/server/payments/dispute.ts` (neu), `src/server/payments/webhook.ts`, `src/server/payments/provider.ts` + `stripe.ts` + `fake.ts` (nur falls Abruf `charge`/`dispute` nötig; sonst Ereignisfelder), `src/server/payments/refund.ts` (Sperre bei offenem Streit), `src/server/finance.ts` (Anzeige), `src/app/admin/…` (Liste/Detail, M4a-2), `docs/BETRIEB.md`, `docs/loop/GO-LIVE-AUDIT.md` (PR-Eintrag), Tests unten.

### 4.6 Tests und Belege
- `tests/integration/card-dispute.test.ts` (AC-11): Ablauf created→withdrawn→closed(won/lost), jede Reihenfolge, doppelte Zustellung, Betrag/Währung falsch, unbekannte Zahlung (Alarm), Variante B (Zahler ist B), Hauptbuch ausgeglichen, Erstattungssperre, Benachrichtigung nur Admin 1.
- Mutationen: Betragsabgleich, Zahler statt Platz, Idempotenzschlüssel, Rangfolge `closed`, Erstattungssperre (jede ROT).
- Belege: `npm run typecheck`, `npm run lint`, `npm test`, `npx vitest run --config vitest.integration.config.mts tests/integration/card-dispute.test.ts`, danach gesamte Integration; `npm run db:generate` + `npm run db:migrate` auf nicht leerer DB.

## 5. M4b: DSGVO (AC-16)

### 5.1 Export
`exportMyData` bekommt: Stripe-Kunden-ID, Marke und letzte vier Ziffern, Mandatstext/-zeit (`payment_profiles`, `payment_setup_intents`), eigene Abbuchungen (als Platz **und** als Zahler: Betrag, Status, Zeit, PaymentIntent-ID), Erstattungen, Übernahmen (Schlüssel, Zeit, ohne Namen Dritter), eigene Zahlungsstreite. **Nicht** in den Export: `payment_method_id` (reine technische ID, kein Mehrwert; AC-16 verlangt nur die Kunden-ID) und fremde Daten (Name des Übernehmers/Platzhalters). **[FRAGE-RECHT]** Ist die Zahlungsmittel-ID auskunftspflichtig?

### 5.2 Löschung
Netzaufrufe nie in einer Transaktion. Zweiphasig:
1. **Tx (bestehende `deleteAccount`)**: Prüfungen wie bisher, anonymisieren, plus **Auftrag** in `payment_erasure_tasks` (Nutzer-ID, Kunden-ID, Status, Versuche, `next_try_at`) anlegen und `payment_profiles` auf den Auftrag übertragen (die Kunden-ID liegt nur noch dort).
2. **Job** (z. B. im Job `card-charges` oder eigener `card-erasure`): `provider.deleteCustomer(customerId)` (Stripe löscht Kunde und Zahlungsmittel), bei Erfolg Auftrag `done` und `customer_id` auf NULL setzen, Zeile `payment_profiles` und `payment_setup_intents` des Nutzers entfernen bzw. anonymisieren; bei Fehler Wiederholung mit Backoff, nach N Tagen Admin-Alarm. Idempotent: „Kunde existiert nicht mehr“ zählt als Erfolg.
Buchungsdaten (Ledger, `payment_charges`, `payment_refunds`, Belege) bleiben, ohne Personenbezug (Nutzerzeile ist anonymisiert). Stripe selbst behält Transaktionsdaten nach eigenen Aufbewahrungspflichten (Hinweis in Datenschutzerklärung).
Sperren, die bleiben: offenes Spiel mit Abbuchung, Guthaben > 0, einziger Team-Admin. Neu: **offener Zahlungsstreit** blockiert die Löschung (Beweismittel). **[FRAGE-RECHT]** Ist das zulässig/erforderlich, und wie lange?

### 5.3 Datenmodell (Migration 0043, additiv)
`payment_erasure_tasks`: `id`, `user_id` FK (NO ACTION), `stripe_customer_id` text NULL (nach Erfolg NULL), `status` CHECK (pending, done, failed), `attempts` int, `next_try_at`, `last_error_code` (nur Stripe-Code), `created_at`, `done_at`; UNIQUE `user_id`.
**Rollback 0043:** erst Code zurückrollen, vorher offene Aufträge abarbeiten (sonst bleibt ein Stripe-Kunde bestehen), dann `drop table payment_erasure_tasks;`.

### 5.4 Dateiliste M4b
`src/server/account.ts`, `src/server/account-actions.ts` (nur Meldungstext), `src/server/payments/provider.ts` + `stripe.ts` + `fake.ts` (`deleteCustomer`), `src/server/payments/erasure.ts` (neu), `src/server/payments/charge-trigger.ts` (Job), `src/db/schema.ts` + `drizzle/0043_*`, `docs/BETRIEB.md`, `docs/loop/GO-LIVE-AUDIT.md`, Tests.

### 5.5 Tests und Belege
- `tests/integration/account.test.ts` erweitern (AC-16): Export enthält Kunden-ID, Marke/last4, Abbuchungen als Platz und Zahler, keine Fremddaten, keine `pm_`-ID; Löschung legt Auftrag an, Job ruft `deleteCustomer`, Profil und Mandat danach weg, Ledger/Belege bleiben, Wiederholung bei Stripe-Fehler, „Kunde existiert nicht“ = Erfolg, kein Netzaufruf in der Transaktion (Struktur-Test wie bei `authorize`), offener Streit blockiert.
- Mutationen: Auftrag nicht angelegt, Profil bleibt, Netzaufruf in Tx, Export enthält `payment_method_id`.
- Belege wie 4.6 plus `tests/integration/account.test.ts`.

## 6. M4c: E2E im Stripe-Testmodus (AC-17)

### 6.1 Rahmen
- Eigene Spec-Gruppe `tests/e2e-stripe/` mit eigener Playwright-Konfiguration; **läuft nicht in der CI** (braucht Geheimnisse und ein laufendes `stripe listen`). Die vorhandenen Fake-Specs (`karte-*.spec.ts`) bleiben die CI-Absicherung. **[FRAGE-PRODUKT]** Sollen Testschlüssel als CI-Secret hinterlegt werden (Risiko: Schlüssel in CI, Laufzeit, Fremd-Netz), oder bleibt der Lauf manuell vor dem Go-live?
- Voraussetzungen: Testschlüssel (`sk_test_…`, `pk_test_…`) und `STRIPE_CARD_WEBHOOK_SECRET` in der `.env.local` des Nutzers (Agenten lesen sie nie), `stripe listen --forward-to localhost:<Port>/api/stripe/webhook`, Dev-Server ohne `PAYMENTS_FAKE`. Der Nutzer startet `stripe listen` selbst (Agenten installieren nichts).
- Zeit: Fristen (48 h, Fenster 2 h) werden per DB gesetzt (`startsAt`, `createdAt`, `grace_until`) und der Job per `callJob` angestoßen; Stripe-Seite ist echt, es gibt keine echten Wartezeiten.
- Browser: Stripe Elements liegen in iframes (`frameLocator`), das 3-D-Secure-Testfenster in einem iframe von `hooks.stripe.com` (Schaltfläche „Complete authentication“/„Fail authentication“). Selektoren sind die fragilste Stelle; kapseln in `tests/e2e-stripe/stripe-ui.ts`.
- Aufräumen: Testkunden bei Stripe über `deleteCustomer` (M4b) in `afterAll`; lokale Testdaten wie bisher.

### 6.2 Testkarten (laut Stripe-Testkartenliste; Nummern bei Umsetzung gegen die aktuelle Stripe-Doku prüfen)
| Zweck | Karte |
|---|---|
| erfolgreich | 4242 4242 4242 4242 |
| abgelehnt (generisch) | 4000 0000 0000 0002 |
| nicht genug Guthaben | 4000 0000 0000 9995 |
| 3-D-Secure verlangt | 4000 0025 0000 3155 |
| hinterlegen klappt, spätere Abbuchung scheitert | 4000 0000 0000 0341 |
| Abbuchung klappt, danach Zahlungsstreit | 4000 0000 0000 0259 |

### 6.3 Szenarien (je für Teamspiel und Privatspiel)
| AC | Szenario |
|---|---|
| AC-1/2/3 | Karte hinterlegen (Mandat), Bereit nur mit Karte, Karte ändern |
| AC-4/5 | Abbuchung zur Frist / Sofortbuchung, Spiel gebucht, Belege |
| AC-6/7 | abgelehnte Karte → Fehlerblock, Nachzahlfenster, neue Karte → erneuter Versuch; 3-D-Secure-Freigabe (Erfolg und Fehlschlag) |
| AC-8/9 | Fenster abgelaufen → Nachrücker; Warteliste leer → Auto-Absage mit Erstattung auf die Karte |
| AC-10 | Absage durch Admin 1 mit Erstattung (Stripe-Refund in Testkonto sichtbar) |
| AC-11 | Karte 4000 0000 0000 0259 → Zahlungsstreit im Testkonto → Admin-Eintrag und Buchung (M4a) |
| AC-12/20 | Ampel und Texte für Betroffenen, Captain/Veranstalter, Dritte, Gast |
| AC-13/14 | Anteil übernehmen (Team: gleiches Team; Privat: jeder Eingeteilte), Abbuchung beim Übernehmer, Absage erstattet an den Übernehmer |
| AC-19 | Mindestbetrag 0,50 EUR |
| AC-16 | Konto löschen: Kunde bei Stripe weg (Stripe API prüft), Export enthält Kunden-ID |

Unterschiede Privatspiel: Veranstalter statt Captain, zufällige Einteilung, „Anteil übernehmen“ ohne Teamgrenze, Sichtbarkeit für Eingeladene. Alle Fälle brauchen Zeitsteuerung per DB.

### 6.4 Dateiliste und Belege M4c
`tests/e2e-stripe/{team.spec.ts, privat.spec.ts, stripe-ui.ts, helpers-stripe.ts}`, `playwright.stripe.config.ts` (Dateiname im Plan festzulegen), `package.json` Skript `test:e2e:stripe` (**Änderung an `package.json`: Nutzer-Freigabe laut Regel nötig**), `docs/BETRIEB.md` (Ablauf). Beleg: `npm run test:e2e:stripe` lokal, Ausgabe mit Zahl bestanden/fehlgeschlagen, Screenshot-Pfade bei Fehlern; Stripe-Testkonto zeigt die Ereignisse (Ereignis-IDs im DONE).

## 7. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Disputebuchung falsch (Geld) | feste Schlüssel, Betrags-/Währungsabgleich, Test auf ausgeglichenes Hauptbuch, security-reviewer |
| Dispute und Erstattung auf dieselbe Zahlung (Doppelverlust) | Erstattungssperre bei offenem Streit, Admin-Alarm |
| Stripe löscht Kunden nicht (Netz) | Auftragstabelle mit Wiederholung, Alarm, Idempotenz |
| Löschung kollidiert mit Beweispflicht im Streit | Sperre bei offenem Streit; Rechtsfrage |
| E2E im Testmodus flaky (iframes, 3DS-Popup, Latenz des `stripe listen`) | Selektoren kapseln, Wartebedingungen über Ereignisse statt Zeit, nicht in CI |
| Testkunden bleiben bei Stripe | `afterAll` mit `deleteCustomer`, Namenspräfix `e2e-` |
| Schlüssel im Repo/Log | nur `.env.local` des Nutzers, nie lesen oder ausgeben, kein Logging von Kunden-IDs |
| Migrationen parallel | strikt seriell, ein Worker, Rollback-Sätze in BETRIEB.md |
| Doppelte Meldung über alten und neuen Webhook | Ereignis nur am neuen Endpunkt abonnieren, alten Zweig entfernen |

## 8. Datenschutz

Gespeichert werden nur Stripe-IDs, Betrag, Status, Zeit, Stripe-Gründe als Codes. Keine Karteninhaberdaten, keine Freitexte von Stripe, keine Namen Dritter im Export. Zahlungsstreit-Daten sind im Admin sichtbar (Admin 1/2), nie für Captain, Dritte oder Gäste. Export und Löschung nach AC-16; Stripe bleibt Auftragsverarbeiter (GO-LIVE-AUDIT), Eintrag in der Datenschutzerklärung zu Stripe-Aufbewahrung ist **[FRAGE-RECHT]**.

## 9. Offene Entscheide

**Produkt**
1. Folgen eines Zahlungsstreits für den Spieler: nur Markierung, oder Beitritts-/Kartensperre? Ab wann aufheben?
2. Absage/Erstattung bei offenem Streit auf derselben Zahlung: warten oder abschließen?
3. Gebührenbuchung bei gewonnenem Streit (erstattet Stripe die 20 €?): nach Stripe-Doku prüfen und bestätigen.
4. Beweise nur manuell im Dashboard, oder später Export aus Soccaz?
5. Konto `chargeback` nach M6 behalten (ja nach AC-18, da kein Wallet, aber Streit bleibt)?
6. E2E im Stripe-Testmodus nur manuell, oder CI-Secret?
7. Wer bekommt die Alarme (nur Admin 1, auch Admin 2)?

**Recht/Steuer (kein Agent beantwortet das)**
1. Aufbewahrung von Mandat, Belegen und Buchungen gegen Löschpflicht (Art. 17 DSGVO, HGB/AO-Fristen), Dauer, Anonymisierungsgrad.
2. Darf eine Löschung wegen offenem Zahlungsstreit verweigert/verzögert werden, und für wie lange?
3. Auskunftsumfang: Zahlungsmittel-ID, Kunden-ID, Stripe-Gerätedaten.
4. Steuerliche Behandlung von Disputeverlust und Disputegebühr im Hauptbuch (Konto `chargeback` vs. `fees`).
5. Wortlaut Datenschutzerklärung zu Stripe und Mandatstexte (G2-012, G11-012).

## 10. Freigabe und Review

Dieser Plan wird von einem anderen Worker geprüft (Writer ist nicht Reviewer). Umsetzung von M4 beginnt erst nach Freigabe durch den Task Manager; vorher keine Migration 0042/0043 und kein Code.
