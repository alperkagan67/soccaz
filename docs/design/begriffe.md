# Begriffsverzeichnis (ENTWURF für 013 M2)
Stand: 2026-11-11 · Code-Stand `origin/main` e6f034d · Verfasser: worker-4 (Doku, kein Code) · Review: worker-2 · Status: Entwurf, nicht entschieden

Zweck: Jedes sichtbare Wort hat eine Bedeutung, und jede Bedeutung hat ein Wort (Vertrag 013 AC-7, Cluster K05 „Unklare Begriffe und Texte“, 55 Funde, Fund-IDs: `docs/design/analyse-frontend-verdichtung.md` Anhang A). Dieses Verzeichnis ist die Vorlage für `docs/design/begriffe.md` in M2 (Umbauplan Abschnitt 5, Punkt 7). Es ändert keinen Code und keinen Vertrag. Wo eine Produktentscheidung fehlt, steht Status „Entscheid nötig“ und die Frage geht an den Orchestrator.

## 1. Wie gelesen wird
- **Bedeutung**: genau eine. Hat der Code heute mehrere, steht hier die vorgeschlagene eine; die übrigen stehen in Abschnitt 3 (Mehrfachbedeutungen).
- **Verbotene Synonyme**: Wörter, die im sichtbaren Text für diesen Begriff nicht mehr vorkommen sollen.
- **Fundstellen**: `Datei:Zeile` unter `src/`, per Suche im Code-Stand e6f034d (Auswahl der wichtigsten; Mengen: Abschnitt 4). Die Zeilen ändern sich mit jedem PR; maßgeblich ist die Suche, nicht die Nummer.
- **Status**: `Entwurf` (aus Vertrag/Code abgeleitet, noch nicht freigegeben) · `Entscheid nötig` (Wahl zwischen zwei Wörtern, nicht aus den Verträgen zu entnehmen) · `entfällt (012 M6a)` (Altmodell, wird nicht als gültig geführt).

## 2. Pflichtbegriffe

### 2.1 Die drei „bestätigt“-Stufen (Umbauplan 5.7, Code geprüft)

| Begriff | Bedeutung (eine) | Verbotene Synonyme | Fundstellen (Auswahl) | Status |
|---|---|---|---|---|
| **Findet statt** | Je Team sind mindestens 4 Spieler bereit (`MIN_READY_PER_TEAM = 4`). Ab da steht das Spiel; es ist noch nichts abgebucht. | „bestätigt“, „Spiel bestätigt“, „gilt als bestätigt“, „steht endgültig“, „Bestätigt: Das Spiel steht“ | Logik `src/server/lobby.ts:229-253`, `src/lib/lobby-rules.ts:4,10-12`; Texte `src/app/lobby/[id]/page.tsx:40` (Status „Bestätigt“), `:95`, `:238` (heute: „Das Spiel gilt als bestätigt, sobald in beiden Teams mindestens 4 Spieler bereit sind“), `src/server/lobby.ts:249` (Titel „Spiel bestätigt“, Text „findet statt“), `src/lib/notification-types.ts:35`, `src/server/mygame.ts:60`, `src/app/app/page.tsx:86`, `src/app/spieler/[id]/page.tsx:38`, `src/components/LobbyBoard.tsx:66`, `src/app/admin/spiele/page.tsx:10`, `src/app/spiele/page.tsx:50` | Entwurf |
| **Preis steht fest** | Beide Captains haben „Letzte Bestätigung“ gedrückt (`finalConfirm`, `homeFinalAt`/`awayFinalAt`); der Anteil je Spieler ist fixiert (`fixShare`). Erst danach kann abgebucht werden (`charge-run.ts:59` ist die Sperre). | „Letzte Bestätigung“, „Spiel bestätigen“, „endgültig bestätigt“, „Bestätigt von beiden Captains“ | Logik `src/server/lobby.ts:312-336,338ff`; Texte `src/app/lobby/[id]/FinalConfirm.tsx:12,14,23,32,36`, `src/app/lobby/[id]/page.tsx:286`, `src/app/lobby/[id]/uebersicht/page.tsx:54`, `src/server/lobby.ts:356,357`, `src/server/payments/charge-run.ts:59`; Turnier (anderer Auslöser, siehe 3.1): `src/app/turniere/[id]/page.tsx:264`, `src/server/tournaments.ts:325` | Entwurf |
| **Ergebnis bestätigt** | Das gemeldete Ergebnis hat das andere Team bestätigt, oder 48 Stunden sind ohne Widerspruch vergangen (automatisch). Hat nichts mit der Lobby zu tun. | „Spiel bestätigt“, „gemeldet und bestätigt“ ohne „Ergebnis“, „Gegner stimmt zu“ | Logik `src/server/results.ts:332-444`, `src/lib/result-rules.ts:47`; Texte `src/app/spiele/[id]/MatchClient.tsx:128,142,147`, `src/app/spiele/[id]/page.tsx:89`, `src/app/lobby/[id]/uebersicht/page.tsx:68,78,93`, `src/app/lobby/[id]/uebersicht/ScoreDialog.tsx:77`, `src/server/results.ts:348,372,383`, `src/server/scheduled.ts:172`, `src/lib/notification-types.ts:38,39` | Entwurf |

### 2.2 Spiel, Lobby und die Handlungen darin

