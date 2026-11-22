# 011 M2-Plan: Anfragen bestätigen oder ablehnen, Pflicht-Begründung, Anbindung an das Beweisprotokoll
Stand: v2 2026-11-22 (v1 2e292f5; Review R-T219: 10 Punkte eingearbeitet) · Code-Stand `origin/main` mit 011 M1 (#138, 2274f08) · Verfasser: worker-3 (Plan, Doku, kein Code) · Status: Entwurf, Review durch einen anderen Worker offen

Zweck: Plan für den Meilenstein M2 des Vertrags `docs/contracts/011-hallen-dashboard.md` (Version 3, AC-2 und AC-3): Der Betreiber bestätigt oder lehnt eine Anfrage seiner Halle ab (Ablehnung nur mit Begründung); jede Entscheidung steht im Beweisprotokoll aus 009 M3. Der Plan legt außerdem fest, wie M2 mit der Antwortfrist (12 Stunden, `veto.ts`), der Karenz und dem Wechsel von Halle oder Termin zusammenspielt, ohne M4 vorwegzunehmen.
Markierungen: **[FRAGE-PRODUKT]** Entscheid Nutzer/Orchestrator, **[FRAGE-RECHT]** beantwortet kein Agent, **[FRAGE-PLAN]** technische Wahl für den Reviewer, **[ANNAHME]** vorläufig.

Quellen: Vertrag 011 (Entscheidungen 2026-11-10, Zusage und Fristen, AC-2, 3, 9, 10, 13 bis 15, Meilensteine), Vertrag 009 v4 (AC-7), 009 M3a/M3b (`recordEvidence`, `booking_evidence`, `evidence_actor`; Branches `feat/009-m3a`, `feat/009-m3b`, `docs/design/m3b-vorbereitung.md`), `docs/design/011-m1-plan.md` (Nachtrag 13), Backlog 115/116, Code `src/server/veto.ts`, `src/app/halle/page.tsx`, `src/server/matchmaking-actions.ts`, `src/db/schema-matchmaking.ts`.

## 0. Neu in v2 (Review R-T219)
| Punkt | Änderung | Abschnitt |
|---|---|---|
| 1 Schnittstelle | Anbindung an die **gebaute** Schnittstelle `recordEvidence` aus 009 M3a (Arten, Idempotenz, `actor`, Salz); `late_attempt` gibt es dort **nicht** | 3.3, 4 |
| 2 Veraltete Aktion | Aktion trägt die Runde mit und prüft sie serverseitig; Test | 3.1 |
| 3 `late_attempt` und Wurf | Rückgabewert statt Wurf, ein Eintrag je (Spiel, Halle, Runde) | 3.2 |
| 4 Uhr | Fristprüfung in SQL gegen die DB-Zeit derselben Transaktion | 3.2 |
| 5 Eine Quelle | Begründung nur im Beweisprotokoll, `match_hall_requests` unverändert, **M2 ohne Migration** (außer `late_attempt`, siehe 4) | 4 |
| 6 Sperrreihenfolge | „Protokoll zuletzt“ = nach `settleHallCheck`/`finishVeto`/`createBookingJob`; Einträge sammeln und am Ende schreiben | 3.3, 3.6 |
| 7 Reihenfolge | M2 als **eine Einheit nach 009 M3a und M3b** | 6 |
| 8 Nummern | belegt 0049, 0050, 0051, 0052, 0053; erst beim Bau prüfen | 4 |
| 9 12 h gegen Anstoß | Frage und Test (Frist ≤ Anstoß − 1 h) | 3.2, 10 |
| 10 Captains | nur Kategorie sichtbar; Benachrichtigung ohne Freitext (Test) | 3.1, 8 |
| Backlog 115/116 | Fix-Entwurf (nur Text) | 3.7 |

## 1. Entscheide, die gelten (nicht neu verhandeln)
- Der Betreiber bestätigt („Halle ist frei“) oder lehnt ab („Halle ist belegt“); **Ablehnung nur mit Begründung**; jede Entscheidung ins Beweisprotokoll (Vertrag 011; AC-2, AC-3; Vertrag 009 AC-7).
- Antwortfrist **12 Stunden**, danach keine Zusage mehr möglich; keine Antwort = abgelehnt, im Beweisprotokoll „nicht reagiert“ (Art `expired`); die Verkürzung bei kurzem Vorlauf ist AC-14 (M4).
- „Keine Antwort = abgelehnt“ und die Zusage gelten nur für Hallen **mit Zugang**; Hallen ohne Zugang (`unmanaged`) bleiben im Rennen (M1: `hasVenueAccess`/`accessHolders` einzige Quelle).
- Betreiber sehen **Team, Zeit, Spielerzahl, keine Namen** (AC-5, P8 in M1).
- **t9 P2:** Name/E-Mail des Google-Kontos, das am geteilten Zugang entschieden hat, steht **nur** im Beweisprotokoll (in `evidence_actor`, außerhalb des Hashes), das Eingriffsprotokoll von Admin 1 enthält nur IDs.
- Die Zusage ist Buchungsbedingung für Hallen mit Zugang (011/008/012); sie wirkt in M4 (AC-13).

## 2. Bestand
- **Ablauf heute** (`veto.ts`): `startHallCheck` fragt alle Hallen im Umkreis an: Zugang → `pending`, sonst `unmanaged`; `matches.vetoTurnDeadline = jetzt + 12 h` (`HALL_REPLY_MS`) gilt für **alle** Zeilen gemeinsam und wird **nicht gegen den Anstoß begrenzt** (ein Spiel in 5 h bekommt 12 h). `startHallCheck` **löscht und legt die Zeilen je Termin neu an** (neue Runde). `settleHallCheck` (nach jeder Antwort und im Minutenjob `advanceVetos`): alle Antworten da oder Frist um → offene Zeilen `declined`; `confirmed` und `unmanaged` kommen ins Veto; ist keine frei: Termin neu wählen.
- **Antwort** (`answerHallRequest(userId, matchId, venueId, accept)`): Spiel `FOR UPDATE`, Zugang über `hasVenueAccess` in der Transaktion, Zeile muss `pending` sein, Audit `hall.confirm`/`hall.decline` **ohne Grund**. `/halle`: zwei Knöpfe ohne Begründung; die Aktion kennt nur `matchId` und `venueId`.
- **Lücke 1 (verspätete Zusage):** Keine Prüfung gegen `vetoTurnDeadline`, nur gegen `vetoStatus = 'halls'`: zwischen Fristende und dem nächsten Joblauf kann eine Zusage noch angenommen werden.
- **Lücke 2 (veraltete Aktion auf neue Runde):** Wird der Termin geändert, legt `startHallCheck` neue `pending`-Zeilen für dasselbe Paar (Spiel, Halle) an. Ein Betreiber mit offener, veralteter `/halle`-Seite (Termin A) bestätigt mit `matchId`/`venueId` die **neue** Anfrage (Termin B), ohne den neuen Termin gesehen zu haben.
- **Lücke 3 (`declined` mehrdeutig):** aktive Ablehnung und Ablauf ohne Antwort sind in `match_hall_requests` nicht zu unterscheiden (`answered_by` ist nur bei Betreiberentscheidung gesetzt, siehe 3.1).
- **Beweisprotokoll (009 M3a, `feat/009-m3a`, `src/server/evidence.ts`):** `recordEvidence(tx, { matchId, venueId, round, kind, jobId?, reason?, actor? }) → { created, seq }`; Arten `request_sent | unmanaged | accepted | declined | expired | job_open | job_booked | job_confirmed | job_unavailable | job_withdrawn | job_done` (CHECK); Idempotenz durch Unique `(match_id, venue_id, round, kind)` für die ersten fünf Arten (zweiter Aufruf: still `created: false`); Begründung bereinigt und auf 300 Zeichen gekürzt (Fremdtext); `actor` → gesalzener `actor_commitment` im Hash, **Name/E-Mail nur in `evidence_actor`**; Zähler zuerst sperren, dann Existenz prüfen, dann einfügen; Sperrreihenfolge der Aufrufer **Spiel → Halle → Anfragezeile → Zähler (zuletzt)**; Zeit setzt der INSERT-Trigger aus der Datenbank. **`free` ist kein Feld:** `accepted` = Platz frei plus Zusage, `declined` = belegt. **`late_attempt` gibt es nicht** (Art ist durch den CHECK ausgeschlossen).
- **009 M3b** schreibt die Haken (`request_sent`, `unmanaged`, `expired`, `job_*`, Entzug) bereits in `veto.ts` und die Buchungspfade.
- **Benachrichtigung:** `hall.request` (Push/Mail-Typ vorhanden) geht beim Anlegen der Anfragen an die Zugangsinhaber; Änderungen sind M4 (AC-11).

## 3. Zielbild
### 3.1 Entscheidung des Betreibers (AC-2, AC-3, AC-4)
- **Bestätigen** („Halle ist frei“): Zeile `confirmed`, Eintrag `accepted` über den vorhandenen Haken, M2 liefert nur `actor`.
- **Ablehnen:** Schritt mit **Pflicht-Begründung** (3 bis 200 Zeichen, getrimmt; Auswahlliste bevorzugt, Freitext nur ergänzend, **P2**); ohne gültige Begründung wird **nichts** geschrieben (Test). Die Begründung liegt **nur** im Beweisprotokoll (`reason`, eine Quelle); `match_hall_requests` bekommt **keine** neue Spalte. Oberfläche: bestehende Klassen und `ActionForm`, kein Look-Umbau.
- **Art der Ablehnung ohne neue Spalte:** `answered_by` ist **nur bei Betreiberentscheidung** gesetzt; `declined` **ohne** `answered_by` = nicht reagiert (Ablauf). Der Beweis trägt die Art (`declined` mit `actor` gegen `expired`). Eine zusätzliche Spalte `decision_kind` (v1, PL2) entfällt.
- **Veraltete Aktion (Lücke 2):** Die Aktion trägt die **Runde** mit (Hidden-Feld in `/halle` aus der angezeigten Zeile; die Runde ist die im Beweisprotokoll geführte `round` bzw., solange M3a/M3b sie nicht an die Zeile hängt, der **angefragte Termin** `startsAt` + Dauer). Der Server vergleicht sie in der Transaktion mit der **aktuellen** Anfragezeile; Abweichung: „Diese Anfrage ist nicht mehr aktuell, bitte die Seite neu laden“, nichts geschrieben (Test: Termin ändern, alte Aktion abgelehnt). Dafür braucht die Zeile die Information (`round` oder `requested_starts_at`): **Klärung mit 009 M3a**, ob `round` bereits an `match_hall_requests` hängt; sonst eine kleine additive Spalte in M2 (Abschnitt 4). **Alle Pfade prüfen**, die `starts_at` oder die Halle ändern (Terminwahl, Termin-Einigung, Matchmaking, Admin-Eingriffe), ob sie `startHallCheck` erneut auslösen und damit eine neue Runde erzeugen; die Liste gehört in den PR-Text.
- **Kein Zugriff fremder Hallen** (AC-4): wie M1 (`hasVenueAccess` in der Transaktion); Entzug zwischen Anzeige und Klick lehnt ab.
- **Idempotenz:** Zweiter Klick oder gleichzeitiger Ablauf: genau ein Eintrag je (Spiel, Halle, Runde, Art) (Unique aus M3a), der zweite meldet „schon beantwortet“.
- **Captains** sehen nur die **Kategorie** („Halle abgelehnt“, ggf. Kategorie aus der Auswahlliste), nie den Freitext; die Benachrichtigung „abgelehnt“ enthält den Freitext **nie** (Test: Notification-Body ohne Begründung, HTML **und** RSC der Lobby).

### 3.2 Antwortfrist, Karenz, 12-h-Regel
- **Eine Funktion, eine Stelle:** `hallReplyDeadline(match, now)` (reine Funktion in `src/lib`, Unit-getestet) ersetzt `HALL_REPLY_MS`: in M2 = jetzt + 12 h (unverändert), in M4 begrenzt auf Anstoß − 1 h (AC-14). **Offen (P9):** Ein Spiel, das in 5 h beginnt, bekommt heute 12 h, die Frist liegt dann **nach** dem Anstoß. M2 benennt die Anforderung (Frist ≤ Anstoß − 1 h) als Test, der in M2 **rot** dokumentiert ist, wenn M4 sie nicht erfüllt; die Umsetzung bleibt M4 (Mindestvorlauf Teamspiel 24 h macht den Fall im Teamspiel unmöglich, das Privatspiel mit 2 h Mindestvorlauf nicht).
- **Harte Grenze im Server mit der Datenbank-Uhr (Punkt 4):** Die Fristprüfung läuft **in SQL derselben Transaktion** gegen die DB-Zeit, nicht mit `new Date()` der Anwendung: z. B. `UPDATE match_hall_requests … WHERE … AND EXISTS (SELECT 1 FROM matches m WHERE m.id = … AND m.veto_turn_deadline > clock_timestamp())` bzw. Prüfung mit `clock_timestamp()` vor der Entscheidung. Damit stimmen Fristgrenze und Beweiszeit (Trigger, DB-Zeit) überein und eine Abweichung der Anwendungsuhr (mehrere Instanzen) wirkt nicht. Test per **Zeitreise über die DB-Zeit oder einen Parameter** (Frist in die Vergangenheit setzen; die Anwendung gibt `now` nicht vor).
- **`late_attempt` ohne Rollback (Punkt 3):** `answerHallRequest` darf bei Fristablauf **nicht** werfen, bevor der Eintrag geschrieben ist (Wurf = Rollback = Eintrag weg). Entwurf: Rückgabewert `{ status: "late" }`: die Transaktion schreibt den Eintrag `late_attempt` und **committet**, danach meldet die Aktion „Die Antwortfrist ist abgelaufen“. Je (Spiel, Halle, Runde) **höchstens ein** `late_attempt` (Unique), sonst Klick-Spam im globalen Protokoll. Die Art `late_attempt` braucht den CHECK-Eintrag (Abschnitt 4).
- **Karenz:** keine (harte Grenze) [ANNAHME]; der Minutenjob räumt nur auf, entscheidend ist die Uhrprüfung. **[FRAGE-PRODUKT P4]**.
- **Ablauf ohne Antwort:** offene Zeilen werden wie heute `declined` (ohne `answered_by`); der Eintrag `expired` liegt **bereits im Haken von M3b**, M2 fügt keinen zweiten hinzu. Keine Geldbewegung (AC-9).
- **Entzug mitten in der Frist:** M1: Zeilen werden `unmanaged`; der Eintrag `unmanaged` kommt aus dem Haken von M3b („Hook in M3b“). **P5 entfällt** (Art `unmanaged` deckt es ab) [ANNAHME].

### 3.3 Anbindung an das Beweisprotokoll (009 M3a/M3b)
- **M2 baut keine eigene Schnittstelle**, sondern nutzt `recordEvidence` aus M3a und die **bereits geschriebenen Haken** aus M3b. M2 liefert in diese Haken nur: (1) `reason` bei `declined`, (2) `actor` (Konto-ID, Name, E-Mail) bei `accepted` und `declined`, (3) den Eintrag `late_attempt`.
- **Abbildung der v1-Begriffe:** `request` → `request_sent`; `answer` → `accepted`/`declined`; `no_response` → `expired`; `access_revoked` → `unmanaged` (Haken in M3b); `free` ist **kein Feld**.
- **Name/E-Mail** nur in `evidence_actor` (außerhalb des Hashes, mit Salz); **PL3** ist durch M3a entschieden (`actor_commitment`); **PL4**: in der Transaktion, ja.
- **Sperrreihenfolge (Punkt 6):** „Protokoll zuletzt“ heißt: **nach** `settleHallCheck`, `finishVeto` und `createBookingJob` (die den Zustand und weitere Sperren/Einträge erzeugen). Die Einträge einer Transaktion werden **gesammelt** und am **Ende** geschrieben (laut `m3b-vorbereitung.md`; gegebenenfalls das DEFERRABLE-Design aus M3b). Die Zählerzeile ist die letzte Sperre in jedem Pfad. Parallel- und Deadlock-Test mit den M3b-Pfaden (Antwort gegen Ablauf, Antwort gegen Entzug, zwei Antworten).
- **Fehlerverhalten:** Scheitert der Eintrag, scheitert die Entscheidung (Rollback), Meldung „Bitte erneut versuchen“; nur `late_attempt` wird bewusst **trotz** abgelehnter Entscheidung committet (3.2).

### 3.4 Wechsel von Halle oder Termin (AC-15) und was M2 davon festlegt
- **Heute:** Antwortet keine Halle mit „frei“, setzt `settleHallCheck` das Spiel auf „neuer Termin“ (Anfragen weg, Stimmen weg, Captains benachrichtigt). Die Zusage verfällt automatisch, weil ihre Zeile gelöscht wird.
- **M2 legt fest und testet:** (a) Die Zusage gilt **nur für die Runde**, in der sie gegeben wurde (Runde = Termin); (b) beim Wechsel bleiben alte Beweiseinträge unverändert, die neue Anfrage erzeugt neue (neue `round`); (c) eine Antwort auf eine **alte** Runde wird abgelehnt (Punkt 2) und höchstens als `late_attempt` der alten Runde protokolliert; (d) abgelehnt/nicht reagiert löst keine Geldbewegung aus.
- **M4 (nicht hier):** Oberfläche „andere Halle oder anderen Termin wählen“, „Bereit“ zurücksetzen, Anteil neu anzeigen, Mindestvorlauf (AC-14, 16), Absage bei fehlender Zusage (AC-10, 13), Kalender (AC-12), Push und Mail (AC-11).
- **Lücke zwischen M2 und M4 (P6):** Bleibt nach einer Ablehnung eine andere Halle frei, kommt sie ins Veto; gefragt wird nicht, ob die Captains eine andere Halle wählen wollen.

### 3.5 Abgrenzung zu den Nachbar-Meilensteinen
| Thema | M2 | später |
|---|---|---|
| Grund, `actor`, Fristgrenze, `late_attempt`, veraltete Aktion | ja | – |
| `hallReplyDeadline` (Funktion, Frist ≤ Anstoß − 1 h als Anforderung) | Anschlussstelle | M4 (AC-14, 16) |
| Push/Mail, Kalender, Zusage als Buchungsbedingung, Wahl andere Halle/Termin | nein | M4 |
| Buchungen, Auszahlungen, Rechnungen | nein | M3 |
| Turnier-Zusage | nein | 012 M5-7 |

### 3.6 Einheit mit 009 M3
M2 wird **nicht** einzeln vor 009 M3 gebaut (Punkt 7, PL1): ohne Beweisprotokoll liefe die Entscheidung ohne Beweis; ein Zwischenspeicher in `audit_log` wäre kein Beweis.

### 3.7 Backlog 115 und 116: Fix-Entwurf (nur Text, Prüfung am Code)
- **115 (`releasePendingRequests`, `venue-access.ts`):** Befund bestätigt: Die Auswahl (`pending` der Halle) und das UPDATE sind getrennt, das UPDATE filtert nur auf Halle und Status `pending`, **nicht** auf die gesperrten Spiele; eine Anfrage, die zwischen Auswahl und UPDATE für ein **ungesperrtes** Spiel entsteht (oder dessen Zeile wechselt), würde ohne Spielsperre `unmanaged`. Fix: `.where(and(eq(venueId), eq(status, 'pending'), inArray(matchId, ids)))` mit den **gesperrten** ids; danach eine Wiederholung der Auswahl in derselben Transaktion (neue pending-Zeilen sind nach `hasVenueAccess` ohnehin nicht mehr möglich, weil der Zugang entzogen ist; die Schleife dient nur der Absicherung) oder bewusst nicht, weil `startHallCheck` den Entzug über `accessHolders` sieht. Test: verschränkt, eine zweite pending-Zeile entsteht nach der Auswahl: sie bleibt `pending` bzw. wird im Folgelauf behandelt, kein ungesperrtes Setzen. **Gehört zu M2** (gleiche Dateien, gleiche Sperrreihenfolge), weil M2 die Antwortpfade ohnehin anfasst; Mutation: ohne `inArray` rot.
- **116 (Konto-Löschung gegen Spielablauf):** Prüfung der Reihenfolgen: `deleteAccount` → `revokeAccessOfUser`: **venues (sortiert) → venue_access → matches (sortiert) → Zähler**; `advanceVetos`/`settleHallCheck`: **Spiel → (ändert Anfragezeilen, löscht Stimmen) → Zähler**; es nimmt **keine** Hallensperre und ändert keine `venues`-/`venue_access`-Zeilen. Ein Zyklus bräuchte einen Pfad, der ein Spiel hält und danach eine Halle sperrt: **heute keiner** (`startHallCheck` liest Hallen ohne Sperre). Das Risiko liegt in **M2/M3b**, wenn dort `venues … FOR UPDATE` **nach** der Spielsperre eingeführt wird. Fix-Entwurf: (1) Regel im Code (Kommentar an `answerHallRequest`/`settleHallCheck`): **nie** eine Halle oder `venue_access` nach einer Spielsperre sperren; (2) ein **deterministischer, verschränkter** Test: T1 `revokeAccessOfUser` (hält Halle + Spiel), T2 `advanceVetos` auf demselben Spiel mit abgelaufener Frist, beide Reihenfolgen, beide Transaktionen müssen enden (kein Timeout), plus ein Lauf mit M3b-Haken (Zähler zuletzt); (3) Mutation: Halle in `settleHallCheck` nach der Spielsperre sperren → Test rot.

## 4. Datenmodell und Migration
- **Keine neue Spalte an `match_hall_requests` für die Begründung** (eine Quelle: das Beweisprotokoll). Damit entfällt die Migration von v1 für `decision_reason`/`decision_kind`.
- **Migration nur, wenn nötig (Punkt 1):** (a) **`late_attempt`** gehört nicht zu den Arten des CHECK `booking_evidence_kind_check` (M3a): Entweder liefert M3 die Art (Abstimmung mit worker-2) **oder** M2 erweitert den CHECK in einer eigenen Migration (zusätzlich die Unique für `late_attempt` je (Spiel, Halle, Runde)). Die Aussage von v1 „keine Protokoll-Migration in M2“ gilt **nicht**; (b) die **Runde** an der Anfragezeile, falls M3a/M3b sie nicht schon dort führen (Punkt 2).
- **Migrationsnummern (Stand 2026-11-22):** belegt **0049** (011 M1, gemergt), **0050** (012 M5-1), **0051** (012 M5-3), **0052** (009 M3a), **0053** (012 M5-4); die nächste freie wird **erst beim Bau** gegen `origin/main` geprüft. Journal und Snapshot mitcommitten, `db:generate`: „No schema changes“, `migrate-check.mjs` ergänzen (Marke, nicht „letzte Migration“). Migrationen nie parallel zu Tasks mit Schema-Annahmen.
- **Rollback:** Spalten/CHECK additiv; der Beweiseintrag ist bewusst nicht rücknehmbar.

## 5. Dateiliste (Entwurf, per Grep zu bestätigen)
| Bereich | Dateien |
|---|---|
| Ablauf | `src/server/veto.ts` (`answerHallRequest`: `reason`, `actor`, Runde, Fristprüfung in SQL, Rückgabewert statt Wurf bei „zu spät“; Haken von M3b liefert die Einträge, M2 reicht nur `reason`/`actor`/`late_attempt` hinein), neu `src/lib/hall-deadline.ts` (reine Funktion + Test), `src/server/venue-access.ts` (Backlog 115/116: `inArray`, Sperrregel) |
| Aktion/Oberfläche | `src/server/matchmaking-actions.ts` (`answerHallAction`: Grund, Runde), `src/app/halle/page.tsx` (Ablehnen-Formular mit Auswahlliste, Runde als Hidden-Feld; bestehende Klassen, **kein Look-Umbau**) |
| Beweisprotokoll | nur Aufrufe von `recordEvidence` (M3a/M3b); falls Migration nötig: `late_attempt` im CHECK und Unique (`src/db/schema-finance.ts`, `drizzle/*`) |
| Benachrichtigung | Text „abgelehnt“ ohne Freitext (`src/server/veto.ts`, `notifyUsers`) |
| Tests | Abschnitt 7; `migrate-check.mjs` nur bei Migration |
| Doku | `docs/BETRIEB.md` (Betreiber-Ablauf, Frist, was bei „nicht reagiert“ passiert), `docs/loop/GO-LIVE-AUDIT.md` |

## 6. Etappen und Startbedingungen
**M2 als EINE Einheit** (kein Zwischenzustand ohne Beweis): Grund + `actor` + Fristgrenze (DB-Uhr) + `late_attempt` + Runde (veraltete Aktion) + Backlog 115/116, in die vorhandenen Haken.
**Startbedingungen:** (1) 011 M1 gemergt (erfüllt, #138); (2) **009 M3a und M3b gemergt** (Beweisprotokoll, Haken in `veto.ts`); (3) Fragen P1 bis P9 beantwortet; (4) Migrationsnummer gegen `origin/main` geprüft (falls Migration nötig). Security-Review Pflicht (Rechte, Mandantentrennung, Beweis, Datenschutz, Sperren), Code-Review durch einen anderen Worker; Writer ≠ Tester; max. 2 Code-Writer.

## 7. Akzeptanzkriterien, Tests und Mutationen
Belegt werden AC-2 und AC-3; AC-4 und AC-7 bleiben aus M1 grün. Neue Tests in `tests/integration/hallen-dashboard.test.ts` und `halls.test.ts`.
| Prüfung | Beleg | Mutation, die rot werden muss |
|---|---|---|
| Zusage: Zeile `confirmed`, `accepted` mit `actor` (Salz, Name nur in `evidence_actor`) | Integration | `actor` weglassen |
| Ablehnung ohne/mit zu kurzer Begründung (leer, 2 Zeichen, Leerzeichen): nichts geschrieben, Zeile `pending` | Integration | Pflichtprüfung entfernen |
| Ablehnung mit Begründung: `declined` mit `answered_by`, `reason` im Beweisprotokoll (bereinigt, ≤ 300), keine Spalte in `match_hall_requests` | Integration | Grund nicht übernehmen |
| Fremde Halle/entzogener Zugang: abgelehnt, nichts außer ggf. `late_attempt` nach Regel | Integration (M1-Muster) | Zugangsprüfung entfernen |
| **Veraltete Aktion:** Termin geändert (neue Runde), Aktion der alten Runde: abgelehnt, neue Anfrage bleibt `pending` | Integration | Rundenprüfung entfernen |
| **Antwort nach Fristende** (Job nicht gelaufen), Frist per **DB-Zeit/Parameter** in die Vergangenheit: abgelehnt, Zeile unverändert, **kein** `accepted`, genau ein `late_attempt` je (Spiel, Halle, Runde), das auch **committet** (kein Rollback durch Wurf); zweiter Versuch: kein zweiter Eintrag | Integration | Fristprüfung entfernen; Wurf vor Eintrag; Unique entfernen |
| Fristprüfung mit der DB-Uhr: Anwendungsuhr weicht ab, Entscheidung folgt der DB-Zeit | Integration | `new Date()` statt SQL-Zeit |
| Ablauf ohne Antwort: `declined` **ohne** `answered_by`, genau ein `expired` (aus M3b), zweiter Joblauf nichts | Integration | doppelter Lauf schreibt doppelt |
| Parallel/verschränkt: Antwort gegen Ablauf, Antwort gegen Entzug (Backlog 116), zwei Antworten: ein Gewinner, ein Eintrag, keine Verklemmung, Zähler zuletzt (mit den M3b-Pfaden) | Integration (deterministisch) | Reihenfolge ändern |
| Backlog 115: zweite `pending`-Zeile nach der Auswahl wird nicht ungesperrt `unmanaged` | Integration (verschränkt) | `inArray` entfernen |
| Namenfrei; **Captains/Lobby: kein Freitext** (HTML **und** RSC, Notification-Body ohne Begründung), Fremdtext nur als Text | E2E + Integration | Begründung in Benachrichtigung einbauen |
| Frist ≤ Anstoß − 1 h (Anforderung, Umsetzung M4) | Test (M2 benennt, M4 erfüllt) | – |
| Keine Geldbewegung bei abgelehnt/nicht reagiert | Integration (Hauptbuch unverändert) | – |
| Bestehende Tests `halls`, `deadlines`, `halle.spec`: Änderungen nur nach t9-Freigabe, einzeln im PR-Text begründet | Review | – |

## 8. Datenschutz und Sicherheit
- **Mandantentrennung** wie M1; die Begründung einer Halle ist nur für Betreiber derselben Halle (und das Beweisprotokoll) sichtbar.
- **Beweisprotokoll ist dauerhaft:** Name und E-Mail des entscheidenden Kontos liegen in `evidence_actor` außerhalb des Hashes (Salz); die Kette bleibt prüfbar, auch wenn eine rechtliche Vorgabe den Klartext später einschränkt (**PL3 entschieden durch M3a**). **[FRAGE-RECHT R-M2-1]** Zulässigkeit, Zweck, Aufbewahrungsdauer, Auskunft und Löschung; **[FRAGE-RECHT R-M2-2]** Beweiswert der Server-Zeit; **[FRAGE-RECHT R-M2-3]** Verbindlichkeit „keine Antwort = abgelehnt“ gegenüber der Halle (Partnervertrag, FEHLT-NOCH). Keine Antwort durch einen Agenten.
- **Freitext:** Begründung kann Personenbezug enthalten; Eingabe begrenzt (200, im Protokoll 300 bereinigt), Hinweistext, Ausgabe nur als Text (escapen, kein HTML), Auswahlliste bevorzugt; Captains sehen nur die Kategorie, **nie** den Freitext (Lobby, Benachrichtigung, RSC).
- **Eingriffsprotokoll bleibt getrennt:** M2 schreibt für Betreiberentscheidungen **nicht** zusätzlich nach `recordIntervention`.
- **Security-Review Pflicht.**

## 9. Risiken und Randfälle
1. **Verspätete Zusage** (Lücke 1) und **veraltete Aktion** (Lücke 2): durch DB-Uhrprüfung und Rundenprüfung behoben, Tests erzwingen es.
2. **Zwei Zugangsinhaber entscheiden gleichzeitig:** Zeilensperre, ein Gewinner.
3. **Zusage lange vor der Buchung:** darf die Halle sie zurücknehmen? (P7)
4. **Beweiszähler als Engstelle:** alle Anfragen serialisieren an der Zählerzeile; Einträge werden am Ende gesammelt geschrieben (3.3), Messen im Bau.
5. **`late_attempt` als Spam-Vektor:** Unique je (Spiel, Halle, Runde).
6. **Frist nach Anstoß** bei kurzem Vorlauf (P9): M4.
7. **Konto-Löschung eines entscheidenden Betreibers:** Einträge bleiben, `evidence_actor` unterliegt R-M2-1.

## 10. Fragen (nur Fragen, keine Entscheidungen; gehen gesammelt an t2q)
**FRAGE-PRODUKT**
- **P1** Zusage mit optionalem Kommentar oder gar keinem? [ANNAHME: keiner]
- **P2** Ablehnung: Begründung als **Auswahlliste** (belegt, geschlossen/Wartung, Veranstaltung, sonstiges + Text) oder Freitext? Captains sehen nur die Kategorie? [ANNAHME: Liste + optionaler Text, Captains nur Kategorie]
- **P3** `late_attempt` (Antwortversuch nach der Frist) als Beweiseintrag? [ANNAHME: ja, ein Eintrag je Runde]
- **P4** Karenz nach Fristende oder harte Grenze? [ANNAHME: hart]
- **P5** *(entfällt: Art `unmanaged` aus M3b)*
- **P6** Genügt in M2 der heutige Ablauf nach „abgelehnt“ (andere freie Hallen kommen ins Veto, sonst neuer Termin), die Wahl „andere Halle/anderer Termin“ liefert M4?
- **P7** Darf die Halle eine Zusage zurücknehmen, solange nicht gebucht ist? [ohne Entscheid: nein]
- **P8** Soll `/halle` nach der Antwort die eigene Entscheidung (Zeit, Konto, Grund) zeigen; Zurückholen verboten? [ANNAHME: ja/nein]
- **P9** Frist ≤ Anstoß − 1 h: Soll M2 den Fall „Spiel in 5 h bekommt 12 h“ schon beheben (statt M4)? [ANNAHME: M4, in M2 als Test benannt]

**FRAGE-PLAN (Reviewer)**
- **PL1** M2 als eine Einheit nach 009 M3a/M3b (hier vorgeschlagen, Punkt 7) — *entschieden im Review*.
- **PL2** *(entfällt: keine `decision_kind`-Spalte)*
- **PL3** *(entschieden durch M3a: `actor_commitment`)*
- **PL4** *(entschieden: in der Transaktion)*
- **PL5** `late_attempt`: Art liefert M3 (Abstimmung mit worker-2) oder M2 erweitert den CHECK mit eigener Migration?
- **PL6** Runde an `match_hall_requests` führen (M3a/M3b) oder `requested_starts_at` in M2 ergänzen?

**FRAGE-RECHT** (beantwortet kein Agent): **R-M2-1** Name/E-Mail im dauerhaften Beweisprotokoll (Zweck, Rechtsgrundlage, Aufbewahrung, Auskunft/Löschung; Zusammenhang R1 in 011 M1); **R-M2-2** Beweiswert der Server-Zeit; **R-M2-3** Verbindlichkeit „keine Antwort = abgelehnt“ und Partnervertrag.
