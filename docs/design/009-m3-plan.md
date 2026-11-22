# Plan 009 M3 (Entwurf v3): Beweisprotokoll mit PDF, Rest aus M2

Status: Entwurf v3 mit Nachträgen Q1a, R-T210 (Abschnitt 12) M3b-Design DEFERRABLE (Abschnitt 13) und Plan v4 (Abschnitt 14, Review-Auflagen) (nur Doku, kein Code), Stand 2026-11-12, Verfasser worker-2. v3 arbeitet den Plan-Review R-T208 (10 Punkte) ein und enthält die Entscheide t9 (Abschnitt 0a). Grundlage: Vertrag 009 v4 (AC-7), Plan `docs/design/009-m2-plan.md`, Code nach 009 M2 (PR #134), Plan 011 M1.
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
| Entzug des Betreiberzugangs / Konto-Löschung des Betreibers (011 M1, `venue-access.ts`/`account.ts`: `pending` → `unmanaged`, Plan 011 P5) | `pending` → `unmanaged` | `unmanaged` (die Art `withdrawn` entfällt; sie widerspräche P5) |
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
- **Idempotenz ohne Lücke (Reihenfolge laut R-T210, ersetzt „Existenzprüfung VOR dem Zähler“):** (1) Zählerzeile nur **sperren** (`SELECT … FOR UPDATE`, nichts hochzählen), (2) Existenz prüfen (vorhanden: still weiter, keine `seq`), (3) hochzählen und einfügen. Ohne die Sperre vor der Prüfung gäbe es ein Rennen (beide prüfen „nicht vorhanden“, der zweite scheitert an UNIQUE und die Geschäftsaktion rollt zurück). Eindeutigkeit: partieller UNIQUE-Index auf (`match_id, venue_id, round, kind`) nur für die Anfrage-Arten (Abschnitt 12 a). (Das `round` ist nötig, weil `startHallCheck` je Spiel mehrfach läuft und die Anfragezeilen jedes Mal neu entstehen; ohne `round` wäre der zweite Termin blockiert.)
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

## 12. Nachtrag R-T210 (Plan-Re-Review v3, REVIEW-OK mit 1 Pflicht)
**Pflicht (Idempotenz-Reihenfolge):** siehe 3.5 (Zähler zuerst sperren, dann Existenz prüfen, dann hochzählen/einfügen). Tests: `Promise.all` derselben Aktion → genau ein Eintrag, kein Fehler, `seq` lückenlos; Mutationen „Zähler vor Existenzprüfung hochgezählt“ und „Existenzprüfung ohne Zählersperre“ (beide müssen rot werden). Der Zähler hält `last_seq` und `last_hash`; **der Trigger setzt `seq`, `prev_hash`, `hash` und `at` aus dem Zählerstand**, die Anwendung kann keinen dieser Werte übergeben (Zusicherung per Test: ein beim INSERT übergebener Wert wird überschrieben).
**a) Eindeutigkeit der Buchungs-Arten:** `booking_jobs.match_id` ist eindeutig (ein Auftrag je Spiel), aber derselbe Wechsel kann mehrfach vorkommen (z. B. `job_booked` nach `job_unavailable`). Der partielle UNIQUE-Index gilt darum **nur für die Anfrage-Arten** (`request_sent`, `unmanaged`, `accepted`, `declined`, `expired`); die `job_*`-Arten tragen `job_id` (nullable Spalte) und sind nicht eindeutig (ein Doppelaufruf ist dort ausgeschlossen, weil der Auftrag unter `FOR UPDATE` gewechselt wird und der zweite Aufruf an `canTransition` scheitert). `venue_id` ist für `job_*` nullable (Auftrag ohne Halle bei `job_open`).
**b) 011-M1-Schreibpfade:** Entzug des Betreiberzugangs und Konto-Löschung des Betreibers setzen `pending` auf `unmanaged` (`venue-access.ts`, `account.ts`; Plan 011 P5); sie gehören in die Matrix (Art `unmanaged`) und in den Grep-Test, ebenso die **Seeds**. M3b setzt 011 M1 als gemergt voraus (sonst die Pfade nachziehen). **Deadlock-Test** zusätzlich für `updateBookingJob` und für den Entzug (Sperrreihenfolge Spiel → Halle → Anfragezeile → Zähler).
**c) Abbildung auf AC-7:** AC-7 nennt „frei/belegt, Zusage/Ablehnung + Begründung“. Abbildung: `accepted` = frei und Zusage, `declined` = belegt bzw. Ablehnung (die Halle unterscheidet im Code nicht zwischen „belegt“ und „lehnt ab“), die Begründung ist optional (011 M2). **Abweichung vom Vertragstext:** „frei/belegt“ und „Zusage/Ablehnung“ fallen zu je einer Art zusammen; ein eigenes „frei, aber abgelehnt“ gibt es nicht.
**d) Hash-Funktion:** Kern-`sha256()` (PostgreSQL 11+, kein pgcrypto).
**e) Externe Prüfung:** Ein Auszug (PDF je Spiel) führt ohne Nachbarzeilen nicht zum Kopf-Hash. Darum zusätzlich ein **Gesamtketten-Export** (Admin 1, Datei, nur Anfrage-Felder ohne Personenfelder: `seq`, `at`, `kind`, `match_id`, `venue_id`, `round`, `reason`, `actor_commitment`, `hash`) für die externe Prüfung (M3c, Route `/api/beweis/kette`); das PDF sagt ausdrücklich: „prüfbar nur zusammen mit dem Gesamtketten-Export und dem extern abgelegten Kopf-Hash“. Der „letzte Lauf“ des Tagesjobs liegt in derselben Datenbank: **maßgeblich ist die externe Kopie** (Ablageort: Frage Anwalt).
**f) Zugriff und Salz:** Die Route prüft ausdrücklich `canUser(user, "owner")` (Admin 1) im Handler. Das **Salz je Zeile** liegt in `evidence_actor` (nicht in `booking_evidence`), damit die Anonymisierung den Bezug endgültig löst.

