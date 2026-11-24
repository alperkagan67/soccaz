# Pilot-Bereitschaft (eine Seite für den Nutzer)

Stand: 2026-11-24 · Code-Stand `origin/main` 78170a4 · Verfasser: worker-4 · Quellen: `pilot-plan.md` (Abschnitte 1, 11, 12, 15), `m3-abschluss-pilot-check.md`, `impeccable-lauf-m3-3.md`, `GO-LIVE-AUDIT.md`

**Kurz gesagt:** Die Software ist bereit. Offen sind das **Stripe-Update** (Version der Zahlungs-Bibliothek anheben und im Testkonto belegen), die **Testumgebung** (Staging: eine Kopie der Seite nur für den Pilot, mit Test-Zugangsdaten) und **deine Entscheidungen** (Tabelle 3).

**Wann ist der Abend möglich?** Zwei Fälle, je nachdem, wann deine Stripe-Schlüssel ankommen:
- **Regelfall:** Das Stripe-Update kommt vor dem Pilot (Entscheid t2q, spätestens 14 Tage vorher fertig). Es braucht den Nachweis im Testkonto vorher und nachher, zwei grüne Testläufe, die Sicherheitsprüfung und einen freien Platz in der Reihe: grob 4 bis 7 Tage. Kommen die Schlüssel erst am Tag 0, ist der Pilotabend **frühestens etwa 3 Wochen nach deiner Antwort** auf Punkt 1 bis 3.
- **Abkürzung (Entscheid t2q):** Der Pilot läuft auf der bisherigen Version 23.1.0 (fest eingestellt), das Update folgt danach. Dann reichen **etwa 14 Tage** (Testumgebung 7 Tage vorher, Probespiele 3 Tage vorher).

## 1. Die Voraussetzungen aus dem Plan (Stand heute)
Grün = erledigt und belegt, gelb = Technik belegt, ein Rest ist offen, offen = noch nicht begonnen.

| Voraussetzung | Stand | Beleg | Wer |
|---|---|---|---|
| Bezahlen mit Karte: Fehlerfälle, Streit, Turnier, kein Guthaben mehr | grün | gemergt bis #163 und #310 (`4d2218a`); Rechtstexte dazu sind Entwürfe (nicht blockierend) | Technik |
| Neue Oberfläche: Start, Spiel suchen, Meine Spiele, Lobby mit „Dein Stand“ und einem einzigen orangen Hauptknopf, Fehlerzustand | grün | #281 bis #310, Lobby-Fix #317 (`a0c6391`), Pilot-Feinschliff #329 (`78170a4`) | w3, w4 |
| Zahlungsknöpfe nach § 312j BGB (die gesetzliche „Button-Lösung“: Der Knopf muss klar sagen, dass er Geld kostet) | gelb | Technik #286; **Text ist Entwurf, Anwalt prüft vor dem Go-live**, im Pilot sichtbar mit Hinweis „Test“ | Nutzer (Anwalt) |
| Lesbarkeit und Kontrast, bei jedem Testlauf geprüft | grün | #271, #290; CI ohne Verstoß | Technik |
| Datensicherung zurückspielen (Restore-Probe: beweisen, dass eine Sicherung wirklich funktioniert) | gelb | Werkzeug #301 in der CI belegt; **Probe mit der echten Sicherung steht aus** | Nutzer |
| Namen nur für Angemeldete, Gäste sehen Initialen | grün | #306, #315, #318, #320; Dauertest für alle Seiten #323 (`752e0e9`) | Technik |
| Design-Prüfung (Impeccable): keine schweren Fehler mehr | grün | #314, #321 (`1e1f24d`), Lauf 3 #328 (`e1ccd7a`): kein P0, kein P1 | w3, w4 |
| Automatische Tests grün, Browser-Teile unter 10 Minuten | gelb | CI grün; Teile liegen bei 8 bis 10 Minuten, echter Stripe-Testmodus erst in der Probe T-1 | Technik |
| `main` grün und Testumgebung aus `main` gebaut | gelb | `main` grün bis `bdd0d04` (letzter fertiger Lauf); der Lauf zu `78170a4` ist noch nicht fertig (Stand 24.11.), Codeprüfung und Geheimnis-Scan dazu grün; **Testumgebung noch nicht begonnen** | Technik |
| Stripe-Update (Version 23.2.0), Nachweis im Testkonto | offen | Backlog 183, Entscheid: **vor dem Pilot, spätestens 14 Tage vorher** (Abkürzung siehe oben) | Technik, Nutzer (Konto) |

## 2. Was fehlt noch außer deinen Punkten?
| Was | Wer | Stand |
|---|---|---|
| Testumgebung aufsetzen; Teams, Halle und Probespiele von Hand anlegen (das automatische Befüllen mit Testdaten, der „Seed“, ist dort gesperrt) | Technik | wartet auf deine Punkte 3 und 4 |
| Stripe-Update und Nachweis im Testmodus | Technik | offen, braucht das Testkonto von dir |
| Probelauf T-1 (Skript für 30 Minuten, alle Rollen, Handy und Rechner) | worker-4 | nächster Schritt nach dieser Seite |
| Kleine Oberflächenpunkte aus Lauf 3: Sprachumschalter und Kästchen der Zustimmung unter 44 px, „Frist abgelaufen“ ohne Handlung, doppelter Freigabe-Satz | w3 | offen, klein, vor dem Pilot sinnvoll |
| Zwei Produktentscheide (t2q): Start und Suche für angemeldete Spieler (zu lang), Hallenbetreiber bekommt „Ersatzspieler anbieten“ als orangen Hauptknopf | t2q | offen; ohne Entscheid bleibt die Seite lang, kein Blocker |
| Beobachten: Prüfung der Anmeldeseite war einmal rot; Test-Teil 5 knapp unter 10 Minuten | Technik | klären vor dem Termin |

## 3. Was du entscheiden und beschaffen musst (Reihenfolge)
1. **Termin und Halle** (Frage 1, 3): Datum, Ort, Halle mit oder ohne „Zugang“. Das legt alle Fristen fest (T minus 14, 7, 3, 2, 1) und ist der einzige Punkt, der den Kalender bestimmt.
2. **Wer kommt** (8 bis 10 Personen) und wer übernimmt welche Rolle (Captain 1 und 2, Gast, Hallenbetreiber-Person, Protokoll, Admin 1; Frage 5). Dazu: eigene Google-Konten oder angelegte Testkonten (Frage 2).
3. **Stripe-Testkonto** mit Schlüsseln und Webhook (die Rückmeldung von Stripe an unsere Seite, z. B. „Zahlung ging durch“), dazu **Server, Adresse und Zugangsschutz für die Testumgebung** (Frage 6, 7). Nur Namen, nie Werte in den Chat. Ohne diesen Punkt kann Technik nicht beginnen.
4. **Information an die Teilnehmenden** (nur Testkarten, was protokolliert wird, Namen sind für Angemeldete sichtbar; Frage 4). Rechtsfrage, **kein Blocker**: du entscheidest, ob eine mündliche Information reicht.
5. **Datensicherung zurückspielen** mit der echten Sicherung des Hosters (Anleitung `BETRIEB.md`); kann parallel laufen.

Nach dem Abend: Pilot-Bericht (1 Tag), danach deine Entscheidung (Gate G, das Freigabetor nach dem Pilot): weiter mit den nächsten Ausbaustufen (M4 bis M7) oder nachbessern.
