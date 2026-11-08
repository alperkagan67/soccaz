# Ist-Analyse SoccaV2 (nur lesend)

Stand: Branch `docs/ist-analyse`, abgeleitet von `main` (Commit `2f65888`). Diese Analyse beschreibt ausschließlich den **Ist-Zustand**. Sie enthält keinen Soll-Zustand und keine Vorschläge. Belege sind Fundstellen im Code als `relativer/Pfad:Zeile`. Die Doku unter `docs/` wurde nicht als Beleg benutzt.

Methode: Dateien gelesen, nichts gestartet, nichts installiert (`node_modules` fehlt im Worktree). Tests wurden nicht ausgeführt. Was nur aus Dateinamen folgt, ist als solches markiert.

## Inhaltsverzeichnis

0. [Rahmen: Stack und Next.js-Hinweis](#0-rahmen-stack-und-nextjs-hinweis)
1. [Datenmodell](#1-datenmodell-drizzle-schema)
2. [Routen, Seiten und API-Handler](#2-routen-seiten-und-api-handler)
3. [Team- und Lobby-Logik](#3-team--und-lobby-logik)
4. [Einladungen](#4-einladungen-token-ablauf)
5. [Guthaben und Ledger](#5-guthaben-und-ledger)
6. [Zahlungen](#6-zahlungen-anbieter-rabattcodes-storno-anteil)
7. [Ergebnisse](#7-ergebnisse-eintragen-bestätigen-streit)
8. [Benachrichtigungen und Jobs](#8-benachrichtigungen-push-jobs-pg-boss)
9. [Turnier-Bestandteile und "Tag 1/2/3"](#9-turnier-bestandteile-und-tag-123)
10. [Abgleich mit Brief](#10-abgleich-mit-brief) (mit 10.5 Zahlungsmodell vs. Entscheidung)
11. [Unklar / nicht gefunden](#11-unklar--nicht-gefunden)

---

## 0. Rahmen: Stack und Next.js-Hinweis

- `AGENTS.md:3-5` warnt, dass diese Next.js-Version Breaking Changes hat und die Hinweise unter `node_modules/next/dist/docs/` zu lesen sind. Diese Dateien waren im Worktree nicht vorhanden und wurden nicht gelesen (siehe Abschnitt 11).
- Die Route-Handler benutzen den typisierten Kontext `RouteContext<"/api/jobs/[name]">` und `await ctx.params` (`src/app/api/jobs/[name]/route.ts:13-15`) sowie `connection()` aus `next/server` in Serverfunktionen (`src/server/lobby.ts:29`, `src/server/teams.ts:94`).
- Drizzle ORM mit PostgreSQL: `src/db/schema.ts:2-13`. Zeitplaner pg-boss: `src/server/scheduler.ts:1`. Web-Push: `src/server/providers/push.ts:1`. Anmeldung über NextAuth mit Google-Provider: `src/auth.ts:2,22-27`.
- Das Schema ist auf sechs Dateien verteilt: `src/db/schema.ts`, `schema-finance.ts`, `schema-league.ts`, `schema-matchmaking.ts`, `schema-community.ts`, `schema-content.ts`. Es gibt 33 Migrationen `drizzle/0000_…` bis `drizzle/0032_…` (Dateiliste per `git ls-files drizzle`).

## 1. Datenmodell (Drizzle-Schema)

### 1.1 Enums
- `user_role`: player, admin, moderator, finance, booking (`src/db/schema.ts:15`).
- `team_role`: admin, player (`src/db/schema.ts:16`).
- `visibility`: public, private (`src/db/schema.ts:17`).
- `request_status`: open, matched, cancelled, expired (`src/db/schema.ts:18`).
- `match_status`: lobby, confirmed, played, disputed, cancelled (`src/db/schema.ts:19`).
- `event_type`: goal, yellow_card, red_card (`src/db/schema.ts:20`).
- Finanzen: `ledger_account` (wallet, clearing, bank, revenue, venue_cost, fees, promo, chargeback, tournament) `src/db/schema-finance.ts:23`; `ledger_kind` (u. a. topup, match_share, refund, tournament_entry, tournament_refund, tournament_payout, tournament_commission) `:24`; `payment_provider` (**dev, stripe**) `:25`; `payment_status` `:26`; `booking_status` `:27`.

### 1.2 Kerntabellen (`src/db/schema.ts`)
| Tabelle | Zeile | Inhalt |
|---|---|---|
| `users` | 22 | Konto, Rolle, `isOrganizer` (Turniere veranstalten, Z. 39), `bannedAt` |
| `teams` | 48 | `kind` = "team" oder "private" (Z. 57), `strength` 1–5 (Z. 55), `archivedAt` |
| `team_members` | 63 | Primärschlüssel (team, user), Rolle admin/player |
| `invites` | 74 | Team-Einladung: `token` (PK), `teamId`, `expiresAt` |
| `match_requests` | 84 | Spielsuche (Status `open` …) |
| `matches` | 103 | Spiel, siehe unten |
| `match_participants` | 138 | Teilnehmer je Spiel, `teamId` null = freier Ersatz (Z. 143), `readyAt`, `paidCents` |
| `match_events` | 154 | Tor / Gelb / Rot |
| `match_results` | 165 | Ergebnis mit Bestätigungsflags |
| `audit_log` | 181 | Protokoll mit before/after |
| `notifications`, `notification_prefs`, `push_subscriptions`, `delivery_log`, `reminders_sent` | 201, 217, 224, 234, 244 | Benachrichtigungen |

`matches` (`src/db/schema.ts:103-136`) enthält u. a.: `kind` "team" | "private" | "tournament" (Z. 124), `maxPlayers` nur für Privatspiele (Z. 123), `priceCents`, `costCents`, `finalShareCents`, `settledAt` (Z. 115-118), `homeFinalAt`/`awayFinalAt` (letzte Captain-Bestätigung, Z. 125-126), `timeWindows` (Z. 127), `vetoStatus` (Z. 128), `schedulingOpen`/`schedulingDeadline` (Z. 131-132), `challengeStatus` (Z. 122), `status` (Z. 134).

### 1.3 Finanz-Tabellen (`src/db/schema-finance.ts`)
- `settings` (Schlüssel/Wert, Z. 30), `venues` (37), `price_rules` (59), `payments` (69), `promo_codes` (90), `promo_redemptions` (109), `ledger_entries` (119), `booking_jobs` (147), `expenses` (159), `receipts` (173), `pending_refunds` (185).
- `ledger_entries`: je Zeile Soll-/Haben-Konto, Betrag > 0 (`check`, Z. 139), eindeutiger `idempotency_key` (Z. 134). `tournament_id` hat im Schema keinen Fremdschlüssel; der steht laut Kommentar in der Migration (Z. 131).

### 1.4 Matchmaking / Termin / Privatspiel (`src/db/schema-matchmaking.ts`)
- `matchmaking_queue` (Z. 12; genau ein wartender Eintrag je Team per Teil-Unique-Index, Z. 30), `match_options` (34), `match_option_votes` (49), `match_veto_halls` (62), `match_hall_requests` (77), `queue_participants` (92), `match_clips` (103), `game_invites` (117, Einladung zum Privatspiel).
- `matchmaking_queue.windows` ist ein JSON-Array von Zeitfenstern `{from,to}` (Z. 10, 21).

### 1.5 Liga, Profi-Tag, Turnier, Sponsoren (`src/db/schema-league.ts`)
- `leagues` (Z. 12), `league_teams` (25), `city_challenge_results` (36), `pro_events` (50), `pro_applications` (65).
- **Turnier**: `tournaments` (Z. 81), `tournament_teams` (113), `tournament_players` (128), `tournament_matches` (143); `sponsors` (166), `team_sponsors` (180).
- Die Zahlen sind Zeilen der Tabellendefinition (`export const <name> = pgTable`) in der jeweiligen Datei.

Details `tournaments` (`src/db/schema-league.ts:81-111`): `format` (Typ round_robin | knockout | groups_ko, Z. 90 im Typ Z. 78), `maxTeams` mit DB-Check 2 bis 32 (Z. 110), `entryFeeCents` ("Eintritt je Spieler", Z. 92), `totalCents` (Hallenkosten gesamt, Z. 93), `hourlyCents`, `durationMin`, `finalShareCents` (Z. 97), `isPrivate` Standard true (Z. 98), `inviteToken` unique (Z. 99), `registrationDeadline` (100), `startsAt` (101), `matchMinutes` Standard 15 (102), `bracketGeneratedAt` (103), `status` (Z. 105; Typ `registration | payment | running | finished | cancelled`, Z. 79), `winnerTeamId`, `settledAt`.
`tournament_teams` (Z. 113-125): `captainId` ("genau ein Captain pro Team", Z. 120), `readyAt` (Z. 121), `paidBy`, `feeCents`.
`tournament_players` (Z. 128-140): `paidCents`, `paidAt`, `paidBy` ("wer gezahlt hat … dorthin gehen Erstattungen", Z. 136).
`tournament_matches` (Z. 143-162): `stage` ("group:A" | "round" | "ko:<n>", Z. 148), `round`, `slot`, `teamA`/`teamB` (leer, solange offen), `scoreA`/`scoreB`, `shootoutWinner`, `feedsMatchId`/`feedsSide` (Weiterleitung des Siegers), `matchId` auf das echte Spiel (Z. 159). Eindeutiger Index auf (Turnier, Stage, Runde, Slot) (Z. 161).

### 1.6 Weitere
- Community: `match_finalizations`, `team_stats`, `player_stats`, `rating_history`, `user_reliability`, `late_cancels`, `user_badges`, `mvp_votes` (`src/db/schema-community.ts:17,22,34,51,66,74,84,96`).
- Inhalt: `comments`, `comment_reports`, `user_warnings`, `media`, `free_player_posts` (`src/db/schema-content.ts:15,36,48,63,79`).
- Sequenz `game_number_seq` für fortlaufende Spielnummern (`src/db/schema.ts:82`).
- Hauptbuch ist per Datenbank-Trigger unveränderlich (`drizzle/0007_ledger_guards.sql:3-17`).

## 2. Routen, Seiten und API-Handler

Grundlage ist die Dateiliste `git ls-files src/app` (Pfade = Route). Dass eine Seite existiert, folgt aus der Datei; ihr Inhalt wurde nur dort gelesen, wo unten eine Fundstelle mit Zeile steht.

### 2.1 API-Handler (14 Dateien unter `src/app/api`)
| Route | Datei | Beobachtung |
|---|---|---|
| `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth |
| `/api/webhooks/stripe` | `src/app/api/webhooks/stripe/route.ts:13` | POST, Signaturprüfung Z. 18 |
| `/api/jobs/[name]` | `src/app/api/jobs/[name]/route.ts:13` | POST, Geheimnis im Header `x-job-secret`, Z. 14 |
| `/api/health` | `src/app/api/health/route.ts` | |
| `/api/lobby/[id]/events` | `…/lobby/[id]/events/route.ts` | Live-Strom (Name der Route; Inhalt nicht gelesen) |
| `/api/spiele/[id]/events`, `/live`, `/api/spiele/stream` | `src/app/api/spiele/…` | Live-Daten (Inhalt nicht gelesen) |
| `/api/belege/[id]`, `/api/karte/[id]`, `/api/media`, `/api/media/[id]`, `/api/sponsor/[id]`, `/api/mein-konto/export` | jeweils `route.ts` | Beleg, Karte, Medien, Sponsor, Kontoexport |

**Es gibt keinen API-Handler für Turniere** (alle 14 Dateien unter `src/app/api` sind oben aufgeführt; kein Pfad enthält "turnier"). Turnierdaten laufen über Serverfunktionen/Server Actions (`src/server/tournament-actions.ts:26-99`) und Serverseiten (`src/app/turniere/[id]/page.tsx`).

### 2.2 Seiten (Auszug nach Bereich)
- Öffentlich: `/` (`src/app/page.tsx`), `/teams`, `/teams/[slug]`, `/spieler`, `/spieler/[id]`, `/spiele`, `/spiele/[id]`, `/suche`, `/suche/[id]`, `/matchmaking`, `/mitspieler`, `/hallen`, `/hallen/[id]`, `/ligen`, `/ligen/[id]`, `/rangliste`, `/profitag`, `/profitag/[id]`, `/turniere`, `/turniere/[id]`.
- Lobby: `/lobby/[id]` mit `LobbyClient`, `SchedulingPanel`, `VetoPanel`, `ChallengePanel`, `FinalConfirm`, `PrivateTools`, `VenueBox`; `/lobby/[id]/uebersicht`; `/lobby/offen/[entryId]`.
- Einladungen: `/einladung/[token]` (Team), `/spiel/[token]` (Privatspiel, Seite `src/app/spiel/[token]/page.tsx`).
- Angemeldeter Bereich `/app/…`: `guthaben`, `benachrichtigungen`, `einstellungen`, `teams/neu`, `suche/neu`, `privatspiel/neu`, `turniere/neu`.
- Betrieb `/admin/…`: buchungen, codes, einstellungen, finanzen (+ ausgaben, export, spiel/[id]), hallen, ligen, moderation, nutzer, profitag, protokoll, spiele, sponsoren, teams.
- Hallenbetreiber: `/halle` (`src/app/halle/page.tsx`). Entwicklung: `/dev/pay/[id]` (Seite des Entwicklungs-Zahlungsanbieters; `src/server/payments.ts:81` leitet dorthin).
- Rollen: `src/lib/roles.ts` (26 Zeilen, Inhalt nicht im Detail gelesen). Admin-Rolle per Dev-Login: E-Mail beginnt mit `admin@` ⇒ Rolle admin (`src/auth.ts:40-41`).

### 2.3 Mutationen
Schreibzugriffe laufen über Server Actions in `src/server/*-actions.ts` (z. B. `actions.ts`, `tournament-actions.ts`, `wallet-actions.ts`, `privategame-actions.ts`, `matchmaking-actions.ts`, `admin-actions.ts`).

## 3. Team- und Lobby-Logik

### 3.1 Team anlegen / beitreten
- Anlegen: `createTeam` `src/server/teams.ts:17`; höchstens 5 Teams je Nutzer (`:11`, Prüfung `:26-28`), Slug mindestens 3 Zeichen (`:19`), Name/Slug eindeutig (`:30-34`). Der Ersteller wird Team-Admin (`:40`).
- Mitglieder-Obergrenze 20 (`:12`, Prüfung beim Beitritt `:125`).
- Beitritt per Einladungslink: `joinWithInvite` `:113-139` (Details Abschnitt 4). Neuer Beitritt wird den Team-Admins gemeldet (`:130-136`).
- Team-Admin prüfen: `isTeamAdmin` `:76-82`.
- Spiel-Teams von Privatspielen (`kind = private`) werden aus Teamseiten und Listen ausgeschlossen (`:47`, `:72`).

### 3.2 Lobby: Regeln
Konstanten `src/lib/lobby-rules.ts`: 5 Startspieler je Team (`:2`), höchstens 6 je Team (`:3`), mindestens 4 bereite Spieler je Team (`:4`, also gesamt 8, `:7`), höchstens 4 wartende Fremde (`:5`). Standard-Privatspiel 10, Minimum 4, Maximum 22 Spieler (`:23-25`). Plätze je Team: bei Privatspielen die Hälfte von `maxPlayers`, sonst 6 (`:28-30`).

### 3.3 Lobby: Abläufe (`src/server/lobby.ts`)
- Beitreten (nur Mitglieder der beiden Teams): `joinLobby` `:306-315`; Team voll ⇒ Fehler `:315`.
- Verlassen: `leaveLobby` `:327`; wer bereit war und weniger als 24 h vor Anstoß geht, wird als späte Absage gezählt (`:332`).
- **Bereit**: `setReady` `:353-365`. Bedingungen: Teilnehmer vorhanden `:356`, einem Team zugewiesen `:357`, Termin/Ort nicht mehr offen `:358`, und **bei eingeschalteten Zahlungen muss der Anteil bezahlt sein** (`:359`, "Bitte zahle zuerst deinen Anteil").
- Bezahlen: `payShare` `:343-352`, erst wenn Uhrzeit und Halle feststehen (`:348`).
- **Status "bestätigt"**: `evaluateConfirmation` `:212-236`. Das Spiel ist `confirmed`, wenn beide Teams je mindestens 4 bereite Spieler haben (`:223`, Regel `src/lib/lobby-rules.ts:10`), sonst `lobby`.
- **Ersatzspieler**: Ersatz ist, wer von außen kommt oder nach den ersten fünf Spielern beitritt (`src/lib/lobby-rules.ts:15`; Auswertung `src/server/lobby.ts:96`). Fremder Ersatz: `joinAsSubstitute` `:378-396` (nur öffentliche Lobby `:380`, höchstens 4 wartende `:392`, Eintrag mit `teamId = null` `:396`); Zuweisung durch Team-Admin: `assignSubstitute` `:406-414`.
- Letzte Bestätigung: `finalConfirm` `:267-296`, nur Captain (Team-Admin) `:274`, nur wenn Team vollständig bereit und bezahlt (`teamComplete` `:252`, `:275`).
- Privatspiele: Zufallseinteilung `randomSplit` `:427-450`, Zuteilung zurücknehmen `unassignParticipant` `:456`, entfernen `removeParticipant` `:468`.
- Absagen: `cancelMatch` `:485` mit Grund 3–200 Zeichen (`:487-488`); `cancelMatchTx` `:496`.
- Frist: `lobbyDeadline` = später von "Annahme + 12 h" und "Anstoß − 24 h" (`src/lib/deadlines.ts:5-9`); der Job `lobby-deadlines` sagt unterbesetzte Lobbys ab (`src/server/scheduled.ts:49-62`).
- Status-Umfang der Lobby bearbeitbar nur in `lobby`/`confirmed` und vor Anstoß (`src/server/lobby.ts:242-243`).

### 3.4 Teamspiel-Anbahnung
- Offene Suche/Warteschlange: `joinQueue` `src/server/matchmaking.ts` (Prüfungen z. B. `:34-35`); Zeitfenster-Überschneidung `src/lib/matchmaking.ts:60`. Der Job `run-matchmaker` läuft jede Minute (`src/server/jobs.ts:45`).
- Herausforderung: `matches.challengeStatus` pending/accepted (`src/server/challenges.ts:43,76`); Annahme setzt eine 48-h-Frist (`:76`).
- Hallen-Veto: Tabellen `match_veto_halls` etc. (`src/db/schema-matchmaking.ts:62`), Logik `src/server/veto.ts` (nicht im Detail gelesen).

## 4. Einladungen (Token, Ablauf)

| Art | Erzeugung | Ablauf | Fundstelle |
|---|---|---|---|
| Team | 16 Zufallsbytes, base64url; nur Team-Admin | 7 Tage (`INVITE_TTL_DAYS`) | `src/server/teams.ts:13,84-91` |
| Privatspiel | 16 Zufallsbytes, base64url | Anstoß + `INVITE_DAYS_AFTER_START` Tage | `src/server/privategame.ts:73-74` |
| Turnier | 16 Zufallsbytes, beim Anlegen; Spalte `inviteToken` | kein Ablaufdatum in der Spalte | `src/server/tournaments.ts:95`, `src/db/schema-league.ts:99` |

- Team-Link prüfen: `getInvitePreview` liefert `invalid`, `expired` oder `valid` (`src/server/teams.ts:93-111`). Beitritt wiederholt sich idempotent ("alreadyMember", `:123`). Bereinigung abgelaufener Einladungen im Job `cleanup` (`src/server/scheduled.ts:111`, Ergebnisfeld `invites`).
- Privatspiel-Link: `getGameInvitePreview` `src/server/privategame.ts:91-100` (abgelaufen ⇒ `expired` `:100`); Beitritt `joinPrivateGame` `:107-111`.
- Turnier-Link: Der Token wird nur dem Veranstalter/Beteiligten angezeigt (`src/server/tournaments.ts:627`, `showToken`); `tokenOk` prüft die Gleichheit mit dem übergebenen Token (`:573`).
- Anmeldung für Einladungsseiten: Die Seite `/einladung/[token]` lädt Vorschau und aktuellen Nutzer parallel (`src/app/einladung/[token]/page.tsx:12`).

## 5. Guthaben und Ledger

- Doppelte Buchführung: jede Zeile bucht Soll an Haben (`src/db/schema-finance.ts:118-145`; Kommentar Z. 118). Unveränderlich per Trigger (`drizzle/0007_ledger_guards.sql:3-17`); Wartungsausnahme über die Einstellung `socaz.ledger_maintenance` (`:2`, `:5`).
- `post(...)` ist idempotent über `idempotencyKey` (`src/server/ledger.ts:38-69`); Beträge müssen positive ganze Cent sein (`:42`).
- Kontostand = Haben − Soll auf `wallet` des Nutzers (`walletBalance`, `src/server/ledger.ts:72-81`).
- Abbuchung: `debitWallet` sperrt die Nutzerzeile (`lockUser` `:84`) und wirft `InsufficientFunds` bei zu wenig Guthaben (`:90-96`, Klasse `:28`).
- Gutschrift: `creditWallet` (`:99`). Gegenbuchung: `reverseEntry` (`:105`, Art `adjustment` `:112`).
- Auszug: `walletStatement` (`:123`), Saldenprobe `trialBalance` (`:142`), Gesamtschuld `totalWalletLiability` (`:161`).
- Beträge in ganzen Cent: `src/lib/money.ts:1`. Aufladung 5,00 bis 200,00 €: `MIN_TOPUP_CENTS = 500`, `MAX_TOPUP_CENTS = 20_000` (`:4-5`, Prüfung `:42-44`).
- Zahlungen sind per Einstellung `payments_enabled` schaltbar, Standard aus (`src/server/settings.ts:22-25`).
- Beleg-Nummern fortlaufend: `receipts` (`src/db/schema-finance.ts:172-182`).

## 6. Zahlungen (Anbieter, Rabattcodes, Storno, Anteil)

### 6.1 Anbieter
- Typ `Provider = "dev" | "stripe"` (`src/server/payments.ts:13`; Enum `src/db/schema-finance.ts:25`).
- Aktiv: Stripe, sobald `STRIPE_SECRET_KEY` gesetzt ist; außerhalb von Produktion der Entwicklungs-Anbieter; in Produktion ohne Schlüssel keiner (`src/server/payments.ts:26-30`).
- **PayPal gibt es im Code nicht als eigenen Anbieter.** Der Begriff kommt in `src/` an vier Stellen vor (`git grep -n -i paypal -- src package.json`): Kommentar "Geschätzte Anbietergebühr (Karte und PayPal)" (`src/server/payments.ts:32`) und drei UI-Texte, nämlich Admin-Einstellungen "Stripe (Karte, PayPal, SEPA)" (`src/app/admin/einstellungen/page.tsx:41`) Hilfeseite "per Karte oder PayPal" (`src/app/hilfe/page.tsx:82`) und Guthaben-Seite "kannst du hier per Karte oder PayPal aufladen" (`src/app/app/guthaben/page.tsx:84`). Ein eigener PayPal-Anbieter im Code existiert nicht (`Provider = dev oder stripe`, `src/server/payments.ts:13`). In `package.json` kommt der Begriff nicht vor. (In Doku-Dateien steht PayPal, z. B. `README.md:85` "Karte, PayPal über Stripe"; das ist Doku, kein Code.)
- Stripe-Checkout wird per HTTP-Aufruf erzeugt (`src/server/payments.ts:39-61`), Zahlungsart Einmalzahlung `mode=payment` (`:41`). Gebührenschätzung 2,9 % + 30 Cent, einstellbar per `PAYMENT_FEE_PERCENT`/`PAYMENT_FEE_FIXED_CENTS` (`:33-37`).
- Rückweg nach Zahlung nur auf interne Pfade (`safeReturnPath`, `:17-19`).

### 6.2 Ablauf Aufladung
1. `createTopUp` prüft Betrag (`:65`), Anbieter (`:66-67`), optionalen Rabattcode (`:70-74`), legt `payments` an (`:76-79`).
2. Stripe meldet per Webhook; Signatur wird geprüft (`src/app/api/webhooks/stripe/route.ts:18`); behandelt werden `checkout.session.completed` (nur wenn `paid`, `:34-37`), `…async_payment_succeeded` (`:38`), `…async_payment_failed` (`:41`), `…expired` (`:44`), `charge.dispute.created` (Hinweis an Plattform-Admins, `:47-52`).
3. `completePayment` (`src/server/payments.ts:91-127`): sperrt die Zahlung (`.for("update")` `:97`), bricht bei bereits erfolgreicher Zahlung ab (`:99`), bucht Guthaben aus `clearing` (`:102`), Gebühr (nur bei Stripe, `:101`, `:103-105`), Rabattbonus (`:107-115`), Beleg (`:118`), Benachrichtigung (`:120-124`).

### 6.3 Rabattcodes
- Regeln `src/lib/promo-rules.ts`: Art Prozent oder Festbetrag (`:2`), Mindestaufladung (`:4`), Bonusdeckel (`:5`), Budget (`:6`), Gültigkeit von/bis (`:8-9`), nur Neukunden (`:10`), Höchstzahl je Nutzer (`:11`), aktiv (`:12`).
- Berechnung: Prozent abgerundet, ggf. gedeckelt (`:25-29`). Prüfreihenfolge in `checkPromo` `:34-46`. Code wird auf Großbuchstaben ohne Leerzeichen normalisiert (`:48-50`).
- Einlösung nur bei erfolgreicher Zahlung, ein Datensatz je Zahlung (`promo_redemptions.payment_id` unique, `src/db/schema-finance.ts:113`). Server: `src/server/promo.ts` (nicht im Detail gelesen).

### 6.4 Anteil pro Spieler (Teamspiel)
- Preis je Dauer aus `price_rules`, Hallenregel vor Standardregel, jüngste Gültigkeit zuerst (`src/server/pricing.ts:9-28`). Ist kein Preis vorhanden, wird ein Fehler geworfen (`src/server/wallet.ts:24`).
- Anteil = Preis ÷ Spielerzahl, aufgerundet; Spielerzahl auf 1 bis 12 begrenzt (`src/lib/money.ts:22-30`). Beim Bereitmachen wird der höchstmögliche Anteil reserviert (Preis ÷ Mindestzahl) (`:33-35`; `src/server/wallet.ts:29-32`, `reserveShare` `:35-57`). Mindestzahl zahlender Spieler aus Einstellung `min_paid_players`, Standard 8, gültig 2 bis 12 (`src/server/settings.ts:27-31`).
- Abrechnung: Endanteil = Preis ÷ max(Zahler, Mindestzahl) (`src/lib/money.ts:38-40`); zu viel Gezahltes wird erstattet, Beleg und Meldung je Zahler (`src/server/wallet.ts:124-150`). Auslöser: Job `settle-matches` alle 5 Minuten (`src/server/jobs.ts:40`, `src/server/scheduled.ts:120-135`), sobald die Lobbyfrist erreicht ist (`:124`).

### 6.5 Stornoregeln (Teamspiel)
- Kostenlos abmelden bis 24 h vor Anstoß (`FREE_CANCEL_HOURS = 24`, `src/server/wallet.ts:18`).
- Verlässt jemand die Lobby: Entfernung durch Admin oder ≥ 24 h Restzeit ⇒ volle Erstattung (`:76-78`); sonst Eintrag in `pending_refunds`, Erstattung erst, wenn ein Ersatz bezahlt hat (`:81-90`, Auslösung `settlePendingRefunds` `:94-100`, je neuem Zahler wird die älteste offene Erstattung gedeckt).
- Spielabsage: alle bekommen alles zurück (`refundOnCancel` `:103-118`).
- Offene Zahlungen älter als 24 h gelten als abgebrochen (Job `expire-payments`, `src/server/scheduled.ts:138`; Kommentar `src/server/scheduled.ts:137`).

### 6.6 Privatspiel
- Mietpreis kann beim Anlegen gesetzt werden und wird als Preis und Kosten des Spiels eingetragen (`src/server/privategame.ts:69`). Die Aufteilung läuft dann über dieselben Funktionen wie beim Teamspiel (`wallet.ts`, siehe 6.4); ob für Privatspiele Besonderheiten gelten, wurde nicht Zeile für Zeile geprüft.

## 7. Ergebnisse (Eintragen, Bestätigen, Streit)

- Ereignisse (Tor, Karten) erfassen: `recordEvent` `src/server/results.ts:242`; nur Team-Admin oder Plattform-Admin (`:244`); nicht mehr, wenn das Endergebnis gemeldet ist (`:248`); Minute 0 bis Dauer + 30 (`:258`). Zurücknehmen: `undoLastEvent` `:268`.
- Endergebnis melden: `submitResult` `:299`; Punktzahl 0 bis 99 (`:281`, `src/lib/result-rules.ts:3,21-23`). Das andere Team muss bestätigen (`confirmResult` `:347`, Prüfung `:352`) oder widersprechen (`disputeResult` `:359`, Grund 3–300 Zeichen `:361-362`, nur das andere Team `:367`).
- Widerspruch setzt `match_results.disputed = true` und `matches.status = disputed` (`:368-369`), benachrichtigt beide Seiten und die Plattform-Admins (`:372-380`).
- Entscheidung bei Streit: `decideResult` `:402`, nur Plattform-Admin (`:407`), Begründung ≥ 3 Zeichen (`:405`).
- Automatische Bestätigung nach 48 h (`CONFIRM_WINDOW_HOURS`, `src/lib/result-rules.ts:1`; `autoConfirmOverdueResults` `src/server/results.ts:414-440`, Job alle 5 Minuten `src/server/jobs.ts:36`). Erinnerung nach 24 h (`REMINDER_AFTER_HOURS`, `result-rules.ts:2`; Job `result-reminders` alle 15 Minuten `jobs.ts:37`).
- Phasen für die Anzeige: `phaseOf` `src/lib/result-rules.ts:30-42`.
- Nach Abschluss laufen "Finalizer" in derselben Transaktion: erst Statistik, dann Turnier (`src/server/finalizers.ts:6-7`, Aufrufschleife `src/server/finalize.ts:16-20`; eingebunden über `src/server/results.ts:11`).
- Statistik/Elo/Rangliste zählen **nur Teamspiele** (`src/server/stats.ts:36`: `if (match.kind !== "team") return;`).
- Tabelle `match_results`: `confirmed_home/away`, `disputed`, `decided_by`, `auto_confirmed` (`src/db/schema.ts:165-179`).

## 8. Benachrichtigungen (Push, Jobs, pg-boss)

- Erzeugen: `notifyUsers(userIds, {type,title,body,url}, exec, exceptUserId)` `src/server/notifications.ts:55`; Nutzer, die den Typ abgewählt haben, werden übersprungen (`:61-62`). Typen: `src/lib/notification-types.ts:2-21` (u. a. match.confirmed, result.confirm, payment, system); je Typ Bezeichnung, E-Mail ja/nein, abwählbar (`:25-42`).
- Einstellungen je Nutzer: Push, E-Mail, abgewählte Typen (`src/db/schema.ts:217-222`; `getPrefs`/`savePrefs` `notifications.ts:93,99`).
- Zustellung: `deliverPending(limit = 200)` `notifications.ts:116`, wählt Meldungen ohne `deliveredAt` (`:129`), protokolliert in `delivery_log` (`:145`).
- Web-Push über `web-push` (`src/server/providers/push.ts:1,18-35`): ohne VAPID-Schlüssel wird übersprungen (`:22`); Geräte-Abo 404/410 gilt als erloschen (`:32`); TTL 12 Stunden (`:27`). Abos gespeichert in `push_subscriptions` (`src/db/schema.ts:224-232`; `savePushSubscription` `notifications.ts:170`). E-Mail-Anbieter: `src/server/providers/email.ts` (nicht im Detail gelesen).
- **Zeitplaner**: pg-boss in eigenem Schema `pgboss` derselben Datenbank (`src/server/scheduler.ts:6-9`). Start beim Serverstart, wenn `ENABLE_SCHEDULER` (Standard: in Produktion an, sonst aus) und `DATABASE_URL` gesetzt (`src/instrumentation.ts:17-21`).
- Jobs (16 Stück, `src/server/jobs.ts:12-29`) und Zeitplan (Cron, UTC; `:32-49`): deliver-notifications und send-reminders und run-matchmaker und advance-vetos jede Minute; lobby-deadlines, auto-confirm-results, settle-matches, booking-agent, expire-scheduling alle 5 Minuten; result-reminders alle 15 Minuten; expire-requests alle 10 Minuten; expire-payments alle 30 Minuten; close-mvp stündlich (Minute 10); cleanup täglich 03:17; finance-alerts täglich 06:05; close-city-challenge am 1. des Monats 05:30.
- Erinnerungen vor Anstoß: 24 h, 2 h, 30 min (`src/lib/deadlines.ts:11-26`); Doppelversand verhindert `reminders_sent` (`src/db/schema.ts:244-252`).
- Manueller Jobaufruf: `POST /api/jobs/[name]` mit Header `x-job-secret` (`src/app/api/jobs/[name]/route.ts:12-19`).

## 9. Turnier-Bestandteile und "Tag 1/2/3"

### 9.1 Server-Aufbau (`src/server/tournaments.ts`)
- Anlegen: `createTournament` `:56`. Nur freigeschaltete Veranstalter (`isOrganizer`) oder Admins (`:58`); Name 3–80 Zeichen (`:60`); Anmeldeschluss vor Beginn (`:65`); Teamzahl 4 bis 32 (`MIN_TOURNAMENT_TEAMS`/`MAX_…`, `:20-21`, Prüfung `:66`); Dauer 30 Min bis 12 h in 15-Minuten-Schritten (`:67`); Spielzeit 5 bis 90 Min (`:77`); Hallenpreis 0 bis 1.000 € je Stunde (`:74`). Beim Anlegen: Format immer `knockout` (`:88`), `entryFeeCents` immer 0 (`:90`), `totalCents` aus Stundenpreis × Dauer (`:91`, `src/lib/tournament.ts:194`), standardmäßig privat (`:94`), Einladungstoken (`:95`).
- Phasen (`status`): `registration` → `payment` → `running` → `finished`, plus `cancelled` (`src/db/schema-league.ts:79`).
  - `registrationOpen` = Status registration ohne Bracket (`tournaments.ts:122`); `paymentOpen` = Status payment ohne Bracket (`:123`).
- Team anmelden: `registerTeam` `:132-146`; nur Team-Admin (`:136`), Turnier nicht voll (`:140`), nicht doppelt (`:142`), Nutzer nicht schon in anderem Team des Turniers (`:144`); der Anmelder wird Captain (`:146`).
- Spieler beitreten: `joinAsPlayer` `:153-167`; nur Teammitglieder (`:160`), Kader höchstens 6 (`:164`, `MAX_PER_TEAM`); **jeder Beitritt setzt "vollzählig" des Teams zurück** (`unlockTeam` `:166`, Funktion `:248-250`).
- Austreten: `leavePlayer` `:181-195`; Captain kann nicht austreten (`:188`); Erstattung `refundPlayer` `:173` und ebenfalls Reset (`:193`).
- **Captain meldet "Kader vollzählig"**: `setRosterComplete` `:256-273`. Voraussetzungen: Phase registration (`:259`), Nutzer ist Captain (`:261`), Kader hat 4 bis 6 Spieler (`rosterReady` `:242-245`, `:262`). **Eine Zahlungsprüfung gibt es dort nicht.**
- **Preis fixieren**: `maybeFixPrice` `:275-295`: wenn alle Plätze belegt und alle Teams vollzählig, wird der Anteil je Spieler = Gesamtkosten ÷ Spielerzahl (aufgerundet, `src/lib/tournament.ts:208`) gesetzt, Status `payment`, danach ist der Kader gesperrt.
- **Bezahlen** erst in Phase `payment`: `payEntry` `:199-212` (Fehler "Bezahlen geht, sobald alle Teams vollzählig sind …" `:202`; nicht doppelt `:207`; Abbuchung vom Guthaben `:208`). **Captain zahlt für alle oder einzelne**: `payForTeam` `:220-239`; nur Captain (`:225`), alles-oder-nichts (Kommentar `:216`); Zahler wird in `paidBy` gespeichert; Erstattungen gehen an den Zahler (`:176`, `refundPlayer` zahlt an `paidBy ?? userId`).
- **Kader wieder öffnen** durch Veranstalter: `reopenRosters` `:297-312`, erstattet alle bezahlten Anteile vollständig und berechnet den Preis später neu.
- Team abmelden: `withdrawTeam` `:315-337`; nach Anmeldeschluss kann der Veranstalter keine Teams ersetzen (`:323`). Mit weniger Teams schließen: `closeWithJoinedTeams` `:339-352` (nur nach Anmeldeschluss `:344`, Mindestens 4 Teams `:346`).
- **Bracket-Erzeugung**: `maybeGenerateBracket` `:373-397`. Bedingungen: Phase payment, kein Bracket (`:375`), Teamzahl = `maxTeams` und ≥ 4 (`:377`), **alle Spieler haben ihren Anteil bezahlt** (`:380`). Dann Status `running`, `bracketGeneratedAt` gesetzt (`:382`), Spielplan `knockout(...)` (`:383`), echte Spiele (`createGames` `:399-428`).
- Sperre gegen Doppelt-Erzeugung: Transaktion mit Zeilensperre `.for("update")` (`lockTournament` `:105-109`) und Prüfung `bracketGeneratedAt` (`:375`).
- **K.-o.-Baum mit Freilosen**: `knockout(teamIds)` `src/lib/tournament.ts:52` ("Freilose rücken ohne Spiel eine Runde weiter. Immer n-1 Spiele", Kommentar `:51`). Setzreihenfolge `bracketOrder` `:39`.
- Weitere Formate sind als Funktionen vorhanden: `roundRobin` `:20`, Gruppen (`groupFixtures` `:107`, `koFromGroups` `:148`); beim Anlegen wird nur `knockout` gesetzt (`tournaments.ts:88`). `MIN_GROUP_TEAMS = 6` `src/lib/tournament.ts:17`.
- **Echte Spiele**: Für jede Paarung mit zwei feststehenden Teams entsteht ein `matches`-Eintrag mit `kind: "tournament"`, `visibility: "private"`, `status: "confirmed"` (`tournaments.ts:413`); alle Kadermitglieder werden als bereit und bezahlt eingetragen (`:416`). Ergebnisse laufen über die normale Captain-Meldung und -Bestätigung (Abschnitt 7).
- **Sieger rücken auf**: Finalizer `advanceFromMatch` (`tournaments.ts:439-454`, registriert `src/server/finalizers.ts:7`). Bei Unentschieden trägt der Veranstalter den Sieger des Siebenmeterschießens ein (`decideShootout` `:456-468`, Hinweis an Veranstalter `:449`).
- **Abschluss und Geld**: `settle` `:481-489`: Auszahlung der Eintritte an den Veranstalter abzüglich Provision (Standard 10 %, Einstellung `tournament_commission_percent`, `commissionPercent` `:26-29`; Berechnung `splitEntryFees` `src/lib/tournament.ts:183`).
- **Absage**: `cancelTournament` `:491-509`: nur Veranstalter (`:494`), nicht wenn schon Ergebnisse vorliegen (`:496-497`), erstattet alle Eintritte vollständig (`:499-501`), setzt Spiele auf abgesagt (`:505`), löscht die Spielplan-Zeilen (`:506`) und setzt Status `cancelled` (`:507`).

### 9.2 Zeitplan
- `planSchedule` `src/lib/tournament.ts:237-255`: zwei Plätze (`COURTS = 2`, `:221`), 5 Minuten Pause zwischen Blöcken (`GAP_MIN = 5`, `:223`), Finale mit einem "Spaßspiel" der Halbfinal-Verlierer auf Platz 2 (Kommentar `:230-236`). Nur für reine K.-o.-Runden (`scheduleOf` `tournaments.ts:390-396`, Bedingung `startsWith("ko:")`); sonst Zeitplan aus `matchMinutes` (`:407-409`).
- Anzeige: `src/app/turniere/[id]/BracketView.tsx`, `BoardClock.tsx`, `BoardInfo.tsx`, `LiveBadge.tsx` (Dateinamen; Inhalt nicht gelesen).

### 9.3 Sichtbarkeit des Brackets
- `bracketVisible = Boolean(t.bracketGeneratedAt)` (`tournaments.ts:580`); Spielzeilen werden nur dann aus der Datenbank gelesen, sonst leere Liste (`:581`). Es gibt keinen API-Handler für Turniere (Abschnitt 2.1).
- Private Turniere: Wer nicht Veranstalter, nicht im Turnier und ohne passenden Token ist ("spectator", `:576`), sieht keinen Einladungslink, Kader oder Zahlungsstand (Kommentar `:574-575`; `captainName` dann "–" `:609`, Spielerliste leer `:614`).

### 9.4 "Tag 1", "Tag 2", "Tag 3"
- **Nicht im Turnier.** Im Code kommen die Begriffe **nur** im Matchmaking-Formular einer offenen Lobby vor: `src/app/matchmaking/QueueForm.tsx`.
  - Felder `day1..day3` / `from1..from3` / `to1..to3` (`:67-81`, Name `day${i}`).
  - Beschriftung: erstes Fenster "Tag des Spiels", weitere "Alternativer Tag 1" und "Alternativer Tag 2" (`:70`). Das Wort "Tag 1/2/3" steht also nicht wörtlich in der Oberfläche; es entsteht aus `i` = 1, 2, 3.
  - Der Hinweistext erklärt, dass es um Tag und Zeitraum geht ("Wähle den Tag und von wann bis wann euer Team Zeit hat … einigen sich die Captains auf die genaue Uhrzeit", `:65`); Knopf "+ Alternativen Tag anbieten" (`:83-86`); höchstens 3 (`:84`, `MAX_WINDOWS = 3` `src/lib/matchmaking.ts:5`).
- Serverseitig sind es Zeitfenster `{from,to}`: Pflicht ≥ 1 Fenster (`src/server/matchmaking.ts:34`), höchstens 3 (`:35`); Spalte `matchmaking_queue.windows` (`src/db/schema-matchmaking.ts:21`). Aus der Überschneidung zweier Teams werden Terminvorschläge gebildet (`src/lib/matchmaking.ts:60`, Verwendung `:115`).
- Beim Spiel selbst heißt das Feld `time_windows` ("vereinbartes Zeitfenster … leer = Tag frei", `src/db/schema.ts:127`).
- Suche im Code (`src`, `drizzle/*.sql`, `tests`, `PLAN.md`, `docs/*.md`) nach den Mustern `tag 1/2/3`, `day 1/2/3`, `tag1/2/3`, `day1/2/3`, `dayNumber`, `spieltag`, `dayIndex`: Treffer nur "Spieltag" im Sinn von Spielbetrieb (z. B. `src/server/actions.ts:198`, Kommentar), nicht als Turniertag. `day${i}` steht in `src/app/matchmaking/QueueForm.tsx:70,71` (Formular) und wird in `src/server/matchmaking-actions.ts:34` gelesen (gleicher Matchmaking-Kontext, kein Turnierbezug).
- **Es gibt kein Datenbankfeld, kein Turnierformular-Feld und keine Turnierlogik namens Tag 1/2/3.** Das Turnier-Formular hat die Felder name, city, maxTeams, venueText, startsAt, registrationDeadline, durationHours, matchMinutes, hourlyRent, public (`src/app/app/turniere/neu/TournamentForm.tsx:15-67`).

## 10. Abgleich mit Brief

Quelle: `BRIEF-turnier-privatspiel.md` (Brief des Nutzers, Kopie unter `docs/briefs/turnier-privatspiel.md`). Dieser Abschnitt stellt nur Brief und Ist-Zustand gegenüber; er enthält keine Vorschläge.

### 10.1 (a) Was der Brief als "neu" beschreibt, existiert bereits
Der Git-Verlauf nennt diese Schritte (Commit-Titel per `git log --oneline`): Turniermodus (`eb24515`), Privatspiel (`eabd463`), Hallenkosten geteilt (`3b1e442`), Captain zahlt für alle (`5ef2018`), Team vollzählig + Preis automatisch + Bracket als Baum (`09f0976`), Turnier-Board (`25c26fe`), Zeitplan (`27d7256`), LIVE-Badge (`ecb3539`). Belegt am Code:

| Brief | Im Code vorhanden? | Fundstelle |
|---|---|---|
| Turniermodus | Ja | `src/server/tournaments.ts`, `src/db/schema-league.ts:81` |
| Organisator legt Name, Teamanzahl, Ort, Termin, Anmeldeschluss fest | Ja | `TournamentForm.tsx:15-42`; `tournaments.ts:56-77` |
| Turnier standardmäßig privat, Link | Ja | `tournaments.ts:94-95`, `schema-league.ts:98-99` |
| Genau ein Captain je Team | Ja | `schema-league.ts:120`; `tournaments.ts:146` |
| Beitritt mit bestehendem Team | Ja (nur bestehendes Team) | `tournaments.ts:132-146` |
| Neues Team über vorhandene Teamfunktion gründen | Teamfunktion ist da (`src/server/teams.ts:17`); ein eigener Weg "Team direkt im Turnier gründen" wurde nicht gefunden (siehe 11) | `src/app/turniere/[id]/RegisterForm.tsx` (Inhalt nicht gelesen) |
| Mitspieler über bestehende Einladungslogik | Ja, Teammitglieder treten dem Turnier bei; Mitgliedschaft über den Team-Einladungslink | `tournaments.ts:153-160`, `teams.ts:113-139` |
| Jeder Spieler zahlt selbst | Ja, plus Captain kann für andere zahlen | `tournaments.ts:199`, `:220` |
| Turnier-Lobby mit Teams, Captains, Spielern, Zahlungsstatus, Bereit-Status | Ja, Daten dafür werden geliefert | `tournaments.ts:557-565,609-614` |
| Bereit-Reset bei Kaderänderung | Ja | `tournaments.ts:166,193` |
| Bracket verborgen bis Bedingungen erfüllt | Ja | `tournaments.ts:373-384 (Prüfungen 375-380),580-581` |
| K.-o.-Bracket einmalig, Freilose | Ja | `tournaments.ts:383`, `src/lib/tournament.ts:52` |
| Sieger rücken automatisch weiter | Ja | `finalizers.ts:7`, `tournaments.ts:439-454` |
| Ersetzen fehlender Teams bis Anmeldeschluss | Ja (Team abmelden durch Veranstalter) | `tournaments.ts:315-337` |
| Absage mit voller Rückbuchung | Ja | `tournaments.ts:491-509` |
| Doppelte Zahlung / doppeltes Bracket ausgeschlossen | Ja | `tournaments.ts:207,375,105-109`, `ledger.ts:38-69` |
| Privatspiel: 10 Spieler Standard | Ja | `lobby-rules.ts:23` (`DEFAULT_PRIVATE_PLAYERS`) |
| Privatspiel nicht öffentlich, nur per Link | Ja (Spiel-Team `kind=private`, Match `kind=private`, Einladung) | `privategame.ts:48-49,60,73-74` |
| Zwei Teams einteilen oder zufällig | Ja | Zufällig: `randomSplit` `lobby.ts:427`; Teams einteilen/Zuweisung zurücknehmen: `assignSubstitute` `lobby.ts:406` (weist wartende Spieler ohne Team einem Team zu; erlaubt für Admins des Ziel-Teams `isAdminOf` und für den Plattform-Admin `isPlatformAdmin`, `lobby.ts:409`; bei Privatspielen ist der Veranstalter Admin beider Spiel-Teams, `privategame.ts:52-55`; Beitritt ohne Team `privategame.ts:120`), `unassignParticipant` `lobby.ts:456` |
| Hallenmiete auf zahlende Spieler | Ja, über die Teamspiel-Abrechnung | `privategame.ts:69`, `money.ts:38-40` (Besonderheiten nicht vollständig geprüft) |
| Privatspiel zählt nicht für Rangliste | Ja | `stats.ts:36` |
| Link funktioniert nach Anmeldung/Registrierung | Seite und Beitritt sind vorhanden; Ablauf über Anmeldung nicht durchgespielt | `src/app/spiel/[token]/page.tsx`, `privategame.ts:107` |
| Oberfläche in Teamspiel / Privatspiel / Turnier getrennt | Teilweise belegt: getrennte Formulare `app/privatspiel/neu`, `app/turniere/neu`, `matchmaking` | Dateiliste; Navigation nicht gelesen |
| Tests für Rechte, Zahlungen, Bereit, Bracket | Dateien vorhanden: `tests/integration/tournament.test.ts`, `privategame.test.ts`, `payments.test.ts`, `wallet.test.ts`, `tests/unit/` | Inhalt und Ergebnis nicht geprüft |

### 10.2 (b) Was fehlt oder abweicht
1. **Bereit und Zahlung in umgekehrter Reihenfolge.** Brief: Captain darf erst "Bereit" drücken, wenn alle seines Teams bezahlt haben. Code: "Bereit" (hier "Kader vollzählig") hängt nur an Kadergröße 4–6 (`tournaments.ts:242-245,262`); bezahlt wird erst **nach** der Preisfestlegung in Phase `payment` (`:199-203`). Das Bracket entsteht, wenn alle bezahlt haben (`:381`). Im Turnierablauf gibt es also keine "Bereit nach vollständiger Zahlung"-Prüfung.
2. **Eintritt wird nicht vom Organisator gesetzt.** Brief: Organisator legt "Eintritt pro Spieler" fest. Code: `entryFeeCents` wird mit 0 angelegt (`tournaments.ts:90`); der Anteil ergibt sich aus Hallenkosten ÷ Spielerzahl (`:275-290`, `src/lib/tournament.ts:208`). Die Spalte `entry_fee_cents` bleibt im Schema ("altes Festgeld", `schema-league.ts:93`).
3. **Teamzahl.** Brief nennt 4, 8, 16, 32 mit Freilosen für andere Zahlen. Code erlaubt jede Zahl von 4 bis 32 (`tournaments.ts:66`); Freilose über `knockout()` (`tournament.ts:51-52`). Das Datenbank-Check erlaubt 2–32 (`schema-league.ts:110`).
4. **Formate.** Im Code existieren Hilfsfunktionen für Rundenturnier und Gruppen (`tournament.ts:20,107,148`); angelegt wird immer `knockout` (`tournaments.ts:88`). Der Brief verlangt nur K.-o.
5. **Gegenüber dem Brief zusätzlich vorhanden** (nicht gefordert): Plattform-Provision (`tournaments.ts:26-29,481-489`), Zeitplan mit zwei Plätzen und Spaßspiel (`tournament.ts:221-255`), Siebenmeterschießen durch den Veranstalter (`tournaments.ts:456`), Board/LIVE-Anzeige.
6. **Turniere nicht in der Navigation.** Commit `547c0a4` nennt "Turniere/Ligen aus der Navigation"; Navigation selbst nicht gelesen (siehe 11).
7. **Privatspiel: wenige Prüfungen nicht verifiziert** (Registrierungs-Weiterleitung in die Lobby, WhatsApp-Teilen, Zahlungsstatus in der Lobby). Siehe 11.

### 10.3 (c) Wo werden "Tag 1/2/3" im Lobby-Formular genutzt?
Nur in `src/app/matchmaking/QueueForm.tsx:67-86` als bis zu drei Zeitfenster (Datum, von, bis) für das Matchmaking der offenen Lobby; Server: `src/server/matchmaking.ts:34-35`, Speicherung als `windows` (`src/db/schema-matchmaking.ts:21`), Auswertung per Überschneidung (`src/lib/matchmaking.ts:60,115`). Mit dem Turnier haben diese Felder im Code keine Verbindung (siehe 9.4). Der Commit `63d56ee` ("ein Tag mit Zeitraum, weitere Tage nur auf Wunsch") und `eabd463` ("Zeitfenster klar benannt") betreffen dieses Formular laut Titel; der Hinweistext Z. 65 und die Beschriftung Z. 70 benennen den Tag als Zeitfenster.

### 10.4 (d) Serverseitige Prüfungen für Bereit und Zahlung; Bracket-Sichtbarkeit über die API
Turnier:
- Bereit/vollzählig: Captain-Prüfung (`tournaments.ts:261`), Phase (`:259`), Kadergröße (`:262`). **Keine Zahlungsprüfung** (Zahlung existiert in dieser Phase noch nicht, `paymentOpen` erst nach `maybeFixPrice`).
- Zahlung: Phase (`:202`), Mitgliedschaft im Kader (`:204`), nicht doppelt (`:207`), ausreichendes Guthaben (`ledger.ts:93`), Zeilensperre (`:200-205`, `ledger.ts:84`), eindeutiger Buchungsschlüssel (`ledger.ts:38-69`).
- Captain zahlt: nur Captain (`:225`), alles-oder-nichts.
- Bracket vor Vollständigkeit: Die Spielzeilen werden nur geladen, wenn `bracketGeneratedAt` gesetzt ist (`:580-581`). **Es gibt keine API-Route für Turniere** (Abschnitt 2.1); der Zugriff läuft über Serverfunktion und Seite. Ob andere Seiten (z. B. `/spiele/[id]`) Daten einer noch nicht erzeugten Paarung liefern könnten, ist nicht anwendbar, weil die echten Spiele erst in `createGames` (nach Bracket-Erzeugung) angelegt werden (`:399-428`).

Teamspiel-Lobby (zum Vergleich): Bereit verlangt bei eingeschalteten Zahlungen einen bezahlten Anteil (`lobby.ts:359`).

### 10.5 Zahlungsmodell vs. Entscheidung

Entscheidung des Nutzers (Vertrag 005 Turniermodus, Zahlung; Stand 2026-11-08, Wortlaut in `docs/briefs/turnier-privatspiel.md`): "Jeder Spieler zahlt grundsätzlich seinen Eintritt selbst. Zusätzlich kann der Captain für einzelne oder alle Spieler seines Teams zahlen, und Spieler können auch füreinander zahlen." Dieser Unterpunkt beschreibt nur, was der Code heute tut.

**(a) "Captain zahlt für alle offenen Spieler oder für einzelne" im Code**
- Eingeführt mit Commit `5ef2018` ("Turnier: Captain zahlt für alle offenen Spieler oder für einzelne, Spieler zahlen weiter selbst; Erstattungen gehen an den Zahler"; laut `git show --stat`: Migrationen `0030`/`0031`, `src/db/schema-league.ts`, `src/server/tournament-actions.ts`, `src/app/turniere/[id]/page.tsx`). Commit `09f0976` ("Team vollzählig, Preis automatisch berechnet, erst dann bezahlen") legte die Phase `payment` fest, in der gezahlt wird.
- Serverfunktion `payForTeam(userId, tournamentId, targetUserId?)`: `src/server/tournaments.ts:220-239`. Nur in Phase `payment` (`:223`); der Aufrufer muss Captain eines angemeldeten Teams sein (`:224-225`); kostenloses Turnier gesperrt (`:227`); Zielspieler muss im Team des Captains sein (`:229`); offene Spieler = Anteil noch nicht voll bezahlt (`:230`); "alles oder nichts" im Kommentar (`:217`).
- Gebucht wird **vom Guthaben des Captains** (`debitWallet(tx, userId, …)` `:233`, `userId` = Aufrufer) auf das Konto `tournament`. Beim Spieler werden `paidCents`, `paidAt` und `paidBy = Captain` gesetzt (`:234`).
- Server Action: `payForTeamAction` `src/server/tournament-actions.ts:76-78`. Oberfläche: Knopf "Als Captain für alle offenen Spieler bezahlen" (`src/app/turniere/[id]/page.tsx:201`), Knopf "Ich zahle für ihn" je Spieler (`:216`, Bedingung `inPayment && mine && !free && !p.paid`; `mine` = `v?.captainTeamId === team.teamId`, `:191`), Hinweis "vom Captain bezahlt" (`:211`).
- Jeder Spieler zahlt weiter selbst über `payEntry` (`tournaments.ts:199-212`, Action `tournament-actions.ts:72-74`).

**(b) Können Spieler heute für andere Spieler zahlen?**
- `payEntry` bucht ausschließlich für den Aufrufer: Es liest die eigene Zeile in `tournament_players` (`:203`), bucht vom eigenen Guthaben (`:208`) und setzt `paidBy` auf den Aufrufer (`:209`). Die Action `payEntryAction(tournamentId)` hat keinen Parameter für einen anderen Spieler (`tournament-actions.ts:72`).
- `payForTeam` verlangt, dass der Aufrufer `captainId` des Teams ist (`tournaments.ts:224-225`) und wirkt nur auf Spieler des eigenen Teams (`:228-229`).
- **Ergebnis: Ein Nicht-Captain kann heute nicht für einen anderen Spieler zahlen; auch ein Captain nicht für ein anderes Team.** Nachweis: Die Buchungsart `tournament_entry` wird in `src/server/tournaments.ts` nur an zwei Stellen gebucht (`:208` in `payEntry`, `:233` in `payForTeam`).

**(c) Wohin gehen Erstattungen?**
- `refundPlayer` (`tournaments.ts:173-178`) schreibt dem Konto `p.paidBy ?? p.userId` gut (`:176`), also dem, der gezahlt hat. `paid_by` auf Spielerebene verweist auf `users` (`src/db/schema-league.ts:136`). Die Spalte `tournament_teams.paid_by` (`:118`) wird im Serverteil nicht verwendet (Suche, siehe Abschnitt 11).
- Aufrufer: Absage durch Veranstalter (`tournaments.ts:499-501`), Kader wieder öffnen (`:304`, danach wird `paidBy` auf null gesetzt, `:305`), Spieler verlässt Kader (`:192`), Team abmelden durch Captain oder Veranstalter (`withdrawTeam` `:315-337`, Erstattung je Spieler `:325`, nur in Phase `registration`, `:318`).
- Beim Wiederöffnen werden Spieler und Zahler benachrichtigt (`:309`, `paidBy` wird einbezogen).
- Heute kann `paidBy` nur der Spieler selbst oder dessen Captain sein (Abschnitt (b)). Würden Spieler für Spieler zahlen, ginge nach dem jetzigen Code die Erstattung an den Zahler (`paidBy`), weil `refundPlayer` nicht nach der Art des Zahlers unterscheidet. Das Datenmodell lässt jeden Nutzer als `paidBy` zu (`schema-league.ts:136`).
- Folgerung aus den Phasenprüfungen, nicht per Test belegt: Spieler können nur in Phase `registration` austreten (`:184`) und Teams nur in Phase `registration` abgemeldet werden (`:318`); bezahlt wird nur in Phase `payment` (`:202`, `:223`). Eine Erstattung bezahlter Anteile erfolgt dadurch in der Praxis über `reopenRosters` (setzt die Phase zurück auf `registration`, `:308`) oder bei Absage; `leavePlayer` und `withdrawTeam` rufen `refundPlayer` zwar ebenfalls auf, erreichen aber nur Spieler mit `paidCents = 0`, solange keine Zahlung in der Anmeldephase möglich ist.
- Verbleib des Geldes im Normalfall: `settle` zahlt die Summe der `paidCents` abzüglich Provision an den Veranstalter aus (`:481-484`, Provision `:26-29`); wer gezahlt hat, spielt dort keine Rolle.

**(d) Passung zur Bereit-Prüfung "alle Spieler bezahlt"**
- Die Bereit-Meldung der Captains (`setRosterComplete` `:256-273`) kommt vor der Zahlung und prüft keine Zahlung (Abschnitt 10.2, Punkt 1). Eine Prüfung "alle Spieler bezahlt" gibt es nur bei der Bracket-Erzeugung: `everyone.every(p => share === 0 || p.paid >= share)` (`:380`).
- Diese Prüfung wertet nur `paidCents` aus, nicht `paidBy`. Ob ein Spieler selbst oder der Captain gezahlt hat, ist für die Bracket-Erzeugung ohne Bedeutung.
- Beide Zahlfunktionen rufen nach der Zahlung `maybeGenerateBracket` auf (`payEntry` und `payForTeam`; Aufrufe `:211` bzw. `:237`).

**(e) Idempotenz und Doppelzahlung**
- Serialisierung: beide Zahlfunktionen sperren die Turnierzeile (`lockTournament` `:105-109`; Aufruf `payEntry` `:201`, `payForTeam` `:222`). `payEntry` sperrt zusätzlich die eigene Spielerzeile (`:203`), `payForTeam` die Spielerzeilen des Teams (`:228`). Gleichzeitige Aufrufe laufen dadurch nacheinander.
- Prüfung vor dem Buchen: `payEntry` bricht ab, wenn `paidCents >= share` (`:207`); `payForTeam` nimmt nur Spieler mit `paidCents < share` (`:230`) und wirft einen Fehler, wenn keiner offen ist (`:231`).
- Buchungsschlüssel: `tournament-entry:<Turnier>:<Spieler>:<joinedAt>:<priceRound>` in beiden Funktionen (`:208`, `:233`), also **unabhängig davon, wer zahlt**. Das Hauptbuch lässt jeden Schlüssel nur einmal wirken (`src/server/ledger.ts:63`, Unique-Spalte `src/db/schema-finance.ts:134`). `priceRound` wird bei jeder Preisfestlegung erhöht (`tournaments.ts:283`), sodass nach einer Kader-Wiederöffnung neu gezahlt werden kann.
- Nicht ausgewertet: Der Rückgabewert von `debitWallet`/`post` (`created: true/false`) wird an `:208` und `:233` nicht geprüft (`src/server/ledger.ts:41,65-68`). Das Guthaben wird vor dem Buchen geprüft (`ledger.ts:92-93`). Einen Datenbank-Constraint "höchstens eine Zahlung je Spieler" außer dem Buchungsschlüssel habe ich nicht gefunden.
- Erstattungsschlüssel enthalten `joinedAt` und `paidAt` (`tournaments.ts:176`).
- Unklar: Testabdeckung dieser Fälle (`tests/integration/tournament.test.ts` vorhanden, Inhalt nicht gelesen).

**Differenz Entscheidung ↔ Ist**
1. "Jeder Spieler zahlt selbst": **Ist vorhanden** (`payEntry`, `tournaments.ts:199`).
2. "Captain zahlt für einzelne oder alle seines Teams": **Ist vorhanden** (`payForTeam`, `:220`), nur in Phase `payment`, nur für das eigene Team, nur vom eigenen Guthaben.
3. "Spieler können füreinander zahlen": **Ist nicht vorhanden**; nur der Captain zahlt für andere (Abschnitt (b)).
4. Erstattung an den Zahler: **Ist vorhanden** über `paidBy` (`:176`); der Fall "Spieler zahlt für Spieler" kommt im Ist nicht vor.
5. Reihenfolge Bereit/Zahlung: **Ist umgekehrt** zu "Bereit erst nach Zahlung" aus dem Brief (Abschnitt 10.2, Punkt 1). Der Entscheidungsvermerk äußert sich dazu nicht.
6. Unklar: Verhalten, wenn der Zahler später nicht mehr im Turnier ist (z. B. Captain-Wechsel). Eine Funktion zum Ändern von `captainId` wurde nicht gefunden; gesetzt wird `captainId` beim Anmelden (`:146`).

---

## 11. Unklar / nicht gefunden

| Gesucht | Ergebnis |
|---|---|
| Inhalt der Next.js-Hinweise `node_modules/next/dist/docs/` | Nicht vorhanden im Worktree (`node_modules` fehlt); nicht gelesen |
| PayPal als eigener Anbieter | Suchbegriff `paypal` in `src`, `package.json`: vier Stellen in `src`: Kommentar `src/server/payments.ts:32` und UI-Texte `src/app/admin/einstellungen/page.tsx:41`, `src/app/hilfe/page.tsx:82`, `src/app/app/guthaben/page.tsx:84`; keine in `package.json`; kein eigener Anbieter (`Provider = dev oder stripe`). Nur Doku-Erwähnungen (`PLAN.md`, `README.md`, `docs/ARCHITEKTUR.md`) |
| "Tag 1/2/3" im Turnier (Feld, Datenbank, Logik) | Nicht gefunden. Suchmuster siehe 9.4. Vorkommen nur als Zeitfenster-Felder in `QueueForm.tsx` |
| Bracket-Dashboard "Baum" und Board im Detail | Dateien vorhanden (`src/app/turniere/[id]/*.tsx`), Inhalt nicht gelesen |
| Captain-zahlt-für-alle in der Oberfläche | Serverfunktion belegt (`tournaments.ts:220`, `tournament-actions.ts:76`); Oberfläche nicht gelesen |
| Team direkt im Turnier gründen | Nicht gefunden (`registerTeam` verlangt ein bestehendes Team, `tournaments.ts:136-138`); `RegisterForm.tsx` nicht gelesen |
| E-Mail-Zustellung (`providers/email.ts`), Rabattcode-Server (`promo.ts`), Hallen-Veto (`veto.ts`), Terminwahl (`scheduling.ts`), Buchungsagent (`booking*.ts`), Spielsuche (`requests.ts`), Profi-Tag (`pro-events.ts`) | Existenz per Dateiliste bzw. Funktionskopf; Innenleben nicht gelesen |
| Navigation/Menü (Trennung Teamspiel / Privatspiel / Turnier) | `Header.tsx`, `BottomNav.tsx` nicht gelesen |
| Weiterleitung neu registrierter Nutzer in ein Privatspiel | Nicht durchgespielt; Seite `src/app/spiel/[token]/page.tsx` und `joinPrivateGame` vorhanden |
| Ergebnisse von Tests (typecheck, lint, vitest, e2e) | Nicht ausgeführt (nur lesend, `node_modules` fehlt) |
| Verhalten bei laufender Datenbank (Migrationen tatsächlich angewendet, Triggerstand) | Nicht geprüft; nur Migrationsdateien gelesen |
| Rollen-Rechte im Detail (`src/lib/roles.ts`) | Datei vorhanden (26 Zeilen), nicht ausgewertet |
| Testabdeckung der Turnier-Zahlfälle (Doppelzahlung, Captain-Zahlung, Erstattung an Zahler) | `tests/integration/tournament.test.ts` vorhanden, Inhalt nicht gelesen |
| Funktion zum Ändern des Captains (`captainId`) | Nicht gefunden (Suche `captainId` mit `set(` in `src/server/tournaments.ts`); gesetzt nur beim Anmelden (`:146`) |
| Nutzung von `tournament_teams.paid_by` / `fee_cents` | Spalten im Schema (`src/db/schema-league.ts:118-119`), Verwendung in `src/server/tournaments.ts` nicht gefunden (Suche `feeCents`, `paidBy` auf Teamebene) |
| Wirkung, wenn jemand für einen anderen Spieler zahlen würde | Im Code nicht vorhanden; Beschreibung nur über `paidBy` in Abschnitt 10.5 (c) |
