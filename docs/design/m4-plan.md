# 012 M4: Plan v2 (Dispute, DSGVO, E2E im Stripe-Testmodus)

Stand: Plan v2 nach Plan-Review (15 Punkte), nicht umgesetzt. Grundlage: Vertrag `docs/contracts/012-zahlung-karte-lobby.md` v3 (AC-11, AC-16, AC-17), ADR 0001, GO-LIVE G4-012, Code auf `main` 760d67d.
**Basis der Migrationen:** M3c-3a (Branch `feat/charge-m3c3`, Migration `0041_perfect_whistler`) ist noch nicht gemergt. Die nächsten freien Nummern sind **0042** und **0043**, strikt seriell nach 0041; M4 beginnt erst, wenn 0041 auf `main` steht. Die Dateinamen (Zufallsnamen von drizzle) werden bei der Umsetzung erzeugt.
Rechts- und Steuerfragen beantwortet dieser Plan nicht: **[FRAGE-RECHT]**; Produktentscheide: **[FRAGE-PRODUKT]**; vorläufige Annahmen sind als **[ANNAHME]** markiert und vor Umsetzung zu bestätigen.

## 1. Ziel und Abgrenzung

| Teil | AC | Inhalt |
|---|---|---|
| M4a | AC-11 | Zahlungsstreit (`charge.dispute.*`) im Kartenwebhook: Hauptbuch, Admin 1 benachrichtigt, Spieler im Admin markiert, Beweis-Ansicht |
| M4b | AC-16 | DSGVO: Export mit Stripe-Kunden-ID und Kartendaten, Löschung entfernt Kunde und Zahlungsmittel bei Stripe, Buchungsdaten bleiben anonymisiert |
| M4c | AC-17 | E2E im Stripe-Testmodus für Teamspiel und Privatspiel, alle Fälle aus AC-1 bis AC-14 |

Nicht Teil von M4: Turnier (M5), Guthaben entfernen (M6), Hallen-Auszahlung, Anwaltstexte.
Begriffsfalle: `disputed` heißt im Code auch ein **strittiges Spielergebnis** (`matches.disputed`, `disputeResultAction`). Der Kartenstreit heißt in M4 durchgehend **Zahlungsstreit** (Tabelle `payment_disputes`).

## 2. Ist-Stand (aus dem Code)

- Der **alte** Webhook `src/app/api/webhooks/stripe/route.ts` (Guthaben, entfällt mit M6) behandelt `charge.dispute.created` nur mit einer Admin-Nachricht, ohne Buchung und Zuordnung. Der **neue** Kartenwebhook `/api/stripe/webhook` (`src/server/payments/webhook.ts`) kennt kein `charge.dispute.*`.
- Hauptbuch: Konto `chargeback` und Art `chargeback` existieren (`schema-finance.ts`, `ledger.ts`), `finance.ts` summiert sie in der Übersicht; automatisch gebucht wird nichts. Konten sind ein Enum.
- Zuordnung: `payment_charges` (eine Zeile je Platz, `payment_intent_id`, bei „Anteil übernehmen“ `payer_user_id`), Historie `payment_charge_attempts` (alte PaymentIntents). Ein Zahlungsstreit trifft den **Zahler**, nicht den Platz.
- `exportMyData` (`src/server/account.ts`) enthält Ledger, Guthaben-Zahlungen, Belege; **nichts** aus `payment_profiles`, `payment_setup_intents`, `payment_charges`, `payment_refunds`, Übernahmen.
- `deleteAccount` anonymisiert die Nutzerzeile, **lässt aber `payment_profiles` (Kunden-ID, Zahlungsmittel-ID, Marke, last4, Mandat) und `payment_setup_intents` bestehen und ruft Stripe nicht auf.** Lücke gegenüber AC-16. Sperren, die bleiben: offenes Spiel mit Abbuchung (`hasChargeRows`), Guthaben > 0, einziger Team-Admin.
- Provider (`provider.ts`) hat `detachPaymentMethod`, kein `deleteCustomer`, kein Abruf eines Streits.
- E2E: `tests/e2e/payments.spec.ts` ist das **alte Guthaben-Spec** (gehört zu M6); `karte-*.spec.ts` laufen mit `PAYMENTS_FAKE=1`. Es gibt keinen E2E gegen echtes Stripe.

