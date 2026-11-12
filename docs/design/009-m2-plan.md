# 009 M2-Plan: Provision je Halle, 10er-Zähler, Monatsrechnung, USt-Schalter
Stand: v2 2026-11-12 (v1 am selben Tag; Plan-Review: 12 Punkte eingearbeitet) · Code-Stand `origin/main` 8c26498 · Verfasser: worker-2 (Plan, Doku, kein Code) · Status: Entwurf, Review durch einen anderen Worker offen

Zweck: Plan für den Meilenstein M2 des Vertrags `docs/contracts/009-admin-einnahmen-buchhaltung.md` (Version 4): Provision pro Halle (Prozent auf die Bemessungsgrundlage und/oder 10er-Bonus), Hauptbuch-Buchung „Provision“, 10er-Zähler, Monatssammelrechnung je Halle mit lückenlosen Nummern, USt-Schalter, Anzeige Provision/Stripe-Gebühren/Rest mit Minus-Warnung (AC-3 bis 6, 10, 15). Der Plan ändert weder Code noch Vertrag. **Er beantwortet keine Steuer-, Rechts- oder Produktfrage** (insbesondere nicht zu Umsatzsteuer und Rechnungsstellung): Sie stehen in Abschnitt 12 als FRAGE. **Arbeitsannahmen** (A1 ff.) sind keine Entscheide: Sie machen den Plan prüfbar und gelten nur bis zur Antwort.

Quellen: Vertrag 009 (Entscheidungen 2026-11-10, Annahmen, AC-3 bis 6, 10, 15, Meilenstein M2), Vertrag 012 (Karte, Stripe-Gebühren), Vertrag 011 (Provisionsrechnungen sehen die Hallen, nur eigene), `docs/design/009-m1-plan.md` (Rollen, Admin 1, Eingriffsprotokoll), `docs/design/011-m1-plan.md` (Hallen-Zugang), `docs/loop/GO-LIVE-AUDIT.md` (G3-012 Tarif, G13-012 Refund-Gebühr, G14-012 Rechnungssteller), `docs/loop/FEHLT-NOCH.md` (Firmenanschrift, USt-IdNr, Mail-Dienst, Rechnungsvorlage).

## 1. Entscheide, die gelten (Vertrag 009, nicht neu verhandeln)
- Einnahme ist die Provision der Halle: pro Halle Prozent pro Buchung (auf die Hallenmiete) und/oder 10er-Bonus; **nur Admin 1** stellt sie ein. „Provision inklusive Zahlungsabwicklung“: Soccaz trägt die Stripe-Gebühren aus der Provision. 10 % sind nur der **Startwert** für neue Hallen, keine feste Untergrenze; der Admin warnt, statt zu begrenzen. Die Provision pro Halle **ersetzt** die globale Turnier-Provision (Einstellung bleibt nur Vorgabe für neue Hallen; Frage P5 betrifft nur den Übergang abgerechneter Turniere).
- 10er-Bonus: Provision der Halle an Soccaz, kein Vorteil für Spieler; zählt jedes abgebuchte, gebuchte, nicht abgesagte Soccaz-Spiel in dieser Halle (egal welche Teams; Turnier: jeder gebuchte Hallenslot), rollierend nach je 10. Der Bonus ist der feste Hallenpreis.
- Rechnungen nur über die Provision, an die Halle: monatliche Sammelrechnung je Halle, jedes Spiel eine Zeile, Bonus eine eigene Zeile, lückenlose fortlaufende Nummern. Die Hallenmiete ist durchlaufendes Geld.
- Umsatzsteuer: Schalter von Admin 1 (19 % oder Kleinunternehmer ohne USt).
- Provision wird beim Buchen (Frist/Sofortbuchung aus 008, nach der Abbuchung) als Hauptbuch-Buchung „Provision“ festgehalten; Erstattung/Absage storniert sie per Gegenbuchung. Stripe-Gebühren je Abbuchung sind eine eigene Buchung (Aufwand); bei Erstattung bleibt die Gebühr bei Soccaz.
- Rechnungsnummer aus einer Zähler-Tabelle mit Zeilensperre (lückenlos auch bei Abbruch), getrennt von den Beleg-Nummern `SOC-JJJJ`.
- **Nicht in M2:** Auszahlung an die Halle (Stripe Connect, Vertrag 012/GO-LIVE-AUDIT), Rechnungsabruf durch Hallen vor 011 M1 (siehe 8).