| Begriff | Bedeutung (eine) | Verbotene Synonyme | Fundstellen (Auswahl) | Status |
|---|---|---|---|---|
| **Spiel** | Die Begegnung zweier Teams (das „Match“) in jeder Phase, von der Lobby bis zum Ergebnis. Die Seite vor dem Anstoß heißt Lobby, die danach Spielübersicht/Spielbericht. | „Match“, „Partie“, „Begegnung“; „Spiel“ für eine Spielsuche („Spiel annehmen“ bei einer Suche) | Routen `src/app/lobby/[id]`, `src/app/spiele/[id]`, `src/app/spiel/[token]` (Privatspiel); Texte `src/app/lobby/[id]/uebersicht/page.tsx:19` (Spielübersicht), `src/app/spiele/[id]/page.tsx:65` (Spielbericht), `src/app/lobby/[id]/LobbyClient.tsx:226` (Spiel absagen), `src/app/suche/[id]/AcceptForm.tsx:25` („Spiel annehmen“ bei Spielsuche, Fund ZA-SU-6) | Entwurf |
| **Lobby** | Der Sammelraum eines Spiels vor dem Anstoß: Kader, Uhrzeit, Halle, Bereit. „Offene Lobby“ ist eine Lobby ohne Gegner, die in der Liste „Offene Lobbys“ steht. | „Suche“, „Spielsuche“, „Anfrage“, „Matchmaking“ (sichtbar) für dasselbe Ding (Funde N1-SU-1, N1-MM-1) | `src/app/lobby/[id]/page.tsx:36,144`, `src/app/lobby/offen/[entryId]/page.tsx:13,31,33,54,79,81,103,105`, `src/app/matchmaking/page.tsx:13,29,31`, `src/lib/i18n.ts:13,40,53` (`nav.requests`, `footer.matchmaking`, `home.matchmaking`), `src/app/app/page.tsx:42,62`, `src/app/manifest.ts:22`, `src/app/admin/spiele/page.tsx:10,53` | Entwurf |
| **Spielsuche** | Ein Gesuch mit festem Termin eines Team-Admins/Captains (`/suche/[id]`, `/app/suche/neu`); wird von einem Gegner angenommen und wird dann zur Lobby/zum Spiel. Nicht dasselbe wie eine Lobby. | „Lobby“ für ein Gesuch, „Anfrage“, „Herausforderung“ (Herausforderung = ein Team fordert ein bestimmtes Team direkt heraus, eigener Begriff) | `src/app/suche/[id]/page.tsx:15`, `src/app/suche/[id]/CancelButton.tsx:15,19`, `src/app/app/suche/neu/RequestForm.tsx:95`, `src/app/app/suche/neu/page.tsx:8`, `src/app/hilfe/page.tsx:53`, `src/server/requests.ts:214` | Entscheid nötig (Trennung Lobby/Spielsuche bestätigen, ZA-SU-6) |
| **Bereit** | Ein Spieler hat sich in der Lobby für den Platz bereit gemacht und eine Karte hinterlegt. Zählt zu den 4 je Team für „Findet statt“. | „bereit und bezahlt“, „bereit drücken“ (Altmodell: Bereit = reservierter Betrag) | `src/app/lobby/[id]/page.tsx:95,97,294,311,312`, `src/app/lobby/[id]/LobbyClient.tsx:105`, `src/server/lobby.ts:324,328,552`, `src/components/PlayerLight.tsx:21`, `src/server/mygame.ts:60` („Bereit machen und bezahlen“), `src/server/scheduled.ts:43,64` | Entwurf (Turnier-„Bereit“: siehe 3.1) |
| **Bezahlen** | Der Spieler trägt seinen Anteil an der Hallenmiete (bzw. den Turnier-Eintritt). Im Kartenmodell bucht die Plattform den Anteil von der hinterlegten Karte ab, nachdem „Preis steht fest“ gilt; der Spieler klickt nicht „Bezahlen“. | „Aufladen“, „aus dem Guthaben zahlen“, „reservieren“, „Schritt 3 Bezahlen“ als Schritt-Chip (Fund Y1-GM-04) | `src/app/lobby/[id]/page.tsx:93-97` (Schritte Uhrzeit/Halle/Bezahlen), `src/app/turniere/[id]/page.tsx:101,210,226`, `src/server/mygame.ts:60`, `src/app/agb/page.tsx:18,19,23`, `src/app/hilfe/page.tsx:83-94`, `src/components/PlayerLight.tsx:21` | Entwurf (Bedienung der Zahlung: 012) |
| **Karte erneuern** | Der Spieler ersetzt eine nicht mehr nutzbare gespeicherte Karte (abgelaufen/abgelehnt, `needsNewCard`) durch eine neue. Der freiwillige Wechsel einer funktionierenden Karte ist „Andere Karte hinterlegen“ (siehe 3.2). | „Karte aktualisieren“, „Karte wechseln“, „Neue Karte“, „Zahlungsmittel ändern“ | `src/app/lobby/[id]/CardForm.tsx:111` (`needsNewCard`), `:131,132,151`; `src/app/lobby/[id]/stored-card.ts:3,8`; `src/server/payments/card-actions.ts:22,34,35`; `src/server/payments/stored-card.ts:14`; `src/lib/card-view.ts:22,28` („Karte hinterlegt“, „Keine Karte“); Oberfläche „Karte erneuern“ ist 012 M5 | Entscheid nötig (ein Wort für Pflicht-Erneuerung und freiwilligen Wechsel?) |
| **Zahlung ausstehend** | Für den Spieler steht der Anteil fest, die Abbuchung ist aber noch nicht erfolgreich (noch nicht versucht, fehlgeschlagen oder wartet auf Nachzahlung). Gäste sehen das nie namentlich (Fund Y1-GM-07, Cluster K12). | „offen“ allein, „unbezahlt“, „Zahlung läuft“ (nur Turnierphase, siehe 3.1), „Nachzahlung“ | `src/server/wallet.ts:198` („Nachzahlung Anteil“), `src/app/turniere/[id]/page.tsx:31`, `src/app/turniere/page.tsx:11` („Zahlung läuft“), `src/app/api/webhooks/stripe/route.ts:42` („Zahlung fehlgeschlagen“); Datenschutz-Fix in der Lobby: 012 M3b | Entscheid nötig (Wort für „noch nicht abgebucht“ und „fehlgeschlagen“ trennen?) |
| **Entfernen** | Eine andere Person oder eine Sache wird aus einer Liste genommen: Spieler aus der Lobby, Mitglied aus dem Team, Team aus dem Turnier, Kommentar durch die Moderation, ein Tor. Wer sich selbst herausnimmt, „verlässt“ oder „meldet sich ab“ (siehe Abmelden). | „Rauswerfen“, „Löschen“ (Löschen = Daten dauerhaft weg, z. B. Konto), „Kicken“ | `src/app/lobby/[id]/LobbyClient.tsx:211`, `src/app/teams/[slug]/TeamManage.tsx:99`, `src/app/turniere/[id]/page.tsx:232,255`, `src/app/admin/moderation/ModerationButtons.tsx:13,14`, `src/app/lobby/[id]/uebersicht/ScoreDialog.tsx:71`, `src/server/team-admin.ts:107,108,111`, `src/server/wallet.ts:314`, `src/server/lobby.ts:552` | Entwurf |
| **Abmelden** | Nur das Abmelden vom Konto (Logout). Das Zurücktreten aus einem Spiel, Team oder Turnier heißt „Verlassen“. | „Abmelden“ für Lobby/Team/Turnier-Austritt; „Austreten“ als zweites Wort neben „Verlassen“ | Logout `src/lib/i18n.ts:22` (`nav.signOut`); Austritt heute als „Abmelden“: `src/app/lobby/[id]/LobbyClient.tsx:113`, `src/app/turniere/[id]/page.tsx:255`, `src/app/ligen/[id]/page.tsx:86`, `src/server/lobby.ts:561`, `src/server/tournaments.ts:196,356,360`, `src/server/leagues.ts:61`, `src/app/hilfe/page.tsx:88,89`, `src/app/agb/page.tsx:23`; „Verlassen“ heute: `src/app/lobby/offen/[entryId]/page.tsx:79`, `src/app/teams/[slug]/TeamManage.tsx:105`, `src/server/team-admin.ts:101,132` | Entscheid nötig (Wortwahl; betrifft AGB und Hilfe, deshalb Produktentscheid) |
| **Captain** | Der Team-Admin eines Teams in einem Spiel oder Turnier. Er wählt Uhrzeit/Halle, drückt „Letzte Bestätigung“, meldet und bestätigt Ergebnisse. Vertrag 008:9 führt „Captain (Team-Admin)“ als dieselbe Rolle (Datenbank: Team-Rolle `admin`, `src/db/schema.ts:21`). | „Team-Admin“, „Admin“ (Admin ohne Zusatz ist nur der Plattform-Admin), „Kapitän“ | Captain: `src/app/lobby/[id]/FinalConfirm.tsx:14,23,36`, `src/app/lobby/[id]/page.tsx:84,90,97,286,312`, `src/app/lobby/offen/[entryId]/page.tsx:50`, `src/app/turniere/[id]/page.tsx:99,210,225,226,277`, `src/app/turniere/[id]/RegisterForm.tsx:11`, `src/app/matchmaking/page.tsx:31,38`; Team-Admin (soll weichen, 54 sichtbare Texte in 29 Dateien): `src/app/app/page.tsx:103,114`, `src/app/app/suche/neu/page.tsx:24`, `src/app/matchmaking/page.tsx:97`, `src/app/profitag/[id]/page.tsx:52`, `src/app/lobby/[id]/LobbyClient.tsx:111,125`, `src/app/lobby/[id]/page.tsx:250`, `src/app/hilfe/page.tsx:45,68,71,107`, `src/app/einladung/[token]/page.tsx:17,20` | Entscheid nötig („Captain“ überall? Funde SM-GL-5, N3-AP-3, Y1-CM-19, Y1-CD-48, Y2-S-04) |
| **Veranstalter** | Wer ein Turnier oder Privatspiel anlegt und verwaltet (Einladungslink, Kader öffnen, Teams einteilen, Turnier absagen). Für Turniere ist das ein freigeschalteter Nutzer. Nicht der Hallenbetreiber und nicht der Captain. | „Turnier-Manager“, „Organisator“, „Admin“; „Betreiber“ (Betreiber = Hallenbetreiber, 011) | `src/app/turniere/[id]/page.tsx:120`, `src/app/turniere/page.tsx:22,38`, `src/app/app/turniere/neu/page.tsx:28`, `src/app/admin/nutzer/page.tsx:59`, `src/server/tournaments.ts:59,338,347,360,361,367,540,575`, `src/server/lobby.ts:519,549`, `src/server/privategame.ts:119,179`, `src/server/results.ts:438`, `src/app/spiel/[token]/page.tsx:18` | Entwurf |
| **Nachrücker** | Ein registrierter Nutzer, der in eine offene Lobby als Ersatz eintritt und von einem Team-Admin einem Team zugewiesen wird; er übernimmt den Platz eines Ausgefallenen. | „Ersatzspieler“, „Ersatz“ (beides im Code vorhanden), „Reserve“ | Heute „Ersatzspieler“/„Ersatz“: `src/app/lobby/[id]/LobbyClient.tsx:125,127,131`, `src/app/lobby/[id]/page.tsx:344,382`, `src/components/LobbyBoard.tsx:49`, `src/lib/notification-types.ts:34`, `src/server/lobby.ts:479,487,498`, `src/server/wallet.ts:325,334,336`, `src/app/hilfe/page.tsx:65,68,89`; Wort „Nachrücker“ steht nicht in der Oberfläche | Entscheid nötig („Nachrücker“ oder „Ersatzspieler“, Vorschlag: „Ersatzspieler“, weil schon überall im Code) |
| **Team** | Eine feste Gruppe von Spielern mit Namen, Seite und Teamfarbe (Vertrag 007). | „Mannschaft“ (kommt im Code nicht vor, soll es nicht), „Club“, „Verein“, „Kader“ für das Team (Kader = die Spielerliste eines Teams in einem Spiel) | 481 sichtbare Treffer in 98 Dateien; Kernrouten `src/app/teams`, `src/app/teams/[slug]/page.tsx`, `src/app/app/teams/neu/TeamForm.tsx`; Verwechslung im Privatspiel: `src/app/lobby/[id]/page.tsx:97` („Jedes Team macht seine Spieler bereit“) bei Privatspiel (Fund Y1-SM-18) | Entwurf |
| **Elo** | Die Spielstärke-Zahl eines Spielers oder Teams, die sich aus Ergebnissen ergibt: Sieg gegen ein stärkeres Team bringt mehr (`src/lib/elo.ts`). Wird als „Elo“ angezeigt und einmal erklärt. | „Spielstärke“ für dieselbe Zahl; „Stärke 1 bis 5“ (das ist die Selbsteinschätzung, siehe 3.1) | `src/app/hilfe/page.tsx:56,99,100,101`, `src/app/lobby/[id]/page.tsx:336,369`, `src/app/spieler/[id]/page.tsx:147,155`, `src/app/teams/[slug]/page.tsx:113,136`, `src/app/teams/page.tsx:69`, `src/app/suche/[id]/page.tsx:80`, `src/components/LobbyBoard.tsx:142` | Entscheid nötig („Elo“ im Text oder „Spielstärke“ mit Erklärung für Neulinge; Funde Y1-GM-12, Y2-G-08, Y1-XM-41) |
| **Rang** | Die Platzierung in der Rangliste (nur mit mindestens 5 gespielten Spielen). „Rangliste“ ist die Seite `/rangliste`. | „Platz“ (für Ranglisten-Position), „Ranking“ | `src/app/rangliste/page.tsx:9,21,102`, `src/app/spieler/[id]/page.tsx:147` („Rang ab 5 Spielen“), `src/app/teams/[slug]/page.tsx:113`, `src/lib/i18n.ts:15` (`nav.ranking`), `src/app/app/page.tsx:64` | Entwurf |