## 13. Nachtrag M3b: Haken DB-seitig per DEFERRABLE-Constraint-Trigger (Entscheid t9/Orchestrator: bevorzugt; Bewertung durch security-reviewer ausstehend)
Stand 2026-11-22, Verfasser worker-2. Dieser Abschnitt ersetzt für M3b die App-Haken aus 3.5 und 12 (die Tabelle 3.2 und die Arten bleiben). Fallback bei unverhältnismäßigem Aufwand: Abschnitt 13.9.

### 13.1 Idee
Auf `match_hall_requests` und `booking_jobs` liegen **AFTER-Constraint-Trigger, `DEFERRABLE INITIALLY DEFERRED`, `FOR EACH ROW`**. PostgreSQL führt sie **erst beim COMMIT** der Transaktion aus. Der Trigger schreibt in `booking_evidence` (der M3a-INSERT-Trigger setzt `seq`, `prev_hash`, `hash`, `at`). Folgen:
- **Jeder** Schreibpfad, auch Seeds, Skripte und künftiger Code, erzeugt den Eintrag in derselben Transaktion; die Anwendung muss nichts aufrufen (kein `recordEvidence` in `veto.ts`/`booking.ts`/`venue-access.ts`/`account.ts`). Ein vergessener Haken ist unmöglich.
- **Rollback = kein Eintrag, keine `seq`** (die Trigger-Ereignisse einer zurückgerollten (Teil-)Transaktion werden verworfen).
- **Der Zähler wird erst beim COMMIT gesperrt**, also zuletzt und nur kurz (13.3). `runBookingAgent` (heute ohne Transaktion: je `UPDATE` ein Autocommit) braucht **keinen Umbau**: der Trigger feuert beim Autocommit.

