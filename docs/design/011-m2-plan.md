# 011 M2-Plan: Anfragen bestätigen oder ablehnen, Pflicht-Begründung, Anbindung an das Beweisprotokoll
Stand: v3 2026-11-22 (v1 2e292f5, v2 9ef515d; v3 nach der Code-Vorbereitung gegen `origin/main` 9ce2b23 und den Entscheiden t2q) · Verfasser: worker-3 (Plan, Doku, kein Code) · Status: Entwurf, Review durch einen anderen Worker offen

Zweck: Plan für den Meilenstein M2 des Vertrags `docs/contracts/011-hallen-dashboard.md` (Version 3, AC-2 und AC-3): Der Betreiber bestätigt oder lehnt eine Anfrage seiner Halle ab (Ablehnung nur mit Begründung); jede Entscheidung steht im Beweisprotokoll aus 009 M3. Der Plan legt außerdem fest, wie M2 mit der Antwortfrist (`veto.ts`), dem Fristende und dem Wechsel von Halle oder Termin zusammenspielt, ohne M4 vorwegzunehmen.
Markierungen: **[FRAGE-PRODUKT]** Entscheid Nutzer/Orchestrator, **[FRAGE-RECHT]** beantwortet kein Agent, **[FRAGE-PLAN]** technische Wahl für den Reviewer, **[ANNAHME]** vorläufig, **ENTSCHIEDEN t2q** (Entscheid 2026-11-22, gilt).

Quellen: Vertrag 011 (Entscheidungen 2026-11-10, Zusage und Fristen, AC-2, 3, 9, 10, 13 bis 15, Meilensteine), Vertrag 009 v4 (AC-7), Plan 009 M3 (v5, Abschnitte 13 und 14) und `drizzle/0052_whole_siren.sql` (Beweisprotokoll, DB-Trigger), `docs/design/011-m1-plan.md` (Nachtrag 13), Backlog 115/116, Code `src/server/{veto,evidence,evidence-write,evidence-head,venue-access}.ts`, `src/lib/evidence.ts`, `src/db/schema-finance.ts`, `src/db/schema-matchmaking.ts`, `src/app/halle/page.tsx`, `src/server/matchmaking-actions.ts`.

## 0. Neu in v3 (Code-Vorbereitung gegen 009 M3 und Entscheide t2q)
| Punkt | v2 | v3 | Abschnitt |
|---|---|---|---|
| Haken | Aufruf von `recordEvidence` in vorhandenen Haken, „Sammeln am Ende“ | Die Haken sind **DB-Trigger** (DEFERRABLE, beim COMMIT) auf `match_hall_requests`; `recordEvidence` ist nur für Tests (ESLint). **M2 hakt nicht selbst ein**; „Sammeln am Ende“ entfällt | 2, 3.3 |
| Begründung | „keine Spalte, M2a ohne Migration“ | Transportweg **Sitzungswert `socaz.evidence_reason` (SET LOCAL), keine Spalte** (**ENTSCHIEDEN t2q, PL-A**); der Trigger prüft „gesetzt, nicht leer, 3 bis 200 Zeichen“; dafür **eine Migration** (Trigger-Funktionen) | 3.3, 4 |
| `late_attempt` | in der M2-Migration | **in der 009-M3-Nachlieferung (worker-2), nicht in M2** (**ENTSCHIEDEN t2q, PL-B/P3**): CHECK, Unique, SQL-Funktion; M2 ruft sie nur auf | 3.2, 4, 6 |
| Frist | „12 h, Verkürzung in M4“ | **Antwortfrist = min(12 h, Vorlauf − 1 h), nie über den Anstoß hinaus, schon in M2** (**ENTSCHIEDEN t2q, P9**); harte Grenze ohne Karenz (**P4**) | 3.2 |
| Uhr | Prüfung gegen die DB-Uhr | **Beweiszeit und Fristprüfung aus derselben DB-Zeit** (`transaction_timestamp()` der Entscheidungs-Transaktion), die Fristgrenze steht im Beweisdatensatz, Test an der Grenze (**ENTSCHIEDEN t2q, P10**) | 3.2, 6 |
| Runde | „aus M3a“ | lesender Helfer **`currentRoundOf`** in `src/server/evidence.ts` | 3.1, 3.3 |
| Captains | nur Kategorie (Annahme) | **ENTSCHIEDEN t2q, P2:** Auswahlliste (belegt / geschlossen-Wartung / Veranstaltung / sonstiges) + optionaler Text 3 bis 200; Captains sehen **nur die Kategorie**, nie den Freitext, nie in Benachrichtigungen | 3.1, 8 |
| Zusage zurücknehmen | offen | **ENTSCHIEDEN t2q, P7: nein** in M2; Ausnahme nur per Admin-1-Eingriff mit Protokoll; Rückzug als Produktfrage nach dem Pilot (Backlog) | 9 |
| Zerlegung | eine Einheit | **M2a-1** Migration allein, **M2a-2** Logik, **M2a-3** verschränkte Tests, **M2b** Oberfläche und Benachrichtigung, **M2c** Security und E2E | 6 |
| AC-5 | allgemein | Stellen einzeln: `halls.test.ts` 56/58/85/86 (Ablehnungen bekommen eine Begründung) | 7.2 |
| Fragen | verstreut | gesammelt in Abschnitt 11 | 11 |

