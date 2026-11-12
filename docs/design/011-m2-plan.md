# 011 M2-Plan: Anfragen bestätigen oder ablehnen, Pflicht-Begründung, Beweisprotokoll-Anbindung
Stand: v1 2026-11-12 · Code-Stand `origin/main` (011 M1 liegt als `feat/011-m1-nachlauf` zum Push bereit und wird hier als gemergt vorausgesetzt) · Verfasser: worker-3 (Plan, Doku, kein Code) · Status: Entwurf, Review durch einen anderen Worker offen

Zweck: Plan für den Meilenstein M2 des Vertrags `docs/contracts/011-hallen-dashboard.md` (Version 3, AC-2 und AC-3): Der Betreiber bestätigt oder lehnt eine Anfrage seiner Halle ab, die Ablehnung nur mit Begründung, und jede Entscheidung landet im Beweisprotokoll aus 009 M3. Zusätzlich legt der Plan fest, wie M2 mit der Antwortfrist (12 Stunden, `veto.ts`), der Karenz und dem Wechsel von Halle oder Termin zusammenspielt, ohne M4 vorwegzunehmen.
Markierungen: **[FRAGE-PRODUKT]** Entscheid Nutzer/Orchestrator, **[FRAGE-RECHT]** beantwortet kein Agent, **[FRAGE-PLAN]** technische Wahl für den Reviewer, **[ANNAHME]** vorläufig.

Quellen: Vertrag 011 (Entscheidungen 2026-11-10, Zusage und Fristen, AC-2, 3, 9, 10, 13 bis 15, Meilensteine M2/M4), Vertrag 009 v4 (Beweisprotokoll, AC-7, M3), `docs/design/011-m1-plan.md` (Nachtrag 13: Entscheide P1 bis P11, R1), `docs/design/009-m1-plan.md` (Eingriffsprotokoll), Code `src/server/veto.ts`, `src/app/halle/page.tsx`, `src/server/matchmaking-actions.ts`, `src/db/schema-matchmaking.ts`.

## 1. Entscheide, die gelten (nicht neu verhandeln)
- Der Betreiber bestätigt („Halle ist frei“) oder lehnt ab („Halle ist belegt“); **Ablehnung nur mit Begründung** (Pflichtfeld); jede Entscheidung ins **Beweisprotokoll** (Vertrag 011, Entscheidungen; AC-2, AC-3; Vertrag 009 AC-7).
- Antwortfrist **12 Stunden**, danach keine Zusage mehr möglich; keine Antwort = abgelehnt, im Beweisprotokoll „nicht reagiert“ (Vertrag 011, Weitere Entscheidungen; die Verkürzung bei kurzem Vorlauf ist AC-14, M4).
- „Keine Antwort = abgelehnt“ und die Zusage gelten nur für Hallen **mit Zugang**; Hallen ohne Zugang („unmanaged“) bleiben im Rennen (Vertrag 011, Annahmen; M1: `hasVenueAccess`/`accessHolders` ist die einzige Quelle).
- Betreiber sehen **Team, Zeit und Spielerzahl, keine Namen und Kontaktdaten** (AC-5, Entscheid P8 in M1).
- **t9 P2 (011 M1, Nachtrag 13):** Name/E-Mail des Google-Kontos, das am geteilten Zugang entschieden hat, steht **nur im Beweisprotokoll** (dieser Meilenstein), das Eingriffsprotokoll von Admin 1 enthält nur IDs.
- Eine Zusage ist Buchungsbedingung für Hallen mit Zugang (Vertrag 011, 008, 012); sie wirkt in M4 (AC-13), M2 liefert die belastbare Zusage-Aussage dazu.

