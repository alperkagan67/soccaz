# Begriffsverzeichnis (ENTWURF für 013 M2)
Stand: 2026-11-11 · Code-Stand `origin/main` e6f034d · Verfasser: worker-4 (Doku, kein Code) · Review: worker-2 (R-T137 REVIEW-CHANGES, Nachbesserung eingearbeitet; REVIEW-OK steht aus) · Status: Entwurf; acht Entscheide von t9 (2026-11-11) sind eingetragen, zwei Punkte (Nr. 9 und 10 in Abschnitt 5) sind offen und noch zu bestätigen (t9)

Zweck: Jedes sichtbare Wort hat eine Bedeutung, und jede Bedeutung hat ein Wort (Vertrag 013 AC-7, Cluster K05 „Unklare Begriffe und Texte“, 55 Funde, Fund-IDs: `docs/design/analyse-frontend-verdichtung.md` Anhang A). Dieses Verzeichnis ist die Vorlage für `docs/design/begriffe.md` in M2 (Umbauplan Abschnitt 5, Punkt 7). Es ändert keinen Code und keinen Vertrag. Die Produktentscheide stehen in Abschnitt 5; entschieden sind Nr. 1 bis 8, offen und zu bestätigen (t9) sind Nr. 9 und 10.

## 1. Wie gelesen wird
- **Bedeutung**: genau eine. Hat der Code heute mehrere, steht hier die vorgeschlagene eine; die übrigen stehen in Abschnitt 3 (Mehrfachbedeutungen).
- **Verbotene Synonyme**: Wörter, die im sichtbaren Text für diesen Begriff nicht mehr vorkommen sollen.
- **Fundstellen**: `Datei:Zeile` unter `src/`, per Suche im Code-Stand e6f034d (Auswahl der wichtigsten; Mengen: Abschnitt 4). Die Zeilen ändern sich mit jedem PR; maßgeblich ist die Suche, nicht die Nummer.
- **Status**: `Entwurf` (aus Vertrag/Code abgeleitet, noch nicht freigegeben) · `entschieden (t9, 2026-11-11)` (Wortwahl vom Orchestrator festgelegt) · `entfällt (012 M6a)` (Altmodell, wird nicht als gültig geführt).

## 2. Pflichtbegriffe

### 2.1 Die drei „bestätigt“-Stufen (Umbauplan 5.7, Code geprüft)

| Begriff | Bedeutung (eine) | Verbotene Synonyme | Fundstellen (Auswahl) | Status |
|---|---|---|---|---|
| **Findet statt** | Je Team sind mindestens 4 Spieler bereit (`MIN_READY_PER_TEAM = 4`). Ab da steht das Spiel; es ist noch nichts abgebucht. | „bestätigt“, „Spiel bestätigt“, „gilt als bestätigt“, „steht endgültig“, „Bestätigt: Das Spiel steht“ | Logik `src/server/lobby.ts:229-253`, `src/lib/lobby-rules.ts:4,10-12`; Texte `src/app/lobby/[id]/page.tsx:40` (Status „Bestätigt“), `:95`, `:238` (heute: „Das Spiel gilt als bestätigt, sobald in beiden Teams mindestens 4 Spieler bereit sind“), `src/server/lobby.ts:249` (Titel „Spiel bestätigt“, Text „findet statt“), `src/lib/notification-types.ts:35`, `src/server/mygame.ts:60`, `src/app/app/page.tsx:86`, `src/app/spieler/[id]/page.tsx:38`, `src/components/LobbyBoard.tsx:66`, `src/app/admin/spiele/page.tsx:10`, `src/app/spiele/page.tsx:50` | Entwurf; Text `src/app/lobby/[id]/page.tsx:238` („Das Spiel gilt als bestätigt, sobald …“) wird in M3 auf „Findet statt, sobald in beiden Teams mindestens 4 bereit sind“ umgestellt |
| **Preis steht fest** | Beide Captains haben „Preis bestätigen“ gedrückt (`finalConfirm`, `homeFinalAt`/`awayFinalAt`); der Anteil je Spieler ist fixiert (`fixShare`). Erst danach kann abgebucht werden (`charge-run.ts:59` ist die Sperre). Der Knopf des Captains heißt „Preis bestätigen“, der Zustand danach „Preis steht fest“. | „Letzte Bestätigung“, „Spiel bestätigen“, „endgültig bestätigt“, „Bestätigt von beiden Captains“ | Logik `src/server/lobby.ts:312-336,338ff`; Texte `src/app/lobby/[id]/FinalConfirm.tsx:12,14,23,32,36`, `src/app/lobby/[id]/page.tsx:286`, `src/app/lobby/[id]/uebersicht/page.tsx:54`, `src/server/lobby.ts:356,357`, `src/server/payments/charge-run.ts:59`; Turnier (anderer Auslöser, siehe 3.1): `src/app/turniere/[id]/page.tsx:264`, `src/server/tournaments.ts:325` | entschieden (t9, 2026-11-11) (Knopf „Preis bestätigen“, Status „Preis steht fest“) |
| **Ergebnis bestätigt** | Das gemeldete Ergebnis hat das andere Team bestätigt, oder 48 Stunden sind ohne Widerspruch vergangen (automatisch). Hat nichts mit der Lobby zu tun. „bestätigt“ bleibt in der Oberfläche nur für diese Bedeutung. | „Spiel bestätigt“, „gemeldet und bestätigt“ ohne „Ergebnis“, „Gegner stimmt zu“ | Logik `src/server/results.ts:332-444`, `src/lib/result-rules.ts:47`; Texte `src/app/spiele/[id]/MatchClient.tsx:128,142,147`, `src/app/spiele/[id]/page.tsx:89`, `src/app/lobby/[id]/uebersicht/page.tsx:68,78,93`, `src/app/lobby/[id]/uebersicht/ScoreDialog.tsx:77`, `src/server/results.ts:348,372,383`, `src/server/scheduled.ts:172`, `src/lib/notification-types.ts:38,39` | entschieden (t9, 2026-11-11) |

