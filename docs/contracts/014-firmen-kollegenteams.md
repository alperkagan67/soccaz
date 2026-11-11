# 014 – Firmen und Kollegenteams (Betriebssport, Feierabend-Kick)
Status: Entwurf, wartet auf G1 (Geld/Recht) (2026-11-11)
Version: 1

## Ziel
Firmen und Kollegengruppen organisieren Hallenfußball ohne Handarbeit: Ein Firmenteam spielt Feierabend-Kicks, Abteilungen treten gegeneinander an, die Firma kann die Anteile ihrer Mitarbeiter zentral zahlen und bekommt eine echte Rechnung. Alles läuft automatisch über die vorhandenen Abläufe (Teamspiel, Privatspiel, Turnier, Karte hinterlegen nach Vertrag 012); es gibt keine Formulare zum Ausfüllen und Zurückschicken.

## Nutzer und Rollen
- Firmen-Admin: legt die Firma an, lädt Kollegen per Link ein, hinterlegt Rechnungsdaten und optional die Firmenkarte; sieht die Rechnungen.
- Mitglied: Kollege mit eigenem Soccaz-Konto, spielt in Firmenteams.
- Captain, Spieler, Veranstalter, Admin 1/2 wie bisher.

## Entscheidungen (vom Nutzer, 2026-11-11, über den Planer)
- Zwei Zahlungswege: A) jeder zahlt seinen Anteil selbst (wie bisher); B) die Firma zahlt zentral über „Anteil übernehmen“ mit der Firmenkarte (Vertrag 012).
- Kein Zuschuss der Firma und keine Rechnung mit Zahlungsziel: Es wird immer sofort per Karte bezahlt.
- Die Firma braucht eine echte Rechnung (Firmenname, Adresse, ausgewiesene Umsatzsteuer). Wer sie ausstellt (Soccaz oder Halle, wegen Stripe Connect), klärt der Steuerberater (Prüfpunkt im GO-LIVE-AUDIT, berührt Vertrag 009).
- Ideen: Betriebssport, Feierabend-Kick, Abteilungen gegeneinander, eventuell Firmenliga. Muss automatisch laufen, keine Handarbeit.
- Keine Rabatte, keine Promo-Codes, kein Treueprogramm. Backlog 15 (sichtbare Servicegebühr nur für Extras wie ein Firmenpaket) ist zu klären; in 014 gibt es dazu nichts.

## Annahmen (Orchestrator-Entscheidung, innerhalb der Rahmenwerte des Nutzers)
- Rechnungsdaten klein: Firmenname, Anschrift, Rechnungs-E-Mail, optional USt-IdNr. Größere Felder (Kostenstelle, Bestellnummer) später, falls Firmen sie verlangen; kein Freitext-Formularwesen.
- Datenmodell: `companies` (Name, Anschrift, Rechnungs-E-Mail, USt-IdNr optional, Zahlungsmittel-Referenz bei Stripe), `company_members` (Firma, Nutzer, Rolle `admin` oder `member`), `teams.company_id` (optional). Ein Nutzer kann Mitglied mehrerer Firmen sein.
- Beitritt: Einladungslink der Firma (wie Privatspiel-Link, widerrufbar); neues Konto per Google-Anmeldung.
- Zahlungsweg B: Der Firmen-Admin legt die Firmenkarte an (Stripe-Zahlungsmittel auf der Firma) und aktiviert „Firma zahlt für Mitglieder“. Beim Fixieren wird der Anteil jedes Mitglieds, das in einem Firmenspiel spielt und dessen Anteil die Firma übernimmt, von der Firmenkarte abgebucht (wie „Anteil übernehmen“, aber automatisch für alle Mitglieder des Firmenteams); Mitglieder ohne Aktivierung zahlen selbst (Weg A). Die Firma übernimmt nur Mitglieder, keine Fremden.
- Rechnung: Pro Monat und Firma eine Rechnung über alle von der Firma bezahlten Anteile (jedes Spiel eine Zeile), mit Umsatzsteuer, wenn der Steuerberater sie vorgibt (Schalter wie in 009), lückenloser Rechnungsnummer, PDF im Firmen-Bereich und per Mail. Wer rechtlich ausstellt, ist offen (Steuerberater); bis dahin Rechnung als „Zahlungsübersicht“ ohne Steuerausweis, Funktion nicht aktiv für den Echtbetrieb.
- Abteilungen gegeneinander: Teams einer Firma können sich im Teamspiel oder Turnier gegenüberstehen; Firmen-Turniere (ein Turnier, an dem nur Firmenteams teilnehmen) über die vorhandene Turnier-Logik mit einem Schalter „nur Firmen“.
- Firmenliga: Nicht-Ziel in 014, eigener späterer Vertrag, wenn der Bedarf belegt ist.