## 2. Bestand (Code 8c26498)
- **Rollen:** Admin 1 = `role = 'admin'` und `users.is_owner`; Wächter `requirePermission("owner", …)`/`canUser(user, "owner")` (`src/lib/roles.ts`, `src/server/session.ts`), Eingriffsprotokoll-Format aus 009 M1 (`audit_log`, Begründung Pflicht, Plan 3.4 dort); Teilrollen `finance`/`booking` entfallen (Migration 0045). M2 nutzt diese Namen; Finanzseite/Codes/Hallenpreise sind Admin-1-only.
- **Hallen und Preise:** `venues` (`schema-finance.ts:37`) hat **keine** Provisionsfelder; `price_rules` (`price_cents`, `cost_cents` je Halle und Dauer, gültig ab) bestimmen den Spielerpreis und die Hallenkosten.
- **Hauptbuch heute (entscheidend für 3.2):** Doppelte Buchführung `ledger_entries` (`ledger.ts` `post`, Idempotenzschlüssel, `reversesEntryId`, `reverseEntry` als Gegenbuchung; Änderungen per Datenbank-Trigger verboten, Migration 0007 `ledger_entries_immutable`). Die Kartenabbuchung bucht den **vollen Spieleranteil `clearing → revenue`** (`kind match_share`, `payments/charge.ts`), die echte Stripe-Gebühr `fees ← clearing` (`bookChargeFee`, `fee:<PI>`), die Erstattung `revenue → clearing` (`refund.ts`), die Hallenmiete als Ausgabe `venue_cost ← bank` (`booking.ts` `recordExpense`, nur von Hand durch Admin). Konten: `wallet`, `clearing`, `bank`, `revenue`, `venue_cost`, `fees`, `promo`, `chargeback`, `tournament` (`schema-finance.ts:23`); Arten u. a. `match_share`, `fee`, `refund`, `venue_cost`, `tournament_commission` (`:24`). Die Marge ist heute **`revenue` minus `venue_cost`** (`finance.ts` `listMatchFinance`, `overview`, `getAlerts` Verlustspiel). Es gibt **kein** Konto und keine Art „Provision“.
- **Turnier:** Provision nur dort: Einstellung `tournament_commission_percent` (Standard 10), `commissionPercent` (`tournaments.ts:27`), `splitEntryFees` (`lib/tournament.ts:197`), Abrechnung `settle` (`tournaments.ts:562-567`: `tournament → revenue`, Art `tournament_commission`, genau einmal je Turnier).
- **Rechnungen/Mail/Jobs:** Keine Sammelrechnung. `receipts` (Beleg je Zahlung/Spiel und Person; Nummer `SOC-JJJJ-000001` aus `receipt_number_seq`, eine Sequenz — **Lücken** bei Abbruch), PDF `@react-pdf/renderer` (`receipt-pdf.tsx`), Abruf `api/belege/[id]`. `providers/email.ts` (Resend; ohne Schlüssel „skipped“), Zustellung durch Job `deliver-notifications`; Zeitplaner `jobs.ts`/`SCHEDULE` mit Monatsjob-Muster; `settleDueMatches` (`scheduled.ts:191`, Job `settle-matches`).
- **Sperrreihenfolge im Zahlungscode:** `lockUser`/`debitWallet` (`ledger.ts:84-91`) sperren die Nutzerzeile; Spiel zuerst, dann Zeilen, dann Nutzer (Regel aus 012). Eine neue Hallenzeilensperre muss sich dort einordnen (5).
- **Migrationen:** auf main `0044` (is_owner), `0045` (Teilrollen) gemergt. Absprache: w1 nimmt **0046** (M5-2a), dieses Vorhaben **0047** ff. Jede Migration kommt **mit Journal und Snapshot** (`db:generate` danach „No schema changes“; `migrate-check`), Nummer vor dem Start gegen `origin/main` prüfen.