### 2.2 Spiel, Lobby und die Handlungen darin

| Begriff | Bedeutung (eine) | Verbotene Synonyme | Fundstellen (Auswahl) | Status |
|---|---|---|---|---|
| **Spiel** | Die Begegnung zweier Teams (das „Match“) in jeder Phase, von der Lobby bis zum Ergebnis. Die Seite vor dem Anstoß heißt Lobby, die danach Spielübersicht/Spielbericht. | „Match“, „Partie“, „Begegnung“; „Spiel“ für eine Spielsuche („Spiel annehmen“ bei einer Suche) | Routen `src/app/lobby/[id]`, `src/app/spiele/[id]`, `src/app/spiel/[token]` (Privatspiel); Texte `src/app/lobby/[id]/uebersicht/page.tsx:19` (Spielübersicht), `src/app/spiele/[id]/page.tsx:65` (Spielbericht), `src/app/lobby/[id]/LobbyClient.tsx:226` (Spiel absagen), `src/app/suche/[id]/AcceptForm.tsx:25` („Spiel annehmen“ bei Spielsuche, Fund ZA-SU-6) | Entwurf |
| **Lobby** | Der Ort eines konkreten Spiels vor dem Anstoß, mit Kader: Uhrzeit, Halle, Bereit. „Offene Lobby“ ist eine Lobby ohne Gegner, die in der Liste „Offene Lobbys“ steht (Vertrag 007). | „Suche“, „Spielsuche“, „Anfrage“, „Matchmaking“ (sichtbar) für dasselbe Ding (Funde N1-SU-1, N1-MM-1) | `src/app/lobby/[id]/page.tsx:36,144`, `src/app/lobby/offen/[entryId]/page.tsx:13,31,33,54,79,81,103,105`, `src/app/matchmaking/page.tsx:13,29,31`, `src/lib/i18n.ts:13,40,53` (`nav.requests`, `footer.matchmaking`, `home.matchmaking`), `src/app/app/page.tsx:42,62`, `src/app/manifest.ts:22`, `src/app/admin/spiele/page.tsx:10,53` | entschieden (t9, 2026-11-11) |
| **Spielsuche** | Eine Anfrage nach einem Gegner (Gesuch eines Team-Admins/Captains, `/suche/[id]`, `/app/suche/neu`); wird sie angenommen, entsteht die Lobby des Spiels. Der Titel der Anlegeseite bleibt „Spiel mit festem Termin suchen“ (Vertrag 007). Eine Spielsuche ist keine Lobby. | „Lobby“ für ein Gesuch, „Anfrage“, „Herausforderung“ (Herausforderung = ein Team fordert ein bestimmtes Team direkt heraus, eigener Begriff) | `src/app/suche/[id]/page.tsx:15`, `src/app/suche/[id]/CancelButton.tsx:15,19`, `src/app/app/suche/neu/RequestForm.tsx:95`, `src/app/app/suche/neu/page.tsx:8`, `src/app/hilfe/page.tsx:53`, `src/server/requests.ts:214` | entschieden (t9, 2026-11-11) |
| **Bereit** | Ein Spieler hat sich in der Lobby für den Platz bereit gemacht und eine Karte hinterlegt. Zählt zu den 4 je Team für „Findet statt“. | „bereit und bezahlt“, „bereit drücken“ (Altmodell: Bereit = reservierter Betrag) | `src/app/lobby/[id]/page.tsx:95,97,294,311,312`, `src/app/lobby/[id]/LobbyClient.tsx:105`, `src/server/lobby.ts:324,328,552`, `src/components/PlayerLight.tsx:21`, `src/server/mygame.ts:60` („Bereit machen und bezahlen“), `src/server/scheduled.ts:43,64` | Entwurf; im Turnier heißt der Zustand des Teams „Team bereit“ (entschieden (t9, 2026-11-11), siehe 3.1) |
| **Bezahlen** | Der Spieler trägt seinen Anteil an der Hallenmiete (bzw. den Turnier-Eintritt). Im Kartenmodell bucht die Plattform den Anteil von der hinterlegten Karte ab, nachdem „Preis steht fest“ gilt; der Spieler klickt nicht „Bezahlen“. | „Aufladen“, „aus dem Guthaben zahlen“, „reservieren“, „Schritt 3 Bezahlen“ als Schritt-Chip (Fund Y1-GM-04) | `src/app/lobby/[id]/page.tsx:93-97` (Schritte Uhrzeit/Halle/Bezahlen), `src/app/turniere/[id]/page.tsx:101,210,226`, `src/server/mygame.ts:60`, `src/app/agb/page.tsx:18,19,23`, `src/app/hilfe/page.tsx:83-94`, `src/components/PlayerLight.tsx:21` | Entwurf (Bedienung der Zahlung: 012) |
| **Karte ändern** | Der Spieler ersetzt die gespeicherte Karte durch eine andere. Ein Begriff für alle Fälle, auch wenn die gespeicherte Karte abgelaufen oder abgelehnt ist (`needsNewCard`). Das erste Hinterlegen heißt „Karte hinterlegt“ (Zustand) bzw. „Karte hinterlegen“ (Knopf). | „Karte erneuern“, „Karte aktualisieren“, „Karte wechseln“, „Neue Karte“, „Andere Karte hinterlegen“, „Zahlungsmittel ändern“ | `src/app/lobby/[id]/CardForm.tsx:111` (`needsNewCard`), `:131,132` („Andere Karte hinterlegen“ heute), `:151`; `src/app/lobby/[id]/stored-card.ts:3,8`; `src/server/payments/card-actions.ts:22,34,35`; `src/server/payments/stored-card.ts:14`; `src/lib/card-view.ts:22,28` („Karte hinterlegt“, „Keine Karte“); Oberfläche „Karte ändern“ ist 012 M5 | entschieden (t9, 2026-11-11) (nicht „erneuern“) |
| **Zahlung ausstehend** | Für Dritte (andere Spieler, Gäste, Veranstalter) steht der Anteil eines Spielers fest, die Abbuchung ist aber noch nicht erfolgt. Für den Betroffenen selbst und den Captain heißt der Fehlerfall „Abbuchung fehlgeschlagen“, mit Grund und Nachzahl-Weg (Vertrag 012 AC-12/AC-20). Gäste sehen den Zahlstatus nie namentlich (Fund Y1-GM-07, Cluster K12). | „offen“ allein, „unbezahlt“, „Zahlung läuft“ (nur Turnierphase, siehe 3.1), „Nachzahlung“ als Zustand | `src/server/wallet.ts:198` („Nachzahlung Anteil“), `src/app/turniere/[id]/page.tsx:31`, `src/app/turniere/page.tsx:11` („Zahlung läuft“), `src/app/api/webhooks/stripe/route.ts:42` („Zahlung fehlgeschlagen“); Datenschutz-Fix in der Lobby: 012 M3b | entschieden (t9, 2026-11-11) |
| **Entfernen** | Eine andere Person oder eine Sache wird aus einer Liste genommen: Spieler aus der Lobby, Mitglied aus dem Team, Team aus dem Turnier, Kommentar durch die Moderation, ein Tor. Wer sich selbst herausnimmt, „verlässt“ oder „meldet sich ab“ (siehe Abmelden). | „Rauswerfen“, „Löschen“ (Löschen = Daten dauerhaft weg, z. B. Konto), „Kicken“ | `src/app/lobby/[id]/LobbyClient.tsx:211`, `src/app/teams/[slug]/TeamManage.tsx:99`, `src/app/turniere/[id]/page.tsx:232,255`, `src/app/admin/moderation/ModerationButtons.tsx:13,14`, `src/app/lobby/[id]/uebersicht/ScoreDialog.tsx:71`, `src/server/team-admin.ts:107,108,111`, `src/server/wallet.ts:314`, `src/server/lobby.ts:552` | Entwurf |
| **Abmelden** | Nur das Abmelden vom Konto (Logout). Das Zurücktreten aus einer Lobby, einem Team oder einem Turnier heißt **Verlassen** („Lobby verlassen“, „Team verlassen“, „Turnier verlassen“). | „Abmelden“ für den Austritt aus Lobby/Team/Turnier/Liga; „Austreten“ | Logout `src/lib/i18n.ts:22` (`nav.signOut`) bleibt; Austritt heute als „Abmelden“ (wird „Verlassen“): `src/app/lobby/[id]/LobbyClient.tsx:113`, `src/app/turniere/[id]/page.tsx:255`, `src/app/ligen/[id]/page.tsx:86`, `src/server/lobby.ts:561`, `src/server/tournaments.ts:196,356,360`, `src/server/leagues.ts:61`; „Verlassen“ heute schon: `src/app/lobby/offen/[entryId]/page.tsx:79`, `src/app/teams/[slug]/TeamManage.tsx:105`, `src/server/team-admin.ts:101,132`. Rechtstexte NICHT ändern: Liste in Abschnitt 5a | entschieden (t9, 2026-11-11) |
| **Verlassen** | Man nimmt sich selbst aus einer Lobby, einem Team oder einem Turnier-Team heraus. Wer jemand anderen herausnimmt, „entfernt“ ihn. | „Abmelden“ (nur Logout), „Austreten“, „Rausgehen“ | siehe Abmelden | entschieden (t9, 2026-11-11) |
| **Captain** | Der Team-Admin eines Teams in einem Spiel oder Turnier. In der Oberfläche heißt er überall „Captain“; „Team-Admin“ bleibt nur intern im Code (Datenbank: Team-Rolle `admin`, `src/db/schema.ts:21`, Vertrag 008:9 „Captain (Team-Admin)“). Er wählt Uhrzeit/Halle, drückt „Preis bestätigen“, meldet und bestätigt Ergebnisse. | „Team-Admin“, „Admin“ (Admin ohne Zusatz ist nur der Plattform-Admin), „Kapitän“ | Captain: `src/app/lobby/[id]/FinalConfirm.tsx:14,23,36`, `src/app/lobby/[id]/page.tsx:84,90,97,286,312`, `src/app/lobby/offen/[entryId]/page.tsx:50`, `src/app/turniere/[id]/page.tsx:99,210,225,226,277`, `src/app/turniere/[id]/RegisterForm.tsx:11`, `src/app/matchmaking/page.tsx:31,38`; Team-Admin (soll weichen, 54 sichtbare Texte in 29 Dateien): `src/app/app/page.tsx:103,114`, `src/app/app/suche/neu/page.tsx:24`, `src/app/matchmaking/page.tsx:97`, `src/app/profitag/[id]/page.tsx:52`, `src/app/lobby/[id]/LobbyClient.tsx:111,125`, `src/app/lobby/[id]/page.tsx:250`, `src/app/hilfe/page.tsx:45,68,71,107`, `src/app/einladung/[token]/page.tsx:17,20` | entschieden (t9, 2026-11-11) (Funde SM-GL-5, N3-AP-3, Y1-CM-19, Y1-CD-48, Y2-S-04) |
| **Veranstalter** | Wer ein Turnier oder Privatspiel anlegt und verwaltet (Einladungslink, Kader öffnen, Teams einteilen, Turnier absagen). Für Turniere ist das ein freigeschalteter Nutzer. Nicht der Hallenbetreiber und nicht der Captain. | „Turnier-Manager“, „Organisator“, „Admin“; „Betreiber“ (Betreiber = Hallenbetreiber, 011) | `src/app/turniere/[id]/page.tsx:120`, `src/app/turniere/page.tsx:22,38`, `src/app/app/turniere/neu/page.tsx:28`, `src/app/admin/nutzer/page.tsx:59`, `src/server/tournaments.ts:59,338,347,360,361,367,540,575`, `src/server/lobby.ts:519,549`, `src/server/privategame.ts:119,179`, `src/server/results.ts:438`, `src/app/spiel/[token]/page.tsx:18` | Entwurf |
| **Nachrücker** | **Nachrücker**: ein Nutzer, der einen Platz von der Warteliste einer Lobby bekommt (heute: „als Ersatzspieler anbieten“, Captain/Team-Admin weist zu). **Ersatzspieler**: ein vom Captain nach der Frist getauschter Spieler (Vertrag 008:18, Captain tauscht gegen Ersatz). Im Turnier gibt es keinen Nachrücker; dort gilt „Team bereit“ (siehe Bereit). | „Ersatz“ ohne Zusatz, „Reserve“; „Ersatzspieler“ für einen Wartelisten-Platz | Heute durchweg „Ersatzspieler“/„Ersatz“ auch für die Warteliste (wird „Nachrücker“): `src/app/lobby/[id]/LobbyClient.tsx:125,127,131`, `src/app/lobby/[id]/page.tsx:344,382`, `src/components/LobbyBoard.tsx:49`, `src/lib/notification-types.ts:34`, `src/server/lobby.ts:479,487,498`, `src/app/hilfe/page.tsx:65,68`; Tausch nach der Frist (bleibt „Ersatzspieler“): `src/server/wallet.ts:325,334,336`, `src/app/hilfe/page.tsx:89`; Rechtstext `src/app/agb/page.tsx:23` (Abschnitt 5a) | entschieden (t9, 2026-11-11) |
| **Team** | Eine feste Gruppe von Spielern mit Namen, Seite und Teamfarbe (Vertrag 007). | „Mannschaft“ (kommt im Code nicht vor, soll es nicht), „Club“, „Verein“, „Kader“ für das Team (Kader = die Spielerliste eines Teams in einem Spiel) | 481 sichtbare Treffer in 98 Dateien; Kernrouten `src/app/teams`, `src/app/teams/[slug]/page.tsx`, `src/app/app/teams/neu/TeamForm.tsx`; Verwechslung im Privatspiel: `src/app/lobby/[id]/page.tsx:97` („Jedes Team macht seine Spieler bereit“) bei Privatspiel (Fund Y1-SM-18) | Entwurf |
| **Elo** | Die Zahl der Spielstärke eines Spielers oder Teams, die sich aus Ergebnissen ergibt (`src/lib/elo.ts`). Im Text steht „Spielstärke“; die Zahl trägt die Beschriftung „Elo“ („Spielstärke (Elo 1180)“) und wird einmal erklärt. Kollision mit der Selbsteinschätzung 1 bis 5: OFFEN, Abschnitt 5 Nr. 9. | „Stärke“ allein, „Rating“, „Siegchance“ ohne Erklärung | `src/app/hilfe/page.tsx:56,99,100,101`, `src/app/lobby/[id]/page.tsx:336,369`, `src/app/spieler/[id]/page.tsx:147,155`, `src/app/teams/[slug]/page.tsx:113,136`, `src/app/teams/page.tsx:69`, `src/app/suche/[id]/page.tsx:80`, `src/components/LobbyBoard.tsx:142` | entschieden (t9, 2026-11-11) (Funde Y1-GM-12, Y2-G-08, Y1-XM-41) |
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
| **bestätigt / Bestätigung** (53 sichtbare Treffer in 28 Dateien, 9 mit „Bestätigung“) | (1) Spiel findet statt · (2) Preis steht fest („Letzte Bestätigung der Captains“) · (3) Ergebnis bestätigt · (4) Halle sagt zu („Die Hallen haben bestätigt“, „Von der Halle bestätigt“) · (5) Uhrzeit festgelegt („Uhrzeit bestätigt, wartet auf die Hallen“) · (6) Buchung erfolgt („ist bestätigt und bezahlt“) · (7) Sicherheitsabfrage („Tippe LÖSCHEN zur Bestätigung“) · (8) Zahlung beim Anbieter bestätigt (Altmodell) | Entschieden (t9, 2026-11-11): „bestätigt“ bleibt nur für **Ergebnis bestätigt**. (1) „Findet statt“, (2) Knopf „Preis bestätigen“, Status „Preis steht fest“, (4) „Zusage der Halle“ (aus Vertrag 011 abgeleitet, Fund Y2-H-06; **zu bestätigen (t9)**, Abschnitt 5 Nr. 10), (5) „Termin steht“, (6) „Halle gebucht“, (7) „Zur Sicherheit“ (Rückfrage; Wortwahl je Dialog einzeln), (8) entfällt | (4) `src/server/veto.ts:36,71`, `src/app/admin/buchungen/page.tsx:18`, `src/app/halle/page.tsx:18`; (5) `src/app/lobby/[id]/page.tsx:93`; (6) `src/server/booking.ts:48`; (7) `src/app/app/einstellungen/ProfileForm.tsx:103`, `src/server/account-actions.ts:42`; (8) `src/app/app/guthaben/page.tsx:71`; Widerspruch auf einer Seite: Fund Y1-CD-03 (`src/app/lobby/[id]/page.tsx:238` „gilt als bestätigt, sobald in beiden Teams …“ gegen `:286` „Mit dem Bestätigen beider Captains steht er fest“), wird in M3 behoben |
| **Bereit** | Spieler-Bereit in der Lobby (2.2) · Team-Bereit im Turnier (Captain drückt „Bereit“, wenn das Team komplett bezahlt hat, `tournaments.ts:276-281`) · Zustand in der Spielerliste (`components/PlayerLight.tsx:21`) | Spieler: „Bereit“; Turnier: **„Team bereit“** (entschieden, t9, 2026-11-11) | `src/app/turniere/[id]/page.tsx:205,216,217`, `src/server/tournaments.ts:276,278,281,753`, `src/db/schema-league.ts:122` |
| **Preis steht fest** | Teamspiel: beide Captains bestätigen · Turnier: alle Plätze belegt und alle Teams vollzählig | Beide behalten das Wort; der Auslöser steht jeweils im Erklärtext | `src/app/turniere/[id]/page.tsx:264`, `src/server/tournaments.ts:325`, `src/server/lobby.ts:312-336` |
| **Lobby ↔ Spiel ↔ Suche** | „Offene Lobbys“ (Liste), „Offene Suchen (0)“ (Matchmaking-Seite), „Lobby aufmachen“ (Footer, Menü), „Spiel suchen“ (Mitte der Leiste), „Spielsuche“ (Gesuch mit festem Termin) | Siehe 2.2: Lobby (Sammelraum), Spielsuche (Gesuch), „Spiel suchen“ bleibt die Handlung in der Leiste | `src/lib/i18n.ts:13,20,40,53`, `src/app/matchmaking/page.tsx`, `src/app/suche`; Funde N1-SU-1, N1-MM-1, Y2-C-25 |
| **Admin** | Team-Admin (Team-Rolle) · Plattform-Admin (Nutzerrolle `admin`) · „Admin“ als Kontakt („E-Mail an den Admin“) · „Zum Admin machen“ (Team) · „Socaz-Admin“ (Turnier-Veranstalter anrufen) | „Admin“ ohne Zusatz nur der Plattform-Admin (Admin 1/2, 009); im Team „Captain“ | `src/server/tournaments.ts:59`, `src/app/turniere/page.tsx:38`, `src/app/teams/[slug]/TeamManage.tsx`; Funde Y1-CM-19, AD-NU-6 („Plattform-Admin“ statt „Admin“) |
| **Stärke** | Selbsteinschätzung 1 bis 5 beim Anlegen und Suchen („Locker … Ex-Vereinsspieler“, `src/lib/labels.ts:1-6`) · Elo-Zahl · „stärker“ in der Rangliste | **OFFEN, zu bestätigen (t9)**: Entscheid 4 legt „Spielstärke“ im Text und „Elo“ als Beschriftung der Zahl fest. Heißt auch die Selbsteinschätzung 1 bis 5 „Spielstärke“, hat das Wort zwei Bedeutungen (1–5-Skala und Elo-Zahl) und widerspricht „eine Bedeutung“. Vorschlag A: Selbsteinschätzung 1 bis 5 = „Spielniveau“, Elo-Zahl = „Spielstärke (Elo)“. Vorschlag B: Selbsteinschätzung = „Spielstärke“ und die Zahl heißt nur „Elo“ (Wort „Spielstärke“ nicht für die Zahl). Bis zum Entscheid wird keines der beiden geändert | `src/app/app/teams/neu/TeamForm.tsx:36,40`, `src/app/app/suche/neu/RequestForm.tsx:60`, `src/app/matchmaking/QueueForm.tsx:42`, `src/app/hilfe/page.tsx:99-101`; Fund GM-SU-5 („Stärke ab/bis“ ohne Erklärung) |
| **Absagen / Absage** | Der Veranstalter/Admin sagt ein Spiel ab · das System sagt zur Frist automatisch ab (zu wenige Bereite, nicht alle bezahlt) · „Abgesagt“ als Status | „Abgesagt“ (Status) und je Auslöser ein Satz, wer abgesagt hat | `src/app/lobby/[id]/LobbyClient.tsx:226,236,239`, `src/app/lobby/[id]/page.tsx:41,241`, `src/server/scheduled.ts:64,115`, `src/server/tournaments.ts:575,625` |
| **Entfernen ↔ Löschen ↔ Verlassen ↔ Abmelden** | Vier Wörter für „raus aus“ | Entfernen (andere), Verlassen (selbst), Abmelden (Logout), Löschen (Daten dauerhaft) | Siehe 2.2 |
| **S, U, N, „S-U-N“** | Kürzel für Siege, Unentschieden, Niederlagen ohne Legende (Funde Y1-GM-29, Y1-GD-29, Y1-SM-39, Y1-CM-22, Y2-G-08) | Ausgeschrieben: „Siege / Unentschieden / Niederlagen“ oder Legende | `src/app/ligen/[id]/page.tsx:51`, `src/app/rangliste/page.tsx:66`, `src/app/teams/[slug]/page.tsx:111` |
| **Fachwörter ohne Erklärung** | „K.-o.-System“, „Kader füllen“, „vollzählig“, „Bracket“, „Ampel wird grün“, „Veto“, „frei/belegt“, „Siegchance“ (Funde Y1-GD-24, Y1-SM-32, Y1-GM-12, Y2-H-06) | Je Wort eine Kurzerklärung oder ein Alltagswort; Liste in M2 mit dem Nutzer abstimmen | `src/app/turniere/[id]/page.tsx:31,99,101,277`, `src/app/halle/page.tsx:18`, `src/app/lobby/[id]/page.tsx:336` |
| **Jargon im Admin** | „Ledger“, „Status confirmed“, Objekt-IDs, Aktionscodes (`user.role`, `comment.remove_and_warn`) (Fund AD-ALL-8) | Klartext-Beschriftungen im Admin | `src/app/admin/finanzen`, `src/app/admin/protokoll` |