### 13.2 Ereignis → `kind` (die Matrix aus 3.2, jetzt im Trigger)
Die Funktion bekommt `TG_OP`, `OLD` und `NEW` (die Zeilenstände zum Zeitpunkt des Ereignisses, auch wenn die Zeile später im selben COMMIT erneut geändert wird):
| Tabelle | Ereignis | `kind` | Actor |
|---|---|---|---|
| `match_hall_requests` | INSERT, `status = 'pending'` | `request_sent` | nein |
| | INSERT, `status = 'unmanaged'` | `unmanaged` | nein |
| | UPDATE `pending → confirmed` | `accepted` | `NEW.answered_by` |
| | UPDATE `pending → declined` mit `answered_by` | `declined` | `NEW.answered_by` |
| | UPDATE `pending → declined` ohne `answered_by` (Frist, `settleHallCheck`) | `expired` | nein |
| | UPDATE `pending → unmanaged` (Entzug/Konto-Löschung, 011 M1) | `unmanaged` | nein |
| | alle anderen Wechsel, DELETE | kein Eintrag (DELETE ist „Ergebnis steht in den Einträgen davor“) | |
| `booking_jobs` | INSERT | `job_open` | nein |
| | UPDATE `status` geändert nach `booked`, `confirmed`, `unavailable`, `withdrawn`, `done` | `job_booked` …`job_done` | nein |
| | `in_progress`, reine Notiz-/Nachweis-Updates (Status unverändert) | kein Eintrag | |
**Unterscheidung `expired`/`declined`:** über `answered_by IS NULL` (die Frist setzt `declined` ohne Antwortenden). Das ist die einzige implizite Regel; ein Test belegt beide Pfade über die echte Anwendung (`settleHallCheck` mit abgelaufener Frist, `answerHallRequest`).
**Actor:** der Trigger liest Name und E-Mail aus `users` **zum COMMIT-Zeitpunkt** (kein Client-Wert), schreibt `evidence_actor` (Salz aus `gen_random_uuid()`, `actor_commitment` wie in M3a: `sha256(salt || ':' || user_id)`). Ist das Konto bis dahin anonymisiert, stehen die anonymisierten Werte (gewollt).
**Maßgebliche Wartungsausnahme:** ist `socaz.ledger_maintenance = 'on'` gesetzt (Test-Cleanup, Wartung), schreibt der Trigger **nichts** (sonst erzeugt jedes Aufräumen Einträge).

### 13.3 Sperren und Verklemmungen (der Kern)
- Heute (App-Haken mitten in der Transaktion) hielte eine Transaktion den globalen Zähler und nähme danach weitere Sperren: Verklemmung mit Pfaden, die erst Zeile/Spiel und dann den Zähler nehmen (Befund worker-4).
- Mit DEFERRABLE liegt die Zählersperre **am Ende**: Beim COMMIT hat jede Transaktion alle ihre Zeilensperren schon. Eine Verklemmung bräuchte einen Zyklus, in dem der **Zählerinhaber** auf etwas wartet. Der Zählerinhaber führt nur noch die Trigger-INSERTs aus. Er darf dabei **auf nichts warten, was andere halten**.
- **Befund (neu, Änderung an M3a nötig): die Fremdschlüssel von `booking_evidence` verletzen das.** Ein INSERT mit FK nimmt `FOR KEY SHARE` auf der referenzierten Zeile (`matches`, `venues`). Hält eine andere Transaktion dort `FOR UPDATE` (z. B. 011 M1 `lockVenues` nimmt `venues` `FOR UPDATE`, Spielsperren der Lobby) und will beim COMMIT selbst den Zähler, entsteht der Zyklus: A hält den Zähler und wartet auf `venues` (B), B hält `venues` und wartet auf den Zähler (A). **Darum in M3a ändern:** die Fremdschlüssel `match_id` und `venue_id` von `booking_evidence` **entfallen** (`RESTRICT`-Ersatz: BEFORE-DELETE-Guard-Trigger auf `matches` und `venues`, die das Löschen verweigern, solange Einträge existieren; die Prüfung liest nur, nimmt keine Zeilensperre; Wartungsausnahme gilt). Der Test „Fremdschlüssel RESTRICT“ aus M3a wird zum Guard-Trigger-Test.
- Weitere Lesezugriffe der Trigger (`users`, `booking_evidence` für die Runde) sind einfache Lesevorgänge ohne Zeilensperren. Damit wartet der Zählerinhaber nur noch auf die **Commit-Sperre selbst** (nie auf Zeilen anderer): ein Zyklus ist ausgeschlossen.
- **Reihenfolge am Zähler:** wer zuerst den Zähler nimmt, schreibt zuerst; die `seq` spiegelt die Commit-Reihenfolge der Zählersperre, nicht die der Anwendungsschritte (für die Kette unerheblich, Kausalität je Spiel bleibt, weil Wechsel desselben Spiels über die Spielsperre serialisiert sind). Innerhalb einer Transaktion gilt die Ereignisreihenfolge.
- **Deadlock-Tests:** echte parallele Transaktionen `answerHallRequest` × `advanceVetos` × `updateBookingJob` × Entzug (011 M1) × `bookCommission` (nimmt `venues` `FOR UPDATE`): keine Verklemmung, alle Einträge vorhanden, Kette gültig.