## 2. Bestand (Code `feat/011-m1-nachlauf`, soweit M2 betroffen)
- **Ablauf heute** (`veto.ts`): Steht der Termin, ruft `startHallCheck` alle Hallen im Umkreis an: Hallen mit Zugang bekommen eine Anfragezeile `pending`, alle anderen `unmanaged`; die Frist `matches.vetoTurnDeadline = jetzt + 12 h` (`HALL_REPLY_MS`) gilt für **alle** Zeilen des Spiels gemeinsam. `settleHallCheck` läuft nach jeder Antwort und im Minutenjob `advanceVetos`: Sind alle Antworten da oder die Frist um, werden die noch offenen Zeilen `declined`, die Hallen `confirmed` und `unmanaged` kommen ins Veto (`match_veto_halls`); ist keine frei, werden Stimmen und Anfragen gelöscht, `schedulingOpen = true` (48 h) und beide Captains benachrichtigt („Keine Halle frei“).
- **Antwort** (`answerHallRequest(userId, matchId, venueId, accept)`, `veto.ts`): Spiel `FOR UPDATE`, Zugang über `hasVenueAccess` in der Transaktion, Zeile muss `pending` sein, setzt `confirmed`/`declined`, `answered_by`, `answered_at`, Audit `hall.confirm`/`hall.decline` mit nur der Halle (**ohne Grund**). Oberfläche `/halle`: zwei Knöpfe ohne Begründung (`answerHallAction`, `matchmaking-actions.ts`).
- **Lücke 1 (Entscheidung nach Fristablauf):** `answerHallRequest` prüft **nicht** gegen `vetoTurnDeadline`, nur gegen `vetoStatus = 'halls'`. Zwischen Fristende und dem nächsten Lauf des Minutenjobs (bis ca. 1 Minute, bei Joblauf-Ausfall länger) kann eine **verspätete Zusage** noch angenommen werden. Der Vertrag verlangt „keine Zusage mehr möglich“ und nennt als Randfall „abgelehnt ‚zu spät‘, protokolliert“.
- **Lücke 2 (nicht unterscheidbar):** `declined` bedeutet heute dreierlei: aktive Ablehnung, Ablauf ohne Antwort („nicht reagiert“), und (M1) Entzug des Zugangs wird zu `unmanaged`. Das Beweisprotokoll braucht die Unterscheidung (Abschnitt 3.3).
- **Lücke 3 (Verlauf geht verloren):** `startHallCheck` löscht die Anfragezeilen eines Spiels und legt sie neu an (neuer Termin); `match_hall_requests` ist also **kein** Verlauf. Der Beweis liegt im Beweisprotokoll (009 M3), nicht in dieser Tabelle.
- **Beweisprotokoll:** gibt es im Code noch nicht (009 M3: Tabelle nur anhängend per Trigger, Hash-Kette, PDF). Bis dahin existiert nur `audit_log` (veränderbar, nicht als Beweis tauglich).
- **Benachrichtigung:** `hall.request` (Push/Mail-Typ vorhanden) geht beim Anlegen der Anfragen an die Zugangsinhaber; Anpassungen sind M4 (AC-11).

## 3. Zielbild
### 3.1 Entscheidung des Betreibers (AC-2, AC-3, AC-4)
- **Bestätigen:** unverändert („Halle ist frei“), Zeile `confirmed`; zusätzlich ein Beweisprotokoll-Eintrag. Kein Grund nötig (optional, siehe P1).
- **Ablehnen:** Schritt mit **Pflicht-Begründung** (`reason`, 3 bis 200 Zeichen, getrimmt, wie `cleanReason` in M1 [ANNAHME]); ohne gültige Begründung wird nichts geschrieben (Test). Oberfläche: bestehende Klassen und `ActionForm`, **kein Look-Umbau** (der Look kommt mit 013 M7/Halle).
- **Kein Zugriff fremder Hallen** (AC-4): wie M1, `hasVenueAccess` in der Transaktion; ein Entzug zwischen Anzeige und Klick lehnt ab (Test, M1-Muster).
- **Sperrreihenfolge unverändert:** Spiel zuerst (`FOR UPDATE`), Zugang ohne Sperre lesen, dann Anfragezeile; **zuletzt** das Anhängen an das Beweisprotokoll (Abschnitt 3.3). Damit bleibt die M1-Ordnung venues → venue_access → matches erhalten und das Protokoll ist immer die letzte Sperre.
- **Idempotenz:** Zweiter Klick oder gleichzeitiger Ablauf: genau ein Eintrag je (Spiel, Halle, Entscheidung); der zweite Versuch meldet „schon beantwortet“ und schreibt nichts (Test mit parallelen Aufrufen).
- **Namenfrei:** Weder die Begründung noch die Anzeige liefern Spielernamen (AC-5). Das Freitextfeld der Halle kann Personenbezug enthalten: Hinweis im Formular, Länge begrenzt (Abschnitt 8).