## 1. Entscheide, die gelten (nicht neu verhandeln)
- Der Betreiber bestätigt („Halle ist frei“) oder lehnt ab („Halle ist belegt“); **Ablehnung nur mit Begründung**; jede Entscheidung ins Beweisprotokoll (Vertrag 011; AC-2, AC-3; Vertrag 009 AC-7).
- Antwortfrist: **min(12 Stunden, Vorlauf minus 1 Stunde)**, nie über den Anstoß hinaus (Vertrag 011, **P9 ENTSCHIEDEN t2q**); danach keine Zusage mehr, **harte Grenze, keine Karenz** (**P4 ENTSCHIEDEN t2q**); keine Antwort = abgelehnt, im Beweisprotokoll „nicht reagiert“ (Art `expired`).
- „Keine Antwort = abgelehnt“ und die Zusage gelten nur für Hallen **mit Zugang**; Hallen ohne Zugang (`unmanaged`) bleiben im Rennen (M1: `hasVenueAccess`/`accessHolders` einzige Quelle).
- Betreiber sehen **Team, Zeit, Spielerzahl, keine Namen** (AC-5, P8 in M1).
- **t9 P2:** Name/E-Mail des Google-Kontos, das am geteilten Zugang entschieden hat, steht **nur** im Beweisprotokoll (`evidence_actor`, außerhalb des Hashes); das Eingriffsprotokoll von Admin 1 enthält nur IDs.
- Die Zusage ist **verbindlich** (**P7 ENTSCHIEDEN t2q: kein Zurücknehmen durch die Halle in M2**, Ausnahme nur durch einen Admin-1-Eingriff mit Protokoll) und Buchungsbedingung für Hallen mit Zugang (011/008/012); sie wirkt in M4 (AC-13).
- **ENTSCHIEDEN t2q (P2/P3):** Die Ablehnung wählt eine Kategorie aus einer **Auswahlliste** (belegt / geschlossen-Wartung / Veranstaltung / sonstiges), dazu optional ein Text von 3 bis 200 Zeichen. Ein Antwortversuch **nach** der Frist wird als Beweiseintrag `late_attempt` festgehalten, ein Eintrag je Spiel, Halle und Runde (UNIQUE).

## 2. Bestand (Code nach 009 M3, `origin/main` 9ce2b23)
- **Ablauf** (`veto.ts`): `startHallCheck` fragt alle Hallen im Umkreis an: Zugang → `pending`, sonst `unmanaged`; `matches.vetoTurnDeadline = jetzt + 12 h` (`HALL_REPLY_MS`) für **alle** Zeilen gemeinsam, **nicht** gegen den Anstoß begrenzt (ein Spiel in 5 h bekommt 12 h). `startHallCheck` **löscht und legt die Zeilen je Termin neu an**. `settleHallCheck` (nach jeder Antwort und im Minutenjob `advanceVetos`): alle Antworten da oder Frist um → offene Zeilen `declined` (ohne `answered_at`); `confirmed` und `unmanaged` kommen ins Veto; ist keine frei: Termin neu wählen.
- **Antwort** (`answerHallRequest(userId, matchId, venueId, accept)`): Spiel `FOR UPDATE`, Zugang über `hasVenueAccess` in der Transaktion, Zeile muss `pending` sein, setzt `status`, `answered_by`, `answered_at`; Audit `hall.confirm`/`hall.decline` **ohne Grund**. `/halle`: zwei Knöpfe ohne Begründung (`answerHallAction(matchId, venueId, accept)`).
- **Beweisprotokoll (009 M3, Migration 0052):** Tabellen `booking_evidence` (Hash-Kette, `seq`/`prev_hash`/`hash`/`at` setzt der INSERT-Trigger, keine Fremdschlüssel, `tx_id`), `booking_evidence_counter`, `evidence_actor` (`user_id`, Name, E-Mail, Salz; **außerhalb des Hashes**). **Die Einträge entstehen DB-seitig:** DEFERRABLE-Constraint-Trigger auf `match_hall_requests` (`evidence_hall_event`, laufen beim COMMIT): `INSERT pending` → `request_sent`, `INSERT unmanaged` und `UPDATE → unmanaged` → `unmanaged`, `UPDATE → confirmed` → `accepted`, `UPDATE → declined` mit `answered_at` → `declined`, **ohne** `answered_at` → `expired`. **Actor** ist `NEW.answered_by` (nur bei `accepted`/`declined`); Name und E-Mail liest der Trigger aus `users` (anonymisierte Konten: kein Actor). **Runde:** INSERT-Ereignisse einer Transaktion eröffnen eine Runde, UPDATE-Ereignisse nehmen `max(round)` des Spiels. Idempotenz: Unique `(match, venue, round, kind)` für die ersten fünf Arten. `recordEvidence` (`evidence-write.ts`) ist **nur für Tests** (ESLint `no-restricted-imports`). `evidence_reconcile()` (täglicher Abgleich) prüft `declined` gegen `declined|expired`, `accepted`.
- **Was für M2 fehlt:** (a) `evidence_write` schreibt **kein `reason`** (die Spalte `booking_evidence.reason` existiert, ist immer NULL), `match_hall_requests` hat kein Begründungsfeld; (b) die Art **`late_attempt`** steht weder im CHECK `booking_evidence_kind_check` noch im Unique `booking_evidence_request_idx`, und ein Antwortversuch ändert keine Zeile (kein Trigger): **kommt in der 009-M3-Nachlieferung (worker-2)**; (c) die Fristgrenze steht nicht im Beweisdatensatz, und `at` wird beim COMMIT gesetzt, die Fristprüfung gäbe es nur mit einer anderen Uhr: **Abstimmung mit der Nachlieferung (6.2)**; (d) die Anwendung hat **keinen lesenden Zugriff auf die Runde** (`currentRound` steht in `evidence-write.ts`).
- **Lücke 1 (verspätete Zusage):** keine Prüfung gegen `vetoTurnDeadline`: zwischen Fristende und dem nächsten Joblauf kann eine Zusage noch angenommen werden.
- **Lücke 2 (veraltete Aktion auf neue Runde):** Nach einem neuen Termin legt `startHallCheck` neue `pending`-Zeilen für dasselbe Paar (Spiel, Halle) an; ein Betreiber mit veralteter `/halle`-Seite bestätigt mit `matchId`/`venueId` die **neue** Anfrage, ohne den neuen Termin gesehen zu haben.
- **Benachrichtigung:** `hall.request` (Push/Mail-Typ vorhanden) beim Anlegen der Anfragen; Änderungen sind M4 (AC-11).