## 3. Etappenschnitt und Reihenfolge

Jede Etappe enthält ihre Tests (kein Task ohne maschinellen Check).

| Etappe | Inhalt | Migration | PR-Art |
|---|---|---|---|
| M4a-1 | `payment_disputes`, Webhook-Verarbeitung, Hauptbuch, Erstattungssperre, Admin-Nachricht, Tests, Vertragstabelle angleichen | 0042 | Geld/Webhook/Migration: security-reviewer Pflicht, GO-LIVE-AUDIT-Eintrag |
| M4a-2 | Admin-Oberfläche (Liste, Detail, Beweis-Ansicht, Markierung am Spieler), alte Route bereinigen, Tests | keine | UI, Impeccable-Belege |
| M4b-1 | Export, `deleteCustomer`, Löschauftrag in der Löschung, Job, **alle Tests (AC-16)**, Doku | 0043 | Datenschutz/Geheimnis/Migration: security-reviewer Pflicht |
| M4c-1 | Infrastruktur Stripe-Testmodus-E2E + Teamspiel-Szenarien | keine | Test, manuell |
| M4c-2 | Privatspiel-Szenarien | keine | Test, manuell |

Reihenfolge: M4a-1, M4a-2, M4b-1, M4c-1, M4c-2. M4c nutzt `deleteCustomer` (M4b) zum Aufräumen, daher nach M4b. M4a-2 und M4b-1 dürfen parallel laufen (keine zweite Migration gleichzeitig; 0042 vorher gemergt).

## 4. M4a: Zahlungsstreit (AC-11)

### 4.1 Ereignisse, Reihenfolge, Zuordnung
Neu im Kartenwebhook (`isCardEvent` erweitern), alle über `stripe_events` idempotent:
`charge.dispute.created`, `.updated`, `.funds_withdrawn`, `.funds_reinstated`, `.closed`.

**Alle Handler sind reihenfolge-unabhängig und folgen einem Schema:**
1. **Upsert über `dispute_id`** (`payment_disputes`, UNIQUE): jedes Ereignis legt die Zeile an, falls sie fehlt (auch `updated` oder `closed` vor `created`).
2. **Statusfelder** (Status, Fristen) werden nur übernommen, wenn `event.created` nicht älter ist als `last_event_created` der Zeile (ältere Ereignisse werden verworfen, nur Audit) und der Rang nicht fällt (`needs_response`/`warning_needs_response` < `under_review`/`warning_under_review` < `won`/`lost`/`warning_closed`; ein Endstatus wird nie überschrieben).
3. **Buchungen kommen nicht aus dem Ereignistyp, sondern aus den Balance-Transactions des Streits** (Feld `balance_transactions` im Streit-Objekt; fehlt es im Ereignis, ruft der Anbieter den Streit ab: neue Funktion `retrieveDispute`). Jede Balance-Transaction wird **einmal** gebucht, Schlüssel `dispute:<dp>:bt:<txn-id>` (mehrstufige Streite, mehrere Abzüge/Rückbuchungen, Anfrage → Streit). So verträgt sich jede Reihenfolge und jede Doppelzustellung.
   - Abzug (negativer Betrag, Kategorie `dispute`): Soll `chargeback`, Haben `clearing`, Art `chargeback`.
   - Rückbuchung (positiver Betrag, Kategorie `dispute_reversal`): Soll `clearing`, Haben `chargeback`. **Kommt die Rückbuchung vor dem Abzug**, wird sie **geparkt** (Zeile `payment_dispute_entries` o. ä. im Status `parked`, siehe 4.2) und erst gebucht, wenn der zugehörige Abzug gebucht ist; so entsteht nie ein negativer Stand auf `chargeback`.
   - Gebühr: aus `fee` der Balance-Transaction (Soll `fees`, Haben `clearing`, Art `fee`), **nie 20 EUR fest annehmen** (der Vertrag nennt 20 EUR nur als Schätzung, Prüfung gegen Stripe vor Go-live, G3-012).