## Nicht-Ziele
- Zuschuss der Firma, Zahlungsziel, Rechnung auf Ziel, Sammelabrechnung mit Verzug.
- Rabatte, Promo, Treueprogramm.
- Firmenliga, Betriebssport-Verwaltung (Spielpläne außerhalb der Hallenbuchung).
- Steuerliche Letztentscheidung (Steuerberater) und Vertragswerk mit Firmen (Anwalt).

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Eingeloggter Nutzer | Legt eine Firma an (Name, Anschrift, Rechnungs-E-Mail) | Firma existiert, Nutzer ist Firmen-Admin; Pflichtfelder geprüft; USt-IdNr optional | tests/integration/company.test.ts |
| AC-2 | Firmen-Admin | Erzeugt, zieht zurück oder erneuert den Einladungslink | Kollege tritt per Link bei (auch neu registriert), alter Link ungültig; Nicht-Admin abgelehnt | tests/integration/company.test.ts |
| AC-3 | Firmen-Admin | Aktiviert „Firma zahlt für Mitglieder“ und hinterlegt eine Firmenkarte | Stripe-Zahlungsmittel auf der Firma, Mandatstext gespeichert; ohne Karte nicht aktivierbar | tests/integration/company-pay.test.ts |
| AC-4 | Firmenspiel, Fixieren, Firmenkarte aktiv | Fixier-Job läuft | Anteile der Firmen-Mitglieder werden genau einmal von der Firmenkarte abgebucht; Mitglieder mit eigener Zahlung zahlen selbst; Fremde nie | tests/integration/company-pay.test.ts |
| AC-5 | Abbuchung der Firmenkarte scheitert | Webhook | Nachzahlfenster wie 012; Firmen-Admin wird benachrichtigt; ohne Lösung fällt der Platz an Weg A (Mitglied zahlt selbst) oder Nachrücker | tests/integration/company-pay.test.ts |
| AC-6 | Monatsende | Rechnungslauf | Pro Firma ein PDF, jedes Spiel eine Zeile, lückenlose Nummer, Mail an die Rechnungs-E-Mail; ohne Steuerberater-Freigabe nur Zahlungsübersicht | tests/integration/company-invoice.test.ts |
| AC-7 | Zwei Teams derselben Firma (Abteilungen) | Gegeneinander im Teamspiel | Spiel läuft nach den Regeln aus 006/008/012; beide Teams als Firmenteam gekennzeichnet | tests/integration/company.test.ts |
| AC-8 | Turnier mit Schalter „nur Firmen“ | Team einer anderen Gruppe will beitreten | Abgelehnt; Firmenteams werden zugelassen | tests/integration/tournament.test.ts |
| AC-9 | Fremder Nutzer | Ruft Firmenbereich oder Rechnungen auf | Kein Zugriff (403/404); Firmen sehen nur eigene Daten | tests/integration/company.test.ts |
| AC-10 | DSGVO | Export/Löschung eines Mitglieds | Mitgliedschaft entfernt, Rechnungen der Firma bleiben (Aufbewahrung), Firmendaten ohne Personenbezug bleiben | tests/integration/account.test.ts |
| AC-11 | Gesamtablauf | Firma anlegen, 8 Kollegen per Link, Feierabend-Kick buchen, Firmenkarte zahlt, Rechnung | Alles ohne Handarbeit im Stripe-Testmodus | tests/e2e/firma.spec.ts |

## Meilensteine (seriell, Migrationen nacheinander)
- M1: Firma, Mitglieder, Einladungslink, Rechte (AC-1, 2, 9, 10)
- M2: Firmenkarte und Zahlungsweg B (AC-3, 4, 5)
- M3: Monatsrechnung (AC-6) – nach Vertrag 009 M2 und Steuerberater-Antwort für den Echtbetrieb
- M4: Firmenteams im Spiel/Turnier (AC-7, 8), E2E (AC-11)

## Betroffene Bereiche
`src/db/schema*.ts` (companies, company_members, teams.company_id; Migration additiv), `src/server/` (company, payments für Firmenkarte, scheduled für Rechnungslauf), `src/app/firma/*` (neue Seiten, nach Vertrag 013 gestaltet), Rechnungs-PDF (aus 009), Tests. Oberfläche erst nach der Grundlage aus 013 M2.

## Risiken und Randfälle
- Firma zahlt für Mitglieder, die zwischendurch ausscheiden: Zuordnung zum Fixierzeitpunkt.
- Steuerliche Einordnung (Vermittlerrolle, wer rechnet): offen, deshalb Zahlungsübersicht statt Rechnung, bis der Steuerberater antwortet.
- Missbrauch der Firmenkarte (fremde Spieler): nur Mitglieder.
- Firmenkarte läuft ab oder wird abgelehnt: Nachzahlfenster, Fallback Weg A.
- Datenschutz: Firmen sehen nur Spiele und Anteile ihrer Mitglieder, keine Namen Dritter.

## Datenschutz / Sicherheit
Security-Review Pflicht (Zahlung, Rechte, Mandanten). Rechnungsdaten sind Firmendaten, die USt-IdNr gilt als geschäftlich. Keine Karten- oder Rechnungsdaten im Repo.

## Offene Fragen
- Wer stellt die Rechnung aus (Soccaz oder Halle)? Steuerberater, Prüfpunkt im GO-LIVE-AUDIT (E4-Umfeld).
- Rechtsfragen zum Firmenvertrag (AGB für Firmen, Datenverarbeitung): Anwalt (E5).
- Servicegebühr für Firmenpakete (Backlog 15): separater Beschluss, nicht in 014.

## End-to-End-Nachweis
`tests/e2e/firma.spec.ts` im Stripe-Testmodus: Firma anlegen, Kollegen per Link, Feierabend-Kick, Firmenkarte zahlt alle Anteile, Zahlungsübersicht bzw. Rechnung für den Monat.