## 3. Zielbild
### 3.1 Entscheidung des Betreibers (AC-2, AC-3, AC-4)
- **Bestätigen:** Zeile `confirmed`; der Trigger schreibt `accepted` mit Actor, kein `reason`.
- **Ablehnen (ENTSCHIEDEN t2q, P2):** Formular mit **Auswahlliste** (belegt / geschlossen-Wartung / Veranstaltung / sonstiges) und optionalem Text (3 bis 200 Zeichen, getrimmt). Die Begründung, die ins Beweisprotokoll geht, ist die Kategorie, ggf. mit dem Text (Format festlegen, z. B. `kategorie` oder `kategorie: Text`, höchstens 200 Zeichen); ohne gültige Kategorie wird **nichts** geschrieben (Test). Oberfläche: bestehende Klassen und `ActionForm`, kein Look-Umbau.
- **Art der Ablehnung ohne neue Spalte:** unterschieden wird im Beweisprotokoll (`declined` mit Actor und `reason` gegen `expired`), im Bestand über `answered_at` (Antwort setzt es, die Frist nicht). **Regel:** Jeder Pfad, der `declined` setzt, setzt `answered_at` (Antwort) oder gehört ausdrücklich zur Frist (`settleHallCheck`); ein Verhaltenstest über `veto.ts`/`venue-access.ts` stellt das sicher (Plan 009 M3, 14.3).
- **Veraltete Aktion (Lücke 2):** `pendingHallInquiries` liefert die **Runde** (`max(round)` des Spiels über den lesenden Helfer `currentRoundOf`, ein Aggregat), `/halle` führt sie als Hidden-Feld, `answerHallRequest` vergleicht sie **in der Transaktion nach der Spielsperre** mit `currentRoundOf`; Abweichung: „Diese Anfrage ist nicht mehr aktuell, bitte die Seite neu laden“, nichts geändert. Altbestand ohne Eintrag: Runde 0 auf beiden Seiten. Alternative (**PL-C**): `match_hall_requests.created_at` als Merkmal (Millisekundenvergleich wegen µs-Genauigkeit). **Alle Pfade prüfen**, die `starts_at` oder die Halle ändern (Terminwahl, Termin-Einigung, Matchmaking, Admin-Eingriffe), ob sie `startHallCheck` erneut auslösen; die Liste gehört in den PR-Text.
- **Kein Zugriff fremder Hallen** (AC-4): wie M1 (`hasVenueAccess` in der Transaktion).
- **Idempotenz:** zweiter Klick oder gleichzeitiger Ablauf: genau ein Eintrag (Unique je Spiel, Halle, Runde, Art), der zweite meldet „schon beantwortet“.
- **Captains (ENTSCHIEDEN t2q, P2):** Sie sehen **nur die Kategorie** („Halle abgelehnt: belegt“), **nie den Freitext** und **nie** in Benachrichtigungen (Test: Notification-Body ohne Begründung, HTML **und** RSC der Lobby, SSE). Quelle der Kategorie für die Lobby: **PL-E** (Frage unten); der Freitext verlässt das Beweisprotokoll nicht.

### 3.2 Antwortfrist, Fristende, Uhr
- **Eine Funktion, eine Stelle:** `hallReplyDeadline(match, now)` (reine Funktion `src/lib/hall-deadline.ts`, Unit-getestet) ersetzt `HALL_REPLY_MS` **schon in M2** (ENTSCHIEDEN t2q, P9): Frist = `min(now + 12 h, Anstoß − 1 h)`, **nie nach dem Anstoß**; liegt der Anstoß weniger als 1 h entfernt, entsteht keine Anfrage mit Frist (Vertrag 011 AC-14/16 regeln den Mindestvorlauf, M4). Test: Spiel in 5 h bekommt Frist ≤ Anstoß − 1 h, Spiel in 30 h bekommt 12 h. `startHallCheck` setzt die Frist über diese Funktion.
- **Harte Grenze ohne Karenz (ENTSCHIEDEN t2q, P4):** Zusage und Ablehnung sind nur **vor** der Frist möglich; der Minutenjob räumt nur auf, entscheidend ist die Prüfung in der Entscheidungs-Transaktion.
- **Eine Uhr für Frist und Beweis (ENTSCHIEDEN t2q, P10):** Die Fristprüfung läuft **in SQL** derselben Transaktion nach der Spielsperre mit **`transaction_timestamp()`** (nicht `new Date()` der Anwendung): `veto_turn_deadline > transaction_timestamp()`. Der Beweiseintrag nimmt **dieselbe DB-Zeit** (`transaction_timestamp()` der Entscheidungs-Transaktion; kein App-Zeitstempel), und die **Fristgrenze wird im Beweisdatensatz mit abgelegt** (Abstimmung mit der Nachlieferung, 6.2). Damit gilt: Eintrag `at` ≤ Frist heißt „vor Fristende entschieden“, und die Prüfung lässt sich am Protokoll nachvollziehen. **Test an der Grenze:** Entscheidung genau am Fristende (Frist = `transaction_timestamp()` der Transaktion und Frist knapp davor/danach, Zeitreise über die DB-Frist, die Anwendung gibt keine Zeit vor): vor Ablauf `accepted`, ab Ablauf `late`. Nebenwirkung, die benannt wird: `transaction_timestamp()` ist der **Beginn** der Transaktion; wartet die Entscheidung auf die Spielsperre, gilt die Zeit des Beginns, nicht des Sperrerhalts (so entschieden, gleiche Zeit für Prüfung und Beweis).
- **`late_attempt` ohne Rollback (ENTSCHIEDEN t2q, P3; Lieferung durch die 009-M3-Nachlieferung):** `answerHallRequest` wirft bei Fristablauf **nicht** (Wurf = Rollback = Eintrag weg), sondern gibt `{ status: "late" }` zurück und beendet die Hauptransaktion **ohne** Änderung; danach ruft die Aktion in einer **eigenen kurzen Transaktion** die SQL-Funktion `evidence_late_attempt(...)` aus der Nachlieferung auf (hält den Zähler nur Millisekunden und davor nichts: der Deadlock-Zyklus aus 009 M3 kommt nicht zurück; ein Aufruf mitten in der Hauptransaktion wäre der verbotene Fall) und meldet „Die Antwortfrist ist abgelaufen“. **Je (Spiel, Halle, Runde) höchstens ein `late_attempt`** (UNIQUE), sonst Klick-Spam im globalen Protokoll.
- **Ablauf ohne Antwort:** der Trigger schreibt `expired` (kein `answered_at`); M2 fügt nichts hinzu. Keine Geldbewegung (AC-9).
- **Entzug mitten in der Frist:** M1: Zeilen werden `unmanaged`; der Trigger schreibt `unmanaged` (kein Zutun von M2).