## 3. Zielbild
### 3.1 Provision je Halle (AC-5)
- `venues` bekommt `commission_percent` (Dezimalzahl, Standard 10 für neue Hallen, **harter Wertebereich 0 bis 100 mit höchstens 2 Nachkommastellen**, per CHECK und im Server; negativ oder über 100 wird abgelehnt) und `commission_bonus_enabled`. Der Bonus-Betrag ist der feste Hallenpreis (Frage P2). Änderung nur Admin 1 (`requirePermission("owner")`) **mit Pflicht-Begründung** (`recordIntervention`, 3 bis 200 Zeichen, ohne Begründung abgelehnt, nichts geändert) und Protokolleintrag wer/wann/vorher/nachher. Wirkt nur auf **künftige** Buchungen (Schnappschuss, 3.2).
- Vorgabe für neue Hallen: Einstellung `tournament_commission_percent` (Standard 10) bleibt als Vorgabewert; neue Hallen übernehmen sie bei der Anlage (Test).
### 3.2 Hauptbuch „Provision“ ohne Doppelzählung (AC-3, AC-10, AC-15) — wichtigster Punkt
**Problem:** Heute zählt `charge.ts` den vollen Spieleranteil als `revenue` und die Hallenmiete steht als `venue_cost`. Eine zusätzliche Provisionsbuchung auf `revenue` zählte dieselben Euro **doppelt** (Marge, Übersicht, AC-15 wären falsch). Der Buchungsschnitt ist deshalb eine **Vertragsfrage (S1)**; der Plan legt zwei Varianten und ihre Folgen offen und baut erst nach dem Entscheid.
- **Variante A (Arbeitsannahme A1): Verbindlichkeit Halle, nur die Provision ist Ertrag.** Neue Konten `venue_payable` (Verbindlichkeit gegenüber der Halle) und `commission` (Ertrag). Abbuchung eines Spiels im neuen Modell: `clearing → venue_payable` (statt `revenue`). Provision zum Auslöser (3.3): `venue_payable → commission` (Art `commission`). Stripe-Gebühr unverändert `fees ← clearing`. Erstattung: `venue_payable → clearing`; Storno der Provision `commission → venue_payable` (`reverseEntry`, Schlüssel `commission-reversal:<match>`, **genau einmal**, zweites Storno bucht nichts). Die Hallenmiete wird im neuen Modell **nicht** zusätzlich als `venue_cost`-Ausgabe gebucht (sie ist Auszahlung aus `venue_payable`, später mit Stripe Connect; **Auszahlung ist Nicht-Ziel von M2**): die manuelle Ausgabe `recordExpense(kind venue)` darf für Spiele im neuen Modell nicht auf `venue_cost` laufen (sonst doppelt) — Folgeregel im Code und Test.
- **Variante B: Provision nur als Auswertung** (keine Hauptbuch-Buchung, `revenue`/`venue_cost` bleiben): Provision = berechnete Größe je Spiel. Widerspricht Vertrag 009 („Hauptbuch-Buchung Provision“) und AC-3/AC-10 im Wortlaut; nur wählbar mit Vertragsänderung.
- **Altspiele (Frage P4):** Spiele ohne Provisionsmodell behalten die alte Buchung (`revenue`, `venue_cost`); `matches` bekommt ein Kennzeichen des Buchungsmodells (Entwurf: `ledger_model` `legacy|commission`, bei der **ersten** Abbuchung nach Einführung gesetzt, danach unveränderlich). `finance.ts` wertet beide Modelle: Alt = `revenue − venue_cost`; neu = `commission − fees` (Rest); `listMatchFinance`, `overview`, `getAlerts` (Verlustspiel, Minus-Warnung) und der CSV-Export müssen das Kennzeichen kennen, sonst falsche AC-15-Werte.
- **Schnappschuss:** Je Spiel eine Zeile `match_commissions`: `match_id` (eindeutig), `venue_id`, `rate_percent` und `base_cents` zum Buchungszeitpunkt, `commission_cents`, `status` (`booked`/`reversed`), `invoice_id` (Zuordnung zur Rechnung). Nur Anhängen: UPDATE/DELETE per Trigger abgelehnt, **mit Ausnahme** der einmaligen Zuordnung `invoice_id` (oder eigene Zuordnungstabelle `invoice_lines`, bevorzugt: dann ist `match_commissions` unveränderlich).
### 3.3 Bemessungsgrundlage und Auslöser
- **Bemessungsgrundlage (Frage P6, Arbeitsannahme A2):** die **tatsächlich erfolgreich abgebuchte Summe der Spieleranteile** des Spiels (Summe der erfolgreichen `payment_charges`, abzüglich Erstattungen) × `commission_percent`, abgerundet auf Cent (nie mehr als vereinbart). Alternativen (Vertragswortlaut „Hallenmiete“): `price_rules.price_cents` oder `cost_cents`; Entscheid nötig, bevor M2b gebaut wird.
- **Auslöser (Arbeitsannahme A3):** genau eine Buchung `commission:<match>` je Spiel zu dem Zeitpunkt, an dem **alle Abbuchungszeilen des Spiels einen Endzustand haben** (erfolgreich, ersetzt oder endgültig fehlgeschlagen; Hook im Abschlussschritt des Abbuchungslaufs, nicht pro Zeile). Teilfälle: fehlgeschlagene/ersetzte Spieler zählen nicht in die Basis; weniger Zahler als Plätze ergibt eine kleinere Basis; spätere Erstattung nach der Buchung → Storno der Provision (A4: ganz oder anteilig? Frage P7); späte Erfolge nach Ersatz (M3c-2b) buchen **keine** Provision nach. Wiederholung des Abschlusses ist idempotent (Schlüssel). Test je Teilfall.
### 3.4 10er-Zähler (AC-4)
- Zähler je Halle wird aus den **gebuchten, nicht stornierten** `match_commissions` abgeleitet (kein zweiter Wahrheitsstand): `n` = Anzahl; bei jedem 10. Spiel entsteht der Bonus. **Bonus ist eine eigene Buchung** (Art `commission_bonus`, Schlüssel `bonus:<venue>:<k>` mit `k` = laufende Bonusnummer), `venue_payable → commission`, Betrag = fester Hallenpreis (P2).
- **Lock-Reihenfolge (fest):** `venues`-Zeile der Halle `FOR UPDATE` → zählen unter der Sperre (`n` wird **unter** der Sperre berechnet) → buchen; die Hallenzeile wird **vor** jeder `lockUser`-Sperre genommen (Deadlock mit `debitWallet` vermeiden); Test mit echten parallelen Transaktionen (zwei Spiele, 10. und 11. gleichzeitig: genau ein Bonus).
- **Nachträgliche Absage** eines der zehn Spiele senkt `n` unter die gebuchte Schwelle: Der schon gebuchte Bonus **bleibt** auf dem abgesagten Spiel gebucht (kein automatisches Zurücknehmen), das Spiel zählt nicht mehr; die nächste Schwelle liegt dadurch später (Arbeitsannahme A5; Frage P3: oder Bonus-Storno). Regel und Test sind verbindlich, sobald P3 beantwortet ist.
### 3.5 Monatssammelrechnung (AC-6)
- Job `invoice-month` (1. des Monats, UTC), mehrfach ausführbar, wirkt nur einmal je Halle und Monat: **Unique (`venue_id`, `period`)**. Eine **Transaktion pro Halle**: Nummer aus der Zähler-Tabelle (`invoice_number_counter`, eine Zeile je Jahr; Folgejahr-Zeile `INSERT … ON CONFLICT DO NOTHING`, dann `FOR UPDATE`) + `invoices`-Kopf + `invoice_lines` (Zeile je Spiel und Bonus) + Zuordnung der Provisionszeilen. **PDF und Mail laufen NICHT in dieser Transaktion:** nach dem Commit Outbox-Eintrag (Versand mit Wiederholung bei Fehler, `send_status` im Outbox-Eintrag statt `UPDATE invoices.sent_at`); das PDF wird bei Abruf aus den festgehaltenen Zeilen erzeugt (deterministisch). Bricht die Transaktion ab, wird **keine Nummer verbraucht**; Hallen **ohne Spiele im Monat** bekommen keine Rechnung und keine Nummer.
- `invoices`/`invoice_lines` sind **nur anhängend** (Trigger wie `ledger_entries_immutable`: UPDATE/DELETE abgelehnt); Fremdschlüssel `invoices → venues` mit `ON DELETE RESTRICT`. Eine erzeugte Rechnung wird nie geändert; Korrektur = Gutschrift/Storno als eigene Rechnung (Frage S3).
- **Pflichtangaben:** Fehlen Betreiberangaben (Anschrift, USt-IdNr/Steuernummer), schlägt die Rechnung fehl (kein leeres PDF, Job meldet es als Aufgabe an Admin 1). Format der Nummer: Steuerberater (S2), Arbeitsannahme `RE-JJJJ-000001`.
- **Inhalt (Datenschutz):** Datum, Uhrzeit, Spiel-ID/Spielnummer, Betrag; **keine Team- und keine Spielernamen**.
### 3.6 USt-Schalter und Rundung
- Einstellung `vat_mode` (Admin 1) **ohne Standardwert**: ist sie nicht gesetzt, schlägt die Erzeugung fehl (Job-Aufgabe), es wird nie stillschweigend ein Satz angenommen. Werte `19` oder `kleinunternehmer` (Hinweistext Steuerberater, S2). `vat_percent`/`vat_cents` stehen je Rechnung fest.
- **Rundung als Parameter** in `src/lib/commission.ts` (reine Funktionen): Provision je Spiel abgerundet (3.3); **USt einmal auf die Nettosumme der Rechnung** gerechnet (nicht je Zeile), Summe der Zeilen = Netto exakt; die Rundungsregel ist Sache des Steuerberaters (S2) und nur dort änderbar.
### 3.7 Turnier und Hallenslots
Die Turnier-Provision (`tournaments.ts` `commissionPercent`/`splitEntryFees`/`settle`, Art `tournament_commission`) wird durch die Provision je Halle ersetzt (Vertrag 009). Das ist eine **eigene Etappe M2f** (oder Absprache mit 012 M5, Turnier auf Karte): Basis Eintrittsgelder, Zählung jedes gebuchten Hallenslots für den Zähler (3.4); bereits abgerechnete Turniere bleiben unverändert (P5).
### 3.8 Anzeige (AC-15)
Je Halle und Spiel Provision, Stripe-Gebühr und Rest; **Minus-Warnung**, wenn die Summe der Provisionen einer Halle im Zeitraum kleiner ist als die Summe der Gebühren; die Warnung zeigt, statt zu begrenzen. Quellen: Hauptbuch, Konto `commission`, `fees`; beide Buchungsmodelle (3.2). Nur Admin 1 (`canUser(user, "owner")`); Admin 2 sieht Finanzen nicht.

