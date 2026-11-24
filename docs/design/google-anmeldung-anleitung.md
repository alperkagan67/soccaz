# Google-Anmeldung einrichten: Anleitung für den Betreiber (Go-live, Staging)

Stand: 2026-11-24 · Verfasser: worker-4 · Status: **Entwurf** · Quellen: `src/auth.ts` (Auth.js mit Google-Anbieter), `src/app/api/auth/[...nextauth]/route.ts`, `docs/BETRIEB.md` („Google-Anmeldung einrichten“), `docker-compose.yml` (`AUTH_URL`, `AUTH_TRUST_HOST`)

**Wofür:** Spieler melden sich bei Soccaz **nur mit ihrem Google-Konto** an (vorläufig, kein Passwort, keine andere Anmeldung). Damit das auf `socaz.de` und auf der Testumgebung (Staging) geht, braucht Soccaz bei Google einen „OAuth-Client“ (eine Art Ausweis der App). Diese Anleitung führt Sie Schritt für Schritt durch die Google Cloud Console. **Rechnen Sie mit 1 bis 2 Stunden eigener Arbeit und mit Wartezeit bei Google** (Abschnitt 8): bitte **diese Woche beginnen**, nicht erst kurz vor dem Go-live.

**Wichtig vorweg**
- **Keine Schlüssel in den Chat, in Mails oder ins Repository.** Die Client-ID und das Client-Geheimnis tragen Sie nur in die Datei `.env` auf dem Server ein (Abschnitt 6). Wir nennen hier nur die **Namen** der Einstellungen.
- Die Oberfläche von Google ändert sich oft. Die Namen der Menüpunkte unten stimmen sinngemäß; wenn ein Wort leicht abweicht („Google Auth Platform“ statt „OAuth-Zustimmungsbildschirm“), suchen Sie das Gleichbedeutende.
- Die Texte unter „Datenschutz“ und „Nutzungsbedingungen“ sind **Entwürfe** (Rechtsprüfung durch den Anwalt steht aus, `go-live-nutzerliste.md`). Google verlangt nur, dass die Adressen erreichbar sind.

## 1. Vorbereiten (10 Minuten)
- Ein **Google-Konto**, das der Betreiber dauerhaft besitzt (nicht das einer Aushilfe), mit **Zwei-Faktor-Anmeldung** (Sicherheit).
- Die Domain `socaz.de` muss erreichbar sein und Sie müssen ihren **DNS-Eintrag** ändern können (für die Domain-Bestätigung, Schritt 3).
- Erreichbar müssen sein: `https://socaz.de/datenschutz`, `https://socaz.de/agb` (Nutzungsbedingungen) und `https://socaz.de/impressum`.

## 2. Projekt anlegen
1. Öffnen Sie `https://console.cloud.google.com/` und melden Sie sich an.
2. Oben links auf die Projektauswahl, **„Neues Projekt“**: Name **Soccaz** (Organisation: keine), „Erstellen“.
3. Das neue Projekt oben **auswählen** (der Name steht in der Kopfzeile). Alles Weitere gilt für dieses Projekt.

## 3. Zustimmungsbildschirm („Was Nutzer bei der Anmeldung sehen“)
Menü **„APIs & Dienste“ → „OAuth-Zustimmungsbildschirm“** (neu: **„Google Auth Platform“ → „Branding“, „Zielgruppe“, „Datenzugriff“**).
1. **Nutzertyp: „Extern“** (jeder mit einem Google-Konto darf sich anmelden), „Erstellen“.
2. **App-Name:** Soccaz. **Support-E-Mail:** eine Adresse, die Sie lesen (sie sehen Nutzer bei Problemen). **Logo:** freiwillig (siehe Abschnitt 8, Logo löst eine Prüfung aus; für den Start weglassen).
3. **App-Domain:**
   - Startseite: `https://socaz.de`
   - Datenschutzerklärung: `https://socaz.de/datenschutz`
   - Nutzungsbedingungen: `https://socaz.de/agb`
4. **Autorisierte Domains:** `socaz.de` eintragen. Google verlangt, dass Sie die Domain **bestätigen** (Inhaberschaft): im Dienst „Google Search Console“ die Domain `socaz.de` hinzufügen, den angezeigten **TXT-Eintrag** bei Ihrem Domain-Anbieter (DNS) einfügen, dann „Bestätigen“ (dauert Minuten bis Stunden). **Liegt die Adresse der Testumgebung NICHT unter `socaz.de`** (z. B. `staging.example.org`), muss **auch deren Domain** unter „Autorisierte Domains“ stehen und bestätigt sein, sonst lehnt Google die Weiterleitungs-URI der Testumgebung ab.
5. **Kontakt-E-Mail des Entwicklers:** eine Adresse, die Sie lesen.
6. Speichern und weiter.