### 3.2 Zwei Wörter, eine Sache

| Sache | Heutige Wörter | Vorschlag |
|---|---|---|
| Rolle des Team-Chefs | „Captain“, „Team-Admin“, „Admin“ | „Captain“ (entschieden, t9) |
| Spieler, der einspringt | „Ersatzspieler“, „Ersatz“ | Warteliste: „Nachrücker“; Tausch nach der Frist: „Ersatzspieler“ (entschieden, t9) |
| Austritt | „Abmelden“, „Verlassen“, „Austreten“ | „Verlassen“ (Abmelden nur Logout; entschieden, t9) |
| Karte ersetzen | „Andere Karte hinterlegen“, „Karte hinterlegen“ | „Karte ändern“ für alle Fälle (entschieden, t9; nicht „erneuern“) |
| Selbstbeurteilung | „Stärke“, „Spielstärke“ | OFFEN, zu bestätigen (t9): „Spielniveau“ (1 bis 5) oder „Spielstärke“ (siehe 3.1, Zeile Stärke, und Abschnitt 5 Nr. 9) |

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


## 5. Entscheide (t9, 2026-11-11)
Die Nummern 1 bis 8 sind von t9 entschieden und in die Tabellen oben eingearbeitet. Die Nummern 9 und 10 sind OFFEN und zu bestätigen (t9); sie sind nicht als entschieden zu lesen.

