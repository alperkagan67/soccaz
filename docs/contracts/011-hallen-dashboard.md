# 011 – Hallen-Dashboard
Status: Freigegeben (2026-11-11)
Version: 2 (Stand 2026-11-11: M4 mit AC-9 bis AC-15, AC-15 Wechsel von Halle oder Termin, AC-16 Mindestvorlauf 2 h bei Hallen mit Zugang, Antwortfrist = Vorlauf minus 1 h)

## Ziel
Hallenbetreiber melden sich per Google an und bekommen einen eigenen Bereich nur für ihre Halle(n): Sie bestätigen oder lehnen neue Buchungsanfragen ab (Ablehnung mit Pflicht-Begründung), sehen ihre Buchungen, Auszahlungen und die Provisionsrechnungen von Soccaz und antworten auf Bewertungen. Jede Entscheidung landet automatisch im Beweisprotokoll aus 009. Admin 1 ordnet Betreiber ihren Hallen zu.

## Nutzer und Rollen
- Hallenbetreiber: heute über `venues.managerUserId` (eine Person je Halle) und die Seite `/halle`. Künftig: eigener Bereich mit genau einem Zugang pro Halle (geteilt mit den Mitarbeitern der Halle); ein Zugang kann mehrere Hallen derselben Betreiberfirma haben.
- Admin 1: ordnet zu und entzieht. Admin 2: sieht Zuordnung nicht ändernd, unterstützt Support.
- Spieler, Gäste: nicht betroffen.

## Entscheidungen (vom Nutzer, 2026-11-10)
- Anmeldung per Google; eigener Bereich nur für die eigenen Hallen.
- Buchungsanfragen bestätigen oder ablehnen; Ablehnung nur mit Begründung; jede Entscheidung ins Beweisprotokoll (009).
- Einsicht: Buchungen, Auszahlungen, Provisionsrechnungen von Soccaz.
- Antworten auf Bewertungen der eigenen Halle.
- Admin 1 ordnet Betreiber Hallen zu.

## Weitere Entscheidungen (Nutzer, 2026-11-10)
- Ein Zugang pro Halle, den die Halle mit ihren Mitarbeitern teilt (eine zugeordnete Google-Anmeldung je Halle).
- Benachrichtigung bei neuen Anfragen: Push und Mail.
- Antwortfrist 12 Stunden, danach keine Zusage mehr möglich. Keine Antwort = abgelehnt: beide Captains werden benachrichtigt und können eine andere Halle oder einen anderen Termin wählen; im Beweisprotokoll als "nicht reagiert" vermerkt. Das Geld bleibt geparkt; kommt bei mindestens 48 h Vorlauf bis zur 48-Stunden-Frist (bei Vorlauf unter 48 h bis 1 Stunde vor Anstoß) keine Zusage zustande, fällt das Spiel aus und alle bekommen Guthaben zurück.
- Sperrzeiten gehören in 011: Die Halle hat einen Kalender, in dem sie Tage und Uhrzeiten als geschlossen einträgt. Spieler sehen live nur freie Zeiten. Bereits gebuchte Zeiten kann die Halle nicht sperren.

## Zusage und Fristen bei kurzem Vorlauf (Orchestrator-Festlegung, Nutzer kann widersprechen)
- Die Zusage der Halle ist in allen Fällen Voraussetzung für die Buchung (bei Hallen mit Zugang): Buchung = alle bezahlt + beide Captains bereit + Zusage. Gilt auch für die Sofortbuchung bei Vorlauf unter 48 h. Verträge 006 und 008 werden um diese Bedingung ergänzt.
- Die Antwortfrist ist 12 Stunden, höchstens aber bis 1 Stunde vor Anstoß. Bei Vorlauf unter 13 Stunden verkürzt sie sich entsprechend.
- Vorlauf mindestens 48 Stunden: Keine Zusage bis zur 48-Stunden-Frist → Spiel fällt aus, Erstattung an alle (AC-10).
- "Halle mit Zugang" = Halle, der in M1 (neue Zuordnungstabelle, Migration additiv) ein Betreiber-Zugang zugeordnet ist; bis M1 gelten alle Hallen als ohne Zugang (keine Zusage nötig, heutiges Verhalten).
- Bei Hallen mit Zugang beträgt der Mindestvorlauf für das Privatspiel 2 Stunden (sonst wäre die Antwortfrist null); bei Hallen ohne Zugang bleibt es beim Privatspiel bei 1 Stunde. Teamspiel und Matchmaking haben unabhängig davon 24 Stunden Mindestvorlauf (Vertrag 008).
- Wählen die Captains nach "abgelehnt" eine andere Halle oder einen anderen Termin, wird die Lobby umgestellt und der Anteil neu gerechnet (AC-15); das setzt voraus, dass noch nicht gebucht wurde (Buchung erfolgt erst mit Zusage).
- Vorlauf unter 48 Stunden: Keine Zusage bis 1 Stunde vor Anstoß → Abbruch wie in 006/008 (Absage, Erstattung an alle); "abgelehnt" nach Ablauf der Antwortfrist gilt auch hier, die Captains können in der verbleibenden Zeit eine andere Halle oder einen anderen Termin wählen.