## 4. Datenzugriff („Scopes“): nur das Nötigste
Es werden **nur** diese drei gebraucht (alle sind „nicht sensibel“, dafür gibt es keine aufwendige Prüfung durch Google):
- `openid`
- `.../auth/userinfo.email` (die E-Mail-Adresse)
- `.../auth/userinfo.profile` (Name und Profilbild)

**Keine weiteren Bereiche hinzufügen.** (Soccaz liest nur E-Mail, Name, Bild und eine eindeutige Google-Kennung; siehe `src/auth.ts`.)

## 5. Veröffentlichungsstatus: „In Produktion“
Im Zustimmungsbildschirm steht der Status **„Test“** (Testing). Im Status „Test“ dürfen sich **nur** Konten anmelden, die Sie als „Testnutzer“ eingetragen haben (höchstens 100); außerdem laufen die Google-Zugangstoken nach 7 Tagen ab. **Für das Turnier ist das ungeeignet.**
- **Go-live (`socaz.de`): auf „In Produktion“ stellen** („App veröffentlichen“, bestätigen). Weil nur die drei einfachen Bereiche genutzt werden, braucht das normalerweise **keine** Prüfung durch Google (Abschnitt 8).
- **Staging-Generalprobe (30.11. bis 2.12.):** entweder derselbe Client im Status „In Produktion“ (einfachste Lösung, die Redirect-Adresse der Testumgebung kommt zusätzlich in den Client, Schritt 6) **oder** Status „Test“ und alle Mitwirkenden der Generalprobe als **Testnutzer** eintragen (E-Mail-Adressen, höchstens 100).

## 6. OAuth-Client anlegen
Menü **„APIs & Dienste“ → „Anmeldedaten“ → „Anmeldedaten erstellen“ → „OAuth-Client-ID“** (neu: „Google Auth Platform“ → „Clients“).
1. **Anwendungstyp: „Webanwendung“**. Name: `Soccaz Web`.
2. **Autorisierte JavaScript-Quellen** (freiwillig, schadet nicht): `https://socaz.de`.
3. **Autorisierte Weiterleitungs-URIs** (das ist die Stelle, an der die meisten Fehler passieren: **exakt so, ohne Leerzeichen und ohne Schrägstrich am Ende**):
   - Produktion: `https://socaz.de/api/auth/callback/google`
   - Staging (Testumgebung): `https://<staging-adresse>/api/auth/callback/google` (die Adresse, die Sie für Staging festgelegt haben; Pfad **genau** gleich)
   - (nur falls Sie lokal testen: `http://localhost:3100/api/auth/callback/google`)

   Der Pfad `/api/auth/callback/google` stammt aus der Anmelde-Bibliothek von Soccaz (Auth.js, Route `src/app/api/auth/[...nextauth]/route.ts`, Anbieter Google) und ist fest; die Adresse davor ist die der Seite (`APP_URL`).
4. „Erstellen“. Google zeigt **Client-ID** und **Client-Geheimnis**: **Nicht fotografieren, nicht mailen, nicht chatten.** Kopieren Sie beide direkt in die Server-Datei (Schritt 7). Das Geheimnis kann später in der Konsole neu erzeugt werden („Geheimnis zurücksetzen“), falls es je irgendwo gelandet ist.

## 7. Auf dem Server eintragen (nur Namen, Werte nur dort)
In der Datei `.env` auf dem **jeweiligen** Server (Produktion bzw. Staging; `docs/BETRIEB.md`):
| Name | Bedeutung |
|---|---|
| `AUTH_GOOGLE_ID` | die Client-ID aus Schritt 6 |
| `AUTH_GOOGLE_SECRET` | das Client-Geheimnis aus Schritt 6 |
| `AUTH_SECRET` | ein **eigener** zufälliger Wert je Umgebung (Sitzungen), z. B. mit `openssl rand -base64 32` erzeugen |
| `APP_URL` | die Adresse der Seite, z. B. `https://socaz.de` (daraus wird `AUTH_URL`; sie muss zu den Weiterleitungs-URIs oben passen) |
`AUTH_TRUST_HOST` ist im `docker-compose.yml` schon gesetzt. Danach die Anwendung neu starten (`docker compose up -d`, bei Staging mit dem Staging-Skript, `pilot-staging-checkliste.md`). **Ohne `AUTH_GOOGLE_ID` gibt es keinen „Mit Google anmelden“-Knopf** (der Google-Anbieter ist dann gar nicht aktiv).

