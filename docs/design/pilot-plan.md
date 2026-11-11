# Pilot-Test-Plan (Vertrag 013 AC-8)
Stand: 2026-11-11 · Code-Stand `origin/main` 7d8f38a · Verfasser: worker-2 (Doku, kein Code) · Status: Entwurf, Review offen

Zweck: Ein Abend mit Freunden in einer Halle, mit Stripe-TESTkarten, nie live. Der Nutzer sieht die neue Oberfläche und den Kartenablauf in der Praxis und entscheidet danach (Gate G), ob M4 bis M7 starten. Der Plan beantwortet keine Rechts- oder Steuerfragen; solche Punkte stehen nur als Frage (Abschnitt 11).

Quellen: Vertrag 012 (`docs/contracts/012-zahlung-karte-lobby.md`, AC-1 bis AC-21), Vertrag 013 (AC-8, AC-13 bis AC-15, Branch `docs/013-freigabe`), `docs/design/umbauplan-013.md`, `docs/BETRIEB.md` (Umgebungen, Zahlungen einschalten, Kartenzahlung), `docs/loop/GO-LIVE-AUDIT.md` (G1-012 bis G15-012), `docs/loop/FEHLT-NOCH.md`, `docs/design/analyse-seed.md`.

## 1. Voraussetzungen (Gate vor dem Pilot)
Bindende Reihenfolge (Nutzerbedingung 2, Backlog 63): M2 → M2b → 012 M3b bis M5 → 012 M6a → 013 M3 → **Pilot** → M4 bis M8. Der Pilot startet erst, wenn alle gemergt sind:
- 012 M3b (Fehlerzustand mit Grund, Benachrichtigung, Datenschutz „Dritte sehen neutral“), M4 (Dispute, DSGVO, E2E im Testmodus), M5 (Turnier auf Karte), M6a (Guthaben in Oberfläche und Texten weg).
- 013 M3 (Navigation, Start, Lobby mit „Dein Stand“ und einer Hauptaktion).
- Die E2E im Stripe-Testmodus (012 AC-17) sind grün: erst danach lohnt der Mensch-Test.
- Browser-Tests laufen unter 10 Minuten (013 AC-11), damit Korrekturen nach dem Pilot schnell zurückfließen.

## 2. Ziel und Umfang
- **8 bis 10 Spieler, eine Halle, ein Abend** (Vorschlag aus Vertrag 013, offene Frage dort).
- Geprüft wird: Verständlichkeit (finden Freunde ohne Erklärung den nächsten Schritt?), der Kartenablauf und seine Fehlerfälle, die Gast-Sicht, die Handy-Bedienung (390 px) und die Sprache nach `begriffe.md`.
- **Nicht getestet** (Abschnitt 9): Live-Zahlung, Rechtstexte, Steuer, Last, Admin-Bereich, Stripe-Live-Konfiguration.

## 3. Rollen
Ein Abend braucht Menschen; Agenten bereiten vor und werten aus, sie sind nicht dabei.
| Rolle | Wer | Aufgabe |
|---|---|---|
| Spielleitung | Nutzer | führt durch den Ablauf, entscheidet Abbruch (Abschnitt 8) |
| Protokoll | eine Person aus dem Kreis (nicht Spielleitung) | schreibt die Feedback-Liste (Abschnitt 7), Uhrzeit je Eintrag |
| Captain 1, Captain 2 | zwei Spieler | spielen die Captain-Fälle |
| Spieler | übrige 6 bis 8 | Karte, Bereit, Nachzahlen, Übernehmen |
| Gast | eine Person ohne Konto (zweites Gerät) | prüft die Gast-Sicht |
| Technik (im Hintergrund) | Orchestrator/Task Manager/Worker | Vorbereitung, Stripe-Dashboard (Testmodus) lesen, Fehler einsammeln; greift während des Abends nicht in den Ablauf ein, außer bei Abbruch |

