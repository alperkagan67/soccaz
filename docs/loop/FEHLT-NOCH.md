# Fehlt noch

Nur Namen, nie Werte; fehlende Angaben werden nie erfunden (Felder leer, Funktion aus oder klarer Hinweis).

Das Repo ist öffentlich: Hier stehen nur die NAMEN der fehlenden Angaben, nie Schlüssel, Nummern oder Zugangsdaten.

| Was | Wo eintragen | Wozu | blockiert Go-live (ja/nein) | wer liefert es |
|---|---|---|---|---|
| Soccaz-Firmenanschrift | Betreiberangaben (Admin-Einstellungen), Impressum | Impressum, Rechnungen | ja | Nutzer |
| USt-IdNr bzw. Steuernummer | Betreiberangaben (Admin-Einstellungen) | Rechnungen | ja | Nutzer, Steuerberater |
| Google-OAuth-Daten (Client-ID und Client-Secret) | Umgebung des Servers (`.env`, nie im Repo) | Anmeldung mit Google | ja | Nutzer |
| Stripe-Live-Schlüssel und Stripe-Webhook-Secret (live) | Umgebung des Servers (`.env`, nie im Repo) | echte Kartenzahlung | ja | Nutzer |
| Stripe-Connect-Konto und Tarif | Stripe-Dashboard, Provisionsrechnung | Auszahlung an Hallen, Gebühren | ja | Nutzer, Steuerberater |
| Domain und `APP_URL` | Umgebung des Servers, DNS | Erreichbarkeit, Links, Webhooks | ja | Nutzer |
| Backup-Ziel | Betrieb (`docs/BETRIEB.md`), Server | Sicherung und Wiederherstellung | ja | Nutzer |
| Mail-Dienst | Umgebung des Servers | Rechnungsmail, Benachrichtigungen | ja | Nutzer |
| Zwei-Faktor für das Google-Konto von Admin 1 | Google-Konto des Admin 1 | Schutz des Admin-Zugangs | ja | Nutzer |
| Partnervertrag Hallen | Hallen-Onboarding | Vertragsgrundlage mit Hallen | ja | Anwalt |
| Steuerberater-Antworten (E4) | `docs/loop/GO-LIVE-AUDIT.md` | Steuer- und Rechnungsfragen | ja | Steuerberater |
| Impressum, AGB, Datenschutz (Endfassung) | Rechtsseiten der App | rechtssicherer Betrieb | ja | Anwalt |
| Rechnungsvorlage Firma | Rechnungsfunktion (009) | Rechnungen an Firmen | ja | Steuerberater |
| Dependabot in den Repo-Einstellungen aktivieren | GitHub, Settings > Code security (Dependabot alerts und version updates) | wöchentliche Update-PRs für npm und GitHub Actions (nach Merge von `.github/dependabot.yml`) | nein | Nutzer |
| Code-Scanning „Default setup“ in den Repo-Einstellungen AUS lassen bzw. abschalten | GitHub, Settings > Code security > Code scanning | sonst scheitert der Upload des CodeQL-Workflows (`.github/workflows/codeql.yml`) | nein | Nutzer |
| Mandatszusatz-Text „Anteil übernehmen“ (Anwalt) | Mandatstext der Karte (`MANDATE_TEXT`, Vertrag 012 AC-13), Oberfläche „Anteil übernehmen“ | Der Übernehmer wird für einen fremden Platz zusätzlich belastet (nicht sofort, zur Frist): Zustimmung dazu im Mandat | ja, für „Anteil übernehmen“ (G2-012) | Anwalt, Nutzer |
| Ordner `.playwright-mcp/` im Hauptrepo löschen (nach dem `.gitignore`-Fix) | Hauptrepo `SoccaV2`, lokaler Ordner `.playwright-mcp/` (nur 2 kleine Dateien: Konsolen-Log, `page.yml`; ohne Geheimnisse geprüft) | `git status` zeigt sonst einen unversionierten Ordner | nein | Nutzer |
| Ordner `worktrees/review-m3c-1c` löschen (ca. 38.000 Dateien, rekursiv; nur der Nutzer, Agenten löschen nicht rekursiv) | Ordner `worktrees/review-m3c-1c` neben dem Hauptrepo (Git-Eintrag und Branch sind schon entfernt, nur Dateien übrig) | belegt Platz; Reste eines Review-Worktrees | nein | Nutzer |
