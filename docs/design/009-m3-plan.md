# Plan 009 M3 (Entwurf v1): Beweisprotokoll mit PDF, Rest aus M2

Status: Entwurf v2 (nur Doku, kein Code), Stand 2026-11-12, Verfasser worker-2; Entscheide t9 nachgetragen (Abschnitt 0a). Grundlage: Vertrag 009 v4 (AC-7), Plan `docs/design/009-m2-plan.md`, Code nach 009 M2 (PR #134).
Rechts- und Steuerfragen werden nur gestellt (Anwalt, Steuerberater), nie von Agenten beantwortet.

## 0a. Entscheide t9 (2026-11-12, zu Plan v1)
- **Q0:** Vertrag 009 gilt: M3 = Beweisprotokoll (AC-7), M4 = Kalender/DATEV, M5 = KI-Belege. Gutschrift S3 bleibt blockiert (Steuerberater); die Kontenzuordnung gehört zu M4.
- **Q1:** **eine globale Hash-Kette** mit lückenlosem `seq` (Abschnitt 3 gilt wie geplant).
- **Q2:** Der Hallen-Abruf ist **ja, aber später mit 011 M3**: nur die eigene Halle, nie Spielernamen. In 009 M3 hat **nur Admin 1** Zugriff.
- **R3 und S3** bleiben bei Anwalt bzw. Steuerberater (nicht von Agenten zu beantworten). Sie stehen als **FEHLT-NOCH** (unten, Abschnitt 11) und als Eintrag im GO-LIVE-AUDIT (Titel „009 M3: Aufbewahrung und Beweiswert des Beweisprotokolls (R3)“ und „009 M2/M3: Gutschrift-Ablauf (S3)“; der Eintrag selbst kommt mit dem Doku-PR des Task Managers).
- Der Bau der **Gutschrift** beginnt erst nach der Antwort zu S3. Der Rest von 009 M3 (Protokoll, Hash-Kette, PDF-Export) darf **ohne S3** gebaut werden.
- **Code-Start** erst nach dem Plan-Review (worker-4) UND nach dem Merge von PR #134. **Migration:** die nächste freie Nummer nach 0051, also **0052** (statt „0050 oder nächste freie“).

## 0. Einordnung und Abgrenzung (durch Q0 entschieden)
Der Vertrag schneidet so: **M3 = Beweisprotokoll mit PDF (AC-7)**, **M4 = Kalender, Auswertungen, DATEV-CSV (AC-11)**, **M5 = KI-Belege (AC-12 bis 14)**. Der Auftrag nannte als „Verbleib“ für M3 zusätzlich das Gutschrift-Ablauf (S3) und die konfigurierbare Kontenzuordnung (009 M4/M5). Dieser Plan hält beides getrennt:
- **Teil A (Vertrag M3):** Beweisprotokoll. Voll planbar, keine offene Rechts-/Steuerfrage blockiert den Bau.
- **Teil B (Rest aus M2):** Gutschrift-Ablauf (S3) ist **blockiert** durch die Steuerberater-Frage; Kontenzuordnung (SKR03) gehört nach dem Vertrag zu M4 (DATEV-Export), nicht zu M3.
**Q0 entschieden:** M3 = nur Teil A; Teil B bleibt in M4 bzw. wartet auf S3.

## 1. Ziel (Teil A)
Jede Buchungsanfrage an eine Halle wird mit Server-Zeitstempel festgehalten: Platz frei ja/nein, Zusage oder Ablehnung mit Begründung. Das Protokoll ist nur anhängend (Datenbank-Trigger wie beim Hauptbuch), jede Zeile trägt einen Hash der Vorgängerzeile (Hash-Kette, prüfbar), und es gibt einen PDF-Export. Zweck: Nachweis gegenüber Halle und Spielern, wann wer was gefragt und geantwortet hat (Streitfall, Partnervertrag).

## 2. Bestand (Code nach M2)
- Anfragen an Hallen: `match_hall_requests` (Schema `schema-matchmaking.ts`), Ablauf in `src/server/veto.ts` (`startHallCheck`, `answerHallRequest`, `settleHallCheck`, `advanceVetos`), Buchungsaufträge `booking_jobs` in `src/server/booking.ts`.
- Append-only-Muster vorhanden: `forbid_ledger_mutation` (0007) und `forbid_append_only_mutation` (0048, Wartungsausnahme `socaz.ledger_maintenance`); Eingriffsprotokoll `audit_log` (nicht append-only, nicht verkettet).
- PDF-Muster vorhanden: `src/server/invoice-pdf.tsx` (`@react-pdf/renderer`, Schrift mindestens 12 pt wegen Regel `soccaz/min-font-size`).

## 3. Zielbild
Neue Tabelle `booking_evidence` (nur anhängend):
| Spalte | Inhalt |
|---|---|
| `id`, `seq` | Schlüssel; `seq` lückenlose Folge je Kette (Zähler-Zeile mit Sperre, wie Rechnungsnummern) |
| `match_id`, `venue_id` | Bezug (kein Personenbezug im Protokolltext) |
| `kind` | `request_sent`, `answer_free`, `answer_busy`, `accepted`, `declined`, `expired` |
| `reason` | Begründung der Halle (höchstens 300 Zeichen, bereinigt) |
| `at` | Server-Zeit (`now()` der Datenbank, nie vom Client) |
| `prev_hash`, `hash` | SHA-256 über `seq|match_id|venue_id|kind|reason|at|prev_hash` |
- **Schreibpunkte** (ein Haken je Zustandswechsel, in derselben Transaktion wie der Wechsel): `startHallCheck` (Anfrage gesendet), `answerHallRequest` (frei/belegt, Zusage/Ablehnung), `settleHallCheck`/`advanceVetos` (abgelaufen), Buchungsauftrag Zusage/Absage in `updateBookingJob`.
- **Hash-Kette:** `seq` aus einer Zählerzeile `FOR UPDATE`; die Kette ist global (eine Reihe), damit Lücken auffallen. Prüfung `verifyEvidenceChain()` rechnet alle Zeilen nach und meldet die erste Abweichung. Wartungsausnahme wie beim Hauptbuch.
- **PDF-Export:** `/api/beweis/[matchId]` (nur Admin 1, 404 sonst), Inhalt: Spiel-Nummer, Halle, Tabelle der Einträge mit Zeit (Europe/Berlin und UTC), Hash-Kopf der Kette; keine Namen von Spielern/Teams (wie bei der Rechnung). Hallen-Abruf erst mit 011 (nur die eigene Halle).
- **Admin-Ansicht:** Liste je Spiel im Admin; Admin-Seiten gelten bis 013 M7 als degradiert (wie M2, Impeccable-Pflicht AC-15 dort).

## 4. Etappen (seriell, Schema nie parallel)
| Etappe | Inhalt | Migration | Pflichtchecks |
|---|---|---|---|
| M3a Schema + Kette | `booking_evidence`, Zähler, Trigger, `recordEvidence(tx, …)`, `verifyEvidenceChain` | ja (**0052**) | typecheck, lint, Unit, Integration, `db:generate` „No schema changes“, `migrate-check` |
| M3b Haken | Schreibpunkte in `veto.ts`/`booking.ts` (je ein Test je Zustandswechsel, Rollback-Test: schlägt der Wechsel fehl, bleibt kein Eintrag) | keine | Integration der betroffenen Suiten (`halls`, `matchmaking`, Buchung) |
| M3c PDF + Abruf | `evidence-pdf.tsx`, Route, Admin-Liste (nur Admin 1) | keine | wie M3b + `npm run build`, Zugriffstest Admin 2 (Seite + Route), axe |
Ein Writer je Etappe, Reviewer ≠ Writer, Security-Review Pflicht (Berechtigung, Hash-Kette, PDF-Abruf).

## 5. Akzeptanzkriterien AC-7 (präzisiert) und Tests (`tests/integration/beweisprotokoll.test.ts`)
1. Jede Anfrage/Antwort erzeugt genau einen Eintrag mit Server-Zeit, `kind`, Begründung; ein zweiter Aufruf desselben Wechsels (Doppelklick, Wiederholung) erzeugt keinen zweiten.
2. UPDATE und DELETE werden von der Datenbank abgelehnt (Test mit Trigger); nur `socaz.ledger_maintenance` erlaubt Wartung.
3. Hash-Kette: unveränderte Kette ist gültig; eine per Wartungsausnahme geänderte Zeile wird von `verifyEvidenceChain` an der richtigen `seq` erkannt (Mutationstest).
4. `seq` lückenlos auch bei parallelen Schreibern (Gate-Test wie bei den Rechnungsnummern) und bei Abbruch der Transaktion (keine verbrauchte Nummer).
5. PDF: Admin 1 erhält ein gültiges PDF, Admin 2, Spieler, Gast und unbekannte ID erhalten dieselbe 404-Antwort; kein Name im PDF.
6. Begründung wird gekürzt/bereinigt (keine Steuerzeichen), Eingabe der Halle kann keine Seitenstruktur des PDF verändern.

## 6. Migrationen
Genau eine Migration (M3a). Nummer: **0052** (nächste freie nach 0051, Entscheid t1d/t9); vor dem Bau die Journal-Liste auf `origin/main` prüfen, nach #134 neu erzeugen (`db:generate` „No schema changes“). Enum-Werte nur anlegen, nicht im selben Lauf nutzen (hier keine neuen Enum-Werte nötig, `kind` ist Text mit CHECK).

## 7. Datenschutz und Sicherheit
- Kein Personenbezug im Protokoll (Spiel-ID, Halle, Art, Begründung der Halle). Begründungen der Hallen sind Fremdtext: bereinigen, kürzen, im PDF als reiner Text.
- Aufbewahrung: nur anhängend, daher keine Löschung; Löschanfragen von Spielern berühren das Protokoll nicht (kein Personenbezug). **Frage R3 (Anwalt):** Aufbewahrungsdauer und Löschkonzept des Beweisprotokolls.
- Abruf nur Admin 1; Fehlerantworten ohne Unterschied zwischen „fremd“ und „unbekannt“.

## 8. Risiken
- Haken in `veto.ts` liegen in Transaktionen mit Sperrreihenfolge Spiel → Halle: der Zähler (`booking_evidence_counter`) wird **zuletzt** gesperrt, damit keine Verklemmung entsteht; Lock-Reihenfolge im Test belegen.
- Globale Kette = ein Engpass beim Schreiben; bei der erwarteten Last (wenige Anfragen je Minute) unkritisch. Alternative Kette je Spiel: einfacher, aber Lücken zwischen Spielen unsichtbar (Q1).
- Wartungsausnahme darf die Kette brechen; jede Nutzung gehört in die Go-live-Prüfliste (wie `ledger_maintenance`).
- Qualifizierter Zeitstempel (Dritter) ist nicht Teil von M3 (Vertrag: später, Anwalt).

## 9. Teil B: Rest aus M2 (nur Vorbereitung, nicht in M3 gebaut)
- **Gutschrift-Ablauf (S3):** offen ist, ob nach einer Absage oder Erstattung **nach** dem Rechnungslauf eine Gutschrift als eigene Rechnung (negative Zeilen, eigene Nummer aus dem Zähler, Bezug auf die Ursprungsrechnung) oder eine Verrechnung auf der nächsten Monatsrechnung gilt. Beides ist steuerlich zu klären (Steuerberater). Technisch vorbereitet durch M2: Rechnungen und Zeilen sind nur anhängend, Provisionsstorno liegt als Gegenbuchung vor (`commission-reversal:<Spiel>`), Zeilen verweisen auf die Buchung. **Bau erst nach der Antwort zu S3.**
- **Kontenzuordnung:** Hauptbuch-Konten → SKR03-Konten, in den Einstellungen änderbar; gehört zu M4 (DATEV-CSV). Vorbereitung: Tabelle `account_mapping` (Konto, Gegenkonto, Steuerschlüssel), Vorgabe als Annahme, Bestätigung durch den Steuerberater (E4).
- Weitere Rest-Punkte aus M2 stehen im Backlog (Einträge 125 bis 136): Schnappschuss der Betreiberangaben in der Rechnung, Alarm auf negativen `venue_payable`-Saldo, Rechnungsversand at-least-once, Default des Testlaufs im Provisionsmodell.

## 10. Fragen (Stand nach Entscheid t9)
- ~~Q0~~, ~~Q1~~, ~~Q2~~: entschieden (Abschnitt 0a).
- **R3** (Anwalt): Aufbewahrung/Löschung und Beweiswert des Protokolls; qualifizierter Zeitstempel später.
- **S3** (Steuerberater): Gutschrift als eigene Rechnung oder Verrechnung; Nummernkreis; Ausweis der USt.

## 11. FEHLT-NOCH (Entscheide Dritter, blockieren den Bau von Teil A nicht)
| Punkt | Wer | Wirkung |
|---|---|---|
| **R3** Aufbewahrungsdauer, Löschkonzept und Beweiswert des Beweisprotokolls; qualifizierter Zeitstempel später | Anwalt | Go-live-Bedingung (GO-LIVE-AUDIT), Protokoll bleibt bis dahin nur anhängend, keine Löschung |
| **S3** Gutschrift als eigene Rechnung oder Verrechnung, Nummernkreis, USt-Ausweis | Steuerberater | Bau der Gutschrift wartet; Rechnungen bleiben unverändert |