### 13.4 Runde (`round`) im Trigger
`startHallCheck` legt je Halle im Pool eine Zeile an: je Zeile ein Ereignis, alle gehören zur **selben Runde**. Regel im Trigger: Gibt es im Protokoll bereits einen Eintrag `request_sent`/`unmanaged` desselben Spiels mit **derselben Transaktionsnummer** (`booking_evidence.tx_id = txid_current()`, neue Spalte, nicht im Hash), gilt dessen Runde; sonst `max(round) + 1` über alle Einträge des Spiels. Antwort-Arten (`accepted`, `declined`, `expired`) und `job_*` tragen die aktuelle Runde (`max(round)` des Spiels, 0 wenn keine). Test: zwei Hallenprüfungen desselben Spiels (neuer Termin) → Runden 1 und 2; mehrere `startHallCheck` in einer Transaktion → eine Runde.

### 13.5 Idempotenz
Das Ereignis entsteht nur bei einer **echten** Änderung (Statuswechsel); ein Doppelaufruf der Anwendung scheitert vorher an den App-Prüfungen (`pending`-Prüfung, `canTransition`). Der Trigger sperrt zuerst den Zähler (`SELECT … FOR UPDATE`), prüft dann die Existenz der Anfrage-Art (partieller UNIQUE-Index) und überspringt bei Treffer ohne `seq` (R-T210). **Kein `ON CONFLICT DO NOTHING`:** der BEFORE-INSERT-Trigger hätte den Zähler dann schon hochgezählt (Lücke).

### 13.6 Volumen und Dauer
`startHallCheck` erzeugt einen Eintrag je Halle im Pool (aktive Hallen der Stadt, meist `unmanaged`): erwartet höchstens einige Dutzend, in der Spitze einige Hundert. PostgreSQL hält die Trigger-Ereignisse im Speicher der Transaktion und führt sie nacheinander beim COMMIT aus, **während der Zähler gehalten wird**. Jeder Eintrag ist ein INSERT mit Hash (plpgsql, Größenordnung 0,1 bis 0,3 ms): 100 Einträge ≈ 10 bis 30 ms Zählersperre. Andere Commits warten entsprechend. **Messen** in M3b (100/500/1000 Hallen) und Grenze festlegen (z. B. > 50 ms im Test = Befund). Alternative bei Problemen: `unmanaged`-Einträge je Halle zu **einem** Sammeleintrag je Runde bündeln (Plan 3.2 ändern, Entscheid t9).

### 13.7 Test „kein Pfad ohne Eintrag“ (ersetzt den Grep-Test)
Statt eines Grep-Tests über die Quelltexte (kann Pfade übersehen) prüft ein **Matrix-Test auf SQL-Ebene** jeden (Alt, Neu)-Status der beiden Enums: für jede Kombination wird die Zeile **direkt per SQL** geändert und gezählt, ob der Eintrag laut Tabelle 13.2 entsteht oder bewusst nicht. Damit ist auch jeder künftige Schreibpfad (und jeder neue Status im Enum) abgedeckt: ein neuer Enum-Wert ohne Zeile in der Matrix lässt den Test rot werden (Test liest die Enum-Werte aus der Datenbank). Zusätzlich je ein Test über die **echten Anwendungspfade** (`startHallCheck`, `answerHallRequest`, `settleHallCheck` mit Frist, Entzug/Konto-Löschung, `createBookingJob`, `updateBookingJob`, `withdrawBookingJob`, `runBookingAgent`) und Rollback-Tests (Fehler nach dem Wechsel: kein Eintrag, keine `seq`).