## 4. Dateiliste (Entwurf)
| Bereich | Dateien |
|---|---|
| Schema/Migration | `src/db/schema-finance.ts` (Spalten `venues`; Tabellen `match_commissions`, `invoices`, `invoice_lines`, `invoice_number_counter`; `matches.ledger_model`; neue Enum-Werte in `ledgerAccount` `venue_payable`, `commission` und `ledgerKind` `commission`, `commission_bonus`, **Zeilen 23-24**), `drizzle/<0047 ff.>_*.sql` (je Etappe, mit Journal und Snapshot), Nur-Anhängen-Trigger |
| Hauptbuch | `src/server/ledger.ts` (**Typen `Account`/`LedgerKind` erweitern**, `post`), `payments/charge.ts` (neues Modell: `clearing → venue_payable`), `payments/refund.ts` (Erstattung neues Modell), `booking.ts` (`recordExpense` je Modell), neu `src/server/commission.ts` (Satz, Schnappschuss, Buchung/Storno, Zähler, Bonus), `src/lib/commission.ts` (Rechnung Cent-genau, Rundung als Parameter) |
| Rechnung | neu `src/server/invoices.ts` (Erzeugen pro Halle, Nummer, Outbox), `src/server/invoice-pdf.tsx`, `src/server/jobs.ts` (Job `invoice-month`, `SCHEDULE`), `src/app/admin/finanzen/*` (Rechnungsliste, Abruf), `src/app/api/rechnungen/[id]/route.ts` |
| Anzeige | `src/server/finance.ts` (`listMatchFinance`, `overview`, `getAlerts`, CSV-Export: beide Modelle), `src/app/admin/finanzen/*` |
| Einstellungen | `src/app/admin/einstellungen/*` (USt-Schalter, Betreiberangaben), `src/server/settings.ts`, Halle: `src/app/admin/hallen/page.tsx` (Satz, nur `owner`) |
| Turnier | `src/server/tournaments.ts` (M2f), `src/lib/tournament.ts` |
| Doku | `docs/BETRIEB.md` (Monatsjob, Rechnungsversand, Buchungsmodell), `docs/loop/GO-LIVE-AUDIT.md`, Vertrag 009 (S1-Entscheid) |

