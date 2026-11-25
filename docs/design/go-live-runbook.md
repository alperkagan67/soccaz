# Go-live-Runbook (Einseiter für den Betreiber): Soccaz auf einem eigenen Server

Stand: 2026-11-24 · Verfasser: worker-2 · Status: **Entwurf**, wird bei der Staging-Generalprobe (30.11. bis 2.12.) Schritt für Schritt belegt · Grundlage: `docs/BETRIEB.md`, `docs/design/pilot-staging-checkliste.md`, `docs/design/anbieter-vorlage.md`, `docs/design/google-anmeldung-anleitung.md` · **Werte (Passwörter, Schlüssel) stehen nie hier, nie im Chat, nie im Repository; nur die Namen der Einstellungen.**

Plan: Code-Freeze Fr 27.11., Generalprobe auf Staging 30.11. bis 2.12., Go-live Do 3.12./Fr 4.12. (Puffer 5.12.), Turnier Sa 12.12. Zahlungen sind in Produktion **aus**; Anmeldung mit **Google und Apple** (Apple hinter `APPLE_LOGIN_ENABLED=1`; ohne den Schalter nur Google).

**Anbieter (Nutzerentscheid 2026-11-25): Hetzner Cloud, Standort Nürnberg (NBG1), App und Postgres in Docker Compose auf einem Server; Domain `socaz.de` bleibt vorerst bei ALL-INKL (DNS dort). Hetzner-spezifische Einzelheiten (Firewall, Backups, Restore, Updates, Logs, Kosten, Domain-Umzug) stehen in Abschnitt 12.** Kein Agent bekommt Zugang: Server, Firewall, DNS und Google-Konsole richtet der Nutzer selbst ein.

Jeder Schritt: **Befehl**, dann **Erwartet**. Stimmt es nicht: **stoppen und melden**, nicht weitermachen.

## 1. Server einrichten auf Hetzner Cloud (ca. 1,5 Std., Nutzer)
**1a Konto und Server** (Hetzner Cloud Console): Projekt „soccaz“ anlegen, Server bestellen: **Standort Nürnberg (NBG1, Deutschland)**, Image **Ubuntu 24.04**, Typ **Staging: CX23** (2 vCPU, 4 GB) und **Produktion: CX33** (4 vCPU, 8 GB; Größen und Preise: Abschnitt 12.1). Ist ein Typ beim Bestellen „nicht verfügbar“, dann **CPX22** (Anbieter-Vorlage). Beim Bestellen: **SSH-Schlüssel hochladen** (den *öffentlichen* Teil; erzeugt **mit Passphrase**; der private bleibt auf Ihrem Gerät), **Backups einschalten**, Namen `soccaz-staging` bzw. `soccaz-prod`.
**1b Firewall** (Console, Firewalls, „soccaz-web“, dem Server zuweisen): **eingehend nur TCP 22, 80 und 443** (IPv4 und IPv6; 22 wenn möglich nur von Ihrer festen Adresse), alles andere gesperrt, **insbesondere 5432 (Postgres)**; ausgehend alles erlaubt. Die Firewall liegt **vor** dem Server und ist der Schutz: Docker veröffentlicht Ports am Server-Programm `ufw` vorbei.
**1c Docker** (per SSH als `root`, einmalig):
```
apt-get update && apt-get install -y docker.io docker-compose-v2 git unattended-upgrades
systemctl enable --now docker
docker compose version
```
Erwartet: eine Versionszeile (Compose 2.x).
**1d Arbeitskonto statt root** (einmalig, als `root`):
```
adduser --disabled-password --gecos "" deploy
usermod -aG sudo,docker deploy
mkdir -p /home/deploy/.ssh && cp /root/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy && chmod 440 /etc/sudoers.d/deploy
```
**Wichtig:** `deploy` hat **sudo ohne Passwort** und ist in der Gruppe `docker` (das ist **root-gleich**). Der einzige Schutz ist Ihr **SSH-Schlüssel**: ihn **mit Passphrase** erzeugen (`ssh-keygen -t ed25519`, die Passphrase eingeben, nicht leer lassen) und den privaten Teil nie kopieren oder versenden.
**1e SSH absichern** (nur mit Schlüssel, kein root): **erst in einem zweiten Fenster prüfen, dass `ssh deploy@<Server-IP>` funktioniert**, dann als `root`:
```
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sshd -t && systemctl restart ssh
sshd -T | grep -E "^(passwordauthentication|permitrootlogin)"
```
Erwartet: `passwordauthentication no` und `permitrootlogin no`. (Setzt eine Datei unter `/etc/ssh/sshd_config.d/` den Wert anders, ändern Sie dort denselben Eintrag.) Ab jetzt nur noch als `deploy`.
**1f Protokolle begrenzen** (sonst füllen Docker-Logs irgendwann die Platte), als `deploy`. **Nur auf einem frischen Server:** der Befehl **überschreibt** `/etc/docker/daemon.json`; gibt es die Datei schon (`cat /etc/docker/daemon.json`), die beiden Einträge dort **zusammenführen** statt zu überschreiben.
```
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```
(gilt für **neu angelegte** Container: der Start in Schritt 4 legt sie an; wer schon gestartet hat, ergänzt `docker compose up -d --force-recreate`.)
**1g Sicherheitsupdates:** `systemctl is-enabled unattended-upgrades` muss `enabled` zeigen; **kein automatischer Neustart** (Kernel-Updates werden bei einem geplanten Neustart wirksam, Abschnitt 12.5).

