# docs/recht: Fakten für die Anwaltsprüfung

Stand: `main` `8f0f333` (2026-11-25) · Verfasser: worker-2 · Auftrag: Nutzer (über t2q/t2s) · Reviewer: w1.

**Zweck:** Der Anwalt soll Impressum, Datenschutzerklärung, AGB, Hausordnung und Hilfe von Soccaz prüfen. Diese Ablage liefert ihm die **Tatsachen**: was die App speichert, wer es sieht, wie lange, wo, und welche Dienstleister beteiligt sind, plus die Seiten als PDF im Stand von `main`.

**Das ist Fakten-Doku, KEINE Rechtsbewertung.** Kein Satz hier sagt, etwas sei „rechtmäßig“, „zulässig“ oder „DSGVO-konform“. Es steht nur, was im Quelltext und in den Betriebsunterlagen steht. Wo der Code keine Regel hat, steht **NICHT GEREGELT**; wo ich etwas nicht belegen konnte, steht **zu prüfen**. **Nichts wurde gegen eine laufende Instanz geprüft.** Öffentliches Repository: keine Zugangsdaten, keine lokalen Pfade, keine privaten Adressen; die Betreiberangaben (Name, Anschrift, E-Mail) stehen bewusst als `[PLATZHALTER]`.

## Inhalt
| Datei | Was |
|---|---|
| `datenliste.md` | Datenkategorien: welche Daten (Tabelle.Feld), Zweck, **wer sie sieht**, **wie lange**, **wo**; Cookies/Browser-Speicher, Server-Protokolle, Sicherungen, Export, Konto-Löschung |
| `dienstleister.md` | jeder Dienstleister und jede externe Verbindung (Zweck, Daten, wann, Standort, Vertragsstatus) |
| `pdf/` | die fünf Seiten als PDF im Stand von `main` (Commit-Hash im Dateinamen); **folgt nach dem Merge des Datenschutz-/AGB-Textes von w4** (`feat/datenschutz-tatsache`) |

## Stand und Zustand der PDFs (geplant)
Die PDFs zeigen die Seiten so, wie sie am **12.12.** laufen sollen: **Zahlungen AUS** (beide Schalter), **`TURNIER_ONLY=1`**, **Google- und Apple-Anmeldung AN**. Für die Darstellung der Apple-Texte wird `APPLE_LOGIN_ENABLED=1` mit **Dummy-Werten** gesetzt (kein echtes Apple-Konto, nur damit der Text erscheint); zusätzlich eine Variante **Apple AUS**, wenn der Text abweicht. Die `OPERATOR_*`-Angaben fehlen absichtlich: die Seiten zeigen sie als **[PLATZHALTER]**. Erzeugung (Schritte, nicht als Skript im Repository): siehe Abschnitt „PDF erzeugen“ unten (wird mit den PDFs ergänzt).

## Offene Fragen an den Anwalt
Die Fragen stehen hier, weil die Antwort die Texte ändern kann; entschieden wird nichts von Agenten.
1. **Auftragsverarbeitung:** Verträge mit Hetzner (Server und Storage Box), Google, Apple, ggf. Resend, Sentry, ALL-INKL: für alle **OFFEN** (`dienstleister.md`).
2. **Drittlandtransfer:** Google, Apple (Anmeldung; Google-Bildserver für das Profilbild), Sentry, Resend, Stripe (später), Browser-Push-Dienste: Verarbeitung außerhalb der EU möglich; Einordnung **zu prüfen**.
3. **Aufbewahrungsfristen:** im Code nur teilweise geregelt (gelesene Mitteilungen 90 Tage, Einladungen 30 Tage nach Ablauf, Hallen-Einladungsadresse 44 Tage, Backups 14 Tage). **NICHT GEREGELT:** `audit_log`, `delivery_log`, `user_warnings`, `match_clips`, ungelesene Mitteilungen, Spiele und Ergebnisse, anonymisierte Konten (bleiben als Zeile), Zahlungs-/Rechnungsbelege (Steuerberater), `payment_erasure_tasks`, Medien (`removed`-Bilder bleiben in der Datenbank), Spiel-Einladungen. Dauer des Begründungs-Klartexts im Beweisprotokoll: offene Rechtsfrage R3 (Standard: aus).
4. **Minderjährige / Altersgrenze:** Mindestalter 16 (Hilfe, AGB). Das Geburtsdatum wird nur geprüft und nicht gespeichert; gespeichert wird der Zeitpunkt der Bestätigung. Unter 16: das Konto wird hart gelöscht. Ob das und der Nachweis genügen: **zu prüfen**; Eltern-Einwilligung für 16/17: nicht im Code.
5. **Fotos und Initialen:** Gast sieht Initialen statt Namen; Profile sind **standardmäßig öffentlich** für Angemeldete (`profile_public = true`); Spielfotos sind abgeschaltet; Profilbilder: jeder Angemeldete mit der Bild-Kennung kann sie abrufen (keine Besitzerprüfung). Einordnung **zu prüfen**.
6. **Impressum-Pflichtangaben:** Name, Anschrift, E-Mail sind Platzhalter bis der Betreiber sie einträgt (Go-live-Prüfpunkt `smoke.mjs --go-live`); weitere Pflichtangaben (Steuer-ID, Streitbeilegung, Aufsichtsbehörde) stehen als Hinweis, ihre Notwendigkeit: **zu prüfen**.
7. **Teilnahmegebühr-Satz:** „Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.“ und AGB 3 „Die Nutzung von Soccaz ist kostenlos.“ sowie AGB 4 „Absage und Abmeldung“ sind als **[ENTWURF]** markiert (Nutzerliste 3a); Bestätigung steht aus.
8. **Cookies und Browser-Speicher:** nur notwendige Cookies laut Datenschutzseite; ob localStorage-Schlüssel, Service Worker und der sessionStorage-Entwurf eine Einwilligung brauchen, **zu prüfen**.
9. **Streams (Twitch, YouTube, Kick):** laden erst nach Klick; IP-Adresse geht dann an den Anbieter: Einordnung **zu prüfen**.
10. **Betreiber-Sicht:** Hallenbetreiber sehen keine Spielernamen; Veranstalter sehen Namen (Angemeldete-Sicht): eigene Veranstalter-Regel **NICHT GEREGELT**.
11. **Server-Protokolle:** Webserver ohne konfiguriertes Zugriffsprotokoll; Netz- und Firewall-Protokolle beim Hoster: **zu prüfen**.

**Hinweis zum Stand:** Zeilennummern (`Pfad:Zeile`) driften; beim PDF-Nachlauf werden `main`-Hash, Datum und Verweise auf den dann aktuellen Stand gebracht.

## Liste der Punkte „NICHT GEREGELT“ / „OFFEN“ / „zu prüfen“
Sie stehen in `datenliste.md` und `dienstleister.md` in der jeweiligen Zeile und sind oben unter „Offene Fragen“ zusammengefasst.