## 5. Etappenschnitt (seriell, Schema nie parallel)
| Etappe | Inhalt | Migration | Pflichtchecks | Voraussetzung |
|---|---|---|---|---|
| M2a Einstellungen | `commission_percent` (CHECK 0..100), Bonus-Schalter, Vorgabe für neue Hallen, Pflicht-Begründung, Protokoll (AC-5) | ja | typecheck, lint, Unit, Integration, `db:generate` „No schema changes“, `migrate-check` | 009 M1 (gemergt), P1/P2 |
| M2b Hauptbuch | Enum-Werte (nur anlegen, nicht im selben Lauf nutzen), `ledger_model`, `match_commissions`, Konten/Arten, Buchung/Storno, Basis/Auslöser, `charge.ts`/`refund.ts`/`booking.ts`-Haken (AC-3, AC-10) | ja | wie M2a + Hauptbuch-Ausgleichstest | **S1, P4, P6, P7 entschieden** |
| M2c Zähler | Bonus, Lock-Reihenfolge, Rennen-Test (AC-4) | ja (Bonus-Art/Index) | wie M2a | M2b, P2/P3 |
| M2d Rechnung | Zähler-Tabelle, `invoices`/`invoice_lines`, PDF, Outbox, Job, USt-Schalter, Admin-Abruf (AC-6) | ja | wie M2a + **`npm run build`** | M2b/M2c, S2/S3, Betreiberangaben |
| M2e Anzeige | Provision/Gebühr/Rest, Minus-Warnung, beide Modelle (AC-15) | **keine** (kein `migrate-check`) | typecheck, lint, Unit, Integration, E2E AC-15 | M2b |
| M2f Turnier | Turnier-Provision je Halle, Hallenslots im Zähler | ggf. | wie M2a | 012 M5 oder Absprache, P5 |
Ein Writer je Etappe, Reviewer ≠ Writer, Security-Review Pflicht (Geld, Rechte, Rechnungsabruf). **Hallen-Abruf der Rechnungen** (011 M3) ist **kein Teil von M2**: erst nach 011 M1 (Zugang), sonst ist nur der Admin-Abruf umgesetzt.