## 2. Domain, DNS bei ALL-INKL und HTTPS (TLS)
Die Domain `socaz.de` bleibt **vorerst bei ALL-INKL**; die A-Einträge setzen Sie dort in den **DNS-Einstellungen der Domain** (Kundenmenü „KAS“; die Menünamen können abweichen). **Reihenfolge: `staging.socaz.de` ZUERST, `socaz.de` erst nach dem Go/No-Go (Mi 2.12.).**
1. **Staging:** A-Eintrag `staging` auf die **IPv4-Adresse des Staging-Servers**.
2. **Produktion (erst nach Go/No-Go):** A-Eintrag `socaz.de` (der „Hauptname“, in KAS oft leer oder `@`) auf die IPv4-Adresse des Produktionsservers. **`www` nicht anlegen:** Caddy bedient nur die Adresse aus `SITE_ADDRESS` (kein `www`, kein Zertifikat dafür); eine Weiterleitung steht im Backlog.
3. **TTL auf 300 Sekunden senken, mindestens 24 Stunden VOR dem Go-live** (der alte, längere Wert gilt sonst noch so lange in den Zwischenspeichern); nach ruhigem Betrieb (nach dem 12.12.) wieder auf 3600 oder mehr.
4. **E-Mail nicht anfassen:** A-Einträge berühren `MX`, `SPF`, `DKIM` nicht; **diese Einträge nie ändern oder löschen**. **Ausnahme-Hinweis Google-Domain-Bestätigung:** die Search Console verlangt einen **zusätzlichen** `TXT`-Eintrag (Google-Bestätigungswert) an der Hauptdomain: als **neuen** Eintrag anlegen, den vorhandenen `SPF`-`TXT`-Eintrag **nie überschreiben oder zusammenführen**. Nach jeder DNS-Änderung eine Testmail an eine Adresse der Domain schicken und von dort antworten.
5. **Kein AAAA-Eintrag** (IPv6) vorerst: weniger Fehlerquellen; Hetzner vergibt zwar eine IPv6-Adresse, Caddy und die Firewall würden sie aber ebenfalls bedienen müssen.
Caddy holt das HTTPS-Zertifikat **selbst**, sobald die Adresse auf den Server zeigt **und** die Ports 80 und 443 in der Firewall offen sind (Schritt 1b).
```
nslookup staging.socaz.de
```
Erwartet: die Server-IP. (Warten Sie bei Abweichung, DNS braucht Minuten bis Stunden; zu früh starten erzeugt nur Zertifikatsfehler, kein Schaden.) Für Staging gilt `SITE_ADDRESS=staging.socaz.de` und `APP_URL=https://staging.socaz.de` (Schritt 3).
**Reihenfolge Rechtstexte (Pflicht): Schritt 3 UND 4 (git clone, `.env` mit `OPERATOR_*`, Start) vor dem A-Eintrag, Schritt 5 Prüfpunkt 1 (Staging-Probe mit denselben `OPERATOR_*`-Werten) davor, Prüfpunkt 2 danach.** So ist die Seite nie mit Platzhalter-Impressum unter der echten Adresse erreichbar. Nach dem A-Eintrag folgt Prüfpunkt 2 (Schritt 5) **vor** der Bekanntgabe der Adresse.

## 3. Code holen und Einstellungen anlegen
```
git clone https://github.com/alperkagan67/soccaz.git && cd soccaz
git log --oneline -1
cp .env.example .env && chmod 600 .env && nano .env
```
Erwartet: letzte Zeile ist der **abgestimmte Stand** (Nummer nennt der Task Manager). **Hinweis:** Eine eigene Produktionsvorlage (`.env.production.example`, wie sie `BETRIEB.md` nennt) liegt **nicht** im Repository; `.env.example` ist die einzige Vorlage und enthält Entwicklungswerte. Ersetzen Sie **jeden** Wert durch einen Produktionswert und ergänzen Sie fehlende Namen aus der Tabelle als Zeile `NAME=Wert`; Zeilen, die Sie nicht einordnen können, vor dem Start melden (nicht stehen lassen). In `.env` nur auf dem Server eintragen (Namen):
| Name | Wert |
|---|---|
| `POSTGRES_PASSWORD` | langes Zufallspasswort |
| `APP_URL` | `https://socaz.de` |
| `SITE_ADDRESS` | `socaz.de` (ohne `https://`) |
| `AUTH_SECRET` | `openssl rand -base64 32` (je Umgebung ein eigener) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | aus der Google-Anleitung |
| `APPLE_LOGIN_ENABLED` | `1` nur, wenn die Apple-Anmeldung eingerichtet ist (Nutzerentscheid: **Google und Apple**); sonst nicht setzen, dann gilt **nur Google** (Rückfall) |
| `JOB_SECRET` | Zufallswert |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` | Impressum (Rechtstexte sind Entwürfe, Anwaltsprüfung) |
| **`TURNIER_ONLY`** | **`1` (Pflicht in Produktion):** nur Turniere; die übrigen Bereiche (Spiele, Suche, Hallen, Rangliste, Ligen u. a.) zeigen „Kommt bald“, ihre Live-Kanäle antworten 403. `0` = ausdrücklich alles offen. **Ohne die Variable** bleibt alles offen und die App schreibt beim Start diese Warnung ins Log: `[start] WARNUNG: TURNIER_ONLY ist in Produktion nicht gesetzt (1 = nur Turniere, 0 = alles offen). Pflichtvariable im Betriebsablauf.` Plattform-Admins sehen immer alles (Betrieb, Prüfung). |
| `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **leer lassen**: Zahlungen sind aus. Kein `PAYMENTS_FAKE`. |
Prüfen, ohne Werte zu zeigen:
```
grep -c "^TURNIER_ONLY=1" .env
grep -c "^PAYMENTS_FAKE=" .env
```
Erwartet: `1` und `0`. (`.env` nie ausgeben oder verschicken.)

**PAUSE-Prüfpunkt: `PAYMENTS_FAKE` ist nicht gesetzt** (Pflicht vor jedem Start und nach jedem Update; Treffer = **STOPP**, nicht starten). Zusätzlich zur `.env` auch die Umgebung des **laufenden** Containers prüfen (nach dem Start, Schritt 4):
```
docker compose exec -T app sh -c 'test -z "$PAYMENTS_FAKE" && echo OK || echo STOPP'
```
Erwartet: `OK`. `STOPP` = Variable aus `.env` und aus Compose-Dateien entfernen, neu starten, erneut prüfen. Die Anwendung selbst **startet in Produktion nicht**, wenn `PAYMENTS_FAKE=1` gesetzt ist (Startsperre; Meldung im Log `PAYMENTS_FAKE=1 ist in Produktion verboten`). Das gilt auch für Staging.