### 2.3 Altmodell (kein gültiger Begriff)

Diese Wörter gehören dem Guthaben-Modell. Sie werden nicht als gültig geführt (Vertrag 012, Entfernen in M6a: Oberfläche und Texte, M6b: Code, Schema, Tests; Vertrag 013 AC-14: spätestens mit M3 kein Guthaben für Spieler sichtbar).

| Begriff | Bedeutung im Altmodell | Verbotene Synonyme (im neuen Text) | Fundstellen (Auswahl) | Status |
|---|---|---|---|---|
| Guthaben | Vorab aufgeladener Geldbetrag auf dem Konto | – (Begriff entfällt; Ersatz: „Karte hinterlegt“) | `src/lib/i18n.ts:33` (`nav.wallet`: „Guthaben“, im Kopf/Menü), `src/app/app/guthaben/page.tsx:15,52,53,56,57,60,64`, `src/app/app/page.tsx:55`, `src/app/hilfe/page.tsx:76,83,88,93,94`, `src/app/agb/page.tsx:19`, `src/app/admin/einstellungen/page.tsx:24`, `src/app/admin/finanzen/page.tsx:26` | entfällt (012 M6a) |
| Aufladung / Aufladen | Geld aufs Guthaben einzahlen | – | `src/app/app/guthaben/page.tsx:18,81`, `src/app/app/guthaben/TopUpForm.tsx:72,74`, `src/app/api/belege/[id]/route.ts:22`, `src/app/admin/finanzen/page.tsx:24`, `src/app/admin/codes/page.tsx:31,40,64` | entfällt (012 M6a) |
| Rabatt / Rabattcode | Bonus beim Aufladen | – | `src/app/app/guthaben/TopUpForm.tsx:57`, `src/app/app/guthaben/page.tsx:19`, `src/app/admin/codes/page.tsx:10,18`, `src/app/admin/finanzen/page.tsx:22`, `src/server/payments.ts:114` | entfällt (012 M6a) |
| Reservieren („Anteil reserviert“) | Beim Bereitmachen wird der höchste Anteil vom Guthaben gesperrt | – | `src/app/lobby/[id]/page.tsx:294`, `src/app/app/guthaben/page.tsx:60`, `src/app/admin/einstellungen/page.tsx:32` | entfällt (012 M6a); Text am Spielstart-Minimum 4 je Team bleibt (Backlog 57) |
| Startgebühr, Bonus, Hallenkosten (Verlaufsarten) | Buchungsarten im Guthaben-Verlauf | – | `src/app/app/guthaben/page.tsx:17-26`, `src/server/wallet.ts:198` (Fund SM-GU-2) | entfällt (012 M6a) |