## 6. Akzeptanzkriterien und Tests
| AC | Inhalt | Test |
|---|---|---|
| AC-3 | Halle mit p %: Hauptbuch `commission` = abgerundete Provision der Basis, ausgeglichen (Soll = Haben, Konto `commission`); **keine Doppelzählung** (Summe `commission` + Rest an der Halle = abgebuchte Summe, nie mehr); Erstattung/Absage storniert per Gegenbuchung, zweites Storno bucht nichts | `tests/integration/provision.test.ts` (neu) |
| AC-3b | Auslöser: genau eine Buchung `commission:<match>` je Spiel, erst bei Endzustand aller Abbuchungszeilen; Teilfälle: fehlgeschlagene/ersetzte Spieler, weniger Zahler, Wiederholung des Abschlusses, späte Erfolge nach Ersatz (keine zweite Provision) | `provision.test.ts` |
| AC-4 | 10 gebuchte Spiele (verschiedene Teams): Zähler 10, Bonus-Buchung `bonus:<venue>:<k>`, Zähler rollierend; abgesagte zählen nicht; nachträgliche Absage: Regel A5; **Rennen** mit echten parallelen Transaktionen (10. und 11. gleichzeitig): genau ein Bonus | `provision.test.ts` |
| AC-5 | Nur Admin 1 stellt Provision/Bonus ein; **ohne Begründung abgelehnt**; Protokoll wer/wann/vorher/nachher; Admin 2 und Betreiber abgelehnt; Wertebereich 0..100 (negativ, über 100, mehr als 2 Nachkommastellen abgelehnt); Änderung wirkt nur auf künftige Spiele | `provision.test.ts`, `admin-rollen.test.ts`/`admin-matrix` (Matrix) |
| AC-6 | Monatsende: je Halle ein Beleg, Zeile je Spiel, Bonus-Zeile, USt je Schalter; Nummern lückenlos und fortlaufend auch bei parallelem Erzeugen und bei **injiziertem Fehler** (Abbruch in der Transaktion verbraucht keine Nummer); Unique (Halle, Zeitraum): Job mehrfach ausführbar; Halle ohne Spiele: keine Nummer; ohne `vat_mode` oder ohne Betreiberangaben schlägt die Erzeugung fehl (kein leeres PDF); PDF/Mail ohne Team- und Spielernamen | `tests/integration/rechnungen.test.ts` (neu) |
| AC-10 | Jede Geldbewegung doppelt gebucht, nicht änderbar, Korrektur nur per Gegenbuchung; UPDATE/DELETE auf `ledger_entries`, `match_commissions`, `invoices`, `invoice_lines` abgelehnt | `tests/integration/ledger.test.ts` (erweitern), `provision.test.ts`, `rechnungen.test.ts` |
| AC-15 | Übersicht Admin 1: Kennzahlen, je Halle/Spiel Provision, Stripe-Gebühr, Rest in **beiden** Buchungsmodellen; Minus-Warnung; Altspiele unverändert | `tests/integration/finance.test.ts` (erweitern); **E2E `tests/e2e/admin.spec.ts` (AC-15) gehört zu M2e** |
| M2-S | Rundung: Provision nie > vereinbart, Summe der Zeilen = Netto, USt einmal auf die Summe; Rundung als Parameter | Unit `tests/unit/commission.test.ts` (neu) |
| M2-Z | Admin-Abruf der Rechnungen nur Admin 1; Hallen-Abruf erst mit 011 M1/M3 (dann nur eigene) | `rechnungen.test.ts` |
**Mutationen je Etappe (Pflicht, einzeln belegt):**
- M2a: Admin-1-Wächter am Satz entfernen → rot; Wertebereich-CHECK entfernen → rot; Pflicht-Begründung entfernen → rot.
- M2b: Schnappschuss entfernen (nimmt aktuellen Satz) → rot; Storno-Schlüssel `commission-reversal:<match>` entfernen (zweites Storno bucht doppelt) → rot; Auslöser pro Zeile statt bei Endzustand → rot; Basis ohne Erstattungsabzug → rot; Altmodell-Kennzeichen ignorieren (Doppelzählung) → rot; Trigger auf `match_commissions` entfernen → rot.
- M2c: **Hallenzeilensperre entfernen** → Rennen-Test rot; „abgesagte zählen nicht“ entfernen (Bonus ohne Absage-Filter) → rot; Bonus-Schlüssel entfernen → rot.
- M2d: **Unique (`venue_id`, `period`) entfernen** → rot; Sperre auf den Nummernzähler entfernen → rot; Nummernvergabe außerhalb der Transaktion → rot; PDF/Mail in der Nummern-Transaktion (Fehlerstelle) → rot; `vat_mode`-Standardwert einführen → rot; Trigger auf `invoices` entfernen → rot.
- M2e: Minus-Warnung entfernen → rot; Buchungsmodell ignorieren → rot.