### 3.3 Anbindung an das Beweisprotokoll (009 M3, DB-Trigger)
- **M2 hakt nicht selbst ein.** Für Zusage, Ablehnung, Ablauf und Entzug schreibt der Trigger den Eintrag, sobald `answerHallRequest`/`settleHallCheck`/`releasePendingRequests` die Zeile wie bisher ändern. Die Sperrreihenfolge „Protokoll zuletzt“ erfüllt der DEFERRABLE-Trigger (Zähler erst beim COMMIT) ohne Zutun von M2; „Einträge sammeln und am Ende schreiben“ aus v2 entfällt. Pflicht für M2: die vorhandene Sperrreihenfolge (Spiel, Zugang ohne Sperre, Anfragezeile) **nicht ändern**.
- **Begründung (`reason`), Transportweg (ENTSCHIEDEN t2q, PL-A):** `answerHallRequest` setzt in der **eigenen Transaktion** vor dem UPDATE den Sitzungswert `socaz.evidence_reason` (`set_config(..., true)`, also `SET LOCAL`); **keine Spalte** an `match_hall_requests`. Die ersetzte Funktion `evidence_hall_event()` liest ihn **nur** beim Ereignis `declined` mit `answered_at` und **prüft: gesetzt UND nicht leer UND Länge 3 bis 200**; sonst bricht der Trigger ab (die Entscheidung scheitert, nichts wird gespeichert). Bei `accepted`, `expired`, `unmanaged` wird der Wert ignoriert. Der Wert wird nach dem UPDATE geleert. **Tests:** ohne Begründung wird abgelehnt (auch wenn die App-Prüfung umgangen wird, Trigger-Test); zu kurz/zu lang abgelehnt; Isolation (zwei Ablehnungen in einer Transaktion, Wert nach der Transaktion leer). **Risiken:** eine andere Zeile derselben Transaktion erbt die Begründung; Fälschbarkeit nur durch App-Code (Vertrauensgrenze wie `answered_by`, Plan 009 M3, 14.3).
- **Bereinigung doppelt:** App (Eingabeprüfung 3 bis 200, Kategorie aus der Liste) und Datenbank (`cleanReason`-Äquivalent, höchstens 300, CHECK `booking_evidence_reason_len`); ein Test vergleicht beide für Sonderzeichen (**PL-D**).
- **Actor:** `NEW.answered_by` (Konto-ID, Name und E-Mail aus `users`) → `evidence_actor` mit Salz; im Hash nur `actor_commitment`. Gelöschte/anonymisierte Konten bekommen keinen Actor (Löschpflicht, Plan 009 M3, 14.1; R-M2-1).
- **Runde:** der Trigger vergibt sie; M2 liest sie nur über `currentRoundOf(exec, matchId)` in `src/server/evidence.ts` (max(round), 0 ohne Eintrag). Einträge einer neuen Runde sind erst nach dem Commit der Anfragezeilen sichtbar; die Seite zeigt die Anfrage erst danach (Test).
- **Abbildung der Begriffe:** Anfrage → `request_sent`; Antwort → `accepted`/`declined`; nicht reagiert → `expired`; Entzug → `unmanaged`; **`free` ist kein Feld** (`accepted` = frei plus Zusage, `declined` = belegt); Versuch nach der Frist → `late_attempt` (Nachlieferung).
- **Fehlerverhalten:** Scheitert der Trigger beim COMMIT, scheitert die Entscheidung (Rollback), Meldung „Bitte erneut versuchen“; `late_attempt` ist bewusst ein eigener kurzer Schritt (3.2).

### 3.4 Wechsel von Halle oder Termin (AC-15) und was M2 davon festlegt
- **Heute:** Antwortet keine Halle mit „frei“, setzt `settleHallCheck` das Spiel auf „neuer Termin“ (Anfragen weg, Stimmen weg, Captains benachrichtigt); die Zusage verfällt, weil ihre Zeile gelöscht wird (die Beweiseinträge bleiben).
- **M2 legt fest und testet:** (a) Die Zusage gilt **nur für die Runde**, in der sie gegeben wurde; (b) beim Wechsel bleiben alte Beweiseinträge unverändert, die neue Anfrage erzeugt neue (neue `round`); (c) eine Antwort auf eine **alte** Runde wird abgelehnt (3.1); (d) abgelehnt/nicht reagiert löst keine Geldbewegung aus.
- **M4 (nicht hier):** Oberfläche „andere Halle oder anderen Termin wählen“, „Bereit“ zurücksetzen, Anteil neu anzeigen, Mindestvorlauf (AC-14 Mindestvorlauf, AC-16), Absage bei fehlender Zusage (AC-10, 13), Kalender (AC-12), Push und Mail (AC-11).
- **Lücke zwischen M2 und M4 (P6):** Bleibt nach einer Ablehnung eine andere Halle frei, kommt sie ins Veto; gefragt wird nicht, ob die Captains eine andere Halle wählen wollen [ANNAHME: M4 liefert die Wahl].