## 3. Mehrfachbedeutungen und Widersprüche

### 3.1 Ein Wort, mehrere Dinge

| Wort | Bedeutungen heute | Vorschlag | Fundstellen |
|---|---|---|---|
| **bestätigt / Bestätigung** (53 sichtbare Treffer in 28 Dateien, 9 mit „Bestätigung“) | (1) Spiel findet statt · (2) Preis steht fest („Letzte Bestätigung der Captains“) · (3) Ergebnis bestätigt · (4) Halle sagt zu („Die Hallen haben bestätigt“, „Von der Halle bestätigt“) · (5) Uhrzeit festgelegt („Uhrzeit bestätigt, wartet auf die Hallen“) · (6) Buchung erfolgt („ist bestätigt und bezahlt“) · (7) Sicherheitsabfrage („Tippe LÖSCHEN zur Bestätigung“) · (8) Zahlung beim Anbieter bestätigt (Altmodell) | (1) „Findet statt“, (2) „Preis steht fest“ / Knopf „Preis fest machen“ (Wortwahl offen), (3) „Ergebnis bestätigt“, (4) „Zusage der Halle“ (Vertrag 011 spricht von Zusage/Ablehnung, Fund Y2-H-06), (5) „Termin steht“, (6) „Halle gebucht“, (7) „Zur Sicherheit …“, (8) entfällt | (4) `src/server/veto.ts:36,71`, `src/app/admin/buchungen/page.tsx:18`, `src/app/halle/page.tsx:18`; (5) `src/app/lobby/[id]/page.tsx:93`; (6) `src/server/booking.ts:48`; (7) `src/app/app/einstellungen/ProfileForm.tsx:103`, `src/server/account-actions.ts:42`; (8) `src/app/app/guthaben/page.tsx:71`; Widerspruch auf einer Seite: Fund Y1-CD-03 (`src/app/lobby/[id]/page.tsx:238` „gilt als bestätigt, sobald in beiden Teams …“ gegen `:286` „Mit dem Bestätigen beider Captains steht er fest“) |
| **Bereit** | Spieler-Bereit in der Lobby (2.2) · Team-Bereit im Turnier (Captain drückt „Bereit“, wenn das Team komplett bezahlt hat, `tournaments.ts:276-281`) · Zustand in der Spielerliste (`components/PlayerLight.tsx:21`) | Spieler: „Bereit“; Turnier: eigener Name (offen, Vorschlag „Team startklar“) | `src/app/turniere/[id]/page.tsx:205,216,217`, `src/server/tournaments.ts:276,278,281,753`, `src/db/schema-league.ts:122` |
| **Preis steht fest** | Teamspiel: beide Captains bestätigen · Turnier: alle Plätze belegt und alle Teams vollzählig | Beide behalten das Wort; der Auslöser steht jeweils im Erklärtext | `src/app/turniere/[id]/page.tsx:264`, `src/server/tournaments.ts:325`, `src/server/lobby.ts:312-336` |
| **Lobby ↔ Spiel ↔ Suche** | „Offene Lobbys“ (Liste), „Offene Suchen (0)“ (Matchmaking-Seite), „Lobby aufmachen“ (Footer, Menü), „Spiel suchen“ (Mitte der Leiste), „Spielsuche“ (Gesuch mit festem Termin) | Siehe 2.2: Lobby (Sammelraum), Spielsuche (Gesuch), „Spiel suchen“ bleibt die Handlung in der Leiste | `src/lib/i18n.ts:13,20,40,53`, `src/app/matchmaking/page.tsx`, `src/app/suche`; Funde N1-SU-1, N1-MM-1, Y2-C-25 |
| **Admin** | Team-Admin (Team-Rolle) · Plattform-Admin (Nutzerrolle `admin`) · „Admin“ als Kontakt („E-Mail an den Admin“) · „Zum Admin machen“ (Team) · „Socaz-Admin“ (Turnier-Veranstalter anrufen) | „Admin“ ohne Zusatz nur der Plattform-Admin (Admin 1/2, 009); im Team „Captain“ | `src/server/tournaments.ts:59`, `src/app/turniere/page.tsx:38`, `src/app/teams/[slug]/TeamManage.tsx`; Funde Y1-CM-19, AD-NU-6 („Plattform-Admin“ statt „Admin“) |
| **Stärke** | Selbsteinschätzung 1 bis 5 beim Anlegen und Suchen („Locker … Ex-Vereinsspieler“, `src/lib/labels.ts:1-6`) · Elo-Zahl („Spielstärke (Elo)“) · „stärker“ in der Rangliste | Selbsteinschätzung: „Spielniveau“ (1 bis 5); Elo: „Elo“ mit einmaliger Erklärung (siehe 2.2) | `src/app/app/teams/neu/TeamForm.tsx:36,40`, `src/app/app/suche/neu/RequestForm.tsx:60`, `src/app/matchmaking/QueueForm.tsx:42`, `src/app/hilfe/page.tsx:99-101`; Fund GM-SU-5 („Stärke ab/bis“ ohne Erklärung) |
| **Absagen / Absage** | Der Veranstalter/Admin sagt ein Spiel ab · das System sagt zur Frist automatisch ab (zu wenige Bereite, nicht alle bezahlt) · „Abgesagt“ als Status | „Abgesagt“ (Status) und je Auslöser ein Satz, wer abgesagt hat | `src/app/lobby/[id]/LobbyClient.tsx:226,236,239`, `src/app/lobby/[id]/page.tsx:41,241`, `src/server/scheduled.ts:64,115`, `src/server/tournaments.ts:575,625` |
| **Entfernen ↔ Löschen ↔ Verlassen ↔ Abmelden** | Vier Wörter für „raus aus“ | Entfernen (andere), Verlassen (selbst), Abmelden (Logout), Löschen (Daten dauerhaft) | Siehe 2.2 |
| **S, U, N, „S-U-N“** | Kürzel für Siege, Unentschieden, Niederlagen ohne Legende (Funde Y1-GM-29, Y1-GD-29, Y1-SM-39, Y1-CM-22, Y2-G-08) | Ausgeschrieben: „Siege / Unentschieden / Niederlagen“ oder Legende | `src/app/ligen/[id]/page.tsx:51`, `src/app/rangliste/page.tsx:66`, `src/app/teams/[slug]/page.tsx:111` |
| **Fachwörter ohne Erklärung** | „K.-o.-System“, „Kader füllen“, „vollzählig“, „Bracket“, „Ampel wird grün“, „Veto“, „frei/belegt“, „Siegchance“ (Funde Y1-GD-24, Y1-SM-32, Y1-GM-12, Y2-H-06) | Je Wort eine Kurzerklärung oder ein Alltagswort; Liste in M2 mit dem Nutzer abstimmen | `src/app/turniere/[id]/page.tsx:31,99,101,277`, `src/app/halle/page.tsx:18`, `src/app/lobby/[id]/page.tsx:336` |
| **Jargon im Admin** | „Ledger“, „Status confirmed“, Objekt-IDs, Aktionscodes (`user.role`, `comment.remove_and_warn`) (Fund AD-ALL-8) | Klartext-Beschriftungen im Admin | `src/app/admin/finanzen`, `src/app/admin/protokoll` |

