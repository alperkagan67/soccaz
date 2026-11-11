# 009 – Admin-Bereich, Einnahmemodell und Buchhaltung
Status: Freigegeben (2026-11-11)
Version: 1
v-Entwurf (wartet auf 012): Provision inklusive Zahlungsabwicklung, Stripe-Gebühren im Admin, Erstattung auf die Karte; gilt erst mit G1 von Vertrag 012; Versionsnummer bleibt 1.

## Ziel
Soccaz ist Vermittler. Spieler zahlen per Karte (Stripe, Vertrag 012) den Hallenpreis geteilt durch die Spielerzahl (aufgerundet), ohne Gebühr für Spieler. Soccaz verdient über eine Provision der Halle (Prozent pro Buchung und/oder 10er-Bonus), die nur Admin 1 pro Halle einstellt. Die Provision ist "Provision inklusive Zahlungsabwicklung": Soccaz trägt die Stripe-Gebühren aus der Provision. Der Admin-Bereich zeigt je Halle und je Spiel Provision, Stripe-Gebühren und Rest und warnt bei einer Halle im Minus. Der Admin-Bereich bekommt zwei Rollen (Admin 1 Betreiber, Admin 2 Mitarbeiter), ein unveränderbares Beweisprotokoll für Hallenanfragen, ein Eingriffsprotokoll und eine Buchhaltung (doppelte Buchung, lückenlose Rechnungsnummern, Kalendermodus, DATEV-Export, KI-geprüfte Belege, Sicherung), die nur Admin 1 sieht.

## Nutzer und Rollen
- Admin 1 (Seitenbetreiber, Rolle `owner`, genau einer): alles; ernennt/entfernt Admin 2; Buchhaltung, Belege, Provisionen, Einstellungen, Absage und Erstattung.
- Admin 2 (Rolle `admin`, Mitarbeiter): Spiele, Lobbys, Turniere, Nutzer/Support (inkl. Sperren), Moderation, Buchungen. Schlägt Absagen mit Begründung vor. Keine Buchhaltung, Provisionen, Einstellungen, Rollenverwaltung.
- Hallen-Betreiber, Spieler, Gast: nicht betroffen (Hallen-Dashboard: Vertrag 011).
- Anmeldung für alle per Google; Admins sehen im Header einen Link zum Admin-Bereich; Rollen werden serverseitig geprüft. Der Dev-Login bleibt außerhalb der Produktion.

## Entscheidungen (vom Nutzer, 2026-11-10)
- Einnahme: Provision der Halle, pro Halle Prozent pro Buchung (auf die Hallenmiete) und/oder 10er-Bonus; nur Admin 1 stellt sie ein. Die Provision schließt die Zahlungsabwicklung ein (Stripe-Gebühren trägt Soccaz, Vertrag 012); 10 % Startwert pro Halle, keine feste Untergrenze (Nutzerentscheid, Vertrag 012); der Admin warnt statt zu begrenzen. Jede Halle hat einen festen Preis; der 10er-Bonus ist dieser Preis. Die Provision pro Halle ersetzt die globale Turnier-Provision (Einstellung bleibt nur Vorgabe für neue Hallen).
- 10er-Bonus (Provision der Halle an Soccaz, kein Vorteil für Spieler): zählt jedes abgebuchte, gebuchte, nicht abgesagte Soccaz-Spiel in dieser Halle (egal welche Teams; Turnier: jeder gebuchte Hallenslot), rollierend nach je 10.
- Rechnungen nur über die Provision, an die Halle: monatliche Sammelrechnung pro Halle, jedes Spiel eigene Zeile, 10er-Bonus eigene Zeile, lückenlose fortlaufende Nummern. Hallenmiete ist durchlaufendes Geld.
- Umsatzsteuer: Schalter von Admin 1: 19 % oder Kleinunternehmer ohne USt.
- Beweisprotokoll: Jede Buchungsanfrage an eine Halle mit Zeitstempel (Server), Platz frei ja/nein, Zusage oder Ablehnung mit Begründung; nur Anhängen (Datenbank-Trigger wie Hauptbuch) plus Hash-Kette; PDF-Export.
- Absage und Erstattung: nur Admin 1. Admin 2 schlägt mit Begründung vor, Admin 1 bestätigt. Erstattung geht per Stripe-Refund auf die Karte (Vertrag 012).
- Eingriffsprotokoll: Jeder Admin-Eingriff (wer, wann, was, warum) wird protokolliert.
- Buchhaltung: Kontenrahmen SKR03 als Vorgabe, Zuordnung in den Einstellungen änderbar.
- KI-Beleg: Admin 1 hinterlegt API-Schlüssel für Claude und OpenAI (verschlüsselt, nur serverseitig) und wählt den bevorzugten Anbieter. Doppelprüfung immer an (beide lesen jeden Beleg, Übereinstimmung = grünes Häkchen, Abweichung = markiertes Feld). Warnung bei nur einem Schlüssel; fällt ein Anbieter aus, springt der andere ein, Beleg als "nur einfach geprüft". KI erkennt Einnahme/Ausgabe und Kategorie. Optionaler Kommentar beim Upload wird mitgelesen und mit dem Beleg gespeichert. Admin 1 bestätigt jeden Eintrag; erst dann wird gebucht und ein PDF erzeugt; Originalfoto unveränderbar mit Hash.
- Sicherung: externes verschlüsseltes Ziel, Aufbewahrung 10 Jahre (Pflicht vor Go-live, GO-LIVE-AUDIT).
- DSGVO: Export/Löschung auf Anfrage; Aufbewahrungspflicht für Buchungsdaten beachten (Anonymisierung bleibt).
- Später/Idee: sichtbare Servicegebühr nur für Extras (Firmenpaket); kein Treueprogramm, keine Rabatte, keine Promo-Codes, keine bezahlten Platzierungen.