### 3.5 Abgrenzung zu den Nachbar-Meilensteinen
| Thema | M2 | später |
|---|---|---|
| Grund (Transport, Pflicht, Kategorie), Actor, Fristgrenze in SQL mit einer Uhr, `late`-Rückgabe, veraltete Aktion, `hallReplyDeadline` = min(12 h, Vorlauf − 1 h) | ja | – |
| `late_attempt` (CHECK, Unique, SQL-Funktion), Fristgrenze und `transaction_timestamp` im Beweisdatensatz | **nein, Nachlieferung 009 M3 (worker-2)** | – |
| Push/Mail, Kalender, Zusage als Buchungsbedingung, Wahl andere Halle/Termin, Mindestvorlauf | nein | M4 |
| Buchungen, Auszahlungen, Rechnungen | nein | M3 |
| Turnier-Zusage | nein | 012 M5-7 |

### 3.6 Einheit mit 009 M3
009 M3 ist gemergt (9ce2b23); M2 baut auf den Triggern auf und **ändert zwei Funktionen** (3.3, 4). Das ist ein Eingriff in die Beweiserzeugung: Migration allein, `beweisprotokoll-haken.test.ts` bleibt **unverändert grün**. Die Nachlieferung (6.2) und die M2-Migration ändern dieselbe Trigger-Familie: **gemeinsame Reihenfolge mit worker-2**, nie gleichzeitig.

### 3.7 Backlog 115 und 116: Fix-Entwurf (nur Text)
- **115 (`releasePendingRequests`, `venue-access.ts`):** Auswahl und UPDATE sind getrennt, das UPDATE filtert nur auf Halle und Status `pending`, **nicht** auf die gesperrten Spiele. Fix: `where(and(eq(venueId), eq(status, 'pending'), inArray(matchId, ids)))` mit den **gesperrten** ids. Test verschränkt: eine zweite `pending`-Zeile nach der Auswahl bleibt `pending`; Mutation ohne `inArray` rot. **Gehört zu M2a-2** (gleiche Dateien, gleiche Sperrreihenfolge).
- **116 (Konto-Löschung gegen Spielablauf):** `deleteAccount` → `revokeAccessOfUser` sperrt **venues → venue_access → matches**; `advanceVetos`/`settleHallCheck` sperren **nur das Spiel**, keine Halle. **Heute kein Zyklus.** Risiko erst, wenn eine Halle **nach** einer Spielsperre gesperrt wird. Fix-Entwurf: Regel im Code (Kommentar an `answerHallRequest`/`settleHallCheck`: nie Halle oder `venue_access` nach einer Spielsperre sperren), **deterministischer verschränkter Test** (T1 `revokeAccessOfUser`, T2 `advanceVetos` auf demselben Spiel mit abgelaufener Frist, beide Reihenfolgen, plus ein Lauf mit Trigger-Pfad) und Mutation (Halle in `settleHallCheck` nach der Spielsperre sperren → Test rot). Der Trigger-Zähler wird erst beim COMMIT gesperrt, ändert die Ordnung also nicht (Plan 009 M3, 14.1).

## 4. Datenmodell und Migration (M2a-1, allein)
- **Eine Migration, additiv, `CREATE OR REPLACE`, kein Datenumbau, keine neue Spalte:**
  1. `evidence_write(p_match, p_venue, p_job, p_round, p_kind, p_actor)` bekommt **`p_reason text`** und schreibt `booking_evidence.reason` (bereinigt, ≤ 300).
  2. `evidence_hall_event()` liest bei `declined` mit `answered_at` den Sitzungswert `socaz.evidence_reason`, **prüft gesetzt, nicht leer, 3 bis 200 Zeichen** (sonst `RAISE EXCEPTION`, die Entscheidung scheitert) und übergibt ihn an `evidence_write`; bei allen anderen Ereignissen `NULL`.
  3. Fristgrenze und Zeit: Wo der Beweisdatensatz die **Fristgrenze** und die DB-Zeit der Entscheidungs-Transaktion trägt, ist Teil der **Nachlieferung** (6.2); die M2-Migration setzt darauf auf und ändert diese Teile nicht.
  4. `evidence_reconcile()` und die Hash-Funktion bleiben unverändert.
- **Nicht in dieser Migration:** `late_attempt` (CHECK, Unique, `evidence_late_attempt`): Nachlieferung 009 M3 (worker-2).
- **Migrationsnummer:** belegt 0049 (011 M1), 0050 (012 M5-1), 0051 (012 M5-3), 0052 (009 M3, gemergt), 0053 (012 M5-4); die Nachlieferung braucht eine weitere; die nächste freie für M2 wird **erst beim Bau** gegen `origin/main` geprüft. Journal und Snapshot mitcommitten, `db:generate` danach „No schema changes“, `migrate-check.mjs` ergänzen (benannte Marke, nicht „letzte Migration“; die beiden Funktionen verhalten sich wie beschrieben). Migrationen nie parallel zu Tasks mit Schema-Annahmen.
- **Rollback:** Funktionsversionen zurücknehmen (alte Definition aus 0052); der Beweiseintrag selbst ist bewusst nicht rücknehmbar.
- **Wartungsausnahme:** `socaz.ledger_maintenance` unterdrückt alle Einträge der Transaktion (Plan 009 M3, 14.3): in M2 **nicht** verwenden.

## 5. Dateiliste (Entwurf, per Grep zu bestätigen)
| Bereich | Dateien |
|---|---|
| Migration | `drizzle/<nächste freie Nummer>_*.sql`, `drizzle/meta/*`, `scripts/migrate-check.mjs` (kein Schema-Code, nur Funktionen) |
| Logik (M2a-2) | `src/server/veto.ts` (`answerHallRequest(userId, matchId, venueId, accept, opts?: { reason?, round? })`: Fristgrenze in SQL mit `transaction_timestamp()`, Rundenprüfung, Pflicht-Begründung, Sitzungswert, Rückgabewert `late`; `startHallCheck` über `hallReplyDeadline`), `src/lib/hall-deadline.ts` (neu), `src/server/evidence.ts` (`currentRoundOf`), `src/server/matchmaking-actions.ts` (`answerHallAction`: `reason`, `round`, Meldung bei `late`), `src/server/venue-access.ts` (Backlog 115) |
| Oberfläche (M2b) | `src/app/halle/page.tsx` (Ablehnen-Formular mit Auswahlliste, Runde als Hidden-Feld; bestehende Klassen, kein Look-Umbau), `pendingHallInquiries` liefert die Runde, Benachrichtigungstext „abgelehnt“ ohne Freitext, Lobby zeigt die Kategorie |
| Tests | Abschnitt 7 |
| Doku | `docs/BETRIEB.md` (Begründung, Frist, was „zu spät“ bedeutet), `docs/loop/GO-LIVE-AUDIT.md` |