4. **`closed` mit Ausgang `lost` ohne gebuchten Abzug:** festgelegt: nichts erfinden. Status `lost` setzen, Balance-Transactions per `retrieveDispute` nachladen und buchen; gibt es auch dann keinen Abzug, bleibt der Streit `lost` **ohne Buchung** mit Admin-Alarm „verloren ohne Abzug“ (manuell klären). `closed won` bucht nur vorhandene Rückbuchungen.
5. **Unbekannter PaymentIntent:** Zuordnung über `dispute.payment_intent` auf `payment_charges.payment_intent_id`, danach über `payment_charge_attempts.payment_intent_id` (alter Versuch). Ohne Treffer: Zeile `payment_disputes` mit `charge_id`, `match_id` und `payer_user_id` = NULL, Buchung trotzdem (das Geld ist weg), Admin-Alarm.

**Betrag und Währung (Punkt 2):** gebucht wird nur bei `0 < Streitbetrag <= Betrag der Abbuchung`, Währung EUR (ein **Teilstreit** ist erlaubt und bucht den Teilbetrag). Alles andere (Betrag über der Abbuchung, andere Währung, Betrag 0): Zeile speichern, **nicht buchen**, Admin-Alarm. Bei unbekannter Zuordnung entfällt der Vergleich mit der Abbuchung (Betrag nur `> 0` und EUR).

**Sperrreihenfolge (Punkt 3):** überall **Spiel → `payment_charges`-Zeile → Nutzer** (wie `applyChargeInTx`, Abbuchung, `deleteAccount`). Gilt für den Dispute-Handler, `refund.ts` (Erstattungssperre/-versand) und `deleteAccount`. Ein Streit ohne Zuordnung sperrt nichts außer der eigenen Zeile. **Tests:** Dispute und Erstattung und Löschung gleichzeitig (kein Deadlock, keine Doppelabbuchung), Mutation Sperrreihenfolge umgekehrt.

### 4.2 Datenmodell (Migration 0042, additiv)
`payment_disputes`: `id`, `dispute_id` text UNIQUE (`dp_…`), `charge_id` FK `payment_charges` **NULL**, `payment_intent_id`, `match_id` FK **NULL**, `payer_user_id` FK **NULL** (alle drei NULL bei unbekanntem PaymentIntent, NO ACTION), `amount_cents` > 0, `currency`, `reason` (nur Stripe-Code, sonst „unknown“), `status` CHECK (needs_response, under_review, won, lost, warning_needs_response, warning_under_review, warning_closed), `evidence_due_by`, `last_event_created`, `closed_at`, `created_at`, `updated_at`; Indizes `payer_user_id`, `status`, `payment_intent_id`.
`payment_dispute_entries`: `id`, `dispute_id` FK, `balance_transaction_id` UNIQUE, `kind` (withdrawal, reversal), `amount_cents`, `fee_cents`, `status` (booked, parked), `booked_at`. (Zuordnung Abzug/Rückbuchung nur über die Zeitfolge je Streit.)
`payment_refunds.status` bekommt den Endwert `cancelled_dispute` (CHECK erweitern).
**Rollback 0042:** erst Code zurückrollen. Das Hauptbuch ist append-only: Buchungen mit Schlüssel `dispute:%` bleiben bestehen (nicht löschen). Vorher offene Streite und geparkte Einträge klären. Dann `delete from stripe_events where type like 'charge.dispute.%';` (damit ein späteres Wiedereinspielen nicht als „schon verarbeitet“ übersprungen wird; die Ledger-Schlüssel verhindern Doppelbuchungen), danach `drop table payment_dispute_entries; drop table payment_disputes;` und `payment_refunds`-CHECK auf die alten Werte zurücksetzen (vorher Zeilen mit `cancelled_dispute` klären).

### 4.3 Erstattungssperre und Rennen (Punkt 4)
- **Offener Streit** = Status `needs_response`, `under_review`, `warning_needs_response`, `warning_under_review`. Für eine Abbuchung mit offenem Streit wird **keine Erstattung gesendet** (Absage, später Erfolg); die Erstattungszeile bleibt `pending`, Admin-Alarm.
- **Rennen:** war die Erstattung schon an Stripe gesendet, bevor der Streit eintrifft, ist Doppelverlust möglich: nichts zurückdrehen, Admin-Alarm „Erstattung und Streit“, Eintrag im Audit.
- **Ausgang `won`:** die gesperrte Erstattungszeile läuft normal weiter (Versand beim nächsten Lauf). **Ausgang `lost`:** die Erstattungszeile wird `cancelled_dispute` (Endstatus, es gibt nichts mehr zu erstatten, Stripe hat das Geld schon abgezogen). `finalizeCancel` behandelt `cancelled_dispute` als erledigt.
- **[FRAGE-PRODUKT]** Soll eine Absage bei offenem Streit auf die Entscheidung warten (Voreinstellung dieses Plans) oder trotzdem abschließen?