## Annahmen (Orchestrator-Vorschlag)
- Rollenmigration: bestehende `moderator`, `finance`, `booking` werden zu `admin` bzw. `player` nach Absprache mit Admin 1; kein Nutzer behält stillschweigend mehr Rechte.
- Provision wird beim Buchen (Frist/Sofortbuchung aus 008, nach der Abbuchung) als Hauptbuch-Buchung "Provision" festgehalten und in der Monatsrechnung ausgewiesen; Erstattung/Absage storniert sie per Gegenbuchung. Stripe-Gebühren je Abbuchung werden als eigene Hauptbuch-Buchung (Aufwand) erfasst; bei Erstattung bleibt die Stripe-Gebühr bei Soccaz (Annahme aus 012, mit Stripe prüfen).
- Rechnungsnummer aus Zähler-Tabelle mit Zeilensperre (lückenlos auch bei Abbruch), getrennt von Beleg-Nummern `SOC-JJJJ`.
- Kalendermodus: Tagesmarkierung und Zeiträume täglich/wöchentlich/monatlich/jährlich, Auswertung und Rechnung als PDF, DATEV-Export als CSV (Buchungsstapel).
- Schlüssel liegen verschlüsselt in der Datenbank (Schlüssel der App aus der Umgebung), nie im Client.
- Zwei-Faktor für Admin 1 liegt beim Google-Konto (kein Soccaz-Zwang), im GO-LIVE-AUDIT (Prüfpunkt E7).

