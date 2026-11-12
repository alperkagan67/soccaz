# Plan 009 M3 (Entwurf v3): Beweisprotokoll mit PDF, Rest aus M2

Status: Entwurf v3 mit Nachtrag Q1a (nur Doku, kein Code), Stand 2026-11-12, Verfasser worker-2. v3 arbeitet den Plan-Review R-T208 (10 Punkte) ein und enthält die Entscheide t9 (Abschnitt 0a). Grundlage: Vertrag 009 v4 (AC-7), Plan `docs/design/009-m2-plan.md`, Code nach 009 M2 (PR #134), Plan 011 M1.
Rechts- und Steuerfragen werden nur gestellt (Anwalt, Steuerberater), nie von Agenten beantwortet.

## 0a. Entscheide t9 (2026-11-12) und offene Präzisierung
- **Q0:** Vertrag 009 gilt: M3 = Beweisprotokoll (AC-7), M4 = Kalender/DATEV, M5 = KI-Belege. Gutschrift S3 bleibt blockiert (Steuerberater); die Kontenzuordnung gehört zu M4.
- **Q1 (entschieden: global):** eine globale Hash-Kette mit lückenlosem `seq`. **Präzisierung offen (Q1a, an t9, Abschnitt 3.3):** ein Spiel-Auszug einer globalen Kette ist ohne die Nachbarzeilen nicht prüfbar, und eine Kette in derselben Datenbank fängt einen Datenbank-Administrator nicht ab. Der Plan legt dazu zwei Varianten offen dar.
- **Q1a (entschieden, t9): Variante G jetzt.** Globale Kette; **Kopf-Hash und Anzahl** werden in **jedem Admin-Abruf** und **täglich außerhalb der Datenbank** ausgegeben; das PDF nennt Kopf-Hash, Anzahl und Prüfergebnis der **Gesamtkette**. **Variante Z** (Kette je Spiel) wird nur als **Zusatzspalte** (`match_prev_hash`, ohne Auswertung) angelegt; ihr Einsatz wird später entschieden. Der **Ablageort des Kopf-Hashs** außerhalb der Datenbank ist eine **Frage an den Anwalt** (FEHLT-NOCH Abschnitt 11, GO-LIVE-AUDIT-Zeile „009 M3: Ablageort Kopf-Hash“, kommt mit dem Doku-PR).
- **evidence_actor außerhalb des Hashes (t9, Entwurf, R3 bleibt offen):** bestätigt als Entwurf. **Test:** Löschen oder Anonymisieren eines Actors lässt die Kette gültig (`verifyEvidenceChain` meldet keine Abweichung, `evidence_actor` leer/gelöscht).
- **Q2:** Hallen-Abruf ja, später mit 011 M3, nur die eigene Halle, nie Spielernamen. In 009 M3 nur Admin 1.
- **R3 und S3** bleiben bei Anwalt bzw. Steuerberater, stehen als FEHLT-NOCH (Abschnitt 11) und als Eintrag im GO-LIVE-AUDIT (kommt mit dem Doku-PR des Task Managers).
- Der Bau der **Gutschrift** beginnt erst nach der Antwort zu S3. Der Rest von 009 M3 (Protokoll, Hash-Kette, PDF-Export) darf **ohne S3** gebaut werden.
- **Code-Start** erst nach Plan-Review (worker-4) UND nach Merge von PR #134. **Migration:** Nummer erst beim Bau aus `origin/main` (frei ab 0052, Entscheid t1d/t9).

## 0. Abgrenzung
- **Teil A (Vertrag M3):** Beweisprotokoll, voll planbar.
- **Teil B (Rest aus M2):** Gutschrift-Ablauf (S3, blockiert); Kontenzuordnung (SKR03) gehört zu M4.

## 1. Ziel (Teil A)
Jede Buchungsanfrage an eine Halle und jede Antwort wird mit Server-Zeitstempel festgehalten: Anfrage, Antwort der Halle (frei/belegt, Zusage/Ablehnung), Ablauf der Frist, Rückzug/Entzug, Ergebnis des Buchungsauftrags. Das Protokoll ist nur anhängend (Datenbank-Trigger wie beim Hauptbuch), jede Zeile trägt einen Hash der Vorgängerzeile (prüfbar) und es gibt einen PDF-Export. Zweck: Nachweis gegenüber Halle und Spielern, wann wer was gefragt und geantwortet hat (Streitfall, Partnervertrag).

## 2. Bestand (Code nach M2, geprüft)
- `match_hall_requests` (Schema `schema-matchmaking.ts`): Schlüssel (`match_id`, `venue_id`), `status` = `pending | confirmed | declined | unmanaged`, `answered_by`, `answered_at`; **kein Begründungsfeld**. FK `match_id` → `matches` mit `ON DELETE CASCADE`.
- Schreibpfade (vollständig, Grep nach `matchHallRequests`): `veto.ts` `startHallCheck` (löscht alle Zeilen des Spiels und legt sie neu an: `pending` bei Hallen mit Betreiber, sonst `unmanaged`), `settleHallCheck` (Ablauf: alle `pending` → `declined`; keine freie Halle: alle Zeilen des Spiels gelöscht, neuer Termin), `answerHallRequest` (`confirmed` bzw. `declined`, mit `answered_by`/`answered_at`), `veto.ts:54` (Löschen bei „keine Halle frei“). **Wichtig:** `startHallCheck` läuft bei einem neuen Termin **mehrfach je Spiel**; die Anfragezeilen werden jedes Mal neu erzeugt.
- `booking_jobs`: `status` = `open | in_progress | booked | unavailable | confirmed | withdrawn | done` (Enum `booking_status`), Schreibpfade in `booking.ts`: `createBookingJob` (Insert `open`), `withdrawBookingJob` (`withdrawn`), `updateBookingJob` (jeder erlaubte Wechsel nach `canTransition`), `runBookingAgent` (`booked` bzw. `unavailable`).
- Append-only-Muster: `forbid_ledger_mutation` (0007), `forbid_append_only_mutation` (0048, 009 M2, Wartungsausnahme `socaz.ledger_maintenance`); Eingriffsprotokoll `audit_log` (nicht append-only, nicht verkettet).
- PDF-Muster: `src/server/invoice-pdf.tsx` (`@react-pdf/renderer`, Schrift mindestens 12 pt, Regel `soccaz/min-font-size`).
- **Abhängigkeit 011 M2:** Eine Begründung der Halle bei Ablehnung gibt es im Code noch nicht (kommt mit 011 M2, nicht gebaut). Bis dahin ist `reason` leer; der Plan setzt `reason` optional (NULL erlaubt) und nennt die Abhängigkeit.

## 3. Zielbild
### 3.1 Tabellen
`booking_evidence` (nur anhängend), **ohne Personenbezug im Hash**:
| Spalte | Inhalt |
|---|---|
| `id` | Schlüssel |
| `seq` | lückenlose Folge (Zählerzeile `booking_evidence_counter`, FOR UPDATE) |
| `match_id`, `venue_id` | Bezug; Fremdschlüssel **RESTRICT** (Begründung Abschnitt 8.2) |
| `round` | Zähler der Hallenprüfungen je Spiel (`startHallCheck` erhöht ihn); trennt neue Termine desselben Spiels |
| `kind` | siehe 3.2 (CHECK-Liste) |
| `reason` | Begründung der Halle, optional, höchstens 300 Zeichen, bereinigt (Fremdtext) |
| `at` | `clock_timestamp()` der Datenbank, in DERSELBEN Transaktion gelesen, UTC mit Mikrosekunden |
| `prev_hash`, `hash` | SHA-256, siehe 3.4 |
`evidence_actor` (getrennt, **außerhalb des Hashes**): `evidence_id` (FK), `user_id`, `name`, `email`. Zweck: der Betreiber, der geantwortet hat (Plan 011 P2 verlangt Name und E-Mail des Google-Kontos im Beweisprotokoll, nur für Admin 1). Im Hash steht nur ein **gesalzener Verpflichtungswert** (`actor_commitment` = SHA-256 über Salz je Zeile + `user_id`), nicht die Person. Wird die Person anonymisiert oder gelöscht (DSGVO), wird nur die Zeile in `evidence_actor` gelöscht bzw. geleert; die Kette bleibt gültig. **Das ist ein Entwurf als Frage an den Anwalt (R3), keine Entscheidung**; die Alternative (Personenfelder im Hash) schließt Löschung/Anonymisierung aus.

### 3.2 Zustandswechsel → `kind` (Matrix, vollständig)
Für JEDEN Schreibpfad gilt: ohne Eintrag kein Wechsel (Test 5.2 prüft die Matrix per Grep/Test).
| Pfad | Wechsel | `kind` |
|---|---|---|
| `startHallCheck` | Zeile neu (`pending`) | `request_sent` |
| `startHallCheck` | Zeile neu (`unmanaged`, Halle ohne Betreiber, keine Anfrage möglich) | `unmanaged` (011 P5) |
| `answerHallRequest` | `pending` → `confirmed` | `accepted` |
| `answerHallRequest` | `pending` → `declined` | `declined` (mit Begründung ab 011 M2, sonst leer) |
| `settleHallCheck` (Frist) | `pending` → `declined` | `expired` |
| `settleHallCheck`/`veto.ts:54` | Zeilen gelöscht („keine Halle frei“) | **kein eigener Eintrag nötig** (Ergebnis steht in den Einträgen davor); Test: Löschen verändert das Protokoll nicht |
| Rückzug/Entzug (Betreiberzugang entzogen, Zeile fällt weg; 011) | Entzug | `withdrawn` |
| `createBookingJob` | Auftrag `open` | `job_open` |
| `updateBookingJob` | jeder Wechsel nach `booked`, `confirmed`, `unavailable`, `withdrawn`, `done` | `job_booked`, `job_confirmed`, `job_unavailable`, `job_withdrawn`, `job_done` |
| `runBookingAgent` | `booked` / `unavailable` | `job_booked` / `job_unavailable` |
| `withdrawBookingJob` | `withdrawn` | `job_withdrawn` |
Der Wechsel `in_progress` ist ein interner Arbeitsstand und wird nicht protokolliert (Begründung: kein Ergebnis gegenüber der Halle). Die Liste der Arten ist ein CHECK in der Tabelle und eine Konstante im Code; der Matrix-Test vergleicht beide.

### 3.3 Hash-Kette: Variante und Verankerung (Frage Q1a an t9, nicht entschieden)
- **Variante G (entschieden, Q1/Q1a): eine globale Kette.** Vorteil: Lücken über alle Spiele fallen auf. Nachteile (Review): (a) ein **Spiel-Auszug** (PDF) ist ohne die Nachbarzeilen nicht prüfbar; (b) die Kette liegt in derselben Datenbank, ein Datenbank-Administrator kann sie neu berechnen. Abhilfe in G: **Kopf-Hash und Anzahl** (`seq` des letzten Eintrags + Hash) werden **außerhalb der Datenbank verankert** (täglich und bei jedem Admin-Abruf des PDFs ausgegeben; Ziel und Verfahren sind eine Frage an den Anwalt, z. B. Mail an Admin 1, Ablage im Sicherungsziel, Zeitstempeldienst).
- **Variante Z (nur als Zusatzspalte, Einsatz später): zwei Ebenen.** Je Spiel eine eigene Kette (für das PDF, in sich prüfbar) **plus** eine globale `seq` nur zur Lückenerkennung. Vorteil: Das Spiel-PDF ist allein prüfbar. Nachteil: zwei Zähler, mehr Aufwand.
- Der Bau (M3a) setzt G um: Kopf-Hash und Anzahl stehen in jedem Admin-Abruf (Seite und PDF) und werden **täglich** als Job (`evidence-head`, Cron täglich) an das noch festzulegende Ziel außerhalb der Datenbank gegeben (bis zur Antwort des Anwalts: Ausgabe an Admin 1 per Benachrichtigung und Eintrag im Eingriffsprotokoll). Z wird nur als Spalte `match_prev_hash` (NULL erlaubt) angelegt und nicht ausgewertet; kein Umbau nötig, wenn Z später gewählt wird.

### 3.4 Hash-Definition (kanonisch)
- Eingabe: **längenpräfixierte Kodierung** (jedes Feld als `<Länge in Byte>:<Bytes>` in fester Reihenfolge, UTF-8), nicht `|`-getrennt, weil `reason` Trennzeichen enthalten kann. Feldfolge: `seq`, `match_id`, `venue_id`, `round`, `kind`, `reason` (leer = Länge 0), `at` (UTC, ISO 8601 mit Mikrosekunden), `actor_commitment`, `prev_hash`.
- `at` ist `clock_timestamp()` der Datenbank, in derselben Transaktion gelesen; nie vom Client.
- **Eine** Funktion berechnet den Hash für Schreiben und Prüfen: als SQL-Funktion `evidence_hash(...)` (pgcrypto) im Trigger `BEFORE INSERT`, damit weder die Anwendung noch ein Test einen anderen Hash einschleusen kann; `verifyEvidenceChain()` ruft dieselbe Funktion auf.
- Test: gleiche Eingabe ergibt gleichen Hash (auch mit `|`, Zeilenumbruch, Unicode, Emoji, leerem `reason`); jede Änderung eines Feldes ergibt einen anderen Hash.

### 3.5 Schreibpunkte und Idempotenz
- Ein Haken `recordEvidence(tx, …)` je Zustandswechsel (Matrix 3.2), in **derselben Transaktion** wie der Wechsel (Rollback des Wechsels = kein Eintrag).
- **Idempotenz ohne Lücke:** `UNIQUE (match_id, venue_id, round, kind)` und eine **Existenzprüfung VOR dem Zähler**; ein Doppelaufruf (Doppelklick, Wiederholung) verbraucht keine `seq`. (Das `round` ist nötig, weil `startHallCheck` je Spiel mehrfach läuft und die Anfragezeilen jedes Mal neu entstehen; ohne `round` wäre der zweite Termin blockiert.)
- Test: „Doppelaufruf: `seq` lückenlos“.

### 3.6 PDF-Export und Abruf
- Route `/api/beweis/[matchId]`, **nur Admin 1** (`canUser(user, "finance")` oder die in M2 verwendete Regel, im Route-Handler geprüft, nicht nur in der Seite); **gleiche 404-Antwort** für fremd, unbekannt und ungültige UUID; `Cache-Control: private, no-store`; Dateiname ohne Personenbezug (`beweis-<Spielnummer>.pdf`).
- Inhalt: Spiel-Nummer, Halle, Tabelle der Einträge mit Zeit in **UTC und Europe/Berlin**, `kind`, `reason` als reiner Text (Steuerzeichen und Pseudo-Markup entfernt bzw. wörtlich dargestellt), **Gesamtzahl, Kopf-Hash und Ergebnis der Kettenprüfung**; bei Variante G der Hinweis, dass ein Auszug nur zusammen mit dem Kopf-Hash prüfbar ist. Der Betreiber (aus `evidence_actor`) erscheint nur im Admin-1-PDF mit Name; die Halle erhält ihren eigenen Auszug erst mit 011 M3 und **nie Spielernamen**.
- Admin-Ansicht: Liste je Spiel; Admin-Seiten gelten bis 013 M7 als degradiert (wie M2, Impeccable-Pflicht AC-15 dort).

## 4. Etappen (seriell, Schema nie parallel)
| Etappe | Inhalt | Migration | Pflichtchecks |
|---|---|---|---|
| M3a Schema + Kette | `booking_evidence`, `evidence_actor`, Zähler, Trigger (Append-only, Hash), `recordEvidence`, `verifyEvidenceChain` | ja (Nummer erst beim Bau aus `origin/main`, ab 0052) | typecheck, lint, Unit, Integration, `db:generate` „No schema changes“, `migrate-check` |
| M3b Haken | Schreibpunkte in `veto.ts`/`booking.ts` nach Matrix 3.2, Tests je Wechsel, Rollback-Test, Matrix-Test | keine | Integration der betroffenen Suiten (`halls`, `matchmaking`, Buchung, `venue-manager-owner`) |
| M3c PDF + Abruf | `evidence-pdf.tsx`, Route, Admin-Liste (nur Admin 1) | keine | wie M3b + `npm run build`, Zugriffstest Admin 2 (Seite + Route), axe |
Ein Writer je Etappe, Reviewer ≠ Writer, Security-Review Pflicht (Berechtigung, Hash-Kette, PDF-Abruf, Personendaten).

## 5. Akzeptanzkriterien AC-7 (präzisiert) und Tests (`tests/integration/beweisprotokoll.test.ts`)
1. Jede Anfrage/Antwort erzeugt genau einen Eintrag mit Server-Zeit, `kind`, optional Begründung; ein Doppelaufruf erzeugt keinen zweiten und **verbraucht keine `seq`**.
2. **Matrix-Test:** Für jeden Wechsel der Tabelle 3.2 gibt es einen Test, und ein Grep-Test findet kein `update`/`insert`/`delete` auf `matchHallRequests` bzw. `bookingJobs` außerhalb der in der Matrix genannten Funktionen (kein Schreibpfad ohne Eintrag).
3. UPDATE und DELETE auf `booking_evidence` werden von der Datenbank abgelehnt; nur `socaz.ledger_maintenance` erlaubt Wartung.
4. Hash-Kette: unveränderte Kette gültig; eine per Wartungsausnahme geänderte Zeile meldet `verifyEvidenceChain` an der **ersten** abweichenden `seq`; eine gelöschte Zeile in `evidence_actor` lässt die Kette gültig.
5. `seq` lückenlos bei parallelen Schreibern (Gate-Test) und bei Abbruch der Transaktion (keine verbrauchte Nummer); mehrere Termine desselben Spiels (`round`) erzeugen getrennte Einträge.
6. Hash: gleiche Eingabe = gleicher Hash (Sonderzeichen, Unicode, `|`), `at` stammt aus der Datenbank (ein vom Client übergebener Wert wird nicht übernommen).
7. PDF: Admin 1 erhält ein gültiges PDF mit Gesamtzahl, Kopf-Hash, Prüfergebnis, UTC und Berlin; Admin 2, Betreiber, Spieler, Gast, unbekannte und ungültige ID erhalten dieselbe 404-Antwort; `no-store`; Dateiname ohne Personenbezug; keine Spieler- oder Teamnamen; Fremdtext mit Steuerzeichen und Pseudo-Markup bleibt Text.
8. **Actor-Test:** Löschen oder Anonymisieren eines `evidence_actor` lässt die Kette gültig; der Hash enthält nur den Verpflichtungswert.
9. **Kopf-Hash:** jeder Admin-Abruf (Seite und PDF) nennt Anzahl, Kopf-Hash und Prüfergebnis der Gesamtkette; der tägliche Job gibt dieselben Werte aus und schlägt Alarm, wenn die Anzahl kleiner ist als beim letzten Lauf oder der frühere Kopf-Hash nicht mehr in der Kette liegt.
10. Deadlock-Test: `advanceVetos` (eine Transaktion je Spiel) und `answerHallRequest` gleichzeitig; Reihenfolge der Sperren siehe 8.3.

## 6. Mutationsliste (je Mutation muss ein Test rot werden)
Trigger (Append-only) entfernt; Zähler ohne `FOR UPDATE`; Hash ohne `prev_hash`; `at` vom Client; Haken außerhalb der Transaktion (Eintrag trotz Rollback); Doppelaufruf erzeugt zweiten Eintrag (Existenzprüfung weg); Existenzprüfung NACH dem Zähler (Lücke); Admin 2 oder Betreiber erhält das PDF; Namen im PDF; `reason` ungekürzt oder mit Steuerzeichen; `verifyEvidenceChain` meldet die erste Abweichung nicht; Wartungsausnahme ohne Prüfung; `round` fehlt (zweiter Termin blockiert); ein Schreibpfad der Matrix ohne Haken.

## 7. Datenschutz und Sicherheit (korrigiert)
- **Personenbezug ist da:** Plan 011 P2 verlangt Name und E-Mail des Google-Kontos des Betreibers im Beweisprotokoll (nur Admin 1); die Begründung der Halle ist Fremdtext und kann Namen enthalten. Darum: Personenfelder getrennt in `evidence_actor` (außerhalb des Hashes, 3.1), Begründung gekürzt und bereinigt, PDF nur für Admin 1.
- Löschung/Anonymisierung (DSGVO) trifft nur `evidence_actor` und ggf. den Freitext; die Kette bleibt gültig. Freitext im Hash bleibt ein Restrisiko (Begründung kann Namen enthalten): **Frage R3** (Anwalt), ob die Begründung im Hash stehen darf oder nur ein Verpflichtungswert.
- Aufbewahrung: nur anhängend; **Frage R3:** Aufbewahrungsdauer, Löschkonzept, Beweiswert, qualifizierter Zeitstempel später, Verfahren der Verankerung des Kopf-Hashs außerhalb der Datenbank.
- Abruf nur Admin 1; Fehlerantworten ohne Unterschied zwischen „fremd“ und „unbekannt“.

## 8. Risiken und Datenbankdetails
1. **Wartungsausnahme** darf die Kette brechen; jede Nutzung gehört in die Go-live-Prüfliste (wie `ledger_maintenance`).
2. **Fremdschlüssel:** `match_id` und `venue_id` mit `ON DELETE RESTRICT` (oder bewusst ohne FK mit Begründung), weil `matches` bei `ON DELETE CASCADE` hängt und ein Spiel sonst sein Protokoll löschen oder die Löschung am Trigger scheitern würde. Folge: `tests/cleanup.ts` und jede Spielelöschung (Seeds, Test-Aufräumen, `deleteAccount`-Pfade) müssen angepasst werden (Wartungsausnahme **nur im Test-Cleanup**); Worker-Datenbanken neu anlegen.
3. **Sperrreihenfolge:** Spiel → Halle → Anfragezeile → (`venue_access` ohne Sperre) → **Zähler zuletzt**. Der Zähler wird bis zum Commit gehalten und **serialisiert alle Hallenprüfungen**; darum genau **eine Transaktion je Spiel** in `advanceVetos` und die Reihenfolge auch in `booking.ts` (`updateBookingJob`: Auftrag `FOR UPDATE` → Zähler) nachweisen; Deadlock-Test (5.8). Bei der erwarteten Last (wenige Anfragen je Minute) unkritisch.
4. **Migration:** Nummer erst beim Bau aus `origin/main` (frei ab 0052); `forbid_append_only_mutation` kommt aus 0048 (009 M2, in #134): M3a setzt 009 M2 als gemergt voraus. Keine neuen Enum-Werte (`kind` ist Text mit CHECK).
5. **Qualifizierter Zeitstempel** (Dritter) ist nicht Teil von M3 (Vertrag: später, Anwalt).

## 9. Teil B: Rest aus M2 (nur Vorbereitung, nicht in M3 gebaut)
- **Gutschrift-Ablauf (S3):** offen ist, ob nach einer Absage oder Erstattung **nach** dem Rechnungslauf eine Gutschrift als eigene Rechnung (negative Zeilen, eigene Nummer, Bezug auf die Ursprungsrechnung) oder eine Verrechnung auf der nächsten Monatsrechnung gilt; steuerlich zu klären (Steuerberater). Technisch vorbereitet durch M2 (nur anhängende Rechnungen, Provisionsstorno als Gegenbuchung). **Bau erst nach der Antwort zu S3.**
- **Kontenzuordnung:** Hauptbuch-Konten → SKR03-Konten, in den Einstellungen änderbar; gehört zu M4 (DATEV-CSV). Vorbereitung: Tabelle `account_mapping`, Vorgabe als Annahme, Bestätigung durch den Steuerberater (E4).
- Weitere Rest-Punkte stehen im Backlog (125 bis 136).

## 10. Fragen (Stand nach Entscheid t9 und Review)
- ~~Q0~~, ~~Q1~~ (global entschieden), ~~Q2~~: Abschnitt 0a.
- ~~Q1a~~: entschieden (Variante G jetzt, Z als Zusatzspalte, Abschnitt 0a). Offen bleibt der **Ablageort des Kopf-Hashs** (Anwalt, R3).
- **R3** (Anwalt): Personenfelder in `evidence_actor` außerhalb des Hashes zulässig? Begründung im Hash oder nur Verpflichtungswert? Aufbewahrung, Löschkonzept, Beweiswert, Verfahren der Verankerung des Kopf-Hashs.
- **S3** (Steuerberater): Gutschrift als eigene Rechnung oder Verrechnung; Nummernkreis; Ausweis der USt.

## 11. FEHLT-NOCH (Entscheide Dritter, blockieren den Bau von Teil A nicht)
| Punkt | Wer | Wirkung |
|---|---|---|
| **R3** Aufbewahrungsdauer, Löschkonzept, Beweiswert, Personenfelder und Verankerung des Beweisprotokolls | Anwalt | Go-live-Bedingung (GO-LIVE-AUDIT „009 M3: Aufbewahrung und Beweiswert des Beweisprotokolls (R3)“); Protokoll bleibt bis dahin nur anhängend, keine Löschung |
| **S3** Gutschrift als eigene Rechnung oder Verrechnung, Nummernkreis, USt-Ausweis | Steuerberater | Bau der Gutschrift wartet (GO-LIVE-AUDIT „009 M2/M3: Gutschrift-Ablauf (S3)“); Rechnungen bleiben unverändert |
| **Ablageort Kopf-Hash** außerhalb der Datenbank (Verfahren, Zeitstempeldienst) | Anwalt | Go-live-Bedingung (GO-LIVE-AUDIT „009 M3: Ablageort Kopf-Hash“); bis dahin Benachrichtigung an Admin 1 und Eintrag im Eingriffsprotokoll |
| **Z** Kette je Spiel einsetzen | t9 (später) | Zusatzspalte liegt bereit, keine Auswertung |
| **011 M2** Begründung der Halle bei Ablehnung | Plan 011 | Bis dahin ist `reason` leer |