### 13.8 Mutationen (je Mutation ROT erwartet)
Trigger fehlt je Tabelle; Trigger nicht `DEFERRABLE` (feuert sofort: Deadlock-Test rot); Zähler nicht zuerst gesperrt; `expired`/`declined` vertauscht; Eintrag auch bei Status unverändert; `in_progress` protokolliert; Runde nicht erhöht/pro Zeile erhöht; Actor aus falscher Spalte; Wartungsausnahme ignoriert (Cleanup erzeugt Einträge); FK wieder da (Deadlock-Test rot); Guard-Trigger auf `matches`/`venues` fehlt (Löschen trotz Einträgen); `ON CONFLICT DO NOTHING` statt Existenzprüfung (Lücke).

### 13.9 Aufwand, Risiko, Fallback
| | DEFERRABLE-Trigger (bevorzugt) | Sammeln am Ende (Fallback) |
|---|---|---|
| Anwendungscode | keiner (nur Aufräumen/Anpassen bestehender Tests) | 6 Aufrufstellen (`lobby.ts`, `scheduling.ts`, `veto.ts`, `venue-access.ts`, `booking.ts`, `runBookingAgent` in Transaktion) |
| Migration | M3a-Migration erweitert (Trigger, `tx_id`, FK entfällt, Guard-Trigger); noch nicht auf main, also keine zweite Migration | keine |
| Sicherheit „kein Pfad ohne Eintrag“ | **DB-seitig, vollständig** (auch Seeds/Skripte) | nur per Disziplin und Tests |
| Verklemmung | Zähler nur im COMMIT, FK entfernt (13.3) | Sammeln und Schreiben ganz am Ende, ebenfalls am Zähler zuletzt; Aufrufer-Disziplin |
| Risiko | plpgsql-Komplexität, schwerer zu debuggen, Fehler erst beim COMMIT sichtbar, Trigger kann vom Tabelleneigentümer deaktiviert werden (gehört in G25-009, DB-Rollenmodell) | vergessener Flush = fehlender Eintrag, mehr Code |
| Aufwand (Schätzung) | mittel: SQL ≈ 150 Zeilen, Tests ≈ 25, M3a-Änderung klein | mittel bis hoch: 6 Stellen, Umbau `runBookingAgent`, viele Tests |
**Empfehlung:** DEFERRABLE. **Entscheidungsgrenze für den Fallback:** (1) der security-reviewer findet einen Zyklus oder eine nicht abgedeckte Sperre; (2) die Messung 13.6 zeigt eine Zählersperre über der Grenze auch nach dem Bündeln; (3) `pg_dump`/Wiederherstellung oder Hosting (G25-009) verbietet `DEFERRABLE`-Constraint-Trigger (unwahrscheinlich).

### 13.10 Änderungen an M3a (vor dem Push von M3a, keine neue Migration)
`booking_evidence`: Fremdschlüssel `match_id`/`venue_id` entfallen; Spalte `tx_id bigint not null default txid_current()`; Guard-Trigger (BEFORE DELETE) auf `matches` und `venues`; die Trigger-Funktionen aus 13.2 mit `DEFERRABLE`-Constraint-Triggern auf den zwei Tabellen. `recordEvidence` bleibt für Tests und Sonderfälle (kein Aufruf in den Fachfunktionen). Die bestehenden M3a-Tests bleiben gültig, der FK-Test wird zum Guard-Trigger-Test.

### 13.11 Offene Punkte (nur gestellt)
- **Q3 (t9):** Bündeln der `unmanaged`-Einträge je Runde (13.6), falls die Messung es verlangt.
- **R3 (Anwalt):** unverändert; die Actor-Auflösung zum COMMIT-Zeitpunkt ändert die Personenfelder nicht (weiterhin nur in `evidence_actor`).

## 14. Plan v4: Auflagen aus dem Security-/Design-Review zu Abschnitt 13 (REVIEW-CHANGES, Empfehlung: DEFERRABLE bauen)
Stand 2026-11-22, Verfasser worker-2. Dieser Abschnitt **ersetzt** in Abschnitt 13 alles, was ihm widerspricht (13.2 Unterscheidung expired/declined, 13.3 Fremdschlüssel, 13.4 Runde, 13.9/13.10 Umfang). Code-Start M3b erst nach Plan-OK (worker-4). Der Fallback „Sammeln am Ende“ ist nicht nötig. M3a ist nicht auf main: der Umbau fließt in die **M3a-Migration** (keine zweite Migration).