### 3.2 Antwortfrist, Karenz, 12-h-Regel
- **Eine Funktion, eine Stelle:** `hallReplyDeadline(match, now)` (reine Funktion in `src/lib`, Unit-getestet) ersetzt die feste Konstante: in M2 = jetzt + 12 h (unverändert), in M4 = `min(12 h, Anstoß − 1 h − Vorlaufabzug)` nach AC-14. So ändert M4 nur die Funktion, nicht den Ablauf.
- **Harte Grenze im Server (schließt Lücke 1):** `answerHallRequest` lehnt ab, wenn `now >= vetoTurnDeadline` („Die Antwortfrist ist abgelaufen“), und schreibt in diesem Fall **keine** Zusage. Ein Beweisprotokoll-Eintrag „zu spät“ (Versuch nach Fristablauf, mit Zeit und Akteur) ist vorgesehen (P3), die Anfragezeile selbst wird dadurch nicht verändert.
- **Karenz:** Der Plan sieht **keine** Karenz vor [ANNAHME]: Zusage bis zur Frist zählt, danach nicht, ohne Toleranz. Der Minutenjob räumt nur auf (setzt offene Zeilen auf den Ablaufstatus); entscheidend ist die Prüfung gegen die Uhr im Server, nicht der Joblauf. **[FRAGE-PRODUKT P4]**, falls der Nutzer eine Karenz (z. B. 5 Minuten) wünscht.
- **Ablauf ohne Antwort** (`settleHallCheck`, Frist um): offene Zeilen werden wie heute `declined`, **zusätzlich** wird je Zeile „nicht reagiert“ (Akteur: System) in das Beweisprotokoll geschrieben, in derselben Transaktion wie das Setzen. Keine Geldbewegung (Vertrag 011 AC-9, 012: nichts abgebucht, solange nicht fixiert).
- **Status unterscheiden:** Neue Spalte (Abschnitt 4) hält, **wie** eine Zeile `declined` wurde (`declined_by_operator` | `no_response`), damit die Oberfläche und der Beweis die Fälle trennen können; der Statuswert `declined` bleibt für den Bestandscode gleich.
- **Entzug des Zugangs mitten in der Frist:** unverändert M1 (`unmanaged`, keine stille Ablehnung); im Beweisprotokoll als Systemereignis „Zugang entzogen, Anfrage entfällt“ [ANNAHME, **FRAGE-PRODUKT P5**: soll das protokolliert werden?].