## Nicht-Ziele
- Zugang für Hallenbetreiber (Vertrag 011), Spieler-Funktionen (010).
- Echte Auszahlung/Provisionsabzug über Stripe Connect (Vertrag 012, GO-LIVE-AUDIT).
- Servicegebühr, Treueprogramm, Rabatte, Promo-Codes, bezahlte Platzierungen.
- Steuerliche Letztprüfung (Steuerberater), Partnervertrag (Anwalt).

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Nutzer mit Rolle admin (Admin 2) | Ruft Finanzen, Provisionen, Einstellungen, Rollen oder Buchhaltung auf (Seite und Server-Aktion) | Abgelehnt (403) | tests/integration/admin-rollen.test.ts |
| AC-2 | Admin 1 | Ernennt/entfernt Admin 2; Admin 2 versucht es | Admin 1 erfolgreich, protokolliert; Admin 2 abgelehnt; es gibt nie zwei `owner` | tests/integration/admin-rollen.test.ts |
| AC-3 | Halle mit Provision p % und 10er-Bonus | Spiel wird gebucht | Hauptbuch: Provision = p % der Hallenmiete; ausgeglichen; Erstattung storniert per Gegenbuchung | tests/integration/provision.test.ts |
| AC-4 | 10 gebuchte Spiele in einer Halle (verschiedene Teams) | 10. Spiel gebucht | Zähler 10, Anzeige "10er-Bonus fällig", Bonus = fester Hallenpreis, Zähler läuft rollierend weiter; abgesagte zählen nicht | tests/integration/provision.test.ts |
| AC-5 | Nur Admin 1 | Stellt Provision/Bonus einer Halle ein | Gespeichert und protokolliert; Admin 2 abgelehnt | tests/integration/provision.test.ts |
| AC-6 | Monatsende | Sammelrechnung erzeugt | Pro Halle ein PDF, jedes Spiel eine Zeile, Bonus eine Zeile, USt 19 % oder 0 % je Schalter, Nummern lückenlos und fortlaufend (auch bei parallelem Erzeugen); PDF automatisch per Mail an die Halle, Versand protokolliert, bei Fehler Wiederholung | tests/integration/rechnungen.test.ts |
| AC-7 | Buchungsanfrage an Halle | Anfrage, Antwort | Eintrag mit Server-Zeitstempel, frei/belegt, Zusage/Ablehnung + Begründung; UPDATE/DELETE per Datenbank abgelehnt; Hash-Kette prüfbar; PDF-Export | tests/integration/beweisprotokoll.test.ts |
| AC-8 | Admin-Eingriff (Sperren, Lobby schließen, Absage, Halle) | Ausgeführt | Eintrag wer/wann/was/warum, Begründung Pflicht | tests/integration/audit.test.ts |
| AC-9 | Admin 2 | Schlägt Absage vor | Vorschlag mit Begründung gespeichert, keine Erstattung; Admin 1 bestätigt → Absage + Erstattung per Stripe-Refund auf die Karte; Admin 2 kann nicht selbst absagen | tests/integration/admin-absage.test.ts |
| AC-10 | Jede Geldbewegung | Abbuchung, Stripe-Gebühr, Auszahlung an Halle, Provision, Erstattung (Refund), Bonus | Doppelt gebucht (ledger_entries), nachträglich nicht änderbar, Korrektur nur per Gegenbuchung | tests/integration/ledger.test.ts |
| AC-11 | Admin 1, Kalender | Markiert Tage/Zeitraum, wählt täglich/wöchentlich/monatlich/jährlich | Auswertung und Rechnung als PDF; CSV-Export (DATEV-Buchungsstapel) mit Pflichtfeldern | tests/integration/export.test.ts |
| AC-12 | Beleg-Foto + optionaler Kommentar | Upload durch Admin 1 | Beide Anbieter lesen Datum, Betrag, Aussteller, Einnahme/Ausgabe, Kategorie; Übereinstimmung grün, Abweichung markiert; Original unveränderbar mit Hash; Kommentar gespeichert; erst nach Bestätigung gebucht + PDF | tests/integration/beleg-ki.test.ts (Anbieter gemockt) |
| AC-13 | Nur ein Schlüssel hinterlegt / ein Anbieter fällt aus | Beleg wird gelesen | Warnung in den Einstellungen; der andere springt ein, Beleg "nur einfach geprüft"; ohne Schlüssel kein KI-Lesen, manuelle Eingabe möglich | tests/integration/beleg-ki.test.ts |
| AC-14 | API-Schlüssel gespeichert | Seite, API-Antworten, Logs, Backup-Export | Schlüssel erscheinen nie im Klartext (nur "gesetzt/zuletzt geändert") | tests/integration/beleg-ki.test.ts |
| AC-15 | Übersicht Admin | Aufruf | Kennzahlen: Provisionsumsatz, Anzahl Buchungen, Auslastung pro Halle; pro Halle Spiele mit Datum/Preis und Zähler; je Halle und je Spiel Provision, Stripe-Gebühren und Rest; Warnung, wenn die Provision die echten Stripe-Gebühren (Karte, 0,25 € je Spieler, Auszahlung) nicht deckt oder eine Halle im Minus ist | tests/e2e/admin.spec.ts |
| AC-16 | Spieler mit Konto | DSGVO-Export/Löschung | Export vollständig; Löschung anonymisiert, Buchungsdaten bleiben ohne Personenbezug | tests/integration/account.test.ts |
| AC-17 | Sicherung | Täglicher Lauf | Verschlüsseltes externes Ziel, Restore-Test dokumentiert | docs/BETRIEB.md, scripts/restore-test.sh |