| Nr. | Entscheid | Status |
|---|---|---|
| 1 | „Captain“ überall in der Oberfläche; „Team-Admin“ nur intern im Code | entschieden (t9, 2026-11-11) |
| 2 | „Abmelden“ nur für Logout; Lobby/Team/Turnier: „Verlassen“. Rechtstexte (AGB, Hilfe-Rechtliches) werden NICHT geändert; Abweichungen siehe 5a | entschieden (t9, 2026-11-11) |
| 3 | „Lobby“ = Ort eines konkreten Spiels mit Kader; „Spielsuche“ = Anfrage nach einem Gegner; „Offene Lobbys“ und „Spiel mit festem Termin suchen“ wie Vertrag 007 | entschieden (t9, 2026-11-11) |
| 4 | „Spielstärke“ im Text, die Zahl mit Beschriftung „Elo“ | entschieden (t9, 2026-11-11) |
| 5 | „Karte ändern“ (ein Begriff, auch im Fehlerfall; nicht „erneuern“) | entschieden (t9, 2026-11-11) |
| 6 | Dritte sehen „Zahlung ausstehend“; Betroffener und Captain sehen „Abbuchung fehlgeschlagen“ mit Grund und Nachzahl-Weg (012 AC-12/AC-20) | entschieden (t9, 2026-11-11) |
| 7 | „Nachrücker“ = Platz von der Warteliste; „Ersatzspieler“ = Captain-Tausch nach der Frist; im Turnier „Team bereit“ | entschieden (t9, 2026-11-11) |
| 8 | Knopf „Preis bestätigen“ (Captain), Status „Preis steht fest“; „bestätigt“ nur noch für „Ergebnis bestätigt“; sonst „Findet statt“/„Preis steht fest“; übrige Bedeutungen je einzeln (3.1) | entschieden (t9, 2026-11-11) |
| 9 | „Spielstärke“ hat zwei Bedeutungen, wenn es für die Selbsteinschätzung 1 bis 5 UND für die Elo-Zahl steht. Vorschlag A: 1 bis 5 = „Spielniveau“, Elo-Zahl = „Spielstärke (Elo)“. Vorschlag B: 1 bis 5 = „Spielstärke“, die Zahl nur „Elo“. | OFFEN, zu bestätigen (t9) |
| 10 | „Zusage der Halle“ für das, was die Halle auf eine Anfrage tut (heute „bestätigt“, „frei“; Vertrag 011 spricht von Zusage/Ablehnung). Aus Vertrag 011 abgeleitet, kein t9-Entscheid. | OFFEN, zu bestätigen (t9) |