### 3.3 Anbindung an das Beweisprotokoll (009 M3, AC-7)
Schnittstelle, die M2 von 009 M3 erwartet (**[ANNAHME]**, mit dem Plan 009 M3 abzustimmen; 009 M3 liegt in der Reihenfolge **vor** 011 M1 bis M4):
- `appendHallEvidence(tx, entry)`: hängt **in der Transaktion des Aufrufers** an; fehlschlagen heißt Rollback der Entscheidung (Beweis und Entscheidung sind gemeinsam atomar). Der Aufrufer gibt `now` nicht vor; die **Server-Zeit** setzt die Datenbank (Vertrag 009).
- Felder: `kind` (`request` | `answer` | `late_attempt` | `access_revoked`), `match_id`, `venue_id`, `request_ref` (Spiel + Halle), `free` (Platz frei ja/nein), `decision` (`accepted` | `declined` | `no_response`), `reason` (Pflicht bei `declined` durch Betreiber; leer bei Zusage und bei `no_response`), `evidence_actor` (siehe unten), `occurred_at` (Server), `prev_hash`/`hash` (Kette, 009).
- **`request`-Eintrag:** wird beim Anlegen der Anfrage (`startHallCheck`) für jede Halle **mit Zugang** geschrieben (Zeitstempel der Anfrage, Termin, Dauer, Spielerzahl, kein Name); Hallen ohne Zugang erzeugen keinen Eintrag (sie werden nie gefragt).
- **`evidence_actor`** (Entscheid P2): bei Betreiber-Entscheidung die **Konto-ID und ein Namens-Schnappschuss** (Name und E-Mail des Google-Kontos zum Zeitpunkt der Entscheidung, weil der Zugang geteilt ist und sich Name/Adresse später ändern können); bei Ablauf `system`. Der Schnappschuss steht nur im Beweisprotokoll, nie im Eingriffsprotokoll oder in `match_hall_requests`.
- **Nicht in M2:** Tabelle, Trigger, Hash-Kette, PDF-Export (009 M3). Fehlt 009 M3 zum Startzeitpunkt, **startet M2 nicht** (Startbedingung, Abschnitt 6); ein Zwischenspeicher in `audit_log` wäre kein Beweis und würde zwei Wahrheiten schaffen.
- **Reihenfolge der Sperren:** Spiel (`FOR UPDATE`) → … → **Protokollkette zuletzt** (eine Serialisierungsstelle in 009 M3, z. B. Advisory-Lock oder Zeile des Kettenendes). Das ist eine Engstelle, bei dem erwarteten Volumen (Hallenanfragen) unkritisch; Parallelitätstest (Abschnitt 7).
- **PDF/AC-8:** Der Gesamtablauf-Test (Vertrag 011 AC-8) liest die beiden Entscheidungen (Zusage, Ablehnung mit Grund) aus dem Export; das gehört zu M5, M2 liefert die Einträge.

### 3.4 Wechsel von Halle oder Termin (AC-15) und was M2 davon festlegt
- **Heute:** Antwortet keine Halle des Pools mit „frei“, setzt `settleHallCheck` das Spiel auf „neuer Termin“ (Anfragen weg, `schedulingOpen`, Stimmen weg) und benachrichtigt die Captains. Eine Zusage verfällt damit **automatisch**, weil ihre Anfragezeile gelöscht wird (`startHallCheck`/`settleHallCheck` löschen `match_hall_requests`).
- **M2 legt fest (und testet):** (a) Die Zusage gilt **nur für den Termin, zu dem sie gegeben wurde**: ändert sich Termin oder Halle, ist sie wertlos; (b) Beim Wechsel bleibt der alte `request`/`answer`-Eintrag im Beweisprotokoll **unverändert** (nur anhängen); die neue Anfrage erzeugt neue Einträge; (c) eine verspätete Antwort auf eine **alte** Anfrage (Termin inzwischen geändert) wird abgelehnt und als `late_attempt` protokolliert; (d) nach „abgelehnt“ oder „nicht reagiert“ werden **keine** Geldbewegungen ausgelöst (M2 fasst kein Geld an).
- **M4 (nicht hier):** die Oberfläche für „andere Halle oder anderen Termin wählen“ bei laufender Lobby, Rücksetzen von „Bereit“, Anteil neu anzeigen, Mindestvorlauf-Regeln (AC-14, 15, 16), Absage bei fehlender Zusage (AC-10, 13), Kalender und Sperrzeiten (AC-12), Mail und Push (AC-11).
- **Offene Lücke zwischen M2 und M4:** Heute fällt eine abgelehnte oder nicht reagierende Halle nur aus dem Pool; bleibt eine andere Halle frei, wird **nicht** gefragt, ob die Captains eine andere Halle wählen wollen (der Vertrag beschreibt „abgelehnt → Captains können eine andere Halle oder einen anderen Termin wählen“). **[FRAGE-PRODUKT P6]**: Genügt in M2 der heutige Pool-Ablauf (verbleibende freie Hallen kommen ins Veto, sonst neuer Termin), und die Wahlmöglichkeit liefert M4 gesamt?