### 4.4 Admin und Datenschutz
- **Admin-Alarm Voreinstellung: Admin 1** (Rolle `owner`), In-App-Nachricht `admin.task` mit Link auf die Detailseite; Admin 2 sieht Liste und Detail lesend. Keine Karteninhaberdaten. **[FRAGE-PRODUKT]** auch Admin 2 benachrichtigen?
- „Spieler im Admin markiert“: **abgeleitet** aus `payment_disputes` („Zahlungsstreit offen/verloren“ in Spielerliste und Detail), keine neue Spalte an `users`. Folgen für den Spieler (Beitrittssperre, Kartenmodell aus) sind **[FRAGE-PRODUKT]**; M4 liefert nur die Markierung.
- Beweis-Ansicht (G4-012): Mandatstext/-zeit (`payment_setup_intents`), Übernahme-Zusatz (`cover_mandate_text`), Spielteilnahme, Beleg, Zeit der Abbuchung. Hochladen manuell im Stripe-Dashboard. **[FRAGE-PRODUKT]** reicht das, oder später ein Export?
- **Nach einer Kontolöschung** fehlen Mandat/Profil (siehe 5.2): die Beweis-Ansicht zeigt dann „Mandat nach Löschung entfernt“; Folgen siehe **[FRAGE-RECHT]** in 5.2.
- Alte Route: `charge.dispute.created` im Stripe-Dashboard vom alten Endpunkt abmelden und den Zweig in `src/app/api/webhooks/stripe/route.ts` entfernen (Ausrollschritt in BETRIEB.md), sonst doppelte Meldung.

### 4.5 Dateiliste M4a
- M4a-1: `src/db/schema.ts` (+ `drizzle/0042_*.sql`, Snapshot, Journal), `src/server/payments/dispute.ts` (neu), `src/server/payments/webhook.ts`, `src/server/payments/provider.ts` + `stripe.ts` + `fake.ts` (`retrieveDispute`, Streit-Ereignisse für die Fake-Signatur), `src/server/payments/refund.ts` (Sperre, `cancelled_dispute`), `docs/BETRIEB.md`, `docs/loop/GO-LIVE-AUDIT.md`, `docs/contracts/012-zahlung-karte-lobby.md` (Tabellenzeile AC-11: Testdatei angleichen), `tests/integration/card-dispute.test.ts`, `tests/unit/dispute-rank.test.ts`.
- M4a-2: `src/app/admin/zahlungsstreit/…` (Liste, Detail), `src/server/finance.ts` bzw. neue Abfrage `src/server/payments/dispute-admin.ts`, Spielerliste im Admin (Markierung), `src/app/api/webhooks/stripe/route.ts` (Zweig entfernen), `docs/BETRIEB.md`, `tests/integration/dispute-admin.test.ts` (Abfragen, Rollen: Admin 1 sieht, Admin 2 lesend, andere nie), `tests/e2e/admin-zahlungsstreit.spec.ts` (Seite, Rollen, Markierung).