## Meilensteine (seriell, Schema-Änderungen nie parallel)
- M1: Rollen (owner/admin), Rechteprüfung, Eingriffsprotokoll, Absagevorschlag (AC-1, 2, 8, 9)
- M2: Provision pro Halle, 10er-Zähler, Rechnungen, USt-Schalter, Anzeige Provision/Stripe-Gebühren/Rest und Minus-Warnung (AC-3 bis 6, 10, 15); die Stripe-Gebühren-Anzeige hängt an 012 M2 (Abbuchung)
- M3: Beweisprotokoll mit PDF (AC-7)
- M4: Kalender, Auswertungen, DATEV-CSV (AC-11)
- M5: KI-Belege mit Doppelprüfung (AC-12 bis 14)
- M6: DSGVO-Prüfung, Sicherung (AC-16, 17)

## Betroffene Bereiche
`src/db/schema*.ts` (Rollen, Provision, Zähler, Beweisprotokoll, Rechnungen, Belege, Einstellungen/Schlüssel), `src/lib/roles.ts`, `src/server/session.ts`, `src/server/admin*.ts`, `src/server/ledger.ts`, `src/server/receipts.ts`, `src/server/veto.ts`, `src/server/booking.ts`, `src/app/admin/*`, `src/app/api` (PDF, Export), Header-Link, `scripts/backup-loop.sh`, `docs/BETRIEB.md`. Migrationen additiv, jeweils GO-LIVE-AUDIT.

## Risiken und Randfälle
- Rollenmigration: niemand verliert/behält unbeabsichtigt Rechte; genau ein `owner`.
- Rechnungsnummern lückenlos: Postgres-Sequenzen sind es nicht; Zähler-Tabelle mit Sperre.
- Provision bei Absage/Erstattung/Abbuchung korrekt stornieren; Rundung auf Cent. Stripe-Gebühr bei Erstattung bleibt hängen (Halle im Minus möglich, Warnung).
- KI-Fehler: nie ungeprüft buchen; Prompt-Injection in Belegtext darf nichts auslösen; Kosten begrenzen (Größen-/Anzahllimit).
- Datenschutz: Beleginhalte gehen an zwei Fremdanbieter (Auftragsverarbeitungsverträge in GO-LIVE-AUDIT).
- Beweisprotokoll rechtlich: Server-Zeit; qualifizierter Zeitstempel später (Anwalt).
- Aufbewahrung vs. Löschung: Buchungsdaten bleiben anonymisiert.
- Schlüssel im Backup: verschlüsselt und nicht mit dem App-Schlüssel zusammen sichern.

## Datenschutz / Sicherheit
Security-Review Pflicht (Auth, Rollen, Zahlungen, Schlüssel). Keine Schlüssel/Belege im Log. Zugriff auf Belegfotos nur Admin 1.

## Offene Fragen
- Backup-Ziel (externer Anbieter): wird vor dem Go-live entschieden (Pflichtpunkt in GO-LIVE-AUDIT); M6 baut die Anbindung konfigurierbar.

## Weitere Entscheidungen (Nutzer, 2026-11-10)
- 10 % ist nur der Startwert für neue Hallen; Admin 1 trägt pro Halle den vereinbarten Wert ein.
- Rechnungen: PDF im Admin und automatisch per Mail an die Halle (Mailadresse der Halle im Hallen-Datensatz, Versand protokolliert, Wiederholung bei Fehler).

## End-to-End-Nachweis
`tests/e2e/admin.spec.ts`: Admin 1 stellt Provision ein, ein Spiel wird gebucht, Provision im Hauptbuch, Monatsrechnung als PDF mit lückenloser Nummer, Admin 2 sieht Finanzen nicht und schlägt eine Absage vor, Admin 1 bestätigt, Eingriffe im Protokoll.