### 3.5 Abgrenzung zu den Nachbar-Meilensteinen
| Thema | M2 (dieser Plan) | später |
|---|---|---|
| Entscheidung mit Pflicht-Begründung, Beweisprotokoll-Eintrag, harte Fristgrenze | ja | – |
| Verkürzte Frist bei Vorlauf unter 13 h, Mindestvorlauf 2 h/1 h | nur die Funktion `hallReplyDeadline` als Anschlussstelle | M4 (AC-14, 16) |
| Push und Mail an den Betreiber, Karenz-Erinnerung | nein | M4 (AC-11) |
| Kalender, Sperrzeiten | nein | M4 (AC-12) |
| Zusage als Buchungsbedingung, Absage bei fehlender Zusage | nein (nur die belastbare Aussage „Zusage vorhanden“) | M4 (AC-10, 13) |
| Wahl anderer Halle/Termin, Bereit zurücksetzen | nur Verhalten der Zusage beim Wechsel (3.4) | M4 (AC-15) |
| Buchungen, Auszahlungen, Rechnungen | nein | M3 |
| Turnier-Zusage | nein | 012 M5-7 / 011 M4 |

## 4. Datenmodell und Migration
- **Tabelle `match_hall_requests`** (additiv, nullable Spalten, **keine** Datenübernahme nötig): `decision_reason text` (Begründung der Ablehnung, 3 bis 200 Zeichen per CHECK bei `declined_by_operator`), `decision_kind text` (`confirmed` | `declined_by_operator` | `no_response` | null bei `pending`/`unmanaged`) mit CHECK-Verträglichkeit zu `status`. Bestand: bereits beantwortete Zeilen bekommen `NULL` (Altzeilen vor M2 haben keine Begründung; die Oberfläche behandelt `NULL` als „ohne Angabe“).
- **Kein Beweisprotokoll in dieser Migration** (009 M3). Falls M2 und 009 M3 sich eine Migration teilen müssten, ist das ein Fehler im Zuschnitt: M2 hängt an der vorhandenen Tabelle.
- **Migrationsnummer:** nächste freie nach `origin/main` zum Startzeitpunkt (Stand dieses Plans belegt: 0046 bis 0049; 012 M5-1 hat 0050, M5-3 0051 reserviert); Journal und Snapshot mitcommitten, `db:generate` danach „No schema changes“, `migrate-check.mjs` um die zwei Spalten ergänzen. Migrationen laufen nie parallel zu anderen Tasks mit Schema-Annahmen.
- **Rollback:** Spalten sind nullable; zurücknehmen heißt, sie nicht mehr zu lesen. Der Beweisprotokoll-Eintrag ist bewusst **nicht** zurücknehmbar.

## 5. Dateiliste (Entwurf, per Grep zu bestätigen)
| Bereich | Dateien |
|---|---|
| Schema/Migration | `src/db/schema-matchmaking.ts` (`match_hall_requests`: zwei Spalten), `drizzle/<nächste freie Nummer>_*.sql`, `drizzle/meta/*`, `scripts/migrate-check.mjs` |
| Ablauf | `src/server/veto.ts` (`answerHallRequest(userId, matchId, venueId, accept, reason)`, Fristgrenze, `settleHallCheck` setzt `decision_kind = no_response` und protokolliert, `startHallCheck` schreibt `request`-Einträge, `HALL_REPLY_MS` → `hallReplyDeadline`), neu `src/lib/hall-deadline.ts` (reine Funktion + Test) |
| Beweisprotokoll | Aufruf von `appendHallEvidence` (Schnittstelle aus 009 M3), Namens-Schnappschuss des Kontos (nur dort) |
| Aktion/Oberfläche | `src/server/matchmaking-actions.ts` (`answerHallAction`: Grund aus dem Formular, Pflicht bei Ablehnung), `src/app/halle/page.tsx` (Ablehnen-Formular mit Begründung, bestehende Klassen und `ActionForm`, **kein Look-Umbau**; Anzeige „Antwort bis …“ bleibt) |
| Benachrichtigung | `src/lib/notification-types.ts` unverändert; Text „abgelehnt“ an die Captains nennt **keine** Begründung im Klartext (P2-Frage unten) |
| Tests | Abschnitt 7; `tests/cleanup.ts` nur falls neue Tabellen entstehen (hier nicht) |
| Doku | `docs/BETRIEB.md` (Betreiber-Ablauf, Frist, was bei „nicht reagiert“ passiert), `docs/loop/GO-LIVE-AUDIT.md` (Beweisprotokoll-Aufbewahrung, siehe Rechtsfragen) |