## Annahmen (Orchestrator-Vorschlag)
- Zuordnung als Tabelle (Betreiber ↔ Halle), `managerUserId` wird migriert; Betreiber bekommen keine Admin-Rechte und sehen keine Daten anderer Hallen.
- Einladung: Admin 1 gibt eine Google-E-Mail frei; der Betreiber meldet sich damit an, die Zuordnung greift beim ersten Login.
- Hallen ohne zugeordneten Zugang ("unmanaged") bleiben wie heute im Rennen; die Regel "keine Antwort = abgelehnt" gilt nur für Hallen mit Zugang.
- Gesperrte Zeiten wirken auf die Zeitauswahl bei Lobby-Anlage und Suche (Spieler sehen nur freie Zeiten); eine Sperre ist protokolliert (wer, wann). Bereits angefragte oder gebuchte Slots sind nicht sperrbar.
- Auszahlungen: nur Anzeige aus dem Hauptbuch (Durchlaufgeld), reale Auszahlung erst mit Zahlungsdienstleister (GO-LIVE-AUDIT).
- Provisionsrechnungen: Download als PDF aus 009, nur eigene Halle.
- Antwort auf Bewertung: eine öffentliche Antwort je Bewertung, Betreiber kann sie bearbeiten; Admin 2 kann sie über "Melden" prüfen.
- Spieler-Namen in Buchungen: Betreiber sehen Team und Spielerzahl, keine Namen/Kontaktdaten.

## Nicht-Ziele
- Halle legt eigene Preise oder Slots fest, Kalender-Synchronisation, Zahlungsabwicklung.
- Eigene Provisionseinstellung durch Betreiber (nur Admin 1, 009).
- Mobile App, Mehrsprachigkeit über das Bestehende hinaus.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Betreiber mit Zuordnung | Meldet sich an | Eigener Bereich nur mit seinen Hallen; fremde Hallen und `/admin` nicht zugänglich (403/404) | tests/integration/hallen-dashboard.test.ts |
| AC-2 | Neue Buchungsanfrage | Betreiber bestätigt | Status bestätigt, Eintrag im Beweisprotokoll (Zeit, Platz frei, Zusage), Spiel läuft weiter | tests/integration/hallen-dashboard.test.ts |
| AC-3 | Neue Buchungsanfrage | Betreiber lehnt ab ohne Begründung | Abgelehnt (Pflichtfeld); mit Begründung: Ablehnung im Beweisprotokoll | tests/integration/hallen-dashboard.test.ts |
| AC-4 | Anfrage einer fremden Halle | Betreiber ruft sie auf oder entscheidet | Abgelehnt | tests/integration/hallen-dashboard.test.ts |
| AC-5 | Betreiber | Öffnet Buchungen, Auszahlungen, Rechnungen | Nur eigene Halle; Rechnungs-PDF abrufbar; keine Spieler-Namen | tests/integration/hallen-dashboard.test.ts |
| AC-6 | Bewertung der Halle | Betreiber antwortet | Antwort öffentlich unter der Bewertung; nur eigene Halle; meldbar | tests/integration/hallen-dashboard.test.ts |
| AC-7 | Admin 1 | Ordnet Betreiber zu / entzieht | Wirkt sofort, protokolliert; Admin 2 und Betreiber dürfen es nicht | tests/integration/hallen-dashboard.test.ts |
| AC-9 | Anfrage an Halle mit Zugang | 12 Stunden ohne Antwort | Anfrage = abgelehnt (Zusage danach abgelehnt), beide Captains benachrichtigt und können andere Halle/Termin wählen, Beweisprotokoll "nicht reagiert", Geld bleibt geparkt | tests/integration/hallen-dashboard.test.ts |
| AC-10 | Vorlauf mindestens 48 h, keine Zusage bis 48 h vor Anstoß | Frist-Job läuft | Spiel fällt aus, alle bekommen Guthaben zurück | tests/integration/hallen-dashboard.test.ts |
| AC-11 | Neue Anfrage | Anfrage entsteht | Betreiber erhält Push und Mail | tests/integration/hallen-dashboard.test.ts |
| AC-12 | Halle trägt Tage/Uhrzeiten als geschlossen ein | Spieler wählt Zeit bei Suche/Lobby-Anlage | Gesperrte Zeiten nicht wählbar (auch serverseitig abgelehnt); Sperre auf bereits angefragten/gebuchten Slot wird abgelehnt | tests/integration/hallen-kalender.test.ts |
| AC-13 | Vorlauf unter 48 h, alle bezahlt, beide Captains bereit, Halle mit Zugang hat nicht zugesagt | Sofortbuchung wäre fällig | Keine Buchung; mit Zusage sofort gebucht; ohne Zusage 1 h vor Anstoß Absage + Erstattung an alle | tests/integration/hallen-dashboard.test.ts |
| AC-14 | Vorlauf unter 13 Stunden (nur Privatspiel; Teamspiel hat mindestens 24 h) | Anfrage entsteht | Antwortfrist = Vorlauf minus 1 h (mindestens 1 h); endet spätestens 1 h vor Anstoß | tests/integration/hallen-dashboard.test.ts |
| AC-15 | Anfrage gilt nach Ablauf als abgelehnt, Lobby bleibt offen | Captains wählen andere Halle oder anderen Termin | Lobby wird umgestellt, neue Anfrage; Anteil neu gerechnet (nach Wegfall der Fixierung): zu viel Gezahltes als Guthaben zurück, zu wenig wird nachgefordert, "Bereit" beider Teams zurückgesetzt, Hallen-Zusage der alten Halle verfällt | tests/integration/hallen-dashboard.test.ts |
| AC-16 | Privatspiel an einer Halle mit Zugang, Anlage mit weniger als 2 h Vorlauf | Spiel wird angelegt | Abgelehnt (Mindestvorlauf 2 h bei Hallen mit Zugang); Privatspiele an Hallen ohne Zugang weiterhin ab 1 h; Teamspiel immer ab 24 h (Vertrag 008) | tests/integration/hallen-dashboard.test.ts |
| AC-8 | Gesamtablauf | Zuordnen, Betreiber meldet sich an, bestätigt, antwortet | Beweisprotokoll vollständig, PDF-Export enthält die Entscheidung | tests/e2e/hallen-dashboard.spec.ts |