## 3a. Umgebungsmarke (NUR Staging, einmalig)
Nur auf dem **Staging**-Server, nach dem ersten Start (Schritt 4), **einmal** (der Staging-Seed in Schritt 10 läuft ohne diese Marke nie):
```
sh scripts/staging-compose.sh exec -T db psql -U socaz -d socaz -c "insert into settings (key, value) values ('environment', '\"staging\"'::jsonb) on conflict (key) do update set value = excluded.value"
sh scripts/staging-compose.sh exec -T db psql -U socaz -d socaz -c "select key, value from settings where key = 'environment'"
```
Erwartet: `INSERT 0 1`, dann eine Zeile `environment | "staging"`. **Auf Produktion wird diese Marke nie gesetzt**; dort muss die zweite Abfrage **0 Zeilen** liefern (Prüfpunkt im Go-live).

## 4. Starten und Migration
```
docker compose up -d --build        # Staging: sh scripts/staging-compose.sh up -d --build
docker compose ps
docker compose logs migrate | tail -5
```
Danach die **Startwarnung** prüfen:
```
docker compose logs app | grep -c "TURNIER_ONLY ist in Produktion nicht gesetzt"
```
Erwartet: `0` (Variable ist gesetzt). `1` oder mehr = `TURNIER_ONLY` in der `.env` fehlt: eintragen, neu starten.

Erwartet: `db`, `app`, `caddy`, `backup` laufen (`uptime` nur, wenn Sie die optionale Überwachung mit `--profile monitoring` gestartet haben); `migrate` ist beendet (`Exited (0)`). **Die Datenbank-Migrationen laufen automatisch bei jedem Start.** Die Log-Warnung „soccaz_ops existiert nicht“ ist vor dem Rollenmodell (A2, nach dem 12.12.) normal. Keine neuen Migrationen bis zum Turnier (0061 bleibt frei).

## 4a. Betriebsregel Produktion: BEIDE Zahlungsschalter AUS
Für das Turnier (12.12.) und bis ausdrücklich anders entschieden gilt: **`payments_enabled` AUS und `card_payments_enabled` AUS.** Beide stehen im Admin-Bereich auf **einer** Seite, `https://socaz.de/admin/einstellungen` (nur Admin): das Häkchen **„Zahlungen einschalten“** (muss leer sein) und der Kasten **„Notabschaltung Kartenzahlung“** (muss „Die Kartenzahlung ist **AUS**“ zeigen). Grund: Ist nur der erste aus und der Kartenschalter an, richten Teile des Kartenwegs weiter Karten ein (Backlog 257); kein Geld fließt, aber die Oberfläche wäre irreführend. Beide Schalter sind ab Werk AUS.

Prüfung auf dem Server (zeigt nur Schlüssel und Wahrheitswert):
```
docker compose exec -T db psql -U socaz -d socaz -c "select key, value from settings where key in ('payments_enabled','card_payments_enabled')"
```
Erwartet: **keine Zeilen** (Standard AUS) oder beide mit `false`. Steht dort `true`: **STOPP**, im Admin-Bereich ausschalten und melden. Einschalten nur nach ausdrücklicher Entscheidung nach dem 12.12.

## 5. Smoke-Test (Gesundheit und Hauptseiten)
```
node scripts/smoke.mjs https://socaz.de --turnier-only --zahlungen-aus
```
Erwartet: jede Zeile `OK`, am Ende `Alle Prüfungen bestanden`, Ende-Code 0.

**`--zahlungen-aus`** (Produktion, beide Zahlungsschalter AUS, Schritt 4a): prüft zusätzlich die öffentlich sichtbare Folge: Turnierliste, Hilfe und die erste Turnierseite enthalten **kein Zahlungswort** (Wortliste wie `src/lib/zahlungen-aus.ts`), Liste und Hilfe nennen den Hinweissatz „Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.“. Ein Turnier **mit** Preis (Altbestand) zeigt Zahlungswörter und löst hier einen Befund aus: prüfen, nicht ignorieren. Die Schalter selbst sind nicht öffentlich prüfbar (nur Schritt 4a). Gilt ab dem Merge der Seitenänderung „Zahlungen AUS“ (PR A); davor schlägt die Prüfung der Hilfe fehl.

**Zweiter Aufruf (Sperrpfade der Betriebsart, nur Produktion mit `TURNIER_ONLY=1`):**
```
node scripts/smoke-turnier-only.mjs https://socaz.de
```
Erwartet: jede Zeile `PASS`, am Ende `ERGEBNIS: BESTANDEN`, Ende-Code 0. Er prüft ohne Anmeldung: die gesperrten Seiten (`/spiele`, `/matchmaking`, `/suche`, `/hallen`, `/rangliste`, `/mitspieler`, `/ligen`) antworten 200 mit „Kommt bald“ und `noindex` (kein 404), der Live-Kanal `/api/spiele/stream` antwortet 403, `/turniere`, `/hilfe`, `/impressum`, `/teams` bleiben offen. **Nicht für Staging mit Zugangsschutz:** dieses Skript kennt kein Passwort (alle Zeilen `FAIL`, Status 401); dort nur `smoke.mjs` mit `SMOKE_BASIC_AUTH` und die Sperrpfade einmal von Hand im Browser öffnen. **Gilt ab dem Merge von `feat/turnier-only`:** `TURNIER_ONLY` und die „kommt bald“-Seite unter `/spiele` gibt es erst danach; **bis dahin den Smoke-Test ohne `--turnier-only` aufrufen** und die Variable in der `.env` noch nicht verlangen. (Prüft `/api/health`, Anmeldeseite, `/turniere`, `/impressum`, `/robots.txt` und mit `--turnier-only` die „kommt bald“-Seite unter `/spiele`.) Zusätzlich prüft es, dass `/anmelden` **keinen Dev-Login** zeigt (in Produktion und Staging darf es ihn nie geben). Ist die Apple-Anmeldung eingeschaltet (`APPLE_LOGIN_ENABLED=1`), rufen Sie mit `--apple` auf: dann **muss** der Apple-Knopf da sein, sonst darf er **nicht** da sein. Das Skript braucht nur Node 22 (`node -v`); es nutzt keine Schlüssel.

**Rechtstexte-Prüfung (PFLICHT, zwei Prüfpunkte, jeder mit Befehl und Erwartet):**

