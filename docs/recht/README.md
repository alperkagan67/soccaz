# docs/recht: Fakten für die Anwaltsprüfung

Stand: `main` `b02fa92` (2026-11-25; Zeilenverweise gegen `b02fa92` geprüft: seit `8f0f333` änderten sich nur Datenschutz, AGB und `zahlungen-aus.ts`, ohne Zeilenverschiebung der zitierten Stellen) · Verfasser: worker-2 · Auftrag: Nutzer (über t2q/t2s) · Reviewer: w1.

**Zweck:** Der Anwalt soll Impressum, Datenschutzerklärung, AGB, Hausordnung und Hilfe von Soccaz prüfen. Diese Ablage liefert ihm die **Tatsachen**: was die App speichert, wer es sieht, wie lange, wo, und welche Dienstleister beteiligt sind, plus die Seiten als PDF im Stand von `main`.

**Das ist Fakten-Doku, KEINE Rechtsbewertung.** Kein Satz hier sagt, etwas sei „rechtmäßig“, „zulässig“ oder „DSGVO-konform“. Es steht nur, was im Quelltext und in den Betriebsunterlagen steht. Wo der Code keine Regel hat, steht **NICHT GEREGELT**; wo ich etwas nicht belegen konnte, steht **zu prüfen**. **Nichts wurde gegen eine laufende Instanz geprüft.** Öffentliches Repository: keine Zugangsdaten, keine lokalen Pfade, keine privaten Adressen; die Betreiberangaben (Name, Anschrift, E-Mail) stehen bewusst als `[PLATZHALTER]`.