### 3.2 Zwei Wörter, eine Sache

| Sache | Heutige Wörter | Vorschlag |
|---|---|---|
| Rolle des Team-Chefs | „Captain“, „Team-Admin“, „Admin“ | „Captain“ (Abschnitt 2.2) |
| Spieler, der einspringt | „Ersatzspieler“, „Ersatz“, (geplant: „Nachrücker“) | „Ersatzspieler“ |
| Austritt | „Abmelden“, „Verlassen“, „Austreten“ | „Verlassen“ (Abmelden nur Logout) |
| Karte ersetzen | „Andere Karte hinterlegen“, „Karte hinterlegen“, (geplant: „Karte erneuern“) | „Karte erneuern“ bei Pflicht, „Andere Karte hinterlegen“ bei freiwilligem Wechsel, oder ein Wort für beides (Entscheid) |
| Selbstbeurteilung | „Stärke“, „Spielstärke“, „Spielniveau“ | „Spielniveau“ (1 bis 5) |

## 4. i18n-Inventar

### 4.1 Mengen im Code (sichtbare Texte, Stand e6f034d)
Die Zählung sucht Zeichenketten und Text zwischen Tags in `src/` (Kommentare und `import`-Zeilen ausgenommen). Sie zählt Zeilen mit mindestens einem Treffer; Bezeichner und Klassen sind weitgehend herausgefiltert, einzelne Fehltreffer sind möglich. Die Zahlen zeigen die Größenordnung, nicht eine Prüfsumme.