### 4.6 Tests und Belege M4a
- Vertrag nennt für AC-11 `tests/integration/card-charge.test.ts`; der Plan nutzt **`card-dispute.test.ts`** (eigene Datei, `card-charge.test.ts` bleibt bei Abbuchung/Gebühr). Der Vertrag wird in M4a-1 an die tatsächliche Datei angeglichen (kleine Änderung der Tabellenzeile, kein Produktentscheid).
- Inhalt `card-dispute.test.ts`: jede Reihenfolge der fünf Ereignisse und Doppelzustellung, Rückbuchung vor Abzug (geparkt, dann gebucht), `closed lost` ohne Abzug (Alarm, keine Buchung), Teilstreit, Betrag über Abbuchung/Währung falsch/0 (nicht gebucht, Alarm), unbekannter PaymentIntent (Zeile mit NULL, Buchung, Alarm), alter Versuch (Historie), Variante B (Zahler), mehrstufiger Streit (zwei Abzüge), Gebühr aus Balance-Transaction (nicht 20 EUR), Hauptbuch ausgeglichen, Erstattungssperre/Rennen/`won`/`lost`, Benachrichtigung nur Admin 1, Sperrreihenfolge (Deadlock-Test).
- Mutationen (jede ROT): Betragsprüfung, Zahler statt Platz, Schlüssel je Balance-Transaction, Rangfolge, Parken, Erstattungssperre, Gebühr fest 20.
- Belege: `npm run typecheck`, `npm run lint`, `npm test`, `npx vitest run --config vitest.integration.config.mts tests/integration/card-dispute.test.ts`, danach gesamte Integration; `npm run db:generate` + `npm run db:migrate` auf nicht leerer DB.

## 5. M4b: DSGVO (AC-16)

### 5.1 Export
`exportMyData` bekommt: Stripe-Kunden-ID, Marke/last4, Mandatstext/-zeit (`payment_profiles`, `payment_setup_intents`), eigene Abbuchungen (als Platz **und** als Zahler: Betrag, Status, Zeit, PaymentIntent-ID), Erstattungen, Übernahmen (Schlüssel, Zeit, **ohne Namen Dritter**), eigene Zahlungsstreite. **Nicht** im Export: `payment_method_id` (reine technische ID), fremde Daten. **[FRAGE-RECHT]** Ist die Zahlungsmittel-ID auskunftspflichtig?

### 5.2 Löschung (Punkt 3 und 7)
Netzaufrufe nie in einer Transaktion. Sperrreihenfolge **Spiel → `payment_charges`-Zeile → Nutzer** (bestehend bei Spielen; neu beim Anfassen der Abbuchungszeilen).
1. **In DERSELBEN Transaktion wie die Anonymisierung** (`deleteAccount`): Auftrag in `payment_erasure_tasks` mit der Kunden-ID anlegen, **danach `payment_profiles` und `payment_setup_intents` (Mandat) des Nutzers löschen**. Die Kunden-ID steht ab dann nur noch im Auftrag.
2. **Job** (im Job `card-charges` oder eigener `card-erasure`; nur Anbieteraufruf, keine Fachlogik): Auftrag mit `FOR UPDATE SKIP LOCKED` beanspruchen (Lease wie `claimNext`), `provider.deleteCustomer(customerId)`; bei Erfolg Auftrag `done`, Kunden-ID auf NULL. **Zustände:** `pending` → `claimed` → `done` | `failed`. Wiederholung mit Backoff (1 h, 6 h, 24 h, dann täglich), nach **N = 10 Versuchen** `failed` mit Admin-Alarm (manuell klären). **Absturz nach Stripe-Erfolg:** der nächste Lauf ruft `deleteCustomer` erneut; „Kunde existiert nicht (mehr)“ zählt als Erfolg (idempotent), kein doppelter Schaden.
3. Buchungsdaten (Ledger, `payment_charges`, `payment_refunds`, Belege) bleiben, ohne Personenbezug über die anonymisierte Nutzerzeile. **[ANNAHME]** Stripe behält Transaktionsdaten nach eigenen Aufbewahrungspflichten (Hinweis in der Datenschutzerklärung); vor Go-live bestätigen.
4. Bleibende Sperren: offenes Spiel mit Abbuchung, Guthaben > 0, einziger Team-Admin. Neu: **offener Zahlungsstreit** blockiert die Löschung (Beweismittel).

**[FRAGE-RECHT]** (nicht beantwortet): (a) Darf/muss eine Löschung wegen offenem Streit verweigert oder verzögert werden, und für wie lange? (b) Ein **Streit kann bis ca. 120 Tage nach der Abbuchung eintreffen**, also auch nach der Löschung; dann fehlen Mandat und Profil als Beweis. Zulässig oder muss das Mandat (anonymisiert) für die Streitfrist bleiben? (c) Die **Pseudonyme in `payment_charges`** (Nutzer-ID bleibt als Verweis auf die anonymisierte Zeile) und die PaymentIntent-IDs: genügt das als „anonymisiert“?