1. **Staging-Probe, VOR dem A-Eintrag** (mit denselben `OPERATOR_*`-Werten wie später in Produktion; Zugangsschutz über `SMOKE_BASIC_AUTH`):
```
node scripts/smoke.mjs https://<Staging-Adresse> --go-live
```
Erwartet: die Zeilen `Go-live: …` für `/impressum`, `/datenschutz` und `/agb` sind `OK`, **kein** `FEHLER` (kein `[PLATZHALTER: Name|Anschrift|E-Mail …]`, kein `[ENTWURF …]`-Satz), Ende-Code 0. Grün ist **Voraussetzung für den A-Eintrag** (Schritt 2).

2. **Produktion, NACH dem A-Eintrag und VOR der Bekanntgabe der Adresse** (Einladungen, Link an Teilnehmer, Social Media; die DNS-Einträge stehen dann schon, das https-Zertifikat holt Caddy erst **nach dem A-Eintrag**, aber niemand kennt die Adresse):
```
node scripts/smoke.mjs https://socaz.de --go-live
```
Erwartet: wie oben, Ende-Code 0. Meldet das Skript zuerst nur **NICHT ERREICHBAR**: 2 bis 5 Minuten warten (Caddy holt das Zertifikat nach dem A-Eintrag) und wiederholen. Erst ein **echtes `FEHLER`** (Platzhalter oder Entwurf) heißt: Adresse **nicht** bekanntgeben, `OPERATOR_*` bzw. Bestätigung nachholen, neu starten, erneut prüfen.

Die übrigen Platzhalter (Steuer-ID, Streitbeilegung, Aufsichtsbehörde) erscheinen als `HINWEIS` bis zur Rechtsprüfung. Die Rechtsaussagen bestätigt der Nutzer, kein Agent.