## 4. Vorbereitung (T-7 bis T-1)
### 4.1 Umgebung
- **Staging**, nie Produktion (`docs/BETRIEB.md`, Umgebungen): zweite Compose-Installation mit eigener Domain und Test-Zugangsdaten. Das Geld-System wird nie gegen die Produktion getestet.
- Stripe im **Testmodus**: Testschlüssel und der Webhook-Endpunkt `/api/stripe/webhook` mit eigenem Signaturgeheimnis (BETRIEB, „Kartenzahlung“). In `docs/loop/FEHLT-NOCH.md` stehen nur NAMEN (Stripe-Testschlüssel, Webhook-Secret Test, Domain und `APP_URL` der Staging-Umgebung); **keine Werte im Repo**, keine Schlüssel in Chat oder Doku.
- `card_payments_enabled = true` (nur auf Staging, ohne offene bezahlte Spiele umlegen, G8-012). `PAYMENTS_FAKE` darf in Staging **nie** gesetzt sein (G10-012; die Startprüfung verweigert Produktion mit Fake): der Pilot geht über echte Stripe-Testkarten, nicht über den Fake-Pfad.
- **Sicherung unmittelbar vor dem Pilot** (T-1 oder am Abend vorher): `docker compose exec backup sh /backup-loop.sh once` (BETRIEB, Sicherung und Wiederherstellung). `scripts/restore-test.sh` stellt nur in eine Wegwerf-Datenbank wieder her und beweist die Sicherung, setzt Staging aber nicht zurück; das **Zurücksetzen der Staging-Datenbank** nach dem Pilot ist das Wiederherstellen in die echte Staging-Datenbank (`gunzip -c backups/socaz-….sql.gz | docker compose exec -T db psql -U socaz -d socaz`, BETRIEB) oder das Löschen der Staging-Umgebung.
- Scheduler/Jobs laufen (Frist-Job, Abbuchung, Nachzahlfenster, Erstattung); Überwachung/Fehlermeldungen aktiv (BETRIEB, Überwachung).

### 4.2 Konten und Daten
- **Keine echten Zahlungsdaten:** nur Stripe-Testkarten (Abschnitt 5). Kein Spieler gibt eine echte Karte ein.
- Anmeldung: **Annahme:** Staging läuft als zweite Compose-Installation wie Produktion (`NODE_ENV=production`); der Dev-Login gibt es nur außerhalb der Produktion (`src/auth.ts:9,33`), also auf Staging nicht. In der Vorprobe (T-1) prüfen, dass `/anmelden` dort keinen Dev-Login zeigt. Wie sich die Freunde anmelden (eigenes Google-Konto vs. eigens angelegte Testkonten) ist eine **Entscheidung des Nutzers** (Abschnitt 11, Frage 2); sie berührt Datenschutz und wird hier nicht entschieden.
- Der lokale Seed (`scripts/seed-frontend.mts`, `analyse-seed.md`) läuft nur gegen lokale Entwicklungsdatenbanken (Seed-Guard: `localhost:5433`) und erzeugt erfundene Karten-IDs: **nicht für Staging**. Für den Pilot werden Teams, Halle und Spiele auf Staging von Hand oder mit einem eigenen, geprüften Vorbereitungsschritt angelegt (Aufgabe der Technik, vorab als Task).
- Halle: eine echte oder als Test angelegte Halle mit Preis; Zusage der Halle (011) nur, wenn die Halle „Zugang“ hat (offen, Frage 3).

### 4.3 Vorab-Fristlauf (wichtig für den Zeitplan)
Die Abbuchung „zur Frist“ liegt 48 Stunden vor Anstoß (012 AC-4); ein Abend kann sie nicht live abwarten. Deshalb:
- **T-3 Tage:** Ein Spiel (Spiel A) mit Anstoß am Pilotabend + mindestens 48 h anlegen; die Spieler hinterlegen Karten und sind bereit. **T-2 Tage** läuft die Abbuchung zur Frist von selbst: die Technik prüft im Testmodus-Dashboard und im Hauptbuch, dass jeder genau einmal belastet wurde (Idempotenz, AC-4, AC-10).
- **Spiel B (Vorab, T-3):** abgelehnte Karte plus vorbereitete Warteliste. Das Nachzahlfenster ist `min(2 h ab Fehler, Anstoß minus 1 h)` (012 AC-6); es kann an einem 3-Stunden-Abend nicht live ablaufen, wenn der Fehler erst am Abend entsteht, und Nachrücker (AC-8) oder Auto-Absage ohne Nachrücker (AC-9) brauchen ein abgelaufenes Fenster. Darum wird Spiel B so angelegt, dass Fehler und Fenster **vor dem Abend** ablaufen (z. B. Anstoß so, dass die Frist/Sofortbuchung am Vortag liegt, Warteliste mit Teilnehmern mit Karte vorbereitet). Am Abend wird das **Ergebnis angesehen** (Nachrücker eingesetzt bzw. automatisch abgesagt, Erstattung im Testmodus), nicht live ausgelöst. Wie Spiel B zeitlich genau gebaut wird, entscheidet die Technik in der Vorbereitung (Task), nicht dieser Plan.
- Am Abend selbst werden Spiele mit Anstoß in unter 48 h (Sofortbuchung, AC-5) und mit Mindestvorlauf (24 h Teamspiel, 1 h Privatspiel) angelegt; der Fehlerfall mit **laufendem** Nachzahlfenster (AC-6, AC-7: Nachzahlen im Fenster) wird live gespielt.