### 5.3 Datenmodell (Migration 0043, additiv)
`payment_erasure_tasks`: `id`, `user_id` FK (NO ACTION), `stripe_customer_id` text NULL (nach Erfolg NULL), `status` CHECK (pending, claimed, done, failed), `attempts` int, `next_try_at`, `claimed_until`, `last_error_code` (nur Stripe-Code), `created_at`, `done_at`; UNIQUE `user_id`.
**Rollback 0043 (Reihenfolge):** (1) offene Aufträge abarbeiten (Job laufen lassen oder die Kunden manuell bei Stripe löschen, `pending`/`claimed`/`failed` müssen leer sein, sonst bleibt ein Stripe-Kunde bestehen), (2) Code zurückrollen, (3) `drop table payment_erasure_tasks;`.

### 5.4 Dateiliste M4b-1
`src/server/account.ts`, `src/server/account-actions.ts` (nur Meldungstext), `src/server/payments/provider.ts` + `stripe.ts` + `fake.ts` (`deleteCustomer`), `src/server/payments/erasure.ts` (neu), `src/server/payments/charge-trigger.ts` (Job), `src/db/schema.ts` + `drizzle/0043_*`, `docs/BETRIEB.md`, `docs/loop/GO-LIVE-AUDIT.md`, `tests/integration/account.test.ts` (erweitern), `tests/integration/card-erasure.test.ts` (Job, Zustände).

### 5.5 Tests und Belege M4b-1 (Tests gehören in diese Etappe)
- `account.test.ts` (AC-16): Export enthält Kunden-ID, Marke/last4, Abbuchungen als Platz und Zahler, keine Fremddaten, keine `pm_`-ID; Löschung: Auftrag und Löschen von Profil/Mandat in einer Transaktion, Ledger/Belege bleiben, Kunden-ID nur noch im Auftrag, offener Streit blockiert, Struktur-Test „kein Netzaufruf in der Transaktion“.
- `card-erasure.test.ts`: Job beansprucht mit `SKIP LOCKED` (zwei parallele Läufe, ein Aufruf), `deleteCustomer` ruft den Anbieter mit der Kunden-ID, Erfolg → `done` und NULL, Stripe-Fehler → Backoff, nach N Versuchen `failed` + Alarm, „existiert nicht“ = Erfolg, Absturz nach Erfolg (Wiederholung ohne Fehler).
- Mutationen (ROT): Auftrag nicht angelegt, Profil bleibt, Netzaufruf in der Transaktion, Export mit `payment_method_id`, kein Backoff.
- Belege wie 4.6 plus die beiden Dateien.

## 6. M4c: E2E im Stripe-Testmodus (AC-17)