## 7. Beleg-Befehle (je Etappe wie in der Tabelle 5)
`npm run typecheck`; `npm run lint`; `npm test` (mit Zeitlimit); `npm run test:integration` (leerer `STRIPE_SECRET_KEY`, Wegwerf-Datenbank, nie parallel zu anderen Worktrees); `npm run db:generate` (danach „No schema changes“, nur mit Migration); `node --env-file=.env.local scripts/migrate-check.mjs` (frisch und bestehend, nur mit Migration); E2E nur betroffene Specs mit `--workers=2`; `npm run build` (M2d).

## 8. Migrationen
**Startbedingung jeder Etappe:** Nummer gegen `origin/main` prüfen (0046 vergibt w1 für M5-2a, M2 beginnt bei **0047**; Absprache mit t1d). Neue **Enum-Werte** (`ledger_account`: `venue_payable`, `commission`; `ledger_kind`: `commission`, `commission_bonus`) nur per `ADD VALUE IF NOT EXISTS` und **nie im selben Migrationslauf verwenden** (Erfahrung 009 M1: der Migrator führt alle offenen Migrationen in einer Transaktion aus; Tests, Backfill und Trigger-Funktionen dürfen den neuen Wert in dieser Migration nicht ansprechen). Keine Datenumschreibung bestehender Buchungen; Altspiele ohne `ledger_model` gelten als `legacy`. Rollback: Code zurück, neue Spalten/Tabellen/Enum-Werte bleiben ungenutzt. Hallen-Abruf der Rechnungen hängt an 011 M1.

## 9. Datenschutz und Sicherheit
- Rechnungsinhalt: Datum, Uhrzeit, Spiel-ID/-Nummer, Betrag; **keine Team- und keine Spielernamen**, keine Kontaktdaten (Test auf PDF und Mail). `invoices → venues` mit `ON DELETE RESTRICT`.
- Rechnungen sind Buchungsunterlagen mit Aufbewahrungspflicht; die Konto-Löschung eines Spielers berührt sie nicht (keine Spielerbezüge). Aufbewahrungsdauer: Recht R1.
- Zugriff: Satz und Rechnungen nur Admin 1 (`owner`), serverseitig (Seite und Aktion); Hallen später nur eigene (011).
- `invoice_email` der Halle kann eine Einzelperson sein: Zweckbindung Rechnungsversand (R1).