Vermerk: Der Widerspruch Y1-CD-03 (`src/app/lobby/[id]/page.tsx:238` gegen `:286`) wird in M3 behoben.

### 5a. Rechtstext-Stellen mit abweichendem Wortgebrauch (für den Anwalt, nicht ändern)
Diese Stellen bleiben unverändert (Entscheid 2). Sie weichen von den neuen Begriffen ab oder gehören zum Altmodell (Guthaben, Reservieren). t1d trägt sie ins GO-LIVE-AUDIT ein.

| Datei:Zeile | Wortgebrauch heute | Abweichung vom neuen Begriff |
|---|---|---|
| `src/app/agb/page.tsx:23` | „kann man sich kostenlos abmelden“, „Ersatzspieler den Platz bezahlt“, „gutgeschrieben“ | Austritt heißt künftig „Verlassen“; „Ersatzspieler“ vs. „Nachrücker“; „gutgeschrieben“ (Guthaben, entfällt) |
| `src/app/agb/page.tsx:19` | „Er wird beim Beitritt reserviert“, Guthaben | Altmodell (Reservieren, Guthaben); Kartenmodell bucht nach „Preis steht fest“ ab |
| `src/app/agb/page.tsx:22` | Überschrift „4. Absage und Erstattung“ | Absage/Erstattung an Kartenmodell anpassen (012) |
| `src/app/agb/page.tsx:11` | „stellt Lobby … bereit“ | „Lobby“ gilt nach neuer Definition (Ort eines Spiels); Text prüfen |
| `src/app/datenschutz/page.tsx:23` | „Zahlungen: Guthaben, Buchungen, Belege“ | Guthaben entfällt |
| `src/app/datenschutz/page.tsx:33` | „Team-Admins“ | Oberfläche sagt „Captain“ |
| `src/app/datenschutz/page.tsx:22` | „Lobbys“ | Begriffsprüfung |
| `src/app/hausordnung/page.tsx:23` | „offenes Guthaben und Reservierungen“ | Guthaben/Reservieren entfallen |

Nicht Rechtstext, aber mit denselben Wörtern (Hilfe, Abschnitt „Geld und Guthaben“, wird mit 012 M6a überarbeitet): `src/app/hilfe/page.tsx:76,83,84,88,89,93,94`. Die Hilfe-Stellen mit „Team-Admin“ (`:45,68,71,107`) sind Oberflächentext und folgen Entscheid 1.

## 6. Quellen
- `docs/design/analyse-frontend-verdichtung.md`, Cluster K05 und Anhang A (K05-Funde, 55); Detail in `analyse-frontend-x/y1/y2/admin.md`.
- `docs/design/umbauplan-013.md`, Abschnitt 5, Punkt 7 („Wann gilt ein Spiel als bestätigt?“), M2 (`begriffe.md`).
- Verträge 007 (Rollen, Teamfarbe), 008 (Captain, Bereit, Frist), 011 (Zusage der Halle), 012 (Kartenmodell, M6a/M6b), 013 (AC-7, AC-14).
- Code: `src/server/lobby.ts`, `src/lib/lobby-rules.ts`, `src/server/results.ts`, `src/server/payments/charge-run.ts`, `src/server/mygame.ts`.