| Begriffsfamilie | Zeilen | Dateien |
|---|---|---|
| spiel | 429 | 121 |
| team | 481 | 98 |
| lobby | 163 | 48 |
| bezahlen/zahl | 127 | 47 |
| team-admin | 54 | 29 |
| bestätigt | 53 | 28 |
| guthaben (Altmodell) | 43 | 23 |
| captain | 41 | 17 |
| bereit | 38 | 19 |
| absagen/abgesagt | 45 | 24 |
| veranstalter | 25 | 14 |
| ersatz(spieler) | 21 | 10 |
| stärke | 22 | 16 |
| elo | 20 | 11 |
| entfernen | 23 | 17 |
| aufladen (Altmodell) | 16 | 9 |
| abmelden | 14 | 10 |
| rang | 12 | 9 |
| rabatt (Altmodell) | 7 | 6 |
| verlassen | 7 | 5 |
| findet statt | 1 | 1 |
| preis steht fest | 2 | 2 |
| bestätigung | 9 | 8 |
| mannschaft | 0 | 0 |

Zwei Befunde daraus: „Findet statt“ kommt als sichtbarer Text nur einmal vor (`src/server/lobby.ts:249`, Benachrichtigung); der Rest sagt „bestätigt“. „Team-Admin“ (54 Zeilen) kommt häufiger vor als „Captain“ (41) und widerspricht damit der Entscheidung, „Captain“ als Wort zu führen.