## 8. Prüfen und was dauern kann
**Prüfung (5 Minuten):** `https://socaz.de/anmelden` öffnen, „Mit Google anmelden“. **Erwartet:** Google zeigt die Kontoauswahl, danach landen Sie angemeldet in Soccaz (beim ersten Mal im Einrichtungsassistenten `/willkommen`).

| Meldung | Ursache | Abhilfe |
|---|---|---|
| `redirect_uri_mismatch` | die Weiterleitungs-URI im Client stimmt nicht exakt (Schreibweise, `http` statt `https`, Schrägstrich am Ende, falsche Subdomain) | Schritt 6.3 prüfen, die Adresse in der Fehlermeldung mit der Eintragung vergleichen |
| „Zugriff blockiert: … nicht verifiziert“ / `access_denied` | Status noch „Test“ und das Konto steht nicht als Testnutzer da | Schritt 5 |
| „Diese App ist nicht verifiziert“ (Warnseite vor der Anmeldung) | Google verlangt eine Prüfung, z. B. wegen Logo/App-Name oder zusätzlichen Bereichen | nur die drei Bereiche behalten, Logo weglassen, Prüfung anstoßen (unten) |
| Domain-Warnung im Zustimmungsbildschirm | `socaz.de` ist noch nicht bestätigt | Schritt 3.4 |
| Staging: Anmeldung bricht nach Google mit 401 ab | der Zugangsschutz der Testumgebung blockiert die Rückleitung | `pilot-staging-checkliste.md`, Schritt „Erster Staging-Login“ (Annahme, dort Fallback) |

**Was Wartezeit kostet (Planung, keine Zusage von Google; die Zeiten nennt Google selbst und sie schwanken):**
- **Domain bestätigen (DNS-TXT):** Minuten bis wenige Stunden.
- **„In Produktion“ ohne Prüfung:** sofort, solange nur `openid`, E-Mail und Profil genutzt werden.
- **Prüfung der App durch Google** („Verifizierung“): **nur falls Google sie verlangt** (z. B. bei Logo, bei sensiblen Bereichen, manchmal bei sehr vielen Nutzern). Dann **Tage bis Wochen**, Rückfragen per Mail an die Entwickler-Kontakt-Adresse. Bis dahin funktioniert die Anmeldung, aber Nutzer sehen eine Warnseite oder es gilt eine Nutzergrenze. **Deshalb: Logo weglassen und keine weiteren Bereiche eintragen, die Anmeldung lieber früh testen.**

## 9. Hinweise
- **Wer kein Google-Konto hat, kann sich vorläufig nicht anmelden** (Produktgrenze, andere Anmeldearten sind nicht vorgesehen). Sagen Sie das den Teilnehmenden des Turniers vorher.
- **Datenschutz:** Soccaz erhält von Google E-Mail, Name, Profilbild und eine Kennung. Die **Datenschutzerklärung** muss die Google-Anmeldung nennen (Entwurf, Rechtsprüfung: `go-live-nutzerliste.md`, Nr. 3).
- **Betreiber und Admin 1** melden sich ebenfalls mit Google an; der Admin-Zugang wird danach vergeben (`BETRIEB.md`, „Admin 1 festlegen“). Betreiber-Einladungen werden nur mit **bestätigter** Google-E-Mail eingelöst.
- **Schlüssel rotieren** (z. B. nach einem Verdacht): in der Konsole das Geheimnis zurücksetzen, den neuen Wert nur in `.env` eintragen, neu starten.

## 10. Kurz-Checkliste (zum Abhaken)
- [ ] Google-Konto des Betreibers mit Zwei-Faktor-Anmeldung
- [ ] Projekt „Soccaz“ angelegt
- [ ] Zustimmungsbildschirm: extern, Name, Support-E-Mail, Startseite, Datenschutz, Nutzungsbedingungen, **Autorisierte Domain `socaz.de` bestätigt**
- [ ] Bereiche: nur `openid`, E-Mail, Profil
- [ ] Status **„In Produktion“** (bzw. Testnutzer für die Generalprobe eingetragen)
- [ ] OAuth-Client „Webanwendung“ mit **beiden** Weiterleitungs-URIs (Produktion und Staging), Pfad `/api/auth/callback/google`
- [ ] `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `APP_URL` nur in der Server-`.env`
- [ ] Anmeldung auf Staging und auf Produktion getestet (Kontoauswahl, Rückkehr, `/willkommen`)
- [ ] **Staging mit Zugangsschutz (Basic-Auth): Anmeldung in Chrome, Safari und Firefox** je einmal geprüft (die Annahme „Rückleitung von Google trägt die Zugangsdaten mit“ ist nur eine Annahme; sie gilt erst nach diesem Test, `pilot-staging-checkliste.md`, Schritt S7)