## 6. Etappen und Startbedingungen (seriell)
| Etappe | Inhalt | Migration | Art |
|---|---|---|---|
| **M2a** | Spalten, `hallReplyDeadline`, Fristgrenze im Server (schließt Lücke 1, **ohne** Beweisprotokoll lauffähig), `decision_kind` | ja | Schema, Logik |
| **M2b** | Pflicht-Begründung in Aktion und Oberfläche (AC-3, AC-4) | nein | Logik, Oberfläche (klein) |
| **M2c** | Anbindung `appendHallEvidence` für `request`, `answer`, `no_response`, `late_attempt` (AC-2, AC-3 Protokollteil) | nein | Datenschutz, Sicherheit |

**Startbedingungen:** (1) 011 M1 gemergt (`hasVenueAccess`, `accessHolders`); (2) **M2c erst nach 009 M3** (Beweisprotokoll mit Trigger, Kette, Schnittstelle `appendHallEvidence`), M2a/M2b können früher gebaut werden, werden aber gemeinsam mit M2c als **eine Einheit** freigegeben, damit es keinen Zwischenzustand gibt, in dem Entscheidungen ohne Beweis laufen [ANNAHME, Alternative: M2a/M2b vorab mit `audit_log`-Eintrag, später umgestellt: **FRAGE-PLAN**]; (3) Frage P1 bis P6 beantwortet; (4) Migrationsnummer gegen `origin/main` geprüft. Security-Review Pflicht (Rechte, Mandantentrennung, Beweis, Datenschutz), Code-Review durch einen anderen Worker; Writer ≠ Tester.

## 7. Akzeptanzkriterien, Tests und Mutationen
Belegt werden AC-2 und AC-3 (Vertrag 011); AC-4 und AC-7 bleiben aus M1 grün. Neue Tests in `tests/integration/hallen-dashboard.test.ts` (Vertragsdatei) und, wo es um die Uhr geht, `tests/integration/halls.test.ts`.
| Prüfung | Beleg | Mutation, die rot werden muss |
|---|---|---|
| Zusage: Zeile `confirmed`, Beweiseintrag mit Akteur-Schnappschuss und Zeitstempel | Integration | Eintrag weglassen / Akteur leer |
| Ablehnung ohne Begründung (leer, 2 Zeichen, nur Leerzeichen): nichts geschrieben, Zeile bleibt `pending` | Integration | Pflichtprüfung entfernen |
| Ablehnung mit Begründung: `declined_by_operator`, Grund gespeichert, Eintrag im Beweisprotokoll mit Grund | Integration | Grund nicht übernehmen |
| Fremde Halle / entzogener Zugang: abgelehnt, nichts im Beweisprotokoll außer `late_attempt`/Zurückweisung nach P3 | Integration (M1-Muster) | Zugangsprüfung entfernen |
| Antwort **nach** Fristende, Job noch nicht gelaufen: abgelehnt „abgelaufen“, Zeile unverändert, kein `accepted`-Eintrag; Test mit gesetzter Uhr (`now` als Parameter, Zeitreise wie in `venue-invite-expiry`) | Integration | Fristprüfung entfernen (heutiger Zustand muss rot sein) |
| Ablauf ohne Antwort: `no_response`, Akteur `system`, ein Eintrag je Zeile, kein zweiter bei erneutem Joblauf | Integration (idempotent) | Doppelter Lauf schreibt doppelt |
| Parallel: Antwort und Ablauf, zwei Antworten: genau eine Entscheidung, genau ein Eintrag; keine Verklemmung (Sperrreihenfolge, Protokoll zuletzt) | Integration (verschränkt, deterministisch wie M1) | Reihenfolge ändern |
| Wechsel: nach neuem Termin zählt die alte Zusage nicht; alte Einträge bleiben; Antwort auf alte Anfrage abgelehnt | Integration | Zusage nicht verfallen lassen |
| Namenfrei: Oberfläche und Benachrichtigung enthalten keine Spielernamen und keinen Namens-Schnappschuss | E2E (HTML und RSC, M1-Muster) | Namen einbauen |
| Keine Geldbewegung bei abgelehnt/nicht reagiert | Integration (Hauptbuch unverändert) | – |
| Bestehende Tests `halls.test.ts`, `deadlines.test.ts`, `halle.spec.ts`: Änderungen nur nach t9-Freigabe (AC-5-Regel), jede einzeln im PR-Text begründet | Review | – |

