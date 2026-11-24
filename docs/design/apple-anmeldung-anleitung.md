# Apple-Anmeldung einrichten: Anleitung für den Betreiber (Go-live, Staging)

Stand: 2026-11-24 · Verfasser: worker-4 · Status: **Entwurf**, wird auf Staging belegt (Generalprobe 30.11. bis 2.12.) · Gegenstück: `docs/design/google-anmeldung-anleitung.md`

Ziel: Spieler können sich mit **„Mit Apple anmelden“** anmelden (neben Google). Jeder Spieler hat **ein eigenes Konto**. Die Anmeldung ist nur sichtbar, wenn der Schalter `APPLE_LOGIN_ENABLED=1` gesetzt ist (Rückfall: ohne den Schalter bleibt nur Google, nichts bricht).

Quellen (Apple, gelesen am 2026-11-24; Apple nennt auf diesen Seiten kein eigenes Stand-Datum, nur „Copyright © 2026“):
- Programm und Kosten: https://developer.apple.com/programs/enroll/
- Sign in with Apple für das Web einrichten: https://developer.apple.com/help/account/configure-app-capabilities/configure-sign-in-with-apple-for-the-web
- Schlüssel (Key) erzeugen: https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key
- Services ID anlegen: https://developer.apple.com/help/account/identifiers/register-a-services-id
- Client Secret (JWT): https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret (diese Seite war beim Lesen nicht abrufbar: die Angaben in Schritt 7 **vor dem Einsatz im Browser gegenlesen**)

**RÜCKFALLREGEL (Go/No-Go, Frist Mittwoch 2.12.2026):** Ist die Apple-Anmeldung bis **Mi 2.12.** nicht auf **Staging** erfolgreich getestet (Schritt 8 komplett grün), gilt für den 12.12.: **nur Google**, `APPLE_LOGIN_ENABLED` bleibt aus, und die Hinweistexte nennen nur das Google-Konto (der Text hängt am selben Schalter, kein Eingriff in den Code nötig). Apple wird dann nach dem 12.12. nachgeholt. Die Entscheidung trifft der Task Manager am 2.12. abends nach der Generalprobe.

**Grundregel für alles Folgende:** Schlüsseldatei (`.p8`), Secrets und Passwörter **nie** in den Chat, in Mails, ins Repository oder in Screenshots. Hier stehen nur **Namen** von Werten.