### 14.1 Fremdschlüssel: ALLE entfernen, auch `evidence_actor.user_id`
- `booking_evidence.match_id` und `venue_id` **ohne** Fremdschlüssel (Abschnitt 13.3).
- **Zusätzlich** `evidence_actor.user_id` **ohne** Fremdschlüssel auf `users`: ein INSERT mit FK nimmt `FOR KEY SHARE` auf `users`; `users` wird oft `FOR UPDATE` gesperrt (`account.ts` Konto-Löschung, `admin.ts` Sperren/Rollen, `finance.ts`, `ledger.ts`) → Zyklus mit dem Zähler beim COMMIT. Die Spalte bleibt als reine UUID (nullable).
- **Regel in der Konto-Löschung/Anonymisierung** (`account.ts`): `evidence_actor`-Zeilen des Kontos: `user_id`, `name`, `email` auf NULL (die Zeile selbst bleibt, das Salz bleibt oder wird gelöscht: Entscheid R3). Test: nach `deleteAccount` ist der Bezug gelöst, die Kette gültig.
- **Deadlock-Tests (echte parallele Transaktionen):** `answerHallRequest` × Konto-Löschung/Entzug (011 M1) × `bookCommission` (`venues` `FOR UPDATE`) × Lobby/`updateBookingJob` (`matches` `FOR UPDATE`) × `admin`-Sperren (`users` `FOR UPDATE`): keine Verklemmung, alle Einträge vorhanden, Kette gültig. **Annahme: READ COMMITTED** (Standard der Anwendung); unter SERIALIZABLE/REPEATABLE READ ist der Plan nicht geprüft.

### 14.2 Verwaiste Verweise: Guard ohne Sperre ist eine Restlücke, die der Job meldet
Der `BEFORE DELETE`-Guard auf `matches`/`venues` liest ohne Zeilensperre und kann ein Rennen (Löschen und Eintragen gleichzeitig) oder die **gleiche Transaktion** (Eintrag zu einem im selben COMMIT gelöschten Spiel) nicht ausschließen. **Bekannte Restlücke** (Spiel-/Hallenlöschung ist ein seltener Admin-/Testpfad). Abhilfe: `verifyEvidenceChain` und der Tagesjob prüfen zusätzlich **verwaiste `match_id`/`venue_id`** (`LEFT JOIN` auf `matches`/`venues`, Treffer ohne Gegenstück = Alarm, nicht Kettenbruch). Test: gelöschtes Spiel (per Wartungsausnahme) → verwaister Eintrag wird gemeldet, Kette bleibt gültig.

