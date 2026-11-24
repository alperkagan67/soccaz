# Plan 011 M3: Buchungen, Auszahlungen, Rechnungen für Hallenbetreiber (AC-5), Abgrenzung zu M4

Stand: 2026-11-24 (Code `origin/main` nach #350, höchste Migration **0059**) · Verfasser: worker-2 · Auftrag: t2q (über t2s), PLAN, **kein Bau vor Plan-OK** · Quelle: `docs/contracts/011-hallen-dashboard.md` (Version 3, AC-5, Meilensteine M3 und M4), `docs/design/011-m2-plan.md`, `src/server/invoices.ts`, `src/server/commission.ts`, `src/app/api/rechnungen/[id]/route.ts`.

## 1. Ziel und Umfang M3 (nur AC-5)

Ein Betreiber mit aktivem Hallenzugang sieht in seinem Bereich (`/halle`) **nur die eigene Halle**: (1) **Buchungen**: Spiele und Turniere an seiner Halle mit Termin, Team- und Turniername, Spielerzahl, Status, Zusage-Stand, Hallenmiete laut Regel; **keine Spielernamen, keine Kontaktdaten**. (2) **Auszahlungen**: reine **Anzeige** aus dem Hauptbuch (Vertrag: „nur Anzeige, reale Auszahlung erst mit Stripe Connect“): je Spiel der Durchlaufbetrag (Konto `venue_payable`) abzüglich der Provision (`match_commissions`), Summe je Monat, Status „vorgemerkt“. (3) **Provisionsrechnungen von Soccaz**: Liste der eigenen Rechnungen (`invoices`, Monatsrechnung aus 009 M2) und **PDF-Abruf der eigenen Rechnung** (heute nur Admin 1: Route `/api/rechnungen/[id]`, Kommentar „Hallen-Abruf erst mit 011“).

**Nicht in M3:** Bestätigen und Ablehnen (M2, gebaut), Frist/Benachrichtigung/Kalender (M4), Bewertungsantworten (M5), reale Auszahlung (Stripe Connect, Nutzerliste Nr. 1), Änderungen am Hauptbuch oder an Rechnungen.

## 2. Abgrenzung zu M4 (Ist-Stand, gegenzulesen vor Baustart)

| M4-Teil (AC) | Stand laut Code und Plan 011 M2 | M3 berührt es? |
|---|---|---|
| Frist 12 h, „keine Antwort = abgelehnt“, Beweis „nicht reagiert“ (AC-9, 10, 14, 15) | Mechanik seit M2/M2b gebaut (Fristanzeige und „abgelaufen“ in `/halle`, `evidence_late_attempt`); Testabdeckung je AC im Plan-Review gegen `tests/integration/hallen-dashboard.test.ts` abhaken | nein |
| Zusage als Buchungsbedingung, Sofortbuchung (AC-13), Mindestvorlauf Privatspiel (AC-16) | im Karten- und Turnierpfad gebaut (Zusage-Prüfung vor der Abbuchung, `hallZusageOk`) | M3 zeigt nur den **Zusage-Stand** je Buchung (lesend) |
| Benachrichtigung bei neuen Anfragen per Push und Mail (AC-11) | In-App ja; **Mail offen**, hängt an Backlog 211 (Mail-Anbindung, Entscheid t2q) | nein |
| **Kalender mit Sperrzeiten** (AC-12) | **nicht gebaut** (Tabelle, Oberfläche, serverseitige Ablehnung gesperrter Zeiten; Migration nötig) | nein, bleibt M4 |

Folge: **M4 ist nach M3 nur noch AC-11 (Mail) und AC-12 (Kalender)**; beides braucht Produktentscheide und (AC-12) eine Migration. M3 ist davon unabhängig und kann zuerst laufen.

## 3. PR-Schnitt (4 PRs, Obergrenze 5) und Migrationen

**Migrationen: keine geplant.** Alle Daten liegen vor (`matches.venue_id`, `match_commissions` mit Index `match_commissions_venue_idx (venue_id, booked_at)`, `invoices`, `invoice_lines`, Hauptbuch). Sollte der Bau einen Index brauchen (zum Beispiel für die Buchungsliste je Halle und Monat), wäre das **eine** additive Migration mit der **nächsten freien Nummer (heute 0060)**; **0059 ist vergeben** (Turnier-Ablehnen). Hinweis an A2: der A2-Entwurf nahm 0059 bis 0061 an, die Nummern verschieben sich auf die dann freien; M3 und A2 laufen **nie parallel** (Regel: Migrations-PRs seriell).

| PR | Inhalt | Rechte-/Beweis-/Zahlungs-Nähe |
|---|---|---|
| **1** | Server-Modul `src/server/venue-reporting.ts`: `listVenueBookings`, `listVenuePayouts`, `listVenueInvoices` je (Betreiber, Halle), Zugriff nur über die eine Quelle `venue-access-rules.ts` (aktiver Zugang, nicht gesperrt, kein Admin); Auswahl nur Aggregate und Teamnamen, keine Nutzerfelder; Integrationstest AC-5 (Mandantentrennung, keine Namen, Summen gegen das Hauptbuch) | lesend, Mandantentrennung: **security-reviewer Pflicht** |
| **2** | `/api/rechnungen/[id]`: zusätzlich **Betreiber der Halle der Rechnung** (`canViewInvoice(user, invoice)`); fremde und unbekannte Rechnung: gleiche Antwort wie heute (404); PDF-Inhalt unverändert; Test je Rolle (Admin 1, Admin 2, Betreiber eigene und fremde Halle, Spieler, Gast) | Auth-nah, Finanzdaten: **security-reviewer, zwei grüne Läufe auf verschiedenen SHAs** |
| **3** | Oberfläche in `/halle`: drei Abschnitte (Buchungen, Auszahlungen als „Durchlaufgeld, vorgemerkt“, Rechnungen mit PDF-Link), Zustände leer/Fehler, 44-px-Ziele, AC-30; Test-IDs; E2E-Zellen | UI: **Impeccable-Pflicht** (Lauf mit `detect`, Gast und Betreiber, 390 und 1280 px) |
| **4** | `tests/e2e/hallen-dashboard.spec.ts` um AC-5 (nur CI), `docs/BETRIEB.md` (Betreiber-Bereich, Hauptbuch-Abgleich), GO-LIVE-AUDIT-Zeile, Backlog | Doku/Test |

## 4. Abhängigkeiten

- **A2 / Hoster-Spike: keine.** M3 liest, ruft keine Beweis-Funktionen auf und ändert keinen Guard; nur die Migrationsnummer (oben).
- **013 M6 (Hallen-Bereich, Look):** `/halle` ist laut GO-LIVE-AUDIT G27-011 „degradiert (013 M6)“. M3 liefert **funktionale** Abschnitte im vorhandenen Aufbau; der Look kommt mit 013 M6. Wegen der Sperre der 013-Seiten M4 bis M7 bis zum Pilot-Feedback (AC-8) ist das **Produktfrage Q1**.
- **009 M2 (Rechnungen):** vorhanden; die **Rechnungsvorlage** und die Umsatzsteuer-Einordnung hängen am Steuerberater (Nutzerliste Nr. 4): der Betreiber-Abruf ändert die Vorlage nicht, macht sie aber für Dritte sichtbar (**Produktfrage Q4**).
- **Stripe Connect:** reale Auszahlung später; M3 nennt den Betrag „vorgemerkt“, nicht „ausgezahlt“ (**Q2**).

## 5. Testplan

1. **Integration (`hallen-dashboard.test.ts`, AC-5):** Seed mit erkennbaren Spielernamen und E-Mails; Betreiber A sieht Buchungen, Durchlaufbeträge und Rechnungen **nur der Halle A** (je Liste, auch bei manipulierter Halle-ID); die serialisierte Antwort enthält **keinen** Spielernamen, keine E-Mail, keine Nutzerkennung; Entzug des Zugangs und Sperre wirken **sofort** (ohne neue Anmeldung); Admin 2, Spieler, Gast: kein Zugriff; Summen: Durchlaufbetrag je Spiel = Hauptbuch (`venue_payable` minus Provision), Monatssumme = Summe der Zeilen; Hallen ohne Zugang („unmanaged“) liefern nichts.
2. **Rechnungs-PDF:** je Rolle (siehe PR 2), fremde Rechnung = unbekannte Rechnung (gleicher Status und Text, kein Zeitunterschied als Orakel), PDF-Kopf trägt nur die eigene Halle.
3. **Mutationen:** Zugriffsprüfung auf die Halle entfernt, Spielername in die Antwort, Rechnung einer fremden Halle, Zugang nicht geprüft, Hauptbuch-Summe falsch gerundet: je ein Test rot.
4. **Unit/Quelltext:** eine Zugriffsquelle (`venue-access-rules.ts`), keine Auswahl von `users.name` oder `users.email` in `venue-reporting.ts` (Pin); Gast-Sicht-Registry (`tests/e2e/gast-sicht-routen.ts`) um die neuen Routen/Seiten ergänzt (angemeldet).
5. **E2E (nur CI):** Betreiber öffnet Buchungen, Durchlaufgeld und Rechnung, lädt das PDF; fremde Rechnung 404.

## 6. Risiken

- **Mandantenbruch (IDOR)** über Halle-ID und Rechnungs-ID: einzige Quelle für „darf diese Halle sehen“, jede Abfrage filtert serverseitig; Antworten für fremd und unbekannt gleich.
- **Personenbezug:** Betreiber sehen keine Spielernamen (Vertrag); Teamnamen sind Nicht-Personen (gleiche Linie wie Gast-Sicht-Gesamtprüfung); Turniere: Veranstalter nur „Vorname I.“ oder gar nicht (Q3).
- **Missverständnis „Auszahlung“:** Anzeige ist kein Zahlungsversprechen; Wortwahl mit dem Anwalt abstimmen (Nutzerliste Nr. 2/4).
- **Rechnungsdaten** sind Finanzdaten (Steuerberater-Freigabe der Vorlage).

## 7. Produktfragen an t2q

1. **UI jetzt oder nach Pilot-Feedback?** Funktionale Abschnitte in `/halle` vor 013 M6 (kleiner Look-Preis, Betreiber sehen die Daten früh) oder M3 erst mit 013 M6 und nach dem Pilot? Empfehlung: **PR 1 und 2 (Server, Rechte, PDF) jetzt, PR 3 (Oberfläche) mit 013 M6**.
2. **Begriff „Auszahlungen“:** bis Stripe Connect „Durchlaufgeld (vorgemerkt)“ nennen? Anwalt-Freigabe der Wortwahl nötig?
3. **Turniere in der Buchungsliste:** Veranstalter-Name für die Halle sichtbar („Vorname I.“) oder nur Turniername und Teamzahl?
4. **Rechnungsabruf durch Betreiber erst nach Steuerberater-Freigabe der Rechnungsvorlage** (Nutzerliste Nr. 4) oder schon vorher (Testmodus/Pilot)?
5. **Zeitraum und Aufbewahrung:** Standardfilter (aktueller und Vormonat), Archiv unbegrenzt?
6. **Reihenfolge:** M3 vor M4 (Mail, Kalender) und vor 010/M5 wie im Vertrag; Kalender (AC-12) bleibt M4 mit eigener Migration.

## 8. Aufwand

PR 1 etwa 1 Tag, PR 2 etwa 0,5 Tag (+ zwei Läufe), PR 3 etwa 1 Tag (+ Impeccable), PR 4 etwa 0,5 Tag: **3 bis 4 Tage**, ohne Migration. Kein Bau vor Plan-OK; 013-Seiten M4 bis M7 bleiben bis zum Pilot-Feedback gesperrt (AC-8). **Plan-OK erteilt, Entscheide t2q siehe Abschnitt 9.**

## 9. Entscheide t2q (2026-11-24, Plan-OK) und was sie ändern

1. **Reihenfolge:** PR 1 (Server, Rechte, Buchungen und Durchlaufgeld) und PR 2 (Rechnungen) zuerst, die **Oberfläche (PR 3) mit 013 M6 nach dem Pilot**. Bis dahin gibt es keinen Betreiber-Bildschirm; PR 1 ist die getestete Datenschicht.
2. **Begriff:** bis Stripe Connect heißt die Ansicht **„Durchlaufgeld (vorgemerkt)“**, nicht „Auszahlungen“. Wortlaut ist **ENTWURF**, die Anwalt-Freigabe steht in der Nutzerliste (Nr. 2).
3. **Turniere in der Buchungsliste:** nur **Turniername, Teamzahl, Termin**, **kein Veranstaltername** (Betreiber namenfrei, Backlog 216, AC-17). Heißt für PR 1: die Abfrage wählt weder `tournaments.organizer_id` noch einen Namen des Veranstalters; Pin im Quelltext-Test.
4. **Rechnungsabruf durch den Betreiber erst nach der Steuerberater-Freigabe der Vorlage, nicht im Pilot.** Das trifft **PR 2** (Liste und PDF der eigenen Rechnungen) und, weil auch die Liste Beträge und Nummern zeigt, **`listVenueInvoices` aus PR 1** (Vorschlag unten).
5. **Standardansicht:** aktueller Monat und Vormonat, **Archiv per Monatsauswahl** (Parameter `monat=JJJJ-MM`, serverseitig auf gültige Monate begrenzt); die **Aufbewahrungsdauer** legt der Steuerberater fest (Nutzerliste Nr. 4), bis dahin wird nichts gelöscht.
6. **Migration:** keine geplant. Falls doch nötig, **nach 0060 (010 M1) und 0061 (009 M4)**, also frühestens 0062, und **nie parallel zu einer anderen Schema-Aufgabe** (eine Schema-Aufgabe zur Zeit; auch nicht parallel zu A2).

### Vorschlag zu (4): wie PR 2 hinter die Freigabe kommt

| Weg | Was | Für | Gegen |
|---|---|---|---|
| **A (Empfehlung): zurückstellen** | PR 2 und `listVenueInvoices` werden **nicht gebaut**, bis der Steuerberater die Vorlage freigegeben hat (Backlog-Zeile mit Auslöser „Nutzerliste Nr. 4 erledigt“). PR 1 enthält Buchungen und Durchlaufgeld, **keine** Rechnungen. | kein Code im Auth-Pfad, der im Pilot nicht benutzt wird; keine Angriffsfläche und kein toter Zweig; kleiner PR 1 | der Bau (etwa 1,5 Tage) kommt nach der Freigabe |
| B: Feature-Schalter, fail-closed | Einstellung `venue_invoices_enabled` (Standard **aus**), gelesen von Liste **und** Route; aus = Betreiber bekommen **dieselbe 404-Antwort wie bei einer unbekannten Rechnung** (kein Orakel); nur Admin 1 schaltet (Einstellungsseite, Protokoll); Admin-1-Abruf unverändert. | Code ist fertig und getestet, Freigabe = ein Schalter | Auth-naher Code geht ohne Nutzung in Produktion; Schalter-Fehlkonfiguration; zwei grüne Läufe und security schon jetzt; Test muss beide Zustände und die Mutation „Schalter ignoriert“ abdecken |

**Empfehlung A.** Begründung: Nach t2q (4) ist die Freigabe eine Voraussetzung, nicht ein Zeitpunkt, und der Pilot nutzt den Abruf nicht; der Schalter würde nur Auth-nahen Code ohne Nutzen früher ausliefern. Wählt t2q B, gilt: Standard aus, fail-closed (fehlende oder unlesbare Einstellung = aus), identische 404 in allen Aus-Zuständen, Test je Zustand und Mutation, Eintrag in der Nutzerliste „Schalter erst nach Freigabe einschalten“.

### Folgen für den Schnitt

- **PR 1 (jetzt, kein Schema):** `src/server/venue-reporting.ts` mit `listVenueBookings` und `listVenuePayouts` („Durchlaufgeld, vorgemerkt“), Zugriff nur über `venue-access-rules.ts`, Standardmonate und Monatsauswahl, Integrationstest AC-5 (Mandantentrennung, keine Namen, kein Veranstalter, Summen gegen das Hauptbuch), Mutationen, security-reviewer.
- **PR 2:** zurückgestellt (Weg A) oder hinter dem Schalter (Weg B), nach Entscheid t2q.
- **PR 3 (Oberfläche):** nach dem Pilot mit 013 M6. **PR 4:** Dokumentation und E2E, soweit es keine Oberfläche braucht; die AC-5-Zelle des E2E folgt mit PR 3.