## Inhalt
| Datei | Was |
|---|---|
| `datenliste.md` | Datenkategorien: welche Daten (Tabelle.Feld), Zweck, **wer sie sieht**, **wie lange**, **wo**; Cookies/Browser-Speicher, Server-Protokolle, Sicherungen, Export, Konto-Löschung |
| `dienstleister.md` | jeder Dienstleister und jede externe Verbindung (Zweck, Daten, wann, Standort, Vertragsstatus) |
| `pdf/` | die fünf Seiten als PDF im Stand von `main` (Commit-Hash im Dateinamen); Stand nach dem Merge des Datenschutz-/AGB-Textes (#412) |

## Stand und Zustand der PDFs
Die PDFs zeigen die Seiten so, wie sie am **12.12.** laufen sollen: **Zahlungen AUS** (beide Schalter), **`TURNIER_ONLY=1`**, **Google- und Apple-Anmeldung AN**. Für die Darstellung der Apple-Texte wird `APPLE_LOGIN_ENABLED=1` mit **Dummy-Werten** gesetzt (kein echtes Apple-Konto, nur damit der Text erscheint); zusätzlich eine Variante **Apple AUS**, wenn der Text abweicht. Die `OPERATOR_*`-Angaben fehlen absichtlich: die Seiten zeigen sie als **[PLATZHALTER]**. Erzeugt aus einem Produktions-Build von `main` `b02fa92` (nach dem Merge von Datenschutz/AGB, #412). **Datenbank-Zustand:** beide Zahlungsschalter (`payments_enabled`, `card_payments_enabled`) AUS; **Umgebung:** `TURNIER_ONLY=1`, `ENABLE_SCHEDULER=0`, Apple-Variante mit `APPLE_LOGIN_ENABLED=1`, `AUTH_APPLE_ID` und `AUTH_APPLE_SECRET` als **Dummy-Werte nur für die Darstellung** (kein echtes Apple-Konto). Ohne `OPERATOR_*` zeigen die Seiten **[PLATZHALTER]**. Die Dateien tragen den Hash im Namen: `<seite>-apple-an-b02fa92.pdf` und, weil nur der Datenschutztext abweicht, `datenschutz-apple-aus-b02fa92.pdf` (Abweichung: ohne Apple entfallen die Nennung von Apple und der Hinweis auf die Weiterleitungsadresse; Impressum, AGB, Hausordnung, Hilfe sind in beiden Varianten textgleich).

## PDF erzeugen (Schritte, kein Skript im Repository)
1. Eigenen Worktree auf aktuellem `main` anlegen (`node scripts/worktree.mjs create <branch> <worker>`), dort `npm run db:migrate`.
2. In der Worker-Datenbank `payments_enabled` und `card_payments_enabled` in der Tabelle `settings` auf `false` setzen.
3. Build: `APPLE_LOGIN_ENABLED=1 AUTH_APPLE_ID=<dummy> AUTH_APPLE_SECRET=<dummy> TURNIER_ONLY=1 npm run build`.
4. Start auf dem Worker-Port: `ENABLE_SCHEDULER=0 APPLE_LOGIN_ENABLED=1 AUTH_APPLE_ID=<dummy> AUTH_APPLE_SECRET=<dummy> TURNIER_ONLY=1 NODE_ENV=production npx next start -p <Worker-Port>`.
5. Mit Playwright (Chromium) je Seite `/impressum`, `/datenschutz`, `/agb`, `/hausordnung`, `/hilfe` öffnen (`waitUntil: networkidle`), auf der Hilfe alle `details` aufklappen, Medium `print`, `page.pdf` mit A4, `printBackground`, Rand 18 mm oben/unten, 16 mm seitlich.
6. Server beenden, ihn **ohne** `APPLE_LOGIN_ENABLED` neu starten, Schritt 5 wiederholen und die Texte vergleichen (`innerText`); nur abweichende Seiten als „apple-aus“ ablegen.
7. Hash des `main`-Stands im Dateinamen und in dieser README nachtragen.

## Offene Fragen an den Anwalt
Die Fragen stehen hier, weil die Antwort die Texte ändern kann; entschieden wird nichts von Agenten.
1. **Auftragsverarbeitung:** Verträge mit Hetzner (Server und Storage Box), Google, Apple, ggf. Resend, Sentry, ALL-INKL: für alle **OFFEN** (`dienstleister.md`).
2. **Drittlandtransfer:** Google, Apple (Anmeldung; Google-Bildserver für das Profilbild), Sentry, Resend, Stripe (später), Browser-Push-Dienste: Verarbeitung außerhalb der EU möglich; Einordnung **zu prüfen**.
3. **Aufbewahrungsfristen:** im Code nur teilweise geregelt (gelesene Mitteilungen 90 Tage, Einladungen 30 Tage nach Ablauf, Hallen-Einladungsadresse 44 Tage, Backups 14 Tage). **NICHT GEREGELT:** `audit_log`, `delivery_log`, `user_warnings`, `match_clips`, ungelesene Mitteilungen, Spiele und Ergebnisse, anonymisierte Konten (bleiben als Zeile), Zahlungs-/Rechnungsbelege (Steuerberater), `payment_erasure_tasks`, Medien (`removed`-Bilder bleiben in der Datenbank), Spiel-Einladungen. Dauer des Begründungs-Klartexts im Beweisprotokoll: offene Rechtsfrage R3 (Standard: aus).
4. **Minderjährige / Altersgrenze:** Mindestalter 16 (Hilfe, AGB). Das Geburtsdatum wird nur geprüft und nicht gespeichert; gespeichert wird der Zeitpunkt der Bestätigung. Unter 16: das Konto wird hart gelöscht. Ob das und der Nachweis genügen: **zu prüfen**; Eltern-Einwilligung für 16/17: nicht im Code.
5. **Fotos und Initialen:** Gast sieht Initialen statt Namen; Profile sind **standardmäßig öffentlich** für Angemeldete (`profile_public = true`); Spielfotos sind abgeschaltet; Profilbilder: jeder Angemeldete mit der Bild-Kennung kann sie abrufen (keine Besitzerprüfung). Einordnung **zu prüfen**.
6. **Impressum-Pflichtangaben:** Name, Anschrift, E-Mail sind Platzhalter bis der Betreiber sie einträgt (Go-live-Prüfpunkt `smoke.mjs --go-live`); weitere Pflichtangaben (Steuer-ID, Streitbeilegung, Aufsichtsbehörde) stehen als Hinweis, ihre Notwendigkeit: **zu prüfen**.
7. **Teilnahmegebühr-Sätze:** Hinweissatz (Hilfe, Turnierseite): „Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.“ (`ZAHLUNGEN_AUS_HINWEIS`) gegenüber AGB 3: „Eine Teilnahmegebühr für ein Turnier vereinbaren Veranstalter und Teams direkt miteinander, außerhalb von Soccaz. Soccaz ist an dieser Vereinbarung und Zahlung nicht beteiligt.“ (`ZAHLUNGEN_AUS_AGB_TEXT`). Sinngemäß gleich, **nicht wortgleich**; **keine Änderung**, der Nutzerwortlaut ist bindend. Ob der Unterschied eine Rolle spielt: **zu prüfen**.
8. **Cookies und Browser-Speicher:** nur notwendige Cookies laut Datenschutzseite; ob localStorage-Schlüssel, Service Worker und der sessionStorage-Entwurf eine Einwilligung brauchen, **zu prüfen**.
9. **Streams (Twitch, YouTube, Kick):** laden erst nach Klick; IP-Adresse geht dann an den Anbieter: Einordnung **zu prüfen**.
10. **Betreiber-Sicht:** Hallenbetreiber sehen keine Spielernamen; Veranstalter sehen Namen (Angemeldete-Sicht): eigene Veranstalter-Regel **NICHT GEREGELT**.
11. **Server-Protokolle:** Webserver ohne konfiguriertes Zugriffsprotokoll; Netz- und Firewall-Protokolle beim Hoster: **zu prüfen**.

**Hinweis zum Stand:** Zeilennummern (`Pfad:Zeile`) driften; beim PDF-Nachlauf werden `main`-Hash, Datum und Verweise auf den dann aktuellen Stand gebracht.

12. **Wortlaut Geburtsdatum:** Die Datenschutzseite nennt unter „Konto“ „Geburtsdatum (nur zur Altersprüfung, nicht öffentlich)“; im Code wird das Geburtsdatum **nicht gespeichert** (nur die Bestätigung als Zeitpunkt). Ob der Satz das klar genug sagt: **zu prüfen**; keine Änderung, Nutzerwortlaut bindend.

## Liste der Punkte „NICHT GEREGELT“ / „OFFEN“ / „zu prüfen“
Sie stehen in `datenliste.md` und `dienstleister.md` in der jeweiligen Zeile und sind oben unter „Offene Fragen“ zusammengefasst.