## 1. Apple Developer Program (Vorlauf, früh beginnen)
Apple verlangt für „Sign in with Apple“ im Web eine **Mitgliedschaft im Apple Developer Program** (Einzelperson reicht).
1. https://developer.apple.com/programs/enroll/ öffnen, mit dem **Apple-Konto** des Betreibers anmelden. Das Konto braucht **Zwei-Faktor-Authentifizierung** und den **echten Rechtsnamen** (laut Apple-Seite werden Rechtsname, E-Mail, Telefon und Adresse bestätigt; Postfächer „P.O. Box“ werden nicht akzeptiert).
2. **Kosten:** laut Apple-Seite **99 USD pro Mitgliedschaftsjahr** (Preise variieren je Region und werden beim Beitritt in Landeswährung angezeigt; Stand: Seite am 2026-11-24 abgerufen). Das ist eine laufende Betreiberausgabe: beim Beitritt prüfen, was Apple anzeigt, und im Kostenplan vermerken.
3. **Dauer (Planung, keine Zusage von Apple):** Anmeldung und Identitätsprüfung einer Einzelperson können **ein bis zwei Tage** dauern; Apple nennt auf den gelesenen Seiten keine Frist. Deshalb **sofort anmelden**: Ohne aktive Mitgliedschaft geht nichts Weiteres.
4. **Erwartet:** Bestätigungsmail von Apple, im Konto sichtbar „Certificates, Identifiers & Profiles“ (https://developer.apple.com/account/resources). Dort arbeiten alle folgenden Schritte. (Nur **Account Holder** oder **Admin** dürfen Identifier anlegen.)

## 2. App ID mit „Sign in with Apple“ (Hauptkennung)
1. In „Identifiers“ auf **+** → **App IDs** → **App** → weiter.
2. Beschreibung z. B. `Soccaz`, **Bundle ID** im Umgekehrt-Domain-Stil, z. B. `de.socaz.web` (ein Name, den es nur einmal gibt; **merken**).
3. Unter „Capabilities“ **Sign in with Apple** anhaken, speichern.
4. **Erwartet:** die App ID steht in der Liste. Sie ist später die **primäre App ID** der Services ID (Schritt 3).

## 3. Services ID (das ist die „Client-ID“ im Web)
1. In „Identifiers“ auf **+** → **Services IDs** → weiter. Beschreibung `Soccaz Anmeldung`, Identifier z. B. `de.socaz.web.anmeldung` (**merken**: das ist `AUTH_APPLE_ID`).
2. Speichern, danach die Services ID öffnen, **Sign in with Apple** anhaken und **Configure** wählen.
3. **Primary App ID:** die App ID aus Schritt 2.
4. **Website URLs → Domains and Subdomains:** nur die **Domain ohne `https://`**: `socaz.de` (für Staging zusätzlich die Staging-Adresse, z. B. `staging.socaz.de`; **kein** `localhost`, Apple nimmt keine lokalen Adressen).
5. **Return URLs** (Weiterleitungs-URLs, **exakt**, eine je Umgebung):
   - Produktion: `https://socaz.de/api/auth/callback/apple`
   - Staging: `https://<Staging-Adresse>/api/auth/callback/apple`
   (Quelle: die Anmeldung läuft über Auth.js; der Pfad ist `/api/auth/callback/<anbieter>` wie bei Google. Schreibweise genau übernehmen: `https`, kein Schrägstrich am Ende.)
6. **Wichtig, Besonderheit von Apple (erster Verdacht bei Fehlern):** Apple liefert das Ergebnis per **cross-site POST**. Damit der Rückkehr-POST ankommt, müssen die Auth.js-Zustands-Cookies (`state`, `pkce`, `nonce`) mit **`SameSite=None; Secure`** gesetzt sein; sonst bricht die Rückkehr mit „InvalidCheck“ oder fehlendem State ab, **unabhängig vom Zugangsschutz**. Die Cookie-Optionen baut w1 (Namen abstimmen); beim Staging-Test (Schritt 8) ist das der **erste Verdacht**. Weitere Besonderheit: Apple liefert das Ergebnis **nicht** als Link zurück, sondern per **POST** („form_post“) an die Return URL. Das übernimmt Auth.js; es braucht auf dem Server nichts Zusätzliches, **aber** der Zugangsschutz der Testumgebung (Basic-Auth) darf den **POST an `/api/auth/callback/apple`** nicht abfangen (sonst bricht die Anmeldung bei Apple-Rückkehr mit 401 ab; gleiche Falle wie bei Google, siehe `pilot-staging-checkliste.md`).
7. **Done → Continue → Save.** Apple erlaubt je Services ID höchstens 10 URLs (Einzelperson).
8. **Domain-Bestätigung:** Laut Apple-Seite ist **keine Datei** auf den Server zu legen. Zeigt die Konsole trotzdem „Verify“, Hinweis befolgen und melden (Annahme, bei der Generalprobe belegen).

## 4. Schlüssel (`.p8`) erzeugen und sicher ablegen
1. In „Keys“ auf **+**, Name z. B. `Soccaz Anmeldung`, **Sign in with Apple** anhaken, **Configure** → **Primary App ID** = Schritt 2 → speichern → **Continue → Register**.
2. **Download der `.p8`-Datei:** Apple erlaubt den Download **nur einmal** (Annahme, Apple-Seite nennt es in der gelesenen Fassung nicht ausdrücklich: so behandeln, als sei es nur einmal möglich). Datei **sofort** an einen sicheren Ort legen (Passwortmanager oder verschlüsselter Datenträger), **eine Sicherung** an zweiter Stelle. **Nicht** ins Repository, nicht in den Chat, nicht per Mail.
3. Notieren (das sind **keine** Geheimnisse, nur Kennungen): **Key-ID** (10 Zeichen, steht in der Keys-Liste und im Dateinamen `AuthKey_<KEY-ID>.p8`) und **Team-ID** (10 Zeichen, oben rechts im Konto unter „Membership details“).
4. Pro App ID sind **höchstens zwei Schlüssel** erlaubt: bei Rotation den alten erst widerrufen, wenn der neue läuft.

## 5. Die drei Kennungen und ihre Variablennamen
| Name | Bedeutung | Quelle |
|---|---|---|
| `AUTH_APPLE_ID` | die **Services ID** | Schritt 3 |
| `APPLE_TEAM_ID` | Team-ID (10 Zeichen) | Schritt 4 |
| `APPLE_KEY_ID` | Key-ID (10 Zeichen) | Schritt 4 |
| `AUTH_APPLE_SECRET` | das **Client Secret** (ein aus dem Schlüssel erzeugtes JWT, **läuft ab**) | Schritt 6 |
| `APPLE_LOGIN_ENABLED` | `1` = „Mit Apple anmelden“ ist sichtbar; ohne = nur Google | Schritt 7 |
Die Namen müssen mit der Auth-Konfiguration übereinstimmen, die der Entwickler (w1) baut; **bei Abweichung gilt die Konfiguration im Repo** und diese Tabelle wird angepasst.

## 5a. Private Relay und E-Mails (Einschränkung)
Versteckt ein Spieler seine Adresse, bekommt Soccaz eine Adresse `…@privaterelay.appleid.com`. **Mails an diese Adresse kommen nur an, wenn die Absender-Domain bei Apple registriert ist:** Developer-Konto → Sign in with Apple → **Configure for Email Communication**, dort die Absender-Domain (und ggf. Adresse) eintragen. Ohne diesen Schritt (oder solange Mailversand nicht eingerichtet ist, Backlog 211) erreichen Mails diese Spieler **nicht**: die Anmeldung selbst funktioniert trotzdem. Für den 12.12. gilt das als bekannte Einschränkung; Benachrichtigungen laufen in der App.

## 6. Client Secret erzeugen (läuft ab: Erneuerung alle 5 Monate)
Apple verlangt als „Passwort“ kein festes Geheimnis, sondern ein **selbst erzeugtes, signiertes JWT** (Algorithmus ES256, Aussteller = Team-ID, Subject = Services ID, Zielgruppe `https://appleid.apple.com`). **Gültigkeit höchstens 6 Monate**; Soccaz plant **Erneuerung spätestens alle 5 Monate** (Pufferwert aus dem Auftrag; Apple-Seite im Browser gegenlesen, siehe Quellen).
1. Auf dem **eigenen Rechner** (nicht im Chat): im Soccaz-Ordner
```
node scripts/apple-client-secret.mjs <Pfad-zur-.p8-Datei>
```
   Das Skript (von w1; **liegt erst nach dessen Merge im Repository**) liest die Datei, nimmt `APPLE_TEAM_ID`, `APPLE_KEY_ID` und `AUTH_APPLE_ID` aus der Umgebung und **gibt das Secret aus** (eine lange Zeile). **Erwartet:** drei Textteile mit zwei Punkten dazwischen. Ausgabe **nicht** kopieren in Chats; nur direkt in `.env` des Servers (nano) einfügen.
2. **Ablaufdatum eintragen:** in `docs/BETRIEB.md`, Abschnitt „Apple-Anmeldung“, Zeile „Client-Secret gültig bis“, und im Kalender **eine Erinnerung nach 5 Monaten** setzen. Läuft das Secret ab, **bricht „Mit Apple anmelden“ ab**, Google bleibt unberührt.
3. Erneuerung = Schritt 6.1 mit demselben Schlüssel wiederholen, neuen Wert in `.env`, Anwendung neu starten, Prüfung aus Schritt 8.

## 7. Auf dem Server eintragen
In der Datei `.env` auf dem **jeweiligen** Server (Produktion bzw. Staging; `docs/BETRIEB.md`) die Werte aus Schritt 5 eintragen, zuletzt `APPLE_LOGIN_ENABLED=1`. Danach neu starten (`docker compose up -d`, Staging mit `sh scripts/staging-compose.sh up -d`). Die `.p8`-Datei selbst liegt **nicht** auf dem Server (nur das fertige Secret).

## 8. Test auf STAGING (vor Produktion, Pflicht)
1. Staging mit eingetragener Staging-Return-URL (Schritt 3.5) und `APPLE_LOGIN_ENABLED=1` starten.
2. `https://<Staging-Adresse>/anmelden` öffnen: **Erwartet:** zwei Knöpfe („Mit Google anmelden“, „Mit Apple anmelden“); **kein** Dev-Login.
3. „Mit Apple anmelden“ → Apple-Anmeldung → Rückkehr zu Soccaz, angemeldet. **Beim ersten Mal** fragt Apple, ob die E-Mail geteilt oder versteckt wird (**Private Relay**: Soccaz bekommt dann eine Weiterleitungsadresse `…@privaterelay.appleid.com`; das ist erlaubt und muss funktionieren).
4. **Erwartet:** in Soccaz ein **eigenes Konto** (Name nur beim allerersten Login von Apple geliefert: fehlt er, fragt Soccaz im Onboarding danach).
5. Smoke: `node scripts/smoke.mjs https://<Staging-Adresse> --apple` (mit `SMOKE_BASIC_AUTH` aus der Umgebung): alle Zeilen `OK`. Danach **Produktion** mit eigener Return-URL und dem Produktionswert wiederholen.

## 9. Wenn es nicht klappt
| Meldung / Verhalten | Ursache | Abhilfe |
|---|---|---|
| `invalid_client` | Services ID, Team-ID, Key-ID oder Secret falsch bzw. **Secret abgelaufen** | Werte aus Schritt 5 prüfen, Secret neu erzeugen (Schritt 6) |
| `invalid_request` / „Invalid redirect_uri“ | Return URL oder Domain in Schritt 3 stimmt nicht **exakt** | Schreibweise, `https`, kein Schrägstrich, Domain ohne `https://` |
| „InvalidCheck“ / State fehlt bei der Rückkehr | Zustands-Cookies nicht `SameSite=None; Secure` (cross-site POST) | **erster Verdacht**: Cookie-Optionen der Auth-Konfiguration prüfen (w1) |
| Rückkehr zeigt 401 oder leere Seite (nur Staging) | Zugangsschutz fängt den POST von Apple ab | `pilot-staging-checkliste.md`, Abschnitt Zugangsschutz; Callback-Pfad ausnehmen (Annahme, bei der Generalprobe belegen) |
| Anmeldung läuft, aber kein Name | Apple liefert den Namen nur beim ersten Mal | Konto in der Apple-ID-Verwaltung („Apps, die Sign in with Apple nutzen“) entfernen, erneut anmelden, oder Namen im Onboarding eintragen |
| Knopf fehlt | `APPLE_LOGIN_ENABLED` nicht gesetzt oder App nicht neu gestartet | Schritt 7 |

## 9a. Hinweise
- **Betreiber-Einladungen** (Hallen, Vertrag 011) lassen sich nur mit einer **bestätigten Google-Adresse** einlösen: ein Apple-Konto kann **keine Halle einlösen**. Betreiber melden sich deshalb mit Google an.
- Jeder Spieler braucht ein **eigenes** Konto; ein Captain meldet nicht für mehrere Spieler an.

## 10. Kurz-Checkliste
- [ ] Apple-Konto mit Zwei-Faktor und Rechtsname; Developer Program beantragt (99 USD/Jahr, Dauer ein bis zwei Tage)
- [ ] App ID mit Sign in with Apple
- [ ] Services ID mit Domains und **beiden** Return URLs (Staging, Produktion)
- [ ] Key erzeugt, `.p8` sicher abgelegt (zweifach), Team-ID und Key-ID notiert
- [ ] Client Secret erzeugt, Ablaufdatum in `BETRIEB.md` und im Kalender (nach 5 Monaten)
- [ ] Staging: beide Knöpfe, Apple-Anmeldung, Private Relay, Smoke `--apple` grün
- [ ] **Go/No-Go Mi 2.12.:** Staging-Test (Schritt 8) grün? Ja = Apple an. Nein = nur Google, Flag aus, Hinweistexte Google
- [ ] Erst dann Produktion: `.env` ergänzen, `APPLE_LOGIN_ENABLED=1`, Smoke, Probe-Anmeldung