### 4.4 Technische Vorprobe (T-1)
- Ein Mensch-Durchlauf mit zwei Personen und allen Karten aus Abschnitt 5 (30 Minuten), alle Rollen, Handy und Desktop.
- Kontrolle: nirgends Guthaben, Aufladung, Codes (AC-15 aus 012), Texte nach `begriffe.md`.

## 5. Stripe-Testkarten (nur Testmodus)
Die Nummern stehen in der Stripe-Dokumentation und werden vor dem Pilot gegen die aktuelle Seite geprüft; sie sind keine Geheimnisse, gehören aber nicht in die Oberfläche.
| Fall | Testkarte (laut Stripe-Doku, vorher prüfen) |
|---|---|
| Erfolgreich | 4242 4242 4242 4242 |
| Abgelehnt | 4000 0000 0000 0002 |
| Authentifizierung nötig (3-D-Secure) | 4000 0027 6000 3184 |
| Konto nicht gedeckt | 4000 0000 0000 9995 |
Ablaufdatum in der Zukunft, beliebige Prüfziffer.

## 6. Ablauf des Abends (ca. 3 Stunden)
| Zeit | Block | Fälle (Vertrag 012) |
|---|---|---|
| 0:00 | Begrüßung, Regeln, Abbruchkriterien vorlesen, Protokollperson bestimmt | – |
| 0:15 | **Block 1 Einstieg ohne Erklärung** | Gast öffnet Start und Lobby (Gast-Sicht: nur Zahlen und Initialen; AC-12/AC-20 für Dritte neutral); Spieler melden sich an, finden „Spiel suchen“, Lobby (013 AC-7) |
| 0:45 | **Block 2 Karte und Bereit** | Karte hinterlegen mit Mandat sichtbar vor dem Klick (AC-1); „Bereit“ ohne Karte abgelehnt, mit Karte möglich (AC-2); Anteil ändert sich bei Beitritt oder Verlassen ohne Geldbewegung (AC-3); **Karte ändern** (ein Begriff, `begriffe.md`) |
| 1:15 | **Block 3 Preis steht fest und Abbuchung** | Beide Captains „Preis bestätigen“, Status „Preis steht fest“; Sofortbuchung bei Anlage unter 48 h (AC-5); Spiel A (T-3) zeigt das Ergebnis der Frist-Abbuchung (AC-4); Beleg/Mindestbetrag 0,50 EUR (AC-19) |
| 1:45 | Pause | – |
| 2:00 | **Block 4 Fehlerfälle** | Abgelehnte Karte: Betroffener und Captain sehen „Abbuchung fehlgeschlagen“ mit Grund und Nachzahl-Weg, alle anderen nur „Zahlung ausstehend“ (AC-6, AC-12, AC-20); Nachzahlen im Fenster mit neuer Karte und 3-D-Secure (AC-7, live, Fenster läuft); **Anteil übernehmen** (AC-13); **Spiel B ansehen:** Fenster ist schon abgelaufen, Nachrücker von der Warteliste ist eingesetzt (AC-8, vorbereitet, nur Ansicht) |
| 2:30 | **Block 5 Absage und Erstattung** | Absage durch Berechtigte: nach der ersten Abbuchung nur Admin 1 (AC-21); Erstattung auf die Karte, Übernahme-Erstattung beim Übernehmer (AC-14); **Auto-Absage ohne Nachrücker** (AC-9) am vorbereiteten Spiel B: Ergebnis ansehen (Fenster schon abgelaufen, nur Ansicht) |
| 2:50 | Abschluss | Feedback-Runde (je Person zwei Minuten), Liste durchgehen, Schweregrade bestätigen, Stripe-Test-Daten und Konten-Aufräumen ankündigen |