## 5a. Turnierablauf prüfen (Handarbeit im Browser; schreibend nur auf Staging)
Das Smoke-Skript prüft nur, was ein Gast **lesend** sieht. Die Turnierwege unten brauchen eine Anmeldung und schreiben Daten: **auf Staging** (Generalprobe) durchspielen, in **Produktion nur ansehen, nie auslösen**. Deshalb gibt es dafür **keine** Smoke-Punkte (ein Skript würde in Produktion Turniere anlegen oder schließen).
| Weg | Staging (durchspielen) | Produktion (nur ansehen) | Erwartet |
|---|---|---|---|
| **Gratis-Turnier anlegen** (seit #384) | Als Veranstalter `/app/turniere/neu`: Formular **ohne Preisfeld**, Hinweis „Das Turnier ist auf Soccaz kostenlos. Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.“ (beide Sätze), Teamlimit bis 16, Vorschlag für den Anmeldeschluss **4 Tage vor dem Beginn**; Turnier anlegen | Formular öffnen und **nicht absenden** (das echte Turnier legt der Veranstalter am Go-live-Tag an, Plan 3.12./4.12.) | Das neue Turnier steht in `/turniere`, ohne Preis, Status „Anmeldung offen“ |
| **Kein Auto-Absagen, Erinnerung** (seit #384) | Turnier bleibt nach dem Anmeldeschluss bestehen (Gratis: keine automatische Absage); der **Veranstalter** (nicht die Captains) bekommt **24 Stunden vor dem Start** die Erinnerung „Das Turnier beginnt bald“ (Inhalt: wie viele Teams angemeldet und bereit sind, mit den bereiten Teams starten oder absagen) | nichts auslösen; am Tag davor in der **Glocke des Veranstalters** nachsehen | Erinnerung ist beim Veranstalter angekommen; Turnier ist nicht abgesagt |
| **Anmeldeschluss: „Anmeldung schließen und mit den N bereiten Teams starten“** (seit #384) | Veranstalter: der Knopf erscheint, sobald **mindestens 4 Teams** vollzählig sind und noch Plätze frei sind oder Teams nicht bereit sind; Rückfrage lesen („Teams, deren Kader nicht vollzählig ist, sind nicht dabei. Danach erscheint der Spielplan.“), bestätigen | Knopf **nur ansehen** (Beschriftung und Zahl N prüfen), **nicht klicken**; geklickt wird er einmal, am Turniertag, vom Veranstalter | Das Bracket (Spielplan) erscheint **erst nach** dem Schließen; Teams ohne vollzähligen Kader sind entfernt; im Audit steht der Vorgang |
| **Privates Turnier, Gast ohne Token** (seit PR 3) | Den Turnier-Link OHNE `?t=…` und mit einem falschen Token als Gast und als eingeloggter Fremder öffnen | nur ansehen | Neutrale Seite **„Dieser Einladungslink ist ungültig oder abgelaufen.“**, kein Turniername, kein Bracket, kein Link mit Token; mit dem richtigen Link die normale Seite. Ein unbekannter Link zeigt dieselbe Seite |
| **Spielplan** (Spielzeit + Puffer) | Als Veranstalter ein Turnier anlegen: Felder „Spielzeit pro Spiel“ (Standard 15) und „Puffer zwischen den Spielen“ (Standard 5) mit Live-Hinweis zur Plandauer; Turnierseite nach dem Start des Brackets ansehen | Formular nur ansehen; die Turnierseite des echten Turniers am Turniertag ansehen | **Slot = Spielzeit + Puffer = 20 Minuten**; die Turnierseite nennt „Ende des Plans“ und je Block „von bis Uhr · Puffer“; ist die gebuchte Hallenzeit zu kurz, steht ein **Hinweis für den Veranstalter** (kein Abbruch, der Plan bleibt) |
| **Kampflos werten** (seit PR C, #387) | siehe Abschnitt 11.2; auf Staging mit einem Test-Spiel durchspielen | nicht auslösen | Gegner rückt weiter, Ergebnis 3:0, Audit-Eintrag |
| **Abpfiff** (seit PR C, #387) | Auf der Spielseite eines Turnierspiels der Abschnitt **„Abpfiff“** mit **einer** Hauptaktion: als Veranstalter/Admin ist das Ergebnis **sofort endgültig** („Endgültig beenden“), als Team-Admin wird es **gemeldet** und das andere Team bestätigt („Ergebnis melden“); bei **Unentschieden im K.-o.-Spiel** entscheidet das Siebenmeterschießen, der Veranstalter trägt den Sieger ein | Spielseite **nur ansehen**; Abpfiff nur am Turniertag, vom Veranstalter | Spiel steht auf beendet, Sieger rückt im Bracket weiter; Fehlertexte sind verständlich (kein Rohtext) |
**Reihenfolge Generalprobe:** erst seeden (Abschnitt 10a, falls vorhanden), dann die echten Teams „vollzählig“ melden; danach „Anmeldung schließen“; danach Spiele mit Abpfiff beenden, ein Spiel mit „Entscheiden“ (11.1) überschreiben, ein Spiel kampflos werten (ab Merge). Ergebnis ins Testprotokoll (Generalprobe-Plan, Abschnitt 8).

## 6. Admin 1 festlegen (einmalig)
1. **Einmal mit Google anmelden** (Admin 1 ist eine Google-Adresse) (`https://socaz.de/anmelden`), damit das Konto existiert.
2. Konto zum Admin machen (Adresse nur als Wert am Server eintragen):
```
docker compose exec db psql -U socaz -c "update users set role='admin' where email='<ihre-google-adresse>'"
read -r -s OWNER_EMAIL; export OWNER_EMAIL     # Adresse verdeckt eingeben, Eingabe mit Enter beenden
docker compose run --rm -e OWNER_EMAIL migrate node scripts/set-owner.mjs
docker compose run --rm -e OWNER_EMAIL migrate node scripts/set-owner.mjs --yes
unset OWNER_EMAIL; history -c
```
Erwartet: der Trockenlauf nennt nur Host und Datenbankname, `--yes` meldet Erfolg. (Der Aufruf über den `migrate`-Dienst ist eine **Annahme**: bei der Generalprobe belegen; sonst `BETRIEB.md`, „Admin 1 festlegen“. Die Adresse steht dank verdeckter Eingabe nur einmal im SQL-Befehl; deshalb danach `history -c`.)

## 6a. Apple-Anmeldung (nur falls eingeschaltet: `APPLE_LOGIN_ENABLED=1`)
Das **Apple-Client-Secret läuft ab** (Apple erlaubt höchstens 6 Monate). **Erneuerung spätestens alle 5 Monate.** Tragen Sie das **Ablaufdatum** in der Betriebsdoku ein (`docs/BETRIEB.md`, Abschnitt „Apple-Anmeldung“, Zeile „Client-Secret gültig bis: <Datum>“) und legen Sie sich **zwei Kalendereinträge** an: 4 Wochen vor Ablauf und am Tag vor Ablauf. Läuft das Secret ab, schlägt die Apple-Anmeldung still fehl (Google bleibt unberührt). Prüfung nach der Erneuerung: Smoke-Test mit `--apple` und eine echte Anmeldung.

## 7. Sicherung (Backup) und Wiederherstellungsprobe
- Läuft automatisch: täglich 03:30 UTC, 14 Tage in `./backups`. Sofort: `docker compose exec backup sh /backup-loop.sh once`; Erwartet: neue Datei `backups/socaz-…sql.gz`.
- **Vor dem Go-live einmal** die Wiederherstellung testen: `sh scripts/restore-test.sh`; Erwartet: Zahlen für Tabellen und Nutzer, kein Fehler.
- **Zweites Ziel (Hetzner Storage Box), Server-Backup und Wiederherstellungsprobe mit Skript: Abschnitt 12.3 und 12.4.**

## 8. Rollback (zurück auf den vorigen Stand)
```
git checkout <vorheriger-commit>
docker compose up -d --build
```
Erwartet: Smoke-Test (Schritt 5) wieder grün. **Datenbankänderungen gehen nur vorwärts:** vor jedem Update eine Sicherung ziehen (Schritt 7). Notfall Datenbank: Sicherung zurückspielen (`BETRIEB.md`, „Sicherung und Wiederherstellung“).

## 9. Update im Betrieb
**Vorprüfung vor dem Deploy der Spielplan-Änderung (Spielzeit 15 + Puffer 5):** laufende Altturniere würden einen anderen Plan anzeigen als ihre Spielzeilen. Auf dem Server (zeigt nur eine Zahl):
```
docker compose exec -T db psql -U socaz -d socaz -c "select count(*) from tournaments where bracket_generated_at is not null and status in ('running', 'payment')"
```
Erwartet: `0`. Bei mehr: nicht deployen, melden (Turnier zu Ende spielen lassen oder auf Staging neu aufsetzen).

`git pull && docker compose up -d --build`, danach Smoke-Test. Nach Code-Freeze nur Fehlerbehebungen, jede mit Sicherung davor.

## 9a. Turniertag: Ergebnis falsch eingetragen
**Entscheidungsbaum: siehe Abschnitt 11.1** (eine Quelle). Eine Ergebnis-Korrektur NACH der Finalisierung gibt es bis nach dem 12.12. nicht in der Oberfläche (Elo, Statistik, Abzeichen, Ligatabellen und das Bracket lassen sich nicht zurückrechnen; Backlog 262). **Vorbeugung:** der Veranstalter trägt Endergebnisse nur über den Dialog „Endergebnis eintragen“ ein (große Anzeige „A 3 : 2 B“, „endgültig“) oder über „Abpfiff“; ein Team, das nicht antritt, wird mit „Kampflos werten“ (3:0) gewertet.

## 10. Staging ist anders
Staging nur mit `sh scripts/staging-compose.sh …` starten (Zugangsschutz, Banner, noindex); nur Stripe-Testschlüssel; nie auf dem Produktionsserver. Vollständiger Ablauf: `pilot-staging-checkliste.md`.

**Veranstalter-Recht entzogen:** Entzug des Veranstalter-Rechts stoppt keine laufenden Turniere; zum Stoppen: Turnier absagen (Admin). Die Rechte im Turnier hängen am Veranstalter des Turniers, das Plattform-Recht steuert nur das Anlegen neuer Turniere.

## 10a. Staging-Seed für die Generalprobe (Teams 3 bis 6, nur Staging)
Für das Gratis-Turnier mit 6 Teams sind Teams 1 und 2 **echte** Konten; Teams 3 bis 6 legt `scripts/staging-seed.mjs` mit **erfundenen** Konten an (`probe-t3-s1@staging.invalid` …, Namen „Probe Konto T3-1“, Teams „Probe-Team 3“ bis „Probe-Team 6“; `.invalid` ist nie zustellbar, es wird nie Post verschickt). Das Skript hat eine **eigene Sperre** und verweigert ohne Umgebungsmarke (Schritt 3a), bei `APP_URL` = `socaz.de` oder `www.socaz.de` und ohne ausdrückliche Bestätigung. Ein Staging unter einer Unteradresse (z. B. `staging.socaz.de`) ist erlaubt.
```
sh scripts/staging-compose.sh run --rm -e APP_URL=https://<staging-adresse> -e STAGING_SEED_CONFIRM=ja-staging-seed migrate node scripts/staging-seed.mjs --turnier <turnier-id>
```
Erwartet: je Team eine Zeile „… 5 Konten, im Turnier angemeldet und bereit“ und am Ende „Fertig: 20 erfundene Konten (@staging.invalid, nie zustellbar), 4 Teams.“. Ohne `--turnier` entstehen nur Konten und Teams. `--turnier` verlangt ein **Gratis-Turnier** (Hallenkosten **genau 0**; ein Altturnier ohne Preisangabe zählt nicht) in der Anmeldung mit mindestens vier freien Plätzen. **REIHENFOLGE (wichtig):** erst die Teams anmelden lassen, **dann seeden, DANACH** melden die echten Teams 1 und 2 „vollzählig“: das **letzte** „vollzählig“ löst den Preisschritt und damit das Bracket aus. Der Seed setzt „vollzählig“ direkt in der Datenbank und ruft die Turnierlogik nicht auf; sind echte Teams schon vollzählig, **verweigert** das Skript (Meldung „erst den Seed laufen lassen“): ein echter Captain nimmt „vollzählig“ zurück (aus und wieder an), dann seeden. Sonst startet das Bracket nie von selbst und „Anmeldung schließen“ meldet, dass alle Plätze belegt sind. Die vier Teams stehen dann auf „vollzählig“ und „Bereit“ (**Annahme**, bei der Generalprobe belegen: der Ablauf der echten Captains danach bis zum Bracket). Aufräumen nach der Probe: dasselbe mit `--clean` statt `--turnier`; **sobald mit den Probe-Teams Turnierspiele gespielt wurden, scheitert `--clean`** (Datenbank-Verweise, nichts geht verloren): dann die gesamte Staging-Datenbank zurücksetzen oder den Server nach der Generalprobe löschen. Eine Staging-Sicherung darf **nie** in Produktion eingespielt werden (sie enthält die Marke). **Mail:** Die erfundenen Konten (`@staging.invalid`) bekommen In-App-Benachrichtigungen; auf **Staging darf kein Mailanbieter konfiguriert sein** (keine Zugangsdaten eines Mailanbieters in die Staging-`.env`), sonst gäbe es Fehlzustellungen und eine schlechtere Reputation des Absenders. Gibt es später einen Mailversand (Backlog 211), muss er auf Staging aus sein oder `.invalid`-Adressen verwerfen, ohne zu senden. Verweigert das Skript („Staging-Seed verweigert: …“), **nichts umgehen**: Marke, Adresse oder Bestätigung prüfen und melden.

## 11. Am Turniertag: falsches Ergebnis, Kampflos, Rückzug (Entscheidungsbaum)
**Grundregel:** **Kein Agent ändert Produktionsdaten** (kein SQL, kein Skript, kein „kurz geradeziehen“). Korrekturen macht der **Veranstalter in der Oberfläche** oder der **Nutzer als Admin 1**; jeder Eingriff steht im Protokoll (Audit). Im Zweifel: **nichts anfassen**, Stand notieren, melden.

### 11.1 Ergebnis falsch eingetragen
| Lage | Wer | Vorgehen | Erwartet |
|---|---|---|---|
| **(1) Das Ergebnis ist noch nicht endgültig** (ein Captain hat gemeldet, das andere Team hat noch nicht bestätigt, oder es gibt einen Widerspruch; das Spiel steht nicht auf „beendet“) | **Veranstalter** (oder Admin 1) | Spielseite des Spiels öffnen (aus dem Bracket), Kasten **„Veranstalter-Entscheidung (für Plattform-Admins ohne Turnier: Plattform-Entscheidung)“**: richtigen Spielstand eintragen, **Begründung** (mindestens 3 Zeichen), **„Endgültig entscheiden“** | Das Spiel zeigt den Endstand, der Sieger rückt im Bracket weiter; im Audit steht „result.decide“ mit altem und neuem Stand. Die Planzeit ist nur ein Richtwert: wer entscheiden darf (Veranstalter, Admin), darf **jederzeit**, auch vor dem geplanten Anstoß |
| **(2) Das Ergebnis ist schon endgültig** (bestätigt, entschieden oder nach 48 Stunden automatisch bestätigt) **und das Folgespiel ist noch nicht gespielt** | **Nutzer als Admin 1** entscheidet das Vorgehen | **Nicht selbst herumklicken.** Die Oberfläche hat dafür **keinen** Korrekturweg. Stand notieren (Spiel, falscher und richtiger Stand, Uhrzeit), melden; Admin 1 entscheidet mit dem Task Manager, ob das Folgespiel mit dem notierten richtigen Stand gespielt wird (Anzeige weicht dann ab) oder wartet. **Kein Agent ändert Daten.** | Entscheidung mit Datum im Testprotokoll/Turnierprotokoll |
| **(3) Notfall: die Spielstand-Anzeige stimmt nicht, das Turnier läuft weiter** | **Veranstalter** | Den **richtigen** Stand **extern notieren** (Zettel, Foto der Tafel) und das Turnier **auf Basis des notierten Stands** weiterführen. **Korrektur nach dem Turnier.** | Notizliste vollständig; nach dem Turnier meldet der Veranstalter sie dem Task Manager |
**Echte Korrektur** eines endgültigen Ergebnisses (mit Rückrechnung von Elo, Statistik, Abzeichen und Folgespiel) gibt es **erst nach dem 12.12.** (Backlog); bis dahin gilt (2) und (3).

### 11.2 Kampflos werten (Gegner ist nicht erschienen)
**Seit PR C (#387) vorhanden.** Im Bracket am Spiel **„Kampflos werten“** aufklappen, dann **„<Team> gewinnt kampflos (3:0)“** wählen und die Rückfrage bestätigen. **Erwartet:** Ergebnis 3:0, der Gegner rückt weiter, Audit-Eintrag. Vor der Entscheidung kurz abwarten (vereinbarte Wartezeit) und beide Captains fragen. Fällt der Knopf aus, geht es notfalls mit 11.1 (1) (Ergebnis 3:0, Begründung „kampflos“).

### 11.3 Team zieht zurück
- **Vor dem Start des Brackets** (Gratis-Turnier): das Team wird **entfernt** (Captain: „Team abmelden“ in der Turnierseite, oder der **Veranstalter** nimmt es heraus; nach dem **Anmeldeschluss** kann der Veranstalter keine Teams mehr ersetzen, dann **„Anmeldung schließen“**, damit mit den angemeldeten Teams, mindestens 4, gespielt wird). Erwartet: das Team steht nicht mehr in der Liste, die übrigen Teams sehen es; im Audit „tournament.withdraw“.
- **Nach dem Start des Brackets** gibt es **keine Abmeldung mehr** („Nach dem Start ist keine Abmeldung mehr möglich“). Zieht ein Team dann zurück: für **kommende** Spiele **Kampflos werten** (11.2); bereits gespielte Spiele bleiben stehen.

## 12. Betrieb auf Hetzner Cloud (Nutzerentscheid 2026-11-25)
Alle Preise **netto** aus den öffentlichen Hetzner-Seiten, Abruf 2026-11-24/25; sie ändern sich, vor der Bestellung auf der Seite prüfen. Angaben, die ich nicht belegen konnte, sind als „vor der Bestellung prüfen“ markiert.

### 12.1 Server und Kosten
| Posten | Staging (`soccaz-staging`) | Produktion (`soccaz-prod`) | Quelle |
|---|---|---|---|
| Typ | **CX23**: 2 vCPU, 4 GB, 40 GB NVMe, **5,99 €/Monat** | **CX33**: 4 vCPU, 8 GB, 80 GB NVMe, **8,99 €/Monat** (Größe laut `groesse-turnier-12-12.md`: 4 vCPU/8 GB für den Turnierzeitraum) | hetzner.com/cloud/cost-optimized |
| Standort | NBG1 (Nürnberg) | NBG1 (Nürnberg) | gleiche Seite: CX23/CX33 in NBG1 und HEL1 gelistet |
| Ausweichtyp | CPX22 (2 vCPU, 4 GB, 80 GB): 19,99 € (NBG1) | CPX22 | hetzner.com/cloud/regular-performance |
| Server-Backup (täglich, 7 Plätze) | ab 1,098 €/Monat | ab 1,098 €/Monat | wie oben („Backups, ab“; Prozentsatz nicht angegeben) |
| Snapshot (manuell) | 0,0143 €/GB/Monat | 0,0143 €/GB/Monat | wie oben |
| Storage Box **BX11** (1 TB, zweites Ziel der Datenbank-Sicherung) | 3,20 €/Monat netto, keine Mindestlaufzeit, Standort Deutschland wählbar | (eine Box für beide Server genügt) | hetzner.com/storage/storage-box |
| Öffentliche IPv4 | laut Hetzner-Doku 0,50 €/Monat netto: **vor der Bestellung prüfen**, ob im Serverpreis enthalten | dto. | docs.hetzner.com |
**Rechnung (Mindestsumme, netto, ohne IPv4 und Snapshots):** 5,99 + 8,99 + 2 × 1,10 + 3,20 ≈ **20,40 €/Monat**. Die Typen CX23/CAX11/CX33 zeigten auf der Seite „currently unavailable“ (Stand 2026-11-24): bei der Bestellung prüfen, sonst CPX22. Größe ändern geht (kurzer Neustart): nur für die Turniertage größer, danach zurück.

### 12.2 Netz: nur 22, 80, 443; Postgres nie öffentlich
Prüfung auf dem Server (zeigt nur Zeilen zu den Ports):
```
docker compose ps
sudo ss -ltnp | grep -E ':(5432|3000)\b' || echo "kein Postgres/App-Port am Server offen"
```
Erwartet: im `docker compose ps` hat `db` **keine** veröffentlichte Adresse (`5432/tcp` ohne `0.0.0.0`), `app` ebenfalls nicht (nur `caddy` zeigt 80/443); die zweite Zeile meldet „kein Postgres/App-Port am Server offen“. **Von außen** (von Ihrem Rechner): `nc -vz <Server-IP> 5432` muss **abbrechen/timeout**, `nc -vz <Server-IP> 443` verbunden. Uptime Kuma (optional) lauscht nur auf `127.0.0.1:3001`.

### 12.3 Sicherungen: drei Ebenen
1. **Hetzner-Server-Backup** (täglich, 7 Plätze): in der Console beim Server „Backups“ einschalten. Das ist eine Kopie der ganzen Platte (absturzkonsistent), kein Ersatz für 2.
2. **Täglicher `pg_dump`** (Compose-Dienst `backup`, 03:30 UTC, 14 Tage in `~/soccaz/backups`, mit Manifest): Schritt 7.
3. **Zweites Ziel: Hetzner Storage Box** (unabhängig vom Server). Einrichtung (Nutzer, einmalig):
   - In der Hetzner-Konsole eine **Storage Box BX11** bestellen, **Standort Deutschland**, in den Einstellungen **„SSH Support“ einschalten** (aktiviert den Zugang auf **Port 23**; Port 22 kann nur SFTP/SCP; rsync läuft über SSH auf Port 23, laut Hetzner-Doku, bei der Einrichtung prüfen).
   - Auf dem Server einen **eigenen Schlüssel** nur dafür: `ssh-keygen -t ed25519 -f ~/.ssh/storagebox_ed25519 -N ""`; den öffentlichen Teil bei der Storage Box hinterlegen (Hetzner-Doku „Storage Box: SSH-Schlüssel“, Port 23, Befehl `install-ssh-key`). Einmal von Hand verbinden, um den Server-Fingerabdruck zu bestätigen: `ssh -p 23 -i ~/.ssh/storagebox_ed25519 uXXXXXX@uXXXXXX.your-storagebox.de ls` (**`uXXXXXX` ist ein Platzhalter für Ihren Benutzernamen**; nie in Chat oder Repository).
   - Das Skript (auf dem Server, nicht im Repository):
```
sudo tee /usr/local/bin/soccaz-offsite.sh >/dev/null <<'EOF'
#!/bin/sh
# Spiegelt die Sicherungen auf die Hetzner Storage Box (zweites Ziel). Nur Zielname und Schluesseldatei stehen hier, keine Passwoerter.
set -eu
SRC="/home/deploy/soccaz/backups/"
DEST="uXXXXXX@uXXXXXX.your-storagebox.de:soccaz-backups/"
KEY="/home/deploy/.ssh/storagebox_ed25519"
# nie spiegeln, wenn lokal nichts liegt oder die neueste Sicherung aelter als 26 Stunden ist (sonst loescht --delete die gute Kopie auf der Box und es wuerde ein stehender Dump gespiegelt)
NEUESTE="$(ls -1t "$SRC"socaz-*.sql.gz 2>/dev/null | head -1)"
[ -n "$NEUESTE" ] || { echo "[offsite] keine lokalen Sicherungen: abgebrochen"; exit 1; }
[ -n "$(find "$NEUESTE" -mmin -1560)" ] || { echo "[offsite] neueste Sicherung ist aelter als 26 Stunden: abgebrochen"; exit 1; }
rsync -a --delete -e "ssh -p 23 -i $KEY -o StrictHostKeyChecking=yes" "$SRC" "$DEST"
echo "[offsite] ok $(date -u +%Y-%m-%dT%H:%M:%SZ)"
EOF
sudo chmod 755 /usr/local/bin/soccaz-offsite.sh
(crontab -l 2>/dev/null | grep -v soccaz-offsite.sh; echo '45 3 * * * /usr/local/bin/soccaz-offsite.sh >> /home/deploy/offsite.log 2>&1') | crontab -   # idempotent: ein zweiter Aufruf legt keinen doppelten Eintrag an
/usr/local/bin/soccaz-offsite.sh
```
   Erwartet: `[offsite] ok <Zeit>`; in der Box liegen `soccaz-backups/socaz-…sql.gz` und `….manifest.json`. Der Auftrag läuft täglich um 03:45 UTC, **nach** dem Dump um 03:30. Die Box hält zusätzlich **Snapshots** (laut Hetzner-Seite bis zu 10 manuelle und 10 automatische Plätze bei BX11): einen **täglichen automatischen Snapshot** in der Console einschalten, damit eine versehentlich gelöschte Sicherung wiederkommt. Nach dem Einrichten **am nächsten Tag** prüfen: `tail -3 ~/offsite.log`.

### 12.4 Wiederherstellungsprobe (Skript)
Auf **Ihrem Rechner mit Postgres** (nicht auf dem Server; die Probe rührt keine echte Datenbank an). **Eigener Schlüssel für den Rechner** (der Server-Schlüssel `storagebox_ed25519` verlässt den Server nie): einmalig `ssh-keygen -t ed25519 -f ~/.ssh/storagebox_rechner_ed25519` (mit Passphrase) und den öffentlichen Teil **zusätzlich** bei der Storage Box hinterlegen (wie in 12.3); später lässt er sich einzeln wieder entfernen.
```
mkdir -p ~/soccaz-restore
rsync -a -e "ssh -p 23 -i ~/.ssh/storagebox_rechner_ed25519" uXXXXXX@uXXXXXX.your-storagebox.de:soccaz-backups/ ~/soccaz-restore/
ls -1 ~/soccaz-restore | tail -4
RESTORE_ADMIN_URL=postgres://<konto>@127.0.0.1:5432/postgres node scripts/restore-test.mjs ~/soccaz-restore/socaz-<zeit>.sql.gz
```
Erwartet: die neueste Datei ist **jünger als 26 Stunden**; das Skript meldet die Prüfungen (Einspielen, Tabellen gegen das Manifest, Summe der Buchungen, Beweiskette) mit `PASS` (Einzelheiten und Optionen: `BETRIEB.md`, „Restore-Probe“). **Vor dem Go-live einmal, danach monatlich.** Im Ernstfall: neuen Server aus dem **Hetzner-Backup** oder einem Snapshot erstellen (Console, Server, Backups, „Server aus Backup erstellen“) **oder** frischen Server nach Schritt 1 bis 4 aufbauen und die Sicherung einspielen (`BETRIEB.md`, „Wiederherstellen in die echte Datenbank“).

### 12.5 Updates, Neustart, Protokolle
- **Neustart-Verhalten:** Alle Dienste laufen mit `restart: unless-stopped`, Docker startet beim Hochfahren selbst. **Probe einmal vor dem Go-live** (Generalprobe Di 1.12. abends): `sudo reboot`, nach 2 Minuten `docker compose ps` (alle `running`, `migrate` beendet), Smoke-Test (Schritt 5). Erwartet: alles grün ohne Eingriff.
- **System-Updates:** Sicherheitsupdates laufen automatisch (`unattended-upgrades`), ein Neustart nie von selbst. **Kernel-Updates** werden mit einem **geplanten Neustart** wirksam: den letzten Neustart **Mo 7.12.** einplanen, in der Turnierwoche (7. bis 13.12.) **keine Neustarts außer bei Störung**.
- **App-Update:** Abschnitt 9; vorher Server-Snapshot (Console) und eine Sicherung (`docker compose exec backup sh /backup-loop.sh once`).
- **Protokolle:** `docker compose logs --tail 200 app`; live `docker compose logs -f --since 10m app`. Die Größe ist begrenzt (Schritt 1f: je 3 Dateien à 10 MB). **Platte prüfen:** `df -h /` (Warnung ab 80 %), `docker system df`. Fehler und Erreichbarkeit: `SENTRY_DSN` und optional Uptime Kuma (`BETRIEB.md`, Überwachung).

### 12.6 Domain-Umzug (Empfehlung: erst nach dem 12.12.)
- **Kein Domain-Umzug** (AuthInfo-Code, Wechsel zu einem anderen Anbieter) **vor dem 12.12.**: ein Umzug kann DNS und E-Mail kurz stören, genau in der heißen Phase. Bis dahin bleibt `socaz.de` bei ALL-INKL, nur die A-Einträge zeigen auf Hetzner.
- **Danach:** erst den Umzug durchführen, dann **E-Mail prüfen** (Postfächer, Weiterleitungen, `MX`/`SPF`/`DKIM` unverändert, Testmail hin und zurück), und **erst dann ALL-INKL kündigen**. Vor der Kündigung alle Postfächer und Weiterleitungen exportieren oder dokumentieren.
- **TTL:** vor dem Go-live auf 300 Sekunden (Schritt 2), nach ruhigem Betrieb zurück.