### 14.3 Wartungsausnahme eng halten, täglicher Abgleich, Rollen
- Die Wartungsausnahme (`socaz.ledger_maintenance`) unterdrückt in der Transaktion **alle** Einträge (auch die davor erzeugten Ereignisse derselben Transaktion), weil die Trigger erst beim COMMIT laufen. Darum **nur im Test-Cleanup** (Allowlist, Grep-Test aus M3a); in Betriebsskripten verboten.
- **Täglicher Abgleich im Job `evidence-head`:** jede `match_hall_requests`-Zeile mit Status `confirmed`, `declined`, `unmanaged` und jeder `booking_jobs`-Auftrag mit Status `booked`, `confirmed`, `unavailable`, `withdrawn`, `done` muss den passenden Protokolleintrag haben (Spiel, Halle, Runde, Art); fehlt einer: **Alarm** an Admin 1. Der Abgleich erkennt unterdrückte oder deaktivierte Trigger nachträglich (er ersetzt nicht den Schutz). Zeilen, die das Spiel inzwischen verlassen haben (gelöschte Anfragezeilen nach `settleHallCheck`), fallen nicht unter den Abgleich (kein Eintrag nötig, siehe 13.2).
- **GO-LIVE-AUDIT G25-009 wird um eine Auflage ergänzt:** „**App-Rolle ≠ Eigentümer/Migrationsrolle**“. Der Eigentümer einer Tabelle kann `ALTER TABLE … DISABLE TRIGGER` ausführen; läuft die App unter dem Eigentümer, schützt kein Trigger. (Eintrag im Doku-PR, nicht in diesem Plan-Commit.)
- **Actor-Aussage:** „Actor = **was die App als Antwortenden einträgt**“ (`answered_by` der Anfragezeile), **nicht kryptografisch bewiesen**; die Datenbank kann nicht prüfen, dass die Person wirklich geantwortet hat. Im PDF und in BETRIEB so benennen.
- **`expired` vs. `declined` nicht an `answered_by IS NULL` hängen** (SET NULL beim Löschen des Kontos, Systemablehnung): Der Trigger unterscheidet nach **`answered_at IS NULL`** (die Frist setzt kein `answered_at`; jede Antwort setzt es zusammen mit `answered_by`; ein späteres `SET NULL` auf `answered_by` ist ein UPDATE ohne Statuswechsel und feuert nichts). Regel + Test: **jeder Pfad, der `declined` setzt, setzt `answered_at` (Antwort) oder gehört ausdrücklich zur Frist**; ein Grep-/Verhaltenstest über `veto.ts`/`venue-access.ts` stellt das sicher. Bleibt die Regel unsicher, kommt ein ausdrücklicher Marker (`answer_kind`) in die M3a-Migration.

### 14.4 Runde: nur INSERT-Ereignisse eröffnen eine neue Runde (ersetzt 13.4)
- **Nur INSERT-Ereignisse auf `match_hall_requests`** (`request_sent`, `unmanaged` aus INSERT) eröffnen eine neue Runde: gibt es einen solchen Eintrag desselben Spiels mit **derselben Transaktionsnummer** (`tx_id`), gilt dessen Runde, sonst `max(round) + 1`.
- **UPDATE-Ereignisse** (`accepted`, `declined`, `expired`, `unmanaged` aus UPDATE, d. h. Entzug) und alle `job_*` nehmen **`max(round)` des Spiels** (0, wenn es keinen Eintrag gibt).
- Test: ein **Entzug nach der Hallenprüfung** ändert die Runde nicht; zwei Hallenprüfungen desselben Spiels → Runden 1 und 2; `pending → unmanaged` (UPDATE) bleibt in der aktuellen Runde.

### 14.5 Nur bei echtem Statuswechsel feuern (sonst serialisiert jedes Notiz-Update den Zähler)
Getrennte Constraint-Trigger je Ereignis: `AFTER INSERT` und **`AFTER UPDATE … WHEN (OLD.status IS DISTINCT FROM NEW.status)`** (die `WHEN`-Bedingung gilt für Constraint-Trigger; sie verhindert, dass ein Update ohne Statuswechsel überhaupt ein Ereignis einreiht). Zusätzlich in der Funktion **früh `RETURN`, bevor der Zähler gesperrt wird**, wenn die Matrix 13.2 für (Alt, Neu) keinen Eintrag vorsieht (z. B. `in_progress`, `DELETE`). Test: reine Notiz-/Nachweis-Updates an `booking_jobs` und Zeilenänderungen ohne Statuswechsel nehmen den Zähler **nicht** (Zählersperre per `pg_locks`/zweiter Transaktion belegt).

### 14.6 Zeitpunkt, Idempotenz der Aufträge
- **`at` ist die COMMIT-Zeit** (Ausführung des Triggers), **nicht** die Ereigniszeit; im Plan, in BETRIEB und im **PDF** als „Eintragszeit (beim Abschluss der Buchung)“ benannt. Wo die Anwendung eine Ereigniszeit hat (`answered_at` der Anfragezeile), bleibt sie dort sichtbar.
- **Rollback/Savepoint** verwirft die eingereihten Ereignisse (Test 13.7: Fehler nach dem Wechsel; Savepoint-Rollback innerhalb der Transaktion).
- **`job_*`-Idempotenz** nur über den **echten Statuswechsel**; `createBookingJob` nutzt `ON CONFLICT DO NOTHING` (kein neues INSERT-Ereignis bei bestehendem Auftrag). Test: zweiter Aufruf von `createBookingJob` und doppelter `updateBookingJob` erzeugen keinen zweiten Eintrag.