Reihenfolge der Blöcke ist verhandelbar, solange Block 4 und 5 nach den Abbuchungen kommen.

## 7. Feedback ohne Formulare
Eine einfache Liste, von der Protokollperson auf dem Handy oder Papier geführt; keine Umfrage-Tools, keine Konten bei Dritten.
| Zeit | Seite | Rolle | Gerät | Was ist passiert / was war unklar | Schwere |
|---|---|---|---|---|---|
Schwere: **S1** Geld/Daten falsch oder Datenleck (Abbruch), **S2** Ablauf blockiert, **S3** unklar/störend, **S4** Schönheit/Wunsch. Screenshots nur von Staging-Seiten; keine Namen echter Personen in Dateinamen.

## 8. Abbruchkriterien (Spielleitung entscheidet sofort)
- **Falsche Abbuchung:** doppelt belastet, falscher Betrag, Abbuchung ohne „Preis steht fest“ oder ohne Karte (S1).
- **Datenleck:** Gast oder Dritter sieht Namen, Zahlstatus oder Kartendaten, die er nicht sehen darf (S1).
- **Dauerfehler:** Seite/Aktion fällt länger als 10 Minuten aus oder dieselbe Fehlermeldung bei drei Personen (S2).
- **Live-Berührung:** irgendwo erscheint ein Live-Stripe-Schlüssel oder eine echte Karte wird versucht.
- Bei Abbruch: Abbuchung/Webhooks im Testmodus stoppen (Technik), Notiz mit Uhrzeit, kein Weiterspielen; Auswertung am nächsten Tag.

## 9. Was NICHT getestet wird
- **Live-Zahlung** und Live-Stripe-Konfiguration (G9-012, G11-012): erst nach Pilot und Rechtsprüfung.
- **Rechtstexte** (AGB, Datenschutz, Impressum, Hausordnung), Mandatstext rechtlich, Steuer, Rechnungen (G1-012 bis G7-012, G12 bis G15): bleiben bei Anwalt/Steuerberater.
- Admin-Bereich (M7), Hallen-Dashboard (011) über die Zusage-Strecke hinaus, Firmenteams (014), Ligen (zurückgestellt).
- Lasttest, Sicherheitstest (laufen im Review der Agenten), Barrierefreiheits-Audit (läuft per Playwright/Impeccable).

## 10. Datenschutz und Aufräumen
- Nur Testkarten, keine echten Zahlungsdaten; es gibt keine Kartennummern im System (nur Stripe-Zahlungsmittel-ID und letzte vier Ziffern der Testkarte).
- Die Teilnehmenden werden vorab informiert, was protokolliert wird (Uhrzeit, Seite, Rolle, Gerät); ob und wie eine formale Einwilligung nötig ist, ist eine Rechtsfrage (Frage 4), die dieser Plan nicht beantwortet.
- Nach dem Abend (T+1):
  - Auswertung der Liste; danach Feedback-Notizen ohne Personenbezug im Repo (`docs/retros/` oder Pilot-Bericht), nie Namen oder E-Mails.
  - Staging-Datenbank aus der Sicherung vor dem Pilot wiederherstellen (BETRIEB) oder die Staging-Umgebung löschen; Test-Kunden in Stripe (Testmodus) bleiben harmlos, können aber im Dashboard gelöscht werden.
  - Testkonten: Konto löschen ist bei offenen Spielen mit Abbuchung nur über den Support möglich (BETRIEB, Konto-Löschung bei laufender Abbuchung); deshalb Spiele vorher beenden/absagen.
  - Webhook-Secret Test und Testschlüssel rotieren, falls sie in Chats gelandet sein könnten.