### 4.2 Schlüssel in `src/lib/i18n.ts` (Wörterbuch, Deutsch/Englisch)
Nur diese Schlüssel laufen heute über das Wörterbuch (Navigation, Start, Anmeldung, Fußzeile). Alle übrigen Seiten haben harte Texte im Quelltext (4.1). Ziel von M2 (Cluster K05): neue und überarbeitete Seiten lesen ihre Wörter aus Schlüsseln, die Begriffe aus Abschnitt 2 stehen einmal.

| Schlüssel | Zeile | Deutsch | Englisch | Begriff / Hinweis |
|---|---|---|---|---|
| nav.requests | 13 | Offene Lobbys | Open lobbies | Lobby |
| nav.live | 14 | Livescore | Live scores |  |
| nav.ranking | 15 | Rangliste | Rankings | Rang |
| nav.teamGame | 16 | Teamspiel | Team game | Team |
| nav.privateGame | 17 | Privatspiel | Private game |  |
| nav.tournaments | 18 | Turniere | Tournaments |  |
| nav.profile | 19 | Profil | Profile |  |
| nav.findGame | 20 | Spiel suchen | Find a game | Handlung |
| nav.signIn | 21 | Anmelden | Sign in |  |
| nav.signOut | 22 | Abmelden | Sign out | Abmelden = Logout |
| nav.notifications | 23 | Benachrichtigungen | Notifications |  |
| nav.notificationsUnread | 24 | Benachrichtigungen, {count} ungelesen | Notifications, {count} unread |  |
| nav.admin | 25 | Admin | Admin |  |
| nav.main | 26 | Hauptnavigation | Main navigation |  |
| footer.legal | 27 | Rechtliches | Legal |  |
| footer.imprint | 28 | Impressum | Imprint |  |
| footer.privacy | 29 | Datenschutz | Privacy |  |
| footer.help | 30 | Hilfe | Help |  |
| footer.contact | 31 | Kontakt | Contact |  |
| footer.teams | 32 | Teams | Teams | Team |
| nav.wallet | 33 | Guthaben | Balance | entfällt (012 M6a) |
| menu.profile | 34 | Mein Profil | My profile |  |
| menu.area | 35 | Mein Bereich | My area |  |
| menu.settings | 36 | Konto und Einstellungen | Account and settings |  |
| footer.terms | 37 | AGB | Terms |  |
| footer.rules | 38 | Hausordnung | House rules |  |
| footer.leagues | 39 | Ligen | Leagues |  |
| footer.matchmaking | 40 | Lobby aufmachen | Open a lobby | Lobby |
| footer.tournaments | 41 | Turniere | Tournaments |  |
| footer.proDay | 42 | Profi-Tag | Pro day |  |
| footer.players | 43 | Spieler | Players |  |
| footer.venues | 44 | Hallen | Venues |  |
| footer.freePlayers | 45 | Mitspieler gesucht | Players wanted |  |
| footer.language | 46 | Sprache | Language |  |
| home.title1 | 47 | Hallenfußball. | Indoor football. |  |
| home.title2 | 48 | Gegner finden. Spielen. | Find opponents. Play. |  |
| home.lead | 49 | Gründe dein Team, lade deine Jungs per Link ein und fordere andere Teams in NRW heraus. | Create your team, invite your mates with a link and challenge other teams in North Rhine-Westphalia. | Team |
| home.start | 50 | Jetzt starten | Get started |  |
| home.createTeam | 51 | Team gründen | Create a team | Team |
| home.viewRequests | 52 | Offene Lobbys ansehen | Browse open lobbies | Lobby |
| home.matchmaking | 53 | Lobby aufmachen | Open a lobby | Lobby |
| home.livescore | 54 | Livescore | Live scores |  |
| home.openRequests | 55 | Offene Lobbys | Open lobbies and searches | Lobby |
| home.noRequests | 56 | Noch keine offenen Lobbys. Sei die Erste, die einen Gegner sucht. | No open lobbies yet. Be the first to look for an opponent. | Lobby |
| home.partners | 57 | Partner | Partners |  |
| how.title | 58 | So funktioniert Socaz | How Socaz works |  |
| how.lead | 59 | In vier Schritten vom Team zum Spiel. Kostenlos anmelden, bezahlt wird nur deine Hallenmiete. | From team to match in four steps. Sign up for free, you only pay your share of the hall. | Team |
| how.s1.title | 60 | Team gründen | Create a team | Team |
| how.s1.text | 61 | Melde dich mit Google an und gründe dein Team. Schick den Einladungslink per WhatsApp an deine Mitspieler. | Sign in with Google and create your team. Send the invite link to your mates via WhatsApp. | Team |
| how.s2.title | 62 | Gegner finden | Find an opponent |  |
| how.s2.text | 63 | Mach mit deinem Team eine Lobby auf. Ein anderes Team tritt an, die Captains einigen sich auf die Uhrzeit. | Look for a match yourself or put your team in the queue. We look for a team of similar strength and a matching time. | Captain |
| how.s3.title | 64 | Termin wählen, Halle bannen | Pick a time, ban halls |  |
| how.s3.text | 65 | Beide Teams sehen Kader und Stärke des anderen und einigen sich auf Tag und Uhrzeit. Dann bestätigen die Hallen, ob sie frei sind, und ihr bannt abwechselnd. Die letzte Halle wird gespielt. | Both teams see each other's squad and strength and agree on a day and time. Then the halls confirm they are free and you take turns banning. The last hall is played. | Team |
| how.s4.title | 66 | Spielen und zählen | Play and count |  |
| how.s4.text | 67 | Tore werden direkt am Spielfeldrand erfasst. Danach gibt es Statistik, Abzeichen, Rangliste und den Spieler des Spiels. | Goals are recorded right at the pitch. Afterwards you get stats, badges, rankings and the player of the match. | Rang |
| how.price.title | 68 | Was kostet das? | What does it cost? |  |
| how.price.text | 69 | Die Anmeldung und alle Funktionen sind kostenlos. Du zahlst nur deinen Anteil an der Hallenmiete: Halle {price60} für 60 Minuten, geteilt durch alle zahlenden Spieler. Du lädst dein Guthaben auf, den Rest erledigen wir. | Signing up and all features are free. You only pay your share of the hall: {price60} for 60 minutes, split between all paying players. You top up your balance, we handle the rest. | entfällt (012 M6a) |
| how.more | 70 | Alles genau erklärt: Hilfe und Fragen | Everything explained: help and questions |  |
| signin.title | 71 | Anmelden | Sign in |  |
| signin.lead | 72 | Mit deinem Google-Konto. Kein Passwort nötig. | With your Google account. No password needed. |  |
| signin.google | 73 | Mit Google anmelden | Sign in with Google |  |
| signin.banned | 74 | Dein Konto ist gesperrt. Wenn du das für einen Fehler hältst, schreib uns über die Kontaktseite (unten in der Fußzeile). | Your account is suspended. If you think this is a mistake, contact us. |  |
| signin.unavailable | 75 | Die Anmeldung ist gerade nicht verfügbar. Bitte versuche es später noch einmal. | Sign-in is currently unavailable. Please try again later. |  |