### 6.1 Rahmen
- Eigene Spec-Gruppe `tests/e2e-stripe/` mit **`playwright.stripe.config.ts`** und Skript `test:e2e:stripe` in `package.json` (Änderung an `package.json` gehört in den PR; der Task Manager mergt, laut CLAUDE.md keine Nutzer-Freigabe nötig, anders als `.github/` und `.claude/`). **Läuft nicht in der CI** (Geheimnisse, `stripe listen`).
- **Vertrag und Plan angleichen:** Der Vertrag nennt für AC-17 `tests/e2e/payments.spec.ts`. Dieses Spec ist das **alte Guthaben-Spec** und wird in **M6** ersetzt/entfernt; für AC-17 gilt `tests/e2e-stripe/…`. Die Tabellenzeile AC-17 wird in M4c-1 angeglichen.
- **AC-17 ist nur manuell nachweisbar:** Beleg-Regel: der **Task Manager führt den Lauf aus**, im DONE stehen die Ausgabe (bestanden/fehlgeschlagen je Spec) und die **Stripe-Ereignis-IDs**; Abnahme **vor Go-live (G4-012, G8-012)**, nicht per CI. **[FRAGE-PRODUKT]** Alternativ Testschlüssel als CI-Secret (nicht empfohlen: Schlüssel in der CI, Laufzeit, Fremdnetz).
- Voraussetzungen: Testschlüssel (`sk_test_…`, `pk_test_…`) in der `.env.local` des Nutzers (Agenten lesen sie nie), `stripe listen --forward-to localhost:<Port>/api/stripe/webhook` vom Nutzer gestartet; **`STRIPE_CARD_WEBHOOK_SECRET` ist das Geheimnis, das `stripe listen` ausgibt** (nicht das des Dashboard-Endpunkts), nur in der eigenen `.env.local`. Dev-Server ohne `PAYMENTS_FAKE`.
- **Schutzvorkehrungen (Punkt 10):** Startguard in `playwright.stripe.config.ts`: bricht ab, wenn `STRIPE_SECRET_KEY` nicht mit `sk_test_` beginnt (**nur Präfixprüfung, der Wert wird nie ausgegeben**) oder die Datenbank nicht `soccaz_w*` ist (Wächter `dbUrlAllowed`, unverändert, nicht lockern). Kein Logging von Kunden-/Streit-IDs außerhalb des DONE; **keine Header, Payloads, Traces oder HAR** in Reports (Trace und Video aus, Screenshots nur bei Fehler und ohne Formularfelder mit Kartendaten). Testkarten sind öffentliche Stripe-Testnummern.
- Zeit: Fristen (48 h, Fenster 2 h) per DB (`startsAt`, `createdAt`, `grace_until`), Job per `callJob`; Stripe-Seite echt, keine echten Wartezeiten.
- **Asynchrone Ereignisse (Punkt 12):** der Test-Streit (Karte …0259) trifft **asynchron** ein: der Test **pollt auf das Ereignis** (Zeile in `payment_disputes` bzw. Zahlungsstatus) mit Zeitlimit, nie mit fester Wartezeit.
- Browser: Stripe Elements in iframes (`frameLocator`), 3-D-Secure-Testfenster in einem iframe von `hooks.stripe.com`; Selektoren gekapselt in `tests/e2e-stripe/stripe-ui.ts`.
- Aufräumen: Testkunden bei Stripe über `deleteCustomer` (M4b) in `afterAll`; Namenspräfix `e2e-`.

### 6.2 Testkarten (laut Stripe-Testkartenliste; vor Umsetzung gegen die aktuelle Stripe-Doku prüfen)
| Zweck | Karte |
|---|---|
| erfolgreich | 4242 4242 4242 4242 |
| abgelehnt (generisch) | 4000 0000 0000 0002 |
| nicht genug Guthaben | 4000 0000 0000 9995 |
| 3-D-Secure verlangt | 4000 0025 0000 3155 |
| hinterlegen klappt, spätere Abbuchung scheitert | 4000 0000 0000 0341 |
| Abbuchung klappt, danach Zahlungsstreit | 4000 0000 0000 0259 |

### 6.3 Szenarien (je Teamspiel und Privatspiel)
| AC | Szenario |
|---|---|
| AC-1/2/3 | Karte hinterlegen (Mandat), Bereit nur mit Karte, Karte ändern |
| AC-4/5 | Abbuchung zur Frist / Sofortbuchung, Spiel gebucht, Belege |
| AC-6/7 | abgelehnte Karte → Fehlerblock, Nachzahlfenster, neue Karte → erneuter Versuch; 3-D-Secure-Freigabe (Erfolg und Fehlschlag) |
| AC-8/9 | Fenster abgelaufen → Nachrücker; Warteliste leer → Auto-Absage mit Erstattung auf die Karte |
| AC-10 | Absage durch Admin 1 mit Erstattung (Stripe-Refund im Testkonto sichtbar) |
| AC-11 | Karte …0259 → Zahlungsstreit im Testkonto → (Polling) Eintrag und Buchung (M4a) |
| AC-12/20 | Ampel und Texte für Betroffenen, Captain/Veranstalter, Dritte, Gast |
| AC-13/14 | Anteil übernehmen (Team: gleiches Team; Privat: jeder Eingeteilte), Abbuchung beim Übernehmer, Absage erstattet an den Übernehmer |
| AC-19 | Mindestbetrag 0,50 EUR |
| AC-16 | Konto löschen: Kunde bei Stripe weg (Prüfung über die Stripe-API), Export enthält Kunden-ID |

Unterschiede Privatspiel: Veranstalter statt Captain, zufällige Einteilung, „Anteil übernehmen“ ohne Teamgrenze, Sichtbarkeit für Eingeladene.