## 11. Offene Fragen (für Orchestrator/Nutzer, nicht von Agenten beantwortet)
1. Termin und Halle für den Pilot; Teilnehmerzahl 8 bis 10 und Dauer ein Abend (Vorschlag aus Vertrag 013) bestätigen.
2. Anmeldung der Freunde: eigene Google-Konten (echte Namen auf Staging) oder eigens angelegte Testkonten? (Datenschutzfrage für den Nutzer.)
3. Halle mit „Zugang“ (Zusage der Halle, 011) oder ohne? Ohne Zusage entfällt die Zusage-Strecke im Test. Wie bekommt die Halle Zugang zur Halle-Ansicht (Zahlung läuft über die Plattform, Auszahlung an Hallen ist nach Vertrag 012 nicht Teil dieses Stands)?
4. Einwilligung/Information der Teilnehmenden: Rechtsfrage (Anwalt), nicht von Agenten zu beantworten.
5. Wer ist „Admin 1“ am Abend (Absage nach der ersten Abbuchung, AC-21)?
6. Staging-Domain und `APP_URL` beschaffen: Nutzer (Namen in `FEHLT-NOCH.md` ergänzen lassen, Werte nie im Repo).

## 12. Zeitplan (Vorschlag, T = Pilotabend)
| Zeitpunkt | Schritt | Verantwortlich |
|---|---|---|
| T-14 | Abhängigkeiten aus Abschnitt 1 erfüllt, Termin/Halle fixiert, Fragen 1 bis 3 beantwortet | Orchestrator, Nutzer |
| T-7 | Staging aufgesetzt, Testmodus, Schalter, Backup-Test, Konten/Teams angelegt | Technik |
| T-3 | Spiel A (Frist-Abbuchung) und Spiel B (abgelehnte Karte, Warteliste) angelegt | Technik, 2 bis 3 Spieler |
| T-2 | Frist-Abbuchung Spiel A prüfen (Dashboard, Hauptbuch); Spiel B: Fehler, Fenster, Nachrücker/Absage beobachten | Technik |
| T-1 | Vorprobe 30 Minuten mit zwei Personen, Checkliste | Technik, Spielleitung |
| T | Pilotabend (ca. 3 Stunden) | Spielleitung, Protokoll |
| T+1 | Aufräumen, Auswertung der Liste, Pilot-Bericht (Funde nach Schwere, Backlog-Einträge) | Orchestrator, Task Manager |
| T+3 | Gate G (Abschnitt 14) | Nutzer |

## 13. Checkliste
**Vorher:** Abhängigkeiten gemergt · Staging mit Testschlüsseln, Webhook-Test grün · `card_payments_enabled = true`, `PAYMENTS_FAKE` nicht gesetzt (Prüfung) · Sicherung unmittelbar vorher (`backup-loop.sh once`) und Restore-Test · Spiel A und Spiel B (T-3) angelegt · Vorprobe fertig · Rollen verteilt · Feedback-Liste bereit · Testkarten aus Abschnitt 5 aktuell · Abbruchkriterien ausgedruckt/geteilt.
**Während:** Protokoll läuft · Stripe-Dashboard (Testmodus) offen · Uhrzeit je Eintrag · bei S1 sofort Abbruch (Abschnitt 8) · keine Live-Schlüssel sichtbar.
**Nachher:** Feedback-Liste gesichert (ohne Personenbezug) · Spiele beendet/abgesagt, Erstattungen im Testmodus geprüft · Staging aus der Sicherung vor dem Pilot zurückgesetzt oder gelöscht · Schlüssel rotiert, falls nötig · Bericht an den Nutzer.

## 14. Gate G (Nutzer)
- **Entscheidung:** Ja/Nein für M4 bis M7 (013 AC-8: „Feedback liegt vor; M4 bis M7 starten erst danach“).
- Grundlage: Pilot-Bericht mit Anzahl Funde je Schwere, offene S1/S2 mit Plan, Aussage, ob die Kartenfälle (Abschnitt 6, Block 3 bis 5) ohne Fehler liefen.
- „Ja“ → M4 beginnt; „Ja mit Änderungen“ → Änderungsliste, die Betroffenen Seiten zuerst, neue Mini-Abnahme; „Nein“ → Gründe, zurück zu M3 (Impeccable `critique` neu), neuer Pilot.
- Der Pilot ersetzt weder den Live-Go-live noch die Rechtsprüfung; beides steht im `GO-LIVE-AUDIT.md`.