## 6. Etappen, Reihenfolge, Startbedingungen
### 6.1 Etappen
| Etappe | Inhalt | Migration | Art |
|---|---|---|---|
| **M2a-1** | Migration (4): `reason` im Trigger mit Prüfung, `migrate-check` | ja, **allein** | Migration, security |
| **M2a-2** | Logik (5): `hallReplyDeadline`, Fristgrenze in SQL, Runde, Pflicht-Begründung/Kategorie, Sitzungswert, `late`-Rückgabewert (ruft die Funktion der Nachlieferung), `currentRoundOf`, Backlog 115 | nein | Server |
| **M2a-3** | Verschränkte und parallele Tests (Backlog 116, Antwort × Ablauf/Entzug/Löschung), Grenzfall am Fristende, Kettenprüfung | nein | Tests, security |
| **M2b** | Oberfläche `/halle`, Benachrichtigung ohne Freitext, Lobby-Kategorie | nein | UI (klein) |
| **M2c** | Security-Prüfung, E2E (Gesamtablauf), `BETRIEB` | nein | security, Doku |

### 6.2 Anforderungen an die 009-M3-Nachlieferung (worker-2, ENTSCHIEDEN t2q: PL-B, P3, P10)
M2 beschreibt nur, was es braucht; Bau und Plan liegen bei worker-2:
1. Art **`late_attempt`**: `booking_evidence_kind_check` und Unique (je Spiel, Halle, Runde höchstens einer); SQL-Funktion `evidence_late_attempt(p_match, p_venue, p_actor)` (Zähler zuerst sperren, Runde = `max(round)`, Existenz prüfen, `evidence_write`, still weiter, wenn vorhanden). Matrix-Test `EVIDENCE_KINDS` gegen CHECK.
2. **Fristgrenze im Beweisdatensatz** (z. B. `deadline_at`, Zeitpunkt der Frist der Anfrage; für `accepted`/`declined`/`late_attempt`/`expired`) und **Eintragszeit aus der DB-Zeit der Entscheidungs-Transaktion** (`transaction_timestamp()` statt Commit-Zeit), damit Prüfung und Beweis dieselbe Uhr haben (P10). Ob die Fristgrenze im Hash steht, entscheidet die Nachlieferung (Folge für Hash-Eingabe und Test).
3. Schnittstellenname und Signatur mit M2 abstimmen; **M2a-2 (Aufruf von `late_attempt`, Fristgrenze) startet erst nach der Nachlieferung**; M2a-1 (Begründung im Trigger) kann vorher laufen, wenn die Reihenfolge der Migrationen mit worker-2 steht (dieselbe Trigger-Familie, nie parallel).