## 10. Risiken
1. **Doppelzählung** im Hauptbuch (3.2): größtes Risiko, falsche Marge/AC-15; Entscheid S1 vor M2b.
2. **Deadlock/Sperrreihenfolge** mit `lockUser`/`debitWallet` (3.4); fester Ablauf und Rennen-Test.
3. **Lückenlose Nummern** bei Abbruch/Parallelität (3.5); Zähler-Tabelle statt Sequenz, Fehlerstellen-Test.
4. **Hook im geprüften Zahlungsfluss** (`charge.ts`/`refund.ts`): Security-Review, Ausgleichstest je Pfad.
5. **Enum-Falle** (8).
6. **Steuerfragen** (USt, Aussteller): ohne Antwort kann M2d nicht gebaut werden.
7. **Betreiberangaben fehlen** (Anschrift, USt-IdNr, Mail-Dienst): blockiert M2d und den Go-live (FEHLT-NOCH).
8. **Altspiele/Turniere im Übergang:** zwei Buchungsmodelle nebeneinander; Auswertung, Export und Alarme müssen beide kennen.

## 11. Arbeitsannahmen (nur zur Prüfbarkeit, keine Entscheide)
A1 Variante A (Verbindlichkeit Halle). A2 Basis = erfolgreich abgebuchte Summe abzüglich Erstattungen. A3 Auslöser = alle Abbuchungszeilen im Endzustand. A4/P7 Storno ganz oder anteilig. A5 Bonus bleibt bei nachträglicher Absage auf dem abgesagten Spiel. Jede Annahme wird mit der Antwort auf die zugehörige Frage ersetzt oder bestätigt.

## 12. Fragen (nur gestellt; Produkt: Nutzer/t9, Steuer: Steuerberater, Recht: Anwalt)
**Produkt**
- **P1:** Prozent und 10er-Bonus „und/oder“: nebeneinander oder wählt Admin 1 eines von beiden?
- **P2:** Was ist der „feste Hallenpreis“, der den 10er-Bonus bildet: Spielerpreis (`price_rules.price_cents`) oder Hallenkosten (`cost_cents`), und für welche Spieldauer?
- **P3:** Wird ein schon ausgelöster 10er-Bonus zurückgenommen, wenn eines der zehn Spiele danach abgesagt wird (A5: nein)?
- **P4:** Gilt die Provision erst ab Einführung (Altspiele behalten das alte Modell) oder rückwirkend?
- **P5:** Übergang der Turnier-Provision: Wie werden bereits abgerechnete Turniere behandelt (Vertrag 009: Provision je Halle ersetzt die globale; Übergang offen)?
- **P6:** Bemessungsgrundlage der Prozent-Provision: Hallenmiete (welcher Wert) oder tatsächlich abgebuchte Spielersumme (A2)?
- **P7:** Provision bei teilweiser oder späterer Erstattung: ganz stornieren oder anteilig kürzen?

**Steuer (Steuerberater, E4)**
- **S1:** Buchungsschnitt und Kontenrahmen: Variante A (Verbindlichkeit Halle, nur Provision als Ertrag) oder B (Auswertung); SKR03-Zuordnung von Provision, Durchlaufgeld (Hallenmiete) und Stripe-Gebühr; ist die Hallenmiete umsatzsteuerlich Durchlaufposten?
- **S2:** Umsatzsteuer und Rechnungsstellung: Ausweis (19 % oder Kleinunternehmer), Rundung, Pflichtangaben und Nummernformat der Rechnung an die Halle.
- **S3:** Rechnungskorrektur (Storno/Gutschrift) nach einer Absage oder Erstattung nach dem Rechnungslauf.

**Recht (Anwalt)**
- **R1:** Aufbewahrungsdauer und Löschung von Rechnungen und Provisionsdaten; Zusammenhang mit Konto-Löschung der Hallenbetreiber (G12-012, G17).
- **R2:** Wer ist Rechnungsaussteller bei Stripe Connect (Soccaz oder Halle; G14-012)?