## 8. Datenschutz und Sicherheit
- **Mandantentrennung:** wie M1; jede Abfrage und Aktion prüft den Zugang serverseitig. Die Begründung einer Halle ist für Betreiber derselben Halle sichtbar, nie für andere Hallen.
- **Beweisprotokoll ist dauerhaft:** Der Namens-Schnappschuss des entscheidenden Kontos bleibt, anders als alles andere, bewusst stehen und kann per Trigger nicht geändert werden. Das ist ein Spannungsfeld zur Konto-Löschung (Anonymisierung) und zur Aufbewahrungsfrist: **[FRAGE-RECHT R-M2-1]** Zulässigkeit, Zweck, Aufbewahrungsdauer und Auskunft/Löschung für Name und E-Mail im Beweisprotokoll; **[FRAGE-RECHT R-M2-2]** Beweiswert der Server-Zeit ohne qualifizierten Zeitstempel (009 Risiken); keine Antwort durch einen Agenten. Technische Vorbereitung ohne Entscheidung: der Schnappschuss liegt in **einem** getrennten Feld, damit eine spätere rechtliche Vorgabe (z. B. nur Konto-ID, Hash statt Klartext) die Kette nicht bricht [**FRAGE-PLAN**: Hash der Kette über den Klartext oder über eine Referenz?].
- **Freitext:** Die Begründung kann (selten) Personenbezug enthalten; Eingabe ist begrenzt (200 Zeichen), Hinweistext im Formular, Ausgabe nur als Text (kein HTML). Die Captains sehen sie **nicht** im Klartext (Vorschlag, **P2**).
- **Eingriffsprotokoll bleibt getrennt:** M2 schreibt für Betreiber-Entscheidungen **nicht** zusätzlich nach `recordIntervention` (das ist Admin-Sache, nur IDs).
- **Fehlerverhalten:** Scheitert der Beweiseintrag, scheitert die Entscheidung (Rollback), mit klarer Meldung „Bitte erneut versuchen“; kein stilles Verlieren des Beweises.
- **Security-Review Pflicht** (Rechte, Beweis, Datenschutz, Sperren).