### 14.7 Felder, gelöschte Zeilen, `recordEvidence`, Seiteneffekte
- Der Trigger setzt **`job_id = NEW.id`** und `match_id`/`venue_id` für `job_*` **selbst** (aus `NEW`).
- **Spike VOR dem Bau (Pflicht):** Verhalten eines **in derselben Transaktion später gelöschten Datensatzes**: `startHallCheck` löscht die alten Anfragezeilen und legt neue an (`veto.ts`), `settleHallCheck` löscht bei „keine Halle frei“ die eben angelegten Zeilen (`veto.ts:54`). Ob PostgreSQL das eingereihte INSERT-Ereignis einer in derselben Transaktion gelöschten Zeile noch ausführt, wird mit einem 20-Zeilen-Test in einer Wegwerf-Datenbank **geprüft, nicht angenommen**. Erwartung laut Plan 13.2: `request_sent` entsteht auch dann (die Anfrage wurde gestellt). Verhält sich PostgreSQL anders, wird die Matrix angepasst (z. B. Eintrag aus dem `AFTER INSERT`-Trigger sofort statt beim COMMIT, mit erneuter Prüfung der Sperrfolge) und der Plan v5 nachgezogen.
- **`recordEvidence` (`src/server/evidence.ts`) nur in Tests zulassen:** ESLint-Regel `no-restricted-imports` bzw. Importtest (Grep) in `src/` außer `src/server/evidence.ts` selbst; sonst kehrt der Zyklus (App-Haken mitten in der Transaktion) zurück.
- **Fail closed:** Ein Fehler im Trigger erscheint als **roher Datenbankfehler beim COMMIT** und macht die ganze Transaktion rückgängig. Darum in `veto.ts`/`booking.ts` **keine Seiteneffekte** (Stripe, Mail, Push, `pg_notify`-Aufrufer, die außerhalb der Transaktion wirken) **vor** dem COMMIT ohne Rücknahme; Benachrichtigungen, die als Zeilen in derselben Transaktion entstehen, sind unkritisch. Test: Trigger-Fehler (Mutation) → die Fachaktion scheitert vollständig, nichts bleibt zurück.

### 14.8 Volumen und Wachstum (zusätzlich zu 13.6)
Neben der Zählersperre pro COMMIT werden **gemessen:** (a) Wachstum der Kette (Einträge je Hallenprüfung × Spiele pro Tag, Hochrechnung auf 1 Jahr), (b) **Dauer von `verifyEvidenceChain`** bei 100 000 und **1 Mio. Zeilen** (Tagesjob), (c) Dauer des Abgleichs 14.3. Ist die Prüfung bei 1 Mio. Zeilen zu langsam, wird sie **inkrementell** (ab dem zuletzt extern verankerten Kopf-Hash) und die Vollprüfung wöchentlich. **Q3 (`unmanaged` bündeln) wird vor der Messung NICHT entschieden.**

### 14.9 Umfang der M3a-Änderung (in die M3a-Migration, vor dem Push von M3a)
`booking_evidence`: keine Fremdschlüssel (match/venue), neue Spalte `tx_id` (`bigint not null default txid_current()`, nicht im Hash), optional `answer_kind` (nur wenn 14.3 es verlangt); `evidence_actor`: kein Fremdschlüssel auf `users`; Guard-Trigger (BEFORE DELETE) auf `matches` und `venues`; die Constraint-Trigger und Funktionen aus 13/14 auf `match_hall_requests` und `booking_jobs`; Verwaisten-Prüfung in `verifyEvidenceChain`; Abgleich im Job. M3a-Tests: der FK-Test wird zum Guard-Trigger-Test; `recordEvidence` bleibt (nur Tests). **Reihenfolge:** Plan-OK (worker-4) → Spike 14.7 → M3a-Umbau → M3b-Tests/Mutationen (13.8 erweitert um: Trigger feuert ohne Statuswechsel, Runde durch Entzug geändert, Abgleich meldet fehlenden Eintrag nicht, FK `evidence_actor.user_id` wieder da).
