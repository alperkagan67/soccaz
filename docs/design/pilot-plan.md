# Pilot-Test-Plan (Vertrag 013 AC-8)
Stand: 2026-11-24 · Code-Stand `origin/main` 4d2218a (013 M3 PR 1 bis 5b gemergt) · Verfasser: worker-3 (Doku, kein Code; Auffrischung der Fassung vom 2026-11-11, worker-2) · Status: Entwurf, Review offen (w4/w1)

Zweck: Ein Abend mit Freunden in einer Halle, mit Stripe-TESTkarten, nie live. Der Nutzer sieht die neue Oberfläche und den Kartenablauf in der Praxis und entscheidet danach (Gate G), ob M4 bis M7 starten. Der Plan beantwortet keine Rechts- oder Steuerfragen; solche Punkte stehen nur als Frage (Abschnitt 11) und im NEEDS-USER-Paket (Abschnitt 15).

Prüfstand zu Abschnitt 1: `docs/design/m3-abschluss-pilot-check.md` (2026-11-24).

Quellen: Vertrag 012 (`docs/contracts/012-zahlung-karte-lobby.md`, AC-1 bis AC-21), Vertrag 013 v3 (`docs/contracts/013-frontend-ueberarbeitung.md`: AC-8 Pilot, AC-14 kein Guthaben, AC-17 Sichtbarkeit je Rolle, AC-27 Kontrast, AC-30 Stilregeln), `docs/loop/GO-LIVE-AUDIT.md` (G1-012 bis G30-013, E-Punkte), `docs/loop/FEHLT-NOCH.md`, `docs/BETRIEB.md` (Umgebungen, Zahlungen einschalten, Kartenzahlung, Restore-Probe), `docs/design/impeccable-lauf-m3.md` (Lauf 1), `docs/design/begriffe.md`.