## Meilensteine
- M1: Zuordnung, Rechte, Bereich (AC-1, 4, 7)
- M2: Anfragen bestätigen/ablehnen (AC-2, 3)
- M3: Buchungen, Auszahlungen, Rechnungen (AC-5)
- M4: Frist, Benachrichtigung, Kalender mit Sperrzeiten, Zusage als Buchungsbedingung (AC-9, 10, 11, 12, 13, 14, 15)
- M5: Antworten auf Bewertungen, Gesamtablauf (AC-6, 8); erst nach Vertrag 010 (braucht die Bewertungen aus 010 M1), die Umsetzungsreihenfolge bleibt 009, 011 M1 bis M4, 010, 011 M5

## Betroffene Bereiche
`src/app/halle/*` (neu strukturiert), `src/server/veto.ts`, `src/server/booking.ts`, Beweisprotokoll (009), Rechnungen (009), Bewertungen (010), `src/db/schema-finance.ts` (Zuordnung, Migration additiv), `src/lib/roles.ts`.

## Risiken und Randfälle
- Datenzugriff über Halle-ID manipulierbar: jede Abfrage und Aktion prüft die Zuordnung serverseitig.
- Betreiber wechselt/Account wird gelöscht: Zuordnung endet, Beweisprotokoll bleibt.
- Entscheidung nach Ablauf der 12-h-Frist: Verhalten klar definieren (abgelehnt "zu spät", protokolliert).
- Hallen ohne Betreiber (heute "unmanaged") bleiben im Rennen.

## Datenschutz / Sicherheit
Security-Review Pflicht (Rechte, Mandantentrennung). Betreiber sehen keine personenbezogenen Spielerdaten.

## Offene Fragen
- (sonst keine; alle vom Nutzer entschieden, siehe "Weitere Entscheidungen")
- Turniere und Hallen-Zusage entscheiden (Produktfrage an Nutzer, bei 011 M2)

## End-to-End-Nachweis
`tests/e2e/hallen-dashboard.spec.ts`: Admin 1 ordnet zu, Betreiber meldet sich an, bestätigt eine Anfrage und lehnt eine mit Begründung ab, sieht Rechnung, antwortet auf eine Bewertung; Beweisprotokoll-PDF zeigt beide Entscheidungen.