## 9. Risiken und Randfälle
1. **Verspätete Zusage** (Lücke 1): behoben durch die Uhrprüfung im Server; ohne sie wäre die Zusage nach Fristablauf möglich. Test erzwingt es.
2. **Zwei Zugangsinhaber entscheiden gleichzeitig** (geteilter Zugang): Zeilensperre, genau ein Gewinner, der zweite sieht „schon beantwortet“.
3. **Zusage zeitlich weit vor der Buchung:** Die Zusage kann Tage vor Anstoß liegen; ob die Halle sie später zurücknehmen darf, ist offen (**P7**).
4. **Beweiskette als Engstelle:** Alle Hallenanfragen serialisieren an der Kette; bei Anlauf vieler Anfragen gleichzeitig (Matchmaking) verlängert sich die Transaktion. Messen in M2c.
5. **Uhr:** Fristen laufen auf Server-Zeit; Sommer-/Winterzeit betrifft Anzeige, nicht die Logik (alles `timestamptz`).
6. **Entzug und Löschung:** Konto-Löschung eines entscheidenden Betreibers lässt die bereits protokollierten Einträge stehen (siehe R-M2-1).
7. **Doppelzählung:** Antwort im Minutenjob und durch den Betreiber im selben Augenblick: Spiel-Sperre serialisiert beides.

## 10. Fragen (nur Fragen, keine Entscheidungen)
**FRAGE-PRODUKT**
- **P1** Soll die Zusage („Halle ist frei“) einen **optionalen** Kommentar zulassen (z. B. „Platz 2“), oder gar keinen? [ANNAHME: kein Kommentar bei Zusage]
- **P2** Ablehnung: Begründung als **Auswahlliste** (z. B. belegt, geschlossen/Wartung, Veranstaltung, sonstiges + Text) oder reiner Freitext? Sehen die **Captains** den Grund (Kategorie oder Klartext) oder nur „Halle abgelehnt“? [ANNAHME: Liste + optionaler Text, Captains sehen nur die Kategorie]
- **P3** Soll ein Antwortversuch **nach** der Frist („zu spät“) im Beweisprotokoll als eigener Eintrag stehen? [ANNAHME: ja]
- **P4** **Karenz** nach Fristende (z. B. 5 Minuten für späte Antworten) oder harte Grenze? [ANNAHME: harte Grenze]
- **P5** Soll der **Entzug des Zugangs** mitten in der Frist (Anfragen werden `unmanaged`) im Beweisprotokoll als Ereignis stehen? [ANNAHME: ja]
- **P6** Reicht in M2 der heutige Ablauf nach „abgelehnt“ (andere freie Hallen kommen ins Veto, sonst neuer Termin), und die Wahl „andere Halle oder anderer Termin“ liefert M4 insgesamt?
- **P7** Darf die Halle eine einmal gegebene Zusage **zurücknehmen**, solange noch nicht gebucht wurde? [Vertrag schweigt; ohne Entscheid: nein]
- **P8** Soll die Oberfläche dem Betreiber nach der Antwort die **eigene Entscheidung** (Zeit, Konto, Grund) anzeigen und ein Zurückholen der Antwort verbieten? [ANNAHME: Anzeige ja, Zurückholen nein]

**FRAGE-PLAN (Reviewer)**
- **PL1** M2a/M2b vor 009 M3 bauen und M2c nachziehen, oder alles erst nach 009 M3 als Einheit? (Abschnitt 6)
- **PL2** `decision_kind` als eigene Spalte oder Status-Erweiterung (`declined` aufteilen)? [Empfehlung: eigene Spalte, der Bestandscode liest `status` weiter]
- **PL3** Hash der Beweiskette über Klartext oder Referenz auf den Namens-Schnappschuss (abhängig von R-M2-1)?
- **PL4** `appendHallEvidence` im Aufrufer-`tx` (hier vorgeschlagen) oder über eine Outbox? [Empfehlung: im `tx`]

**FRAGE-RECHT** (beantwortet kein Agent)
- **R-M2-1** Name und E-Mail des entscheidenden Google-Kontos im dauerhaften Beweisprotokoll: Zweck, Rechtsgrundlage, Aufbewahrungsdauer, Auskunft und Löschung (Zusammenhang R1 in 011 M1 und Partnervertrag).
- **R-M2-2** Beweiswert der Server-Zeit; qualifizierter Zeitstempel später.
- **R-M2-3** Gilt „keine Antwort = abgelehnt“ gegenüber der Halle verbindlich, und muss der Partnervertrag es regeln? (FEHLT-NOCH Partnervertrag)