### 6.4 Dateiliste und Belege M4c
`tests/e2e-stripe/{team.spec.ts, privat.spec.ts, stripe-ui.ts, helpers-stripe.ts}`, `playwright.stripe.config.ts`, `package.json` (Skript), `docs/BETRIEB.md` (Ablauf), Vertragstabelle AC-17. Beleg: `npm run test:e2e:stripe` (vom Task Manager ausgeführt), Ausgabe + Ereignis-IDs im DONE.

## 7. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Streitbuchung falsch (Geld) | Buchung je Balance-Transaction, Betragsabgleich, ausgeglichenes Hauptbuch, security-reviewer |
| Ereignisse in falscher Reihenfolge | Upsert, `event.created`, Rang, Parken, Tests für jede Reihenfolge |
| Streit und Erstattung auf dieselbe Zahlung | Erstattungssperre, `cancelled_dispute`, Alarm bei Rennen |
| Deadlock Dispute/Erstattung/Löschung | feste Sperrreihenfolge Spiel → Zeile → Nutzer, Test |
| Stripe löscht Kunden nicht (Netz) | Auftrag mit Wiederholung, Alarm, Idempotenz |
| Löschung kollidiert mit Beweispflicht im Streit | Sperre bei offenem Streit; **[FRAGE-RECHT]** |
| E2E im Testmodus flaky | Selektoren kapseln, auf Ereignisse pollen, nicht in CI |
| Testkunden bleiben bei Stripe | `afterAll` mit `deleteCustomer`, Präfix `e2e-` |
| Schlüssel im Repo/Log/Report | nur `.env.local` des Nutzers, Startguard `sk_test_`, keine Header/Payloads/Traces/HAR |
| Migrationen parallel | strikt seriell, Rollback-Sätze in BETRIEB.md |
| Doppelte Meldung alter/neuer Webhook | Ereignis nur am neuen Endpunkt, alten Zweig entfernen |

## 8. Datenschutz

Gespeichert werden nur Stripe-IDs, Beträge, Status, Zeiten, Stripe-Gründe als Codes. Keine Karteninhaberdaten, keine Freitexte von Stripe, keine Namen Dritter im Export. Zahlungsstreit-Daten nur für Admin 1/2, nie für Captain, Dritte oder Gäste. Kein Logging von Kunden-/Streit-IDs in Server-Logs. Export und Löschung nach AC-16; Stripe bleibt Auftragsverarbeiter (GO-LIVE-AUDIT).

## 9. Offene Entscheide

**Produkt** (7): (1) Folgen eines Zahlungsstreits für den Spieler (nur Markierung oder Sperre, Aufhebung). (2) Absage bei offenem Streit auf derselben Zahlung (warten oder abschließen). (3) Behandlung der Streitgebühr bei gewonnenem Streit (gegen Stripe-Doku prüfen). (4) Beweise nur manuell im Dashboard oder später Export. (5) Konto `chargeback` nach M6 behalten. (6) E2E manuell oder CI-Secret. (7) Alarme nur Admin 1 (Voreinstellung) oder auch Admin 2.

**Recht/Steuer** (kein Agent beantwortet das): (1) Aufbewahrung von Mandat, Belegen, Buchungen gegen Löschpflicht (Art. 17 DSGVO, HGB/AO-Fristen), Dauer, Anonymisierungsgrad. (2) Löschung bei offenem Streit und Streit nach Löschung (bis ca. 120 Tage), Mandat als Beweis. (3) Auskunftsumfang: Zahlungsmittel-ID, Kunden-ID, Gerätedaten. (4) Steuerliche Behandlung von Streitverlust und Streitgebühr (Konto `chargeback` vs. `fees`). (5) Datenschutzerklärung zu Stripe (Aufbewahrung bei Stripe als **[ANNAHME]**), Mandatstexte (G2-012, G11-012). (6) Pseudonyme in `payment_charges` nach Anonymisierung.

## 10. Freigabe und Review

Plan v2 wird von einem anderen Worker geprüft (worker-4 oder worker-2; Writer ist nicht Reviewer, Rechtsfragen werden nicht bewertet). Umsetzung von M4 beginnt erst nach Freigabe durch den Task Manager und nachdem 0041 auf `main` steht; vorher keine Migration 0042/0043 und kein Code.