Auffällig im Wörterbuch: `nav.wallet` („Guthaben“ / „Balance“, Zeile 33) und der Text `how.price.text` („Du lädst dein Guthaben auf …“, Altmodell) entfallen mit 012 M6a. `how.s2.text` unterscheidet sich zwischen Deutsch („Mach mit deinem Team eine Lobby auf“) und Englisch („Look for a match yourself or put your team in the queue“): zwei verschiedene Bedeutungen für denselben Schritt. `home.openRequests` heißt deutsch „Offene Lobbys“, englisch „Open lobbies and searches“ (Lobby und Suche vermischt, Fund N1-SU-1). `nav.requests` trägt intern den Namen „requests“ (Anfragen), sichtbar „Offene Lobbys“.


## 5. Offene Entscheide für den Orchestrator
1. **Captain oder Team-Admin** in allen Texten (Vorschlag „Captain“; DB-Rolle bleibt `admin`).
2. **Abmelden/Verlassen**: Logout = „Abmelden“, Austritt = „Verlassen“? Betrifft AGB-Text („abmelden bis 24 Stunden vor Anstoß“, `src/app/agb/page.tsx:23`) und Hilfe.
3. **Lobby und Spielsuche** getrennt führen und beide erklären?
4. **Elo** im Text lassen (mit Erklärung) oder „Spielstärke“ sagen?
5. **Karte erneuern**: ein Wort für Pflicht-Erneuerung und freiwilligen Wechsel?
6. **Zahlung ausstehend**: ein Wort für „noch nicht abgebucht“ und „fehlgeschlagen“ oder zwei?
7. **Turnier-„Bereit“** und **Ersatzspieler/Nachrücker**: Wortwahl.
8. Wortwahl für „Preis steht fest“ als Knopf (heute „Ja, mein Team ist komplett: Spiel bestätigen“).

## 6. Quellen
- `docs/design/analyse-frontend-verdichtung.md`, Cluster K05 und Anhang A (K05-Funde, 55); Detail in `analyse-frontend-x/y1/y2/admin.md`.
- `docs/design/umbauplan-013.md`, Abschnitt 5, Punkt 7 („Wann gilt ein Spiel als bestätigt?“), M2 (`begriffe.md`).
- Verträge 007 (Rollen, Teamfarbe), 008 (Captain, Bereit, Frist), 011 (Zusage der Halle), 012 (Kartenmodell, M6a/M6b), 013 (AC-7, AC-14).
- Code: `src/server/lobby.ts`, `src/lib/lobby-rules.ts`, `src/server/results.ts`, `src/server/payments/charge-run.ts`, `src/server/mygame.ts`.