### 6.3 Startbedingungen
(1) 011 M1 und 009 M3 gemergt (erfüllt: #138, 9ce2b23); (2) Plan-OK (Review), Entscheide t2q liegen vor; (3) **Nachlieferung 009 M3 (`late_attempt`, Fristgrenze/Zeit)** vor M2a-2; (4) Migrationsnummer gegen `origin/main` geprüft; (5) Fragen PL-C, PL-D, PL-E beantwortet (Detail, kein Blocker für M2a-1). Security-Review Pflicht, Code-Review durch einen anderen Worker; Writer ≠ Tester; höchstens 2 Code-Writer; M2a-1 läuft allein, M2a-2 durch **einen** Writer (Sperrreihenfolge in `veto.ts`).

## 7. Akzeptanzkriterien, Tests, Mutationen, AC-5
### 7.1 Neue Tests (AC-2, AC-3; AC-4 und AC-7 bleiben aus M1 grün)
Neue Datei `tests/integration/hall-answer.test.ts` (oder in `hallen-dashboard.test.ts`).
| Prüfung | Beleg | Mutation, die rot werden muss |
|---|---|---|
| Zusage: `accepted` mit Actor (Salz, Name nur in `evidence_actor`), **kein** `reason` | Integration | `actor` weglassen |
| Ablehnung ohne Begründung/Kategorie (leer, 2 Zeichen, Leerzeichen, unbekannte Kategorie): nichts geschrieben, Zeile `pending`; **auch bei umgangener App-Prüfung** lehnt der Trigger ab | Integration + Trigger-Test | App-Prüfung entfernen (Trigger fängt), Trigger-Prüfung entfernen (App fängt, Test auf Trigger rot) |
| Ablehnung mit Kategorie (+ Text): `declined` mit Actor, `reason` im Protokoll (bereinigt, ≤ 300), keine Spalte in `match_hall_requests` | Integration | Begründung nicht übernehmen |
| Sitzungswert-Isolation: zwei Ablehnungen in einer Transaktion bekommen nicht dieselbe Begründung; nach der Transaktion ist der Wert leer | Integration | Wert nicht leeren |
| Ablauf ohne Antwort: `expired`, **kein** `reason`, kein Actor | Integration | Begründung auch bei `expired` übernehmen |
| **Fristgrenze:** Antwort **genau am Fristende** (Frist und `transaction_timestamp()` fallen zusammen; Grenzwerte −1 µs/+0): vor Ablauf `accepted`, ab Ablauf `late`; Eintragszeit und Prüfzeit stammen aus **derselben DB-Zeit**; die Fristgrenze steht im Beweisdatensatz (nach Nachlieferung) | Integration (Zeitreise über die DB-Frist) | App-Uhr statt DB-Zeit; Grenze mit `>=`/`>` vertauscht |
| **Antwort nach Fristende** (Job nicht gelaufen): Rückgabe `late`, Zeile unverändert, **kein** `accepted`, genau ein `late_attempt` je (Spiel, Halle, Runde), das **committet** (kein Rollback); zweiter Versuch: kein zweiter Eintrag | Integration (nach Nachlieferung) | Fristprüfung entfernen (heutiger Zustand rot); Wurf statt Rückgabe; Unique entfernen |
| `hallReplyDeadline`: Spiel in 5 h → Frist ≤ Anstoß − 1 h, Spiel in 30 h → 12 h, nie nach dem Anstoß | Unit + Integration (`startHallCheck`) | 12 h fest einbauen |
| **Veraltete Aktion:** Termin geändert (neue Runde), Aktion der alten Runde abgelehnt, neue Anfrage bleibt `pending` | Integration | Rundenprüfung entfernen |
| Fremde Halle/entzogener Zugang: abgelehnt, nichts außer ggf. `late_attempt` nach Regel | Integration (M1-Muster) | Zugangsprüfung entfernen |
| Parallel/verschränkt: Antwort × Ablauf, Antwort × Entzug (116), zwei Antworten, Antwort × Konto-Löschung: ein Gewinner, vollständige Einträge, `verifyEvidenceChain` gültig, keine Verklemmung | Integration (deterministisch) | Sperrreihenfolge ändern |
| Backlog 115: zweite `pending`-Zeile nach der Auswahl wird nicht ungesperrt `unmanaged` | Integration (verschränkt) | `inArray` entfernen |
| Matrix und Bereinigung: `cleanReason` gleich SQL-Bereinigung | Unit/Integration | – |
| Abgleich: `evidence_reconcile()` bleibt leer nach Zusage, Ablehnung, Ablauf (und `late_attempt`) | Integration | – |
| Altzeile vor `evidence_cutover_at`: Antwort erzeugt trotzdem Einträge | Integration | – |
| Namenfrei; **Captains/Lobby: nur Kategorie, nie Freitext** (HTML, RSC, SSE; Notification-Body ohne Begründung); Fremdtext nur als Text | E2E + Integration | Freitext in Benachrichtigung/Lobby einbauen |
| Keine Geldbewegung bei abgelehnt/nicht reagiert | Integration | – |

### 7.2 Änderungen an bestehenden Tests (AC-5, Freigabe t9, **jede Stelle einzeln im PR-Text begründet**)
Grund für alle: **Pflicht-Begründung bei Ablehnung (Vertrag 011 AC-3)**. Zusagen (`accept = true`) bleiben unverändert, weil `reason`/`round` optionale Parameter sind; keine Abschwächung, die Ablehnungen werden strenger.
| Stelle (Stand `origin/main` 9ce2b23) | Änderung | Ersatz gleich stark? | Mutation, die die Stelle rot macht |
|---|---|---|---|
| `tests/integration/halls.test.ts:56` `answerHallRequest(d.manager.id, d.id, d.rows[0].id, false)` (erwartet „schon beantwortet“) | erhält eine gültige Begründung; die Aussage „zweite Antwort abgelehnt“ bleibt | ja (gleiche Aussage; der Test prüft die Doppelantwort, nicht die Begründungspflicht) | Prüfung „schon beantwortet“ entfernen |
| `halls.test.ts:58` `…rows[1].id, false // belegt` | erhält eine Begründung | ja | Ablehnung wirkt nicht (Status bleibt `pending`) |
| `halls.test.ts:85` und `:86` (beide Hallen ablehnen, danach neuer Termin) | beide bekommen eine Begründung | ja (der Test prüft „alle abgelehnt → neuer Termin“) | Auswertung `settleHallCheck` ändern |
| `tests/integration/beweisprotokoll-pfade.test.ts` (Ablehnung, falls vorhanden) | erhält eine Begründung; zusätzliche Aussage zu `reason` | ja, stärker | Begründung nicht übernehmen |
| `tests/e2e/halle.spec.ts` („Halle ist belegt“) | bleibt in M2a unberührt, ändert sich mit M2b (Formular mit Kategorie) | – | – |
| `tests/integration/beweisprotokoll-haken.test.ts` | **unverändert**, muss grün bleiben (Trigger-Ersetzung ändert keine bestehende Aussage) | – | Trigger-Funktion defekt → rot |

## 8. Datenschutz und Sicherheit
- **Mandantentrennung** wie M1; die Begründung einer Halle ist nur für Betreiber derselben Halle und im Beweisprotokoll sichtbar; **Captains sehen nur die Kategorie** (ENTSCHIEDEN t2q).
- **Beweisprotokoll ist dauerhaft:** Name und E-Mail des entscheidenden Kontos liegen in `evidence_actor` außerhalb des Hashes (Salz); bei Konto-Löschung werden `user_id`, `name`, `email` auf NULL gesetzt, die Kette bleibt gültig (Plan 009 M3, 14.1). **[FRAGE-RECHT R-M2-1]** Zulässigkeit, Zweck, Aufbewahrungsdauer, Auskunft und Löschung (das Betreiberkonto im Besonderen); **R-M2-2** Beweiswert der Server-Zeit (jetzt DB-Zeit der Entscheidungs-Transaktion); **R-M2-3** Verbindlichkeit „keine Antwort = abgelehnt“ gegenüber der Halle (Partnervertrag, FEHLT-NOCH). Keine Antwort durch einen Agenten.
- **Freitext:** Die Begründung kann Personenbezug enthalten und steht im Beweisprotokoll (Plan 009 M3, R3); Eingabe begrenzt (3 bis 200, im Protokoll 300 bereinigt), Hinweistext im Formular, Ausgabe nur als Text, Auswahlliste vorrangig.
- **Sitzungswert:** wird nur gesetzt, wenn die Begründung geprüft ist, nach dem UPDATE geleert, nie aus Client-Daten ohne Bereinigung; der Trigger prüft zusätzlich (3 bis 200, nicht leer).
- **Eingriffsprotokoll bleibt getrennt:** M2 schreibt für Betreiberentscheidungen **nicht** zusätzlich nach `recordIntervention`.
- **Security-Review Pflicht** (Rechte, Beweis, Datenschutz, Sperren, Trigger-Ersetzung).

## 9. Risiken und Randfälle
1. **Trigger-Funktion ersetzen:** `CREATE OR REPLACE` von `evidence_write`/`evidence_hall_event` ändert die Beweiserzeugung; ein Fehler bricht **jede** Hallenanfrage (der Trigger läuft beim COMMIT). Schutz: `beweisprotokoll-haken.test.ts` unverändert grün, `migrate-check`, Deadlock-Test, Migration allein, Reihenfolge mit der Nachlieferung.
2. **Sitzungswert** leckt in eine andere Zeile oder bleibt stehen: Isolationstest, Wert leeren (3.3).
3. **`late_attempt` hält den Zähler:** nur in einer kurzen eigenen Transaktion (3.2), nie mitten in der Hauptransaktion.
4. **`transaction_timestamp()` ist der Transaktionsbeginn:** eine Entscheidung, die auf die Spielsperre wartet, trägt die Zeit des Beginns; Prüfung und Beweis nutzen dieselbe Zeit (so entschieden, P10).
5. **Verspätete Zusage** (Lücke 1) und **veraltete Aktion** (Lücke 2): Tests erzwingen die Behebung.
6. **Zwei Zugangsinhaber entscheiden gleichzeitig** (geteilter Zugang): Zeilensperre, ein Gewinner.
7. **Zusage lange vor der Buchung (P7, ENTSCHIEDEN t2q):** Die Zusage ist verbindlich, die Halle kann sie in M2 **nicht** zurücknehmen; eine Ausnahme gibt es nur als Admin-1-Eingriff mit Eingriffsprotokoll. Ein Rückzug durch die Halle ist eine **Produktfrage nach dem Pilot** (Backlog-Zeile in diesem Branch).
8. **Beweiszähler als Engstelle:** alle Anfragen serialisieren beim COMMIT; Messen im Bau (Plan 009 M3, 13.6).
9. **Altbestand** vor `evidence_cutover_at` hat keine Einträge, die Antwort erzeugt trotzdem welche (Runde 0 → 1).
10. **Konto-Löschung während der Antwort:** gelöschtes Konto = kein Actor, die Antwort bleibt gültig.
11. **Abhängigkeit von der Nachlieferung (worker-2):** M2a-2 wartet auf `late_attempt` und die Fristgrenze im Beweisdatensatz; verzögert sie sich, bleibt M2a-1 allein baubar, M2 insgesamt aber blockiert.
12. **Bestehende Aufrufer** von `answerHallRequest` (Tests, `deadlines.test.ts`, `hallen-dashboard.test.ts`): optionale Parameter halten sie lauffähig; nur Ablehnungen ändern sich (7.2).

## 10. Belege (je Etappe, mit Zeitlimit, nie parallel in mehreren Worktrees)
`npm run typecheck`, `npx eslint`, `npx vitest run --testTimeout=…`, Integrationsdateien **einzeln** (`vitest.integration.config.mts`), `node --env-file=.env.local scripts/migrate-check.mjs`, `npx drizzle-kit generate` („No schema changes“), E2E nur betroffene Specs (`--workers=1`). Beendet sich `next dev` nach der ersten Anfrage mit einem Hinweis, ist das ein Hinweis von Next (Neustart nötig), kein Fehler des Plans.

## 11. Offene Fragen (nur gestellt; Entscheide t2q stehen oben)
**ENTSCHIEDEN t2q (2026-11-22):** P2 (Auswahlliste + optionaler Text, Captains nur Kategorie), P3 (`late_attempt` ja, Nachlieferung worker-2), P4 (harte Grenze), P7 (nein in M2, Rückzug als Produktfrage nach dem Pilot), P9 (Frist = min(12 h, Vorlauf − 1 h)), P10 (eine DB-Zeit, Fristgrenze im Datensatz), PL-A (Sitzungswert), PL-B (Nachlieferung).
**FRAGE-PRODUKT (weiter offen, Annahmen):** **P1** Zusage mit optionalem Kommentar oder keinem? [ANNAHME: keiner] · **P6** Genügt in M2 der heutige Ablauf nach „abgelehnt“ (andere freie Hallen kommen ins Veto, sonst neuer Termin), die Wahl „andere Halle/anderer Termin“ liefert M4? [ANNAHME: ja] · **P8** Soll `/halle` nach der Antwort die eigene Entscheidung (Zeit, Konto, Kategorie) zeigen, Zurückholen verboten? [ANNAHME: ja/nein, vereinbar mit P7]
**FRAGE-PLAN (Reviewer, worker-2 bei der Nachlieferung)**
- **PL-C** Veraltete Aktion: Runde (`currentRoundOf`, Vorschlag) oder `created_at`?
- **PL-D** Bereinigung der Begründung auch in SQL (zwei Quellen, Test) oder nur in der App?
- **PL-E (neu)** Woher bekommt die Lobby die **Kategorie** der Ablehnung für die Captains (nie den Freitext)? Vorschlag: Format `kategorie[: Text]` im `reason` und ein lesender Helfer in `evidence.ts`, der nur den Teil vor dem Doppelpunkt liefert; Alternative: Kategorie als eigenes Feld im Beweisdatensatz (Nachlieferung).
- **PL-F (neu)** Fristgrenze im Beweisdatensatz: Spalte (`deadline_at`) im Hash oder daneben, und Eintragszeit `transaction_timestamp()` (Nachlieferung, 6.2).
**FRAGE-RECHT (beantwortet kein Agent)**
- **R-M2-1** Name/E-Mail des entscheidenden Kontos im dauerhaften Beweisprotokoll: Zweck, Rechtsgrundlage, Aufbewahrung, Auskunft/Löschung (Zusammenhang R1 in 011 M1 und Partnervertrag).
- **R-M2-2** Beweiswert der Server-Zeit (DB-Zeit der Entscheidungs-Transaktion); qualifizierter Zeitstempel später.
- **R-M2-3** Verbindlichkeit „keine Antwort = abgelehnt“ und Partnervertrag.