## 1. Voraussetzungen (Gate vor dem Pilot)
Bindende Reihenfolge (Nutzerbedingung 2, Backlog 63): M2 → M2b → 012 M3b bis M5 → 012 M6a → 013 M3 → **Pilot** → M4 bis M8 (013). Stand laut `git log` und GO-LIVE-AUDIT; der Task Manager bestätigt die Zeilen vor der Freigabe des Termins.
| Voraussetzung | Stand 2026-11-24 |
|---|---|
| 012 M3b (Fehlerzustand mit Grund, Nachzahl-Weg), M4 (Zahlungsstreit, DSGVO), M5 (Turnier auf Karte), M6a (Guthaben aus Oberfläche und Texten, AC-14) | gemergt (GO-LIVE G22 bis G28); Rechtstexte zu M6a sind **ENTWURF, Anwalt prüft vor Go-live** (G28-012), blockieren den Pilot nicht |
| 013 M3: Navigation, Start, Spiel suchen, `/app` „Meine Spiele“, Lobby „Dein Stand“ mit EINER Hauptaktion, Fehlerzustand mit EINEM Schritt, Captain-Leiste | gemergt: PR 1 bis 5b (#281, #284, #290, #293, #302, #310) |
| Zahlungstexte nach § 312j BGB (zentral, nur bei echter Abbuchung) | gemergt (#286), **ENTWURF, Rechtsprüfung offen**; im Pilot sichtbar, Teilnehmende wissen: Test |
| AC-27 Kontrastmessung verbindlich (Handy 390 und Desktop 1280, hell/dunkel) | gemergt (#271), main-Lauf ohne Verstoß |
| Restore-Probe (E8 Werkzeug) | gemergt (#301), in der CI belegt; Probelauf mit echter Hoster-Sicherung steht aus (Nutzer, Abschnitt 15) |
| **Namen-PRs (Sichtbarkeit, Entscheid t2q 2026-11-24):** PR A Kommentare (Gäste und reine Betreiber: Initialen, kein Link) | **gemergt:** PR A #306 (Kommentare), PR B #315 (Listen), PR C #318 (Spielbericht, Live-Schnittstelle), PR D #320 (Spielerprofil für Gäste nicht öffentlich); das Gäste-Szenario (Block 1b) ist freigegeben (Stand und Beleg: `m3-abschluss-pilot-check.md`) |
| Impeccable-Engine-Lauf 2 (Lobby-Zustände Fehlerzustand und Captain-Leiste, hell, `/willkommen`, Einladung) | **erledigt** (#314: keine P0, vier P1, zwölf P2); P1 1, 2, 4 behoben mit dem Lobby-Fix #317, **P1-3 (Knopf-Innenabstand im Baustein `btn`, w4) offen**; danach ein kleiner Lauf 3 (Hell, Lücken aus Lauf 2); Einzelheiten und offene P2 in `m3-abschluss-pilot-check.md` |
| E2E im Stripe-Testmodus grün (012 AC-17), Browser-Tests unter 10 Minuten je Teil (013 AC-11) | in der CI; Shards liegen knapp um 10 Minuten (Notiz in `tests/e2e-shards.json`), der Task Manager prüft vor dem Termin |
| `main` grün (CI), Staging aus `main` gebaut | Technik, T-7 |

## 2. Ziel und Umfang
- **8 bis 10 Spieler, eine Halle, ein Abend** (Vorschlag aus Vertrag 013, Bestätigung durch den Nutzer: Frage 1).
- Geprüft wird: Verständlichkeit (finden Freunde ohne Erklärung den nächsten Schritt?), „Dein Stand“ und die eine Hauptaktion je Rolle, der Kartenablauf und seine Fehlerfälle (Lobby 5b), die Sicht je Rolle (Gast, Spieler, Captain, Betreiber), die Handy-Bedienung (390 px) und die Sprache nach `begriffe.md`.
- **Nicht getestet** (Abschnitt 9): Live-Zahlung, Rechtstexte, Steuer, Last, Admin-Bereich über die Pilot-Aufgaben hinaus, Stripe-Live-Konfiguration.

## 3. Rollen
Ein Abend braucht Menschen; Agenten bereiten vor und werten aus, sie sind nicht dabei.
| Rolle | Wer | Aufgabe |
|---|---|---|
| Spielleitung | Nutzer | führt durch den Ablauf, entscheidet Abbruch (Abschnitt 8) |
| Protokoll | eine Person aus dem Kreis (nicht Spielleitung) | schreibt die Feedback-Liste (Abschnitt 7), Uhrzeit je Eintrag |
| Captain 1, Captain 2 | zwei Spieler | Captain-Fälle: Lobby aufmachen, bereit, „Preis bestätigen“, Captain-Leiste, Anteil übernehmen |
| Spieler | übrige 6 bis 8 | beitreten, Karte, Bereit, Fehlerfälle, Ergebnis |
| Gast | eine Person ohne Konto (zweites Gerät) | prüft die Gast-Sicht (Abschnitt 10) |
| Hallenbetreiber | eine Person mit Betreiber-Zugang (`venue_access`), **nicht** im Spiel | prüft die namenfreie Sicht in Lobby, Teamseite, Kommentaren; sagt die Halle zu, falls die Halle „Zugang“ hat (Frage 3) |
| Admin 1 | Nutzer oder eine benannte Person | Absage nach der ersten Abbuchung (AC-21), Ausnahme-Erstattung, Blick aufs Hauptbuch |
| Technik (im Hintergrund) | Orchestrator/Task Manager/Worker | Vorbereitung, Stripe-Dashboard (Testmodus) lesen, Fehler einsammeln; greift während des Abends nicht ein, außer bei Abbruch |

## 4. Vorbereitung (T-14 bis T-1)
### 4.1 Umgebung
- **Staging**, nie Produktion (`docs/BETRIEB.md`, Umgebungen): zweite Compose-Installation mit eigener Domain und Test-Zugangsdaten. Das Geld-System wird nie gegen die Produktion getestet. Staging nicht für Suchmaschinen und Fremde offen lassen (Zugangsschutz am Reverse-Proxy oder nur Einladungslinks; Entscheidung Nutzer/Technik).
- Stripe im **Testmodus**: Testschlüssel (`sk_test_`, `pk_test_`) und der Webhook-Endpunkt `/api/stripe/webhook` mit eigenem Signaturgeheimnis `STRIPE_CARD_WEBHOOK_SECRET` (BETRIEB, „Kartenzahlung“). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` wird beim BAUEN eingebettet: nach jeder Änderung neu bauen. In `FEHLT-NOCH.md` stehen nur NAMEN; **keine Werte im Repo**, keine Schlüssel in Chat oder Doku.
- `payments_enabled` AN **und** `card_payments_enabled` AN (nur auf Staging, ohne offene bezahlte Spiele umlegen, G8-012). **Nicht** „Zahlungen AUS“: dann sind alle Spiele gratis und der Kartenablauf wird nicht geprüft. `PAYMENTS_FAKE` darf auf Staging **nie** gesetzt sein (G10-012): der Pilot geht über echte Stripe-Testkarten, nicht über den Fake-Pfad. Staging läuft mit `NODE_ENV=production`, dort verweigert der Code den Fake-Pfad ohnehin (zweite Absicherung); die Prüfung, dass die Variable nirgends gesetzt ist, bleibt trotzdem Pflicht (die lokalen Tests `lobby-captain`, `karte-freigabe` nutzen den Fake-Pfad, der Pilot ersetzt sie nicht).
- **Beweisprotokoll und DB-Rollen** (G25-009, G26-009): die Einstellungen `evidence_*` und die Datenbankrollen sind Produktionsfragen; die Technik legt fest, ob Staging damit läuft, und vermerkt es im Vorbereitungsprotokoll. Kein Pilot-Blocker, solange Staging startet und die **bestehenden** Prüfungen grün sind (Startprüfung der Zahlungs-/Fake-Einstellung, Salden-Guard, Restore-Probe); eine Startprüfung für die Datenbankrollen (A2) gibt es noch nicht (Backlog 228-2, nur Entwurf) und wird hier nicht vorausgesetzt.
- **Sicherung unmittelbar vor dem Pilot** (T-1): `docker compose exec backup sh /backup-loop.sh once` (BETRIEB, Sicherung und Wiederherstellung); sie schreibt das Manifest `socaz-<zeit>.manifest.json` daneben. **Restore-Probe** auf einer lokalen Wegwerf-Datenbank: `RESTORE_ADMIN_URL=postgres://<konto>@127.0.0.1:5432/postgres node scripts/restore-test.mjs backups/socaz-<zeit>.sql.gz` (BETRIEB, Restore-Probe; Kopf-Hash und Anzahl der Beweiskette aus der EXTERNEN Kopie mit `--head-hash`/`--count`). Die Probe belegt die Sicherung, **setzt Staging nicht zurück**. Das Zurücksetzen nach dem Pilot ist das Wiederherstellen in die echte Staging-Datenbank (`gunzip -c backups/socaz-….sql.gz | docker compose exec -T db psql -U socaz -d socaz`) oder das Löschen der Staging-Umgebung.
- Scheduler/Jobs laufen (Frist-Job, Abbuchung, Nachzahlfenster, Erstattung); Überwachung/Fehlermeldungen aktiv (BETRIEB, Überwachung); Notabschaltung Kartenzahlung (Admin 1, `/admin/einstellungen`) einmal geübt.

### 4.2 Konten und Daten
- **Keine echten Zahlungsdaten:** nur Stripe-Testkarten (Abschnitt 5). Kein Spieler gibt eine echte Karte ein.
- Anmeldung: Staging läuft wie Produktion (`NODE_ENV=production`), den Dev-Login gibt es dort nicht (`src/auth.ts`): in der Vorprobe prüfen, dass `/anmelden` keinen Dev-Login zeigt. Wie sich die Freunde anmelden (eigenes Google-Konto vs. angelegte Testkonten) ist eine **Entscheidung des Nutzers** (Frage 2); die Google-Anmeldung braucht für Staging eine eigene Weiterleitungs-Adresse im OAuth-Client (BETRIEB, Google-Anmeldung).
- Der lokale Seed (`scripts/seed-frontend.mts`) läuft nur gegen lokale Entwicklungsdatenbanken (Seed-Guard): **nicht für Staging**. Teams, Halle und Spiele auf Staging werden von Hand oder mit einem eigenen, geprüften Vorbereitungsschritt angelegt (Aufgabe der Technik, vorab als Task).
- Halle: eine echte oder als Test angelegte Halle mit Preis; Zusage der Halle (011) nur, wenn die Halle „Zugang“ hat (Frage 3). Der Betreiber-Zugang wird vom Admin 1 vergeben (BETRIEB, Hallenbetreiber: Zugang je Halle).

### 4.3 Vorab-Fristlauf (wichtig für den Zeitplan)
Die Abbuchung „zur Frist“ liegt 48 Stunden vor Anstoß (012 AC-4); ein Abend kann sie nicht live abwarten. Deshalb:
- **T-3 Tage:** Ein Spiel (Spiel A) mit Anstoß am Pilotabend + mindestens 48 h anlegen; die Spieler hinterlegen Karten und sind bereit, beide Captains bestätigen („Preis bestätigen“). **T-2 Tage** läuft die Abbuchung zur Frist von selbst: die Technik prüft im Testmodus-Dashboard und im Hauptbuch, dass jeder genau einmal belastet wurde (Idempotenz, AC-4, AC-10).
- **Spiel B (Vorab, T-3):** abgelehnte Karte plus vorbereitete Warteliste. Das Nachzahlfenster ist `min(2 h ab Fehler, Anstoß minus 1 h)` (012 AC-6); es kann an einem 3-Stunden-Abend nicht live ablaufen, wenn der Fehler erst am Abend entsteht, und Nachrücker (AC-8) oder Auto-Absage ohne Nachrücker (AC-9) brauchen ein abgelaufenes Fenster. Darum wird Spiel B so angelegt, dass Fehler und Fenster **vor dem Abend** ablaufen. Am Abend wird das **Ergebnis angesehen** (Nachrücker eingesetzt bzw. automatisch abgesagt, Erstattung im Testmodus), nicht live ausgelöst. Wie Spiel B zeitlich gebaut wird, entscheidet die Technik in der Vorbereitung (Task), nicht dieser Plan.
- Am Abend selbst werden Spiele mit Anstoß in unter 48 h (Sofortbuchung, AC-5) und mit Mindestvorlauf (24 h Teamspiel, 1 h Privatspiel) angelegt; der Fehlerfall mit **laufendem** Nachzahlfenster (AC-6, AC-7) wird live gespielt (Abschnitt 6, Block 4).

### 4.4 Technische Vorprobe (T-1)
- Ein Mensch-Durchlauf mit zwei Personen und allen Karten aus Abschnitt 5 (30 Minuten), alle Rollen (auch Betreiber und Gast), Handy (390 px) und Desktop.
- Kontrolle: nirgends Guthaben, Aufladung, Codes (AC-14); Texte nach `begriffe.md` („Spiel ist angesetzt, Halle wird gebucht“, „Preis steht fest“, „Karte ändern“, „Zahlung freigeben“); keine Stundenzahl in Mails und Hilfe; die Zahlungsknöpfe tragen die zentralen Texte (`src/lib/zahlungspflicht-texte.ts`, ENTWURF).
- Messpunkte der Vorprobe (Abschnitt 6a) einmal vorab durchgehen, damit der Abend nur noch Abweichungen findet.

## 5. Stripe-Testkarten (nur Testmodus)
Die Nummern stehen in der Stripe-Dokumentation und werden vor dem Pilot gegen die aktuelle Seite geprüft; sie sind keine Geheimnisse, gehören aber nicht in die Oberfläche.
| Fall | Testkarte (laut Stripe-Doku, vorher prüfen) | Erwartung in der Lobby |
|---|---|---|
| Erfolgreich | 4242 4242 4242 4242 | Karte hinterlegt, Bereit möglich |
| Abgelehnt | 4000 0000 0000 0002 | Fehlerzustand „Karte ändern“ (5b) |
| Authentifizierung nötig (3-D-Secure) | 4000 0027 6000 3184 | Fehlerzustand „Zahlung freigeben“ als einzige Hauptaktion, andere Karte nur eingeklappt |
| Konto nicht gedeckt | 4000 0000 0000 9995 | Fehlerzustand „Karte ändern“ mit Grund „nicht gedeckt“ |
Ablaufdatum in der Zukunft, beliebige Prüfziffer.

## 6. Ablauf des Abends (ca. 3 Stunden)
Der Weg je Spiel: Start/„Spiel suchen“ → Lobby („Dein Stand“) → Karte → Bereit → „Preis bestätigen“ (beide Captains) → Spielübersicht → Spiel → Ergebnis.
| Zeit | Block | Fälle (Vertrag 012/013) |
|---|---|---|
| 0:00 | Begrüßung, Regeln, Abbruchkriterien vorlesen, Protokollperson bestimmt | – |
| 0:15 | **Block 1 Einstieg ohne Erklärung** | Spieler melden sich an (Einladung/Onboarding), finden „Spiel suchen“ (drei Wege: Teamspiel, Privatspiel, Turnier), `/app` „Meine Spiele“ und „Dein Stand“, öffnen die Lobby; Messung: findet jeder die eine Hauptaktion ohne Hilfe? (013 AC-7) |
| 0:30 | **Block 1b Gast** (Namen-PRs A bis D gemergt; vor dem Abend HTML-Stichprobe je Fläche als Gast und als Betreiber in der Vorprobe) | Gast öffnet Start, offene Lobby, Spiel: nur Zahlen und Initialen, kein Zahlstatus, „Anmelden“ als Hauptaktion (AC-12/AC-20 für Dritte neutral) |
| 0:45 | **Block 2 Karte und Bereit** | Karte hinterlegen mit Mandat sichtbar vor dem Klick (AC-1); „Bereit“ ohne Karte nicht möglich, mit Karte möglich (AC-2); Anteil ändert sich bei Beitritt oder Verlassen ohne Geldbewegung (AC-3); **Karte ändern** |
| 1:15 | **Block 3 Preis steht fest und Abbuchung** | Beide Captains „Preis bestätigen und zahlungspflichtig zusagen“ (ENTWURF, nur bei echter Abbuchung), Zustand „Preis steht fest“; Sofortbuchung bei Anlage unter 48 h (AC-5); Spiel A (T-3) zeigt das Ergebnis der Frist-Abbuchung (AC-4); Beleg und Mindestbetrag 0,50 EUR (AC-19) |
| 1:45 | Pause | – |
| 2:00 | **Block 4 Fehlerfälle** (Abschnitt 6b) | abgelehnte Karte, Freigabe (3-D-Secure), abgelaufenes Fenster; Captain-Leiste mit „Anteil übernehmen“ (AC-13); Spiel B ansehen (AC-8/AC-9, vorbereitet) |
| 2:30 | **Block 5 Spiel, Ergebnis, Absage und Erstattung** | Spielübersicht (Ort, Notfallnummer), Ergebnis eintragen und vom anderen Captain bestätigen lassen, Wertung aufdecken; Absage durch Berechtigte (nach der ersten Abbuchung nur Admin 1, AC-21), Erstattung auf die Karte, Übernahme-Erstattung beim Übernehmer (AC-14 aus 012); Auto-Absage ohne Nachrücker (Spiel B, nur Ansicht) |
| 2:50 | Abschluss | Feedback-Runde (je Person zwei Minuten), Liste durchgehen, Schweregrade bestätigen, Aufräumen ankündigen |
Reihenfolge der Blöcke ist verhandelbar, solange Block 4 und 5 nach den Abbuchungen kommen.

### 6a. Messpunkte (Handy 390 px, dazu Desktop 1280)
Jede Messung geht als Zeile in die Feedback-Liste (Spalte „Messwert“), nicht als Umfrage.
| Messpunkt | Wie | Soll |
|---|---|---|
| Touch-Ziele | Spielleitung tippt die Hauptaktion und die Knöpfe der Lobby mit Daumen; Protokoll notiert Fehltreffer | Knöpfe mindestens 44 px (AC-3, AC-30), keine Fehltreffer an eng stehenden Knöpfen |
| Laden | Zeit vom Tippen auf einen Lobby-Link bis „Dein Stand“ sichtbar, im Hallen-Mobilfunk (Stoppuhr am Handy, drei Messungen je Person) | Meldemodus (kein hartes Soll, CI-Messung ist ebenfalls Meldemodus); Auffälligkeit ab 3 Sekunden notieren |
| Kontrast im Hallenlicht | Lesbarkeit von Hauptaktion, Zustandswörtern und Ampelpunkten bei Hallenbeleuchtung/Tageslicht, hell und dunkel | AC-27 ist in der CI gemessen (4,5:1 Text, 3:1 Zeichen); der Abend prüft den Augenschein, nicht die Zahl |
| Knopf vor der Hydration | beim Öffnen der Lobby sofort tippen | nichts wird als Link/GET gesendet, der Knopf ist kurz gesperrt (Wächter `forms-action`); Fehltreffer notieren |
| Scrollen/Länge | Lobby auf 390 px: wie weit bis zur Hauptaktion, wie lang die Seite (Lauf 1: ca. 2600 px) | Hauptaktion ohne Suchen auffindbar; Länge als Wunsch notieren (DESIGN-F) |
| Umbruch/Überlauf | alle Seiten des Abends auf 390 px: kein seitliches Scrollen, Schrift mindestens 12 px | AC-30 e (ui-seiten.spec) |

### 6b. Fehlerfälle (Lobby 5b, Abschnitt 5)
| Fall | Auslöser | Was der Betroffene sieht | Was der Captain sieht | live/vorbereitet |
|---|---|---|---|---|
| Karte fehlt | Spieler ist beigetreten, keine Karte | „Dein Stand“: „Nächster Schritt: Karte hinterlegen“; Bereit gesperrt | Teamstand „nicht alle Karten hinterlegt“ | live |
| Freigabe nötig | Testkarte 3-D-Secure | „Zahlung freigeben“ (einzige Hauptaktion), „Stattdessen eine andere Karte hinterlegen“ eingeklappt, Frist | Zeile „Abbuchung fehlgeschlagen“ mit Frist des Spielers bzw. „Anteil übernehmen“ | live (Fenster läuft) |
| Abgelehnt | Testkarte abgelehnt/nicht gedeckt | Grund im Klartext, „Karte ändern“ als einzige Hauptaktion | wie oben | live (Fenster läuft) |
| Fenster abgelaufen | Fenster vorbei, keine Lösung | Grund, „Das Zeitfenster ist abgelaufen. Dein Platz wird neu vergeben“, keine Aktion | Zeile „Der Platz wird neu vergeben“ | Spiel B, nur Ansicht |
| Nachrücker/Auto-Absage | Fenster abgelaufen, Warteliste | Nachrücker eingesetzt bzw. Spiel abgesagt, Erstattung | Meldung | Spiel B, nur Ansicht |
Erwartung in jedem Fall: genau EINE orange Hauptaktion je Ansicht, Dritte sehen nur „Zahlung ausstehend“ ohne Grund (AC-6, AC-12, AC-20).

## 7. Feedback ohne Formulare
Eine einfache Liste, von der Protokollperson auf dem Handy oder Papier geführt; keine Umfrage-Tools, keine Konten bei Dritten.
| Zeit | Seite | Rolle | Gerät | Was ist passiert / was war unklar | Messwert | Schwere |
|---|---|---|---|---|---|---|
Schwere: **S1** Geld/Daten falsch oder Datenleck (Abbruch), **S2** Ablauf blockiert, **S3** unklar/störend, **S4** Schönheit/Wunsch. Screenshots nur von Staging-Seiten; keine Namen echter Personen in Dateinamen.

## 8. Abbruchkriterien (Spielleitung entscheidet sofort)
- **Falsche Abbuchung:** doppelt belastet, falscher Betrag, Abbuchung ohne „Preis steht fest“ oder ohne Karte (S1).
- **Datenleck:** Gast, Hallenbetreiber oder Dritter sieht Namen, Zahlstatus, Grund einer Abbuchung oder Kartendaten, die er nicht sehen darf (S1).
- **Dauerfehler:** Seite/Aktion fällt länger als 10 Minuten aus oder dieselbe Fehlermeldung bei drei Personen (S2).
- **Live-Berührung:** irgendwo erscheint ein Live-Stripe-Schlüssel oder eine echte Karte wird versucht.
- **Falscher Zustand der Schalter:** Staging zeigt „kostenlos“ bei einem Spiel mit Preis (Schalter falsch) oder `PAYMENTS_FAKE`-Knöpfe („(Test)“) erscheinen.
- Bei Abbruch: Abbuchung/Webhooks im Testmodus stoppen (Technik; Notabschaltung Kartenzahlung), Notiz mit Uhrzeit, kein Weiterspielen; Auswertung am nächsten Tag.

## 9. Was NICHT getestet wird
- **Live-Zahlung** und Live-Stripe-Konfiguration (G9-012, G11-012): erst nach Pilot und Rechtsprüfung.
- **Rechtstexte** (AGB, Datenschutz, Impressum, Hausordnung), Mandatstext rechtlich, Zahlungs-Knopftexte nach § 312j (ENTWURF), Steuer, Rechnungen (G1-012 bis G7-012, G12 bis G15): bleiben bei Anwalt/Steuerberater.
- Admin-Bereich (M7) über die Pilot-Aufgaben hinaus, Hallen-Dashboard (011) über die Zusage-Strecke hinaus, Firmenteams (014), Ligen (zurückgestellt), Turnier-Ablauf im Pilot (optional, nur wenn Zeit bleibt).
- Lasttest, Sicherheitstest (laufen im Review der Agenten), Barrierefreiheits-Audit (läuft per Playwright/Impeccable), Produktions-Datenbankrollen (G25-009).

## 10. Datenschutz, Sichtbarkeit und Aufräumen
- **Sichtbarkeit je Rolle (Entscheid t2q 2026-11-24, FEHLT-NOCH: Sichtbarkeit von Spielernamen):** Gäste und reine Hallenbetreiber sehen Autor- und Spielernamen nicht im Klartext und ohne Link auf `/spieler`. Je Fläche gilt: **Lobby** (#302): Gast Initialen, Betreiber „Spieler N“ (kein Name, keine Initialen); **Kommentare** (PR A, #306): Gast und Betreiber beide Initialen ohne Link; angemeldete Nutzer sehen Klarnamen. Das Spielerprofil `/spieler/[id]` ist für Gäste nicht öffentlich, die Namenssuche gilt nur angemeldet.
- **Stand der Umsetzung (2026-11-24):** Lobby und Teamkarten für den Betreiber namenfrei und Torjäger-Block nur für angemeldete Mitglieder (#302), Kommentare (**PR A**, #306: Gäste und reine Betreiber Initialen ohne Link, Hinweistext beim Schreiben), Listen (**PR B**, #315: Rangliste, Spielerliste, Mitspieler, Turnier, offene Lobby, Einladung), Spielbericht und `/api/spiele/[id]/live` (**PR C**, #318), Spielerprofil nur für Angemeldete (**PR D**, #320, noindex). Offen und bewusst akzeptiert: Nachläufer Backlog 242 (Sortierung nach Namen, Betreiber zugleich Team-Admin, „ß“) und 243 (Bildcache, `/api/media` öffentlich per UUID, Produktfrage).
- **Folge für den Abend:** Das **Gäste-Szenario** (Block 1b) und die Betreiber-Prüfung über alle Flächen sind freigegeben. In der Vorprobe (T-1) je Fläche eine HTML-Stichprobe als Gast und als Betreiber (keine Namen, keine Links auf `/spieler`); gefundene Lücken sind S1 und werden vor dem Abend behoben.
- Nur Testkarten, keine echten Zahlungsdaten; es gibt keine Kartennummern im System (nur Stripe-Zahlungsmittel-ID und letzte vier Ziffern der Testkarte).
- Die Teilnehmenden werden vorab informiert, was protokolliert wird (Uhrzeit, Seite, Rolle, Gerät) und dass Klarnamen für angemeldete Teilnehmende sichtbar sind; ob und wie eine formale Einwilligung nötig ist, ist eine Rechtsfrage (Frage 4), die dieser Plan nicht beantwortet.
- Nach dem Abend (T+1):
  - Auswertung der Liste; danach Feedback-Notizen ohne Personenbezug im Repo (`docs/retros/` oder Pilot-Bericht), nie Namen oder E-Mails.
  - Staging-Datenbank aus der Sicherung vor dem Pilot wiederherstellen (BETRIEB) oder die Staging-Umgebung löschen; Test-Kunden in Stripe (Testmodus) bleiben harmlos, können aber im Dashboard gelöscht werden.
  - Testkonten: Konto löschen ist bei offenen Spielen mit Abbuchung nur über den Support möglich (BETRIEB, Konto-Löschung bei laufender Abbuchung); deshalb Spiele vorher beenden/absagen.
  - Webhook-Secret Test und Testschlüssel rotieren, falls sie in Chats gelandet sein könnten.

## 11. Offene Fragen (für Orchestrator/Nutzer, nicht von Agenten beantwortet)
1. Termin und Halle für den Pilot; Teilnehmerzahl 8 bis 10 und Dauer ein Abend bestätigen.
2. Anmeldung der Freunde: eigene Google-Konten (echte Namen auf Staging) oder eigens angelegte Testkonten? (Datenschutzfrage für den Nutzer.)
3. Halle mit „Zugang“ (Zusage der Halle, 011) oder ohne? Ohne Zusage entfällt die Zusage-Strecke; die Betreiber-Rolle prüft dann nur die namenfreie Sicht (dafür braucht die Person trotzdem einen Betreiber-Zugang an irgendeiner Halle).
4. Information/Einwilligung der Teilnehmenden (Protokoll, Klarnamen für Angemeldete): Rechtsfrage (Anwalt), nicht von Agenten zu beantworten.
5. Wer ist „Admin 1“ am Abend (Absage nach der ersten Abbuchung, AC-21)?
6. Staging-Domain, `APP_URL` und Stripe-Testmodus-Zugang beschaffen (Namen in `FEHLT-NOCH.md`, Werte nie im Repo).
7. Zugangsschutz für Staging (nur Pilotgruppe) gewünscht, oder reicht Einladung per Link?

## 12. Zeitplan (Vorschlag, T = Pilotabend)
| Zeitpunkt | Schritt | Verantwortlich |
|---|---|---|
| T-14 | Abhängigkeiten aus Abschnitt 1 erfüllt (Namen-PRs sind gemergt; offen: P1-3 `btn` und Impeccable Lauf 3, siehe `m3-abschluss-pilot-check.md`), Termin/Halle fixiert, Fragen 1 bis 3 beantwortet, NEEDS-USER-Paket (Abschnitt 15) abgehakt | Orchestrator, Nutzer |
| T-7 | Staging aufgesetzt, Testmodus, Schalter, Backup-Test, Konten/Teams angelegt, Betreiber-Zugang vergeben | Technik, Admin 1 |
| T-3 | Spiel A (Frist-Abbuchung) und Spiel B (abgelehnte Karte, Warteliste) angelegt | Technik, 2 bis 3 Spieler |
| T-2 | Frist-Abbuchung Spiel A prüfen (Dashboard, Hauptbuch); Spiel B: Fehler, Fenster, Nachrücker/Absage beobachten | Technik |
| T-1 | Sicherung, Restore-Probe, Vorprobe 30 Minuten mit zwei Personen, Checkliste | Technik, Spielleitung |
| T | Pilotabend (ca. 3 Stunden) | Spielleitung, Protokoll |
| T+1 | Aufräumen, Auswertung der Liste, Pilot-Bericht (Funde nach Schwere, Backlog-Einträge) | Orchestrator, Task Manager |
| T+3 | Gate G (Abschnitt 14) | Nutzer |

## 13. Checkliste
**Vorher:** Abhängigkeiten gemergt (Abschnitt 1, P1-3 `btn`, Impeccable Lauf 3) · Staging mit Testschlüsseln, Webhook-Test grün · `payments_enabled` und `card_payments_enabled` AN, `PAYMENTS_FAKE` nicht gesetzt (Prüfung) · Sicherung unmittelbar vorher und Restore-Probe · Spiel A und Spiel B (T-3) angelegt · Vorprobe fertig (alle Rollen, 390 px) · Rollen verteilt (inkl. Betreiber, Gast) · Feedback-Liste bereit · Testkarten aus Abschnitt 5 aktuell · Abbruchkriterien ausgedruckt/geteilt · Teilnehmende informiert.
**Während:** Protokoll läuft · Stripe-Dashboard (Testmodus) offen · Uhrzeit je Eintrag · Messpunkte (Abschnitt 6a) notiert · bei S1 sofort Abbruch (Abschnitt 8) · keine Live-Schlüssel sichtbar.
**Nachher:** Feedback-Liste gesichert (ohne Personenbezug) · Spiele beendet/abgesagt, Erstattungen im Testmodus geprüft · Staging aus der Sicherung vor dem Pilot zurückgesetzt oder gelöscht · Schlüssel rotiert, falls nötig · Bericht an den Nutzer.

## 14. Gate G (Nutzer)
- **Entscheidung:** Ja/Nein für M4 bis M7 (013 AC-8: „Feedback liegt vor; M4 bis M7 starten erst danach“).
- Grundlage: Pilot-Bericht mit Anzahl Funde je Schwere, offene S1/S2 mit Plan, Aussage, ob die Kartenfälle (Abschnitt 6, Block 3 bis 5) ohne Fehler liefen, Auswertung der Messpunkte (6a).
- „Ja“ → M4 beginnt; „Ja mit Änderungen“ → Änderungsliste, die betroffenen Seiten zuerst, neue Mini-Abnahme; „Nein“ → Gründe, zurück zu M3 (Impeccable `critique` neu), neuer Pilot.
- Der Pilot ersetzt weder den Live-Go-live noch die Rechtsprüfung; beides steht im `GO-LIVE-AUDIT.md`.

## 15. NEEDS-USER-Paket (Checkliste für den Nutzer)
Nur NAMEN und Entscheidungen; Werte (Schlüssel, Passwörter, Adressen) gehören nie ins Repo oder in den Chat.
### 15.1 Beschaffen und entscheiden (vor T-14 bis T-7)
- [ ] **Halle und Termin** festlegen (Frage 1, 3): Datum, Uhrzeit, Ort; Halle als Test angelegt oder echte Halle mit Preis; Halle mit oder ohne „Zugang“.
- [ ] **Teilnehmer 8 bis 10** zusagen lassen, Rollen verteilen: Captain 1 und 2, Gast, Hallenbetreiber-Person, Protokoll, Admin 1 (Frage 5).
- [ ] **Stripe-Testmodus-Zugang:** im Stripe-Dashboard im Testmodus `STRIPE_SECRET_KEY` (`sk_test_`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_`) und für Staging einen Webhook-Endpunkt `https://<staging-domain>/api/stripe/webhook` mit eigenem `STRIPE_CARD_WEBHOOK_SECRET` bereitstellen und in der Staging-Umgebung eintragen (nie ins Repo). Testkarten aus Abschnitt 5 gegen die Stripe-Seite prüfen.
- [ ] **Staging-Server, Domain, `APP_URL`** bereitstellen; **Google-OAuth-Client** für Staging (zusätzliche Weiterleitungs-Adresse) oder Testkonten-Weg wählen (Frage 2, 6).
- [ ] **Admin 1** für Staging festlegen (`OWNER_EMAIL`, `scripts/set-owner.mjs`, BETRIEB), Zwei-Faktor am Google-Konto.
- [ ] **Backup-Ziel** für Staging; die Hoster-Sicherung für den E8-Probelauf bereitstellen (das Werkzeug ist in der CI belegt, offen ist nur der Lauf mit der echten Sicherung), den Lauf führt der Nutzer aus (Anleitung BETRIEB).
- [ ] **Zugangsschutz** für Staging entscheiden (Frage 7).
- [ ] **Handys und Geräte:** je Spieler ein eigenes Handy (Android und iPhone gemischt, nach Möglichkeit), ein zweites Gerät ohne Konto für den Gast, ein Laptop für die Spielleitung/Technik; geladen, Mobilfunkempfang in der Halle geprüft.
- [ ] **Zeitfenster:** T-3 Spiel A/B anlegen lassen, T-2 Abbuchung prüfen lassen, T-1 Vorprobe, Abend ca. 3 Stunden, T+1 Aufräumen, T+3 Gate G.
- [ ] **Teilnehmende informieren:** Testmodus, keine echten Zahlungen, was protokolliert wird, Klarnamen für Angemeldete sichtbar (Wortlaut: Nutzer; die Rechtsfrage dazu steht unten).
### 15.2 Rechtsfragen
**Vor dem Pilot zu klären (Nutzer entscheidet, Agenten beantworten sie nicht):**
- [ ] Information/Einwilligung der Teilnehmenden zu Protokoll und sichtbaren Klarnamen (Frage 4): ob eine mündliche/schriftliche Information genügt oder vorher ein Anwalt gefragt wird. Die Rechtsliste (FEHLT-NOCH, Sichtbarkeit von Spielernamen) führt die Namensanzeige als Hinweis, **kein Blocker**; die Entscheidung für den Freundeskreis liegt beim Nutzer.
- [ ] Die Pilotgruppe weiß, dass die Zahlungs- und Zusagetexte **Entwürfe** sind (§ 312j BGB, Mandat) und dass nur Testkarten laufen.
**Nicht blockierend für den Pilot (bleiben für den Go-live, Abschnitt 9):**
- AGB, Datenschutzerklärung, Impressum, Hausordnung (Endfassung), Mandatstext und „Anteil übernehmen“-Zusatz (Anwalt), Button-Lösung § 312j (Anwalt), Stripe als Auftragsverarbeiter (G1-012), Chargeback-Prozess (G4-012), Preisgelder/Glücksspielrecht (G7-012), Unter-16-Wiederanmeldung (G16-013), Begriffsabweichungen in Rechtstexten (G17-013).
- Steuer und Rechnungen (E4, G14-012), Partnervertrag Hallen (E5), Stripe Connect/Auszahlung (E3, E6, G5-012, G6-012), Firmenteams (G15-012).
- Betrieb: DB-Rollenmodell Produktion (G25-009), Beweisprotokoll-Schalter in Produktion (G26-009), Domain/Mail/Backup-Ziel der Produktion, Hero-Video-Lizenz (Standbild bis dahin), Markenprüfung Look.
### 15.3 Am Pilotabend vom Nutzer erwartet
- Spielleitung, Entscheidung über Abbruch (Abschnitt 8) und die Feedback-Runde; Gate G nach dem Bericht (T+3).
