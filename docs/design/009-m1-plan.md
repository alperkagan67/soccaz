# 009 M1-Plan: Rollen, Absagevorschlag, Eingriffsprotokoll, Admin-Alarm
Stand: v4 2026-11-12 (v1 bis v3 am selben Tag; v4: Vertragssatz, Signaturänderung, Bereinigung veralteter owner-Formulierungen; E1a und E1b sind als Code gebaut und security-geprüft, auf `feat/009-m1-e1a` und `feat/009-m1-e1b`, noch nicht auf main, die Migration noch nicht committet) · Code-Stand `origin/main` 872f1d6 · Verfasser: worker-2 (Plan, Doku, kein Code) · Status: Entwurf, Review durch einen anderen Worker offen

Zweck: Plan für den Meilenstein M1 des Vertrags `docs/contracts/009-admin-einnahmen-buchhaltung.md` (Version 3): Rollen `owner`/`admin`, Rechteprüfung, Eingriffsprotokoll mit Pflicht-Begründung, Absagevorschlag (Admin 2) mit Absage und Erstattung nur durch Admin 1, Admin-Alarm nur an Admin 1 (AC-18), Oberfläche für die Admin-Absage. Der Plan ändert weder Code noch Vertrag und **beantwortet keine Produkt- oder Rechtsfrage**: Sie stehen in Abschnitt 11 als FRAGE. Annahmen und Empfehlungen sind als solche markiert; wo der Nutzer entscheiden muss, steht „Entscheid Nutzer“.

Quellen: Vertrag 009 (Rollen, AC-1, 2, 8, 9, 18, Meilenstein M1, Entscheide t9 2026-11-12), `docs/loop/GO-LIVE-AUDIT.md` (G20-012 Admin-Absage mit Oberfläche = Go-live-MUSS, G21-012 Absagegrund), `docs/loop/FEHLT-NOCH.md` (Alarm-Empfänger ENTSCHIEDEN), `docs/design/m4-plan.md` (Admin-Alarm Admin 1, `admin.task`), `docs/design/m3-plan.md`, Vertrag 013 (Admin am Handy: nur Übersicht, Moderation, Sperren, Protokoll lesen).

## 1. Entscheide, die gelten (nicht neu verhandeln)
- Admin 1 (im Vertrag Rolle `owner`), genau einer; technisch `role = 'admin'` plus `users.is_owner` (Abschnitt 3.1, 5). Admin 2 = Rolle `admin` (Mitarbeiter). Admin 2 hat keine Buchhaltung, Provisionen, Einstellungen, Rollenverwaltung (Vertrag 009, Rollen).
- Absage mit Erstattung nur durch Admin 1. Admin 2 schlägt vor, mit Begründung; keine Erstattung durch den Vorschlag (AC-9).
- Admin-Absage ohne Oberfläche reicht vor dem Go-live nicht (Go-live-MUSS G20-012, **bleibt offen bis E4**). Die Oberfläche wird nicht vor der Grundlage 013 M2 und der Admin-Oberfläche 013 M7 gebaut. Der E2E zu M4-AC-10 bleibt bis dahin `fixme`; der Server-Test deckt die Funktion.
- Admin-Alarm: bis zu dieser M1 (die Rolle `owner` gibt es noch nicht) an alle nicht gesperrten Nutzer mit Rolle `admin` (derzeit identisch mit Admin 1), danach NUR an `owner` (AC-18, Test `tests/integration/admin-alarm-empfaenger.test.ts`). **Kein Ersatzkreis** nach der Migration (ein Fallback auf `admin` würde AC-18 öffnen). Die Warnung „kein Admin 1“ in der Übersicht kommt erst mit E4; bis dahin nur Server-Log.
- Eingriffe (Sperren, Lobby schließen, Absage, Halle) werden mit wer/wann/was/warum protokolliert, Begründung Pflicht (AC-8).

## 2. Bestand (Code 872f1d6)
- **Rollen:** Enum `user_role` = `player`, `admin`, `moderator`, `finance`, `booking` (`src/db/schema.ts:21`), kein `owner`. Der Plan führt deshalb `users.is_owner` ein (Abschnitt 3.1). Davon getrennt das Enum `team_role` = `admin`, `player` (`schema.ts:22`, Team-Admin/Captain). `src/lib/roles.ts`: `GRANTS` gibt `admin` ALLE Berechtigungen; `can(role, permission)`. Heute ist jeder Plattform-Admin faktisch Admin 1.
- **Prüfstellen:** Die Suche nach `role === "admin"` / `role !== "admin"` / `eq(users.role, "admin")` findet 53 Zeilen in 29 Dateien. **Davon betreffen rund die Hälfte die Team-Rolle** (`team_members.role`, Captain), die M1 nicht anfasst. Die Plattform-Rolle (`users.role`) prüfen die Stellen in Abschnitt 4. Dazu kommen Prüfungen über `can(user.role, …)` (Finanzexport, Belege, Hallenpreise, Kopfleiste) und Empfängerlisten mit `inArray(users.role, [...])`.
- **Admin-Bereich:** `src/app/admin/layout.tsx` (Navigation nach Berechtigung; Einstellungen an `admin`, Finanzen/Codes an `finance`). Rollen ändern und sperren: `admin.ts` `setRole` (Audit `user.role`, ohne Begründung), `setBanned(actorId, userId, banned, reason)` (Plattform-Admins sind nicht sperrbar, `admin.ts:161`), UI `src/app/admin/nutzer/UserActions.tsx`.
- **Absage mit Erstattung (012 M3a):** `payments/refund.ts` `adminCancelMatch(actorId, matchId, reason)` (Grund 3 bis 200 Zeichen; prüft `actor.role === "admin"`, `:138`) und `requestMatchCancel`; Server-Aktion `actions.ts:209` `adminCancelMatchAction`. **Kein Aufrufer in der Oberfläche.** Absage ohne Abbuchung: `lobby.ts` `cancelMatch` → `canManageMatch` (Plattform-Admin erlaubt, `lobby.ts:214`) → `cancelMatchTx`; nach der ersten Abbuchung lehnt `cancelMatchTx` ab.
- **Protokoll:** Tabelle `audit_log` (`actor_id` mit Fremdschlüssel auf `users`, `action`, `entity`, `entity_id`, `before`, `after`, `at`), Helfer `server/audit.ts`, `admin.ts` `listAudit`, Seite `src/app/admin/protokoll/page.tsx`. Es gibt kein Feld für die Begründung (sie steht, wenn überhaupt, in `after`).
- **Alarm-Empfänger:** `notifications.ts:48` `platformAdminIds` (alle nicht gesperrten `role = 'admin'`; Aufrufer `api/webhooks/stripe/route.ts:49` und `results.ts:409`), außerdem `scheduled.ts:224` (`notifyFinanceAlerts`, täglich an `admin` und `finance`) und `booking.ts:34` (`["admin","booking"]`, Buchungsanfragen). M4 (`docs/design/m4-plan.md`) fügt weitere Aufrufer hinzu.
- **Tests:** `tests/integration/helpers.ts` `makeUser(tag, role)` kennt `player|admin|finance|booking|moderator`; `admin-rollen.test.ts`, `audit.test.ts`, `admin-absage.test.ts` aus Vertrag 009 gibt es noch nicht; E2E `tests/e2e/admin.spec.ts` existiert.
- **Migrationen:** letzte auf main `drizzle/0041_perfect_whistler.sql`. `scripts/migrate.mjs` ruft den Drizzle-Migrator (`migrate()` aus `drizzle-orm/node-postgres/migrator`) auf; **er führt alle offenen Migrationen in EINER Transaktion aus**.

## 3. Zielbild
### 3.1 Rollenmodell
- **Admin 1 = `users.role = 'admin'` UND `users.is_owner = true`** (Entscheid v3, nach dem Versuch in Abschnitt 5). Kein neuer Enum-Wert: Ein Teilindex auf `role::text` ist in Postgres nicht erlaubt (die Umwandlung Enum → Text ist nicht IMMUTABLE), und `ADD VALUE` ist nicht rückgängig zu machen. Die Rolle `owner` des Vertrags 009 ist damit die Rolle `admin` mit gesetztem `is_owner`; für Oberfläche und Matrix heißt sie weiter „Admin 1“ / `owner`. **Vertragssatz (Vorbedingung für E1a, Vertragsänderung durch t9; der Vertrag verlangt an den Zeilen 9, 46, 62 und 76 wörtlich die Rolle `owner` und „nie zwei `owner`“):** „`owner` bezeichnet technisch ein Konto mit `role = 'admin'` und `users.is_owner = true`; es gibt höchstens eines. Admin 2 ist `role = 'admin'` mit `is_owner = false`. Wo ein Akzeptanzkriterium (z. B. AC-18) von der Rolle `admin` im Gegensatz zu `owner` spricht, ist Admin 2 gemeint.“ Der Satz kommt mit E1a in den Vertrag; ohne ihn widerspricht der Code dem Vertragswortlaut.
- **Folge:** Alle bisherigen Prüfungen `users.role = 'admin'` (siehe Inventar, Abschnitt 4) gelten für Admin 1 unverändert weiter. Admin 1 verliert mit altem Code keinen Zugang, und `inArray(users.role, ["admin", …])` (z. B. `booking.ts:34`, `scheduled.ts:224`) enthält Admin 1 automatisch. Das macht die Deploy-Reihenfolge ungefährlich (Abschnitt 6).
- Helfer in `src/lib/roles.ts`: `isPlatformAdmin(user)` (= Rolle `admin`) und `isOwner(user)` (= Rolle `admin` und `is_owner`). Stellen, die Admin-1-Rechte meinen (Finanzen, Einstellungen, Rollen, Absage mit Erstattung, Alarme), prüfen `isOwner` ausdrücklich bzw. über die Berechtigung `owner`.
- **Signaturänderung (E1b):** `can(role, permission)` und `GRANTS` kennen nur die Rolle und können Admin 1 nicht von Admin 2 unterscheiden. Deshalb gibt es `canUser(user, permission)` (Rolle plus `is_owner`: Admin 1 bekommt zusätzlich `finance` und `owner`); `requirePermission` nutzt `canUser`. `GRANTS.admin` verliert `finance`. Betroffen: `session.ts` (`requirePermission`), `admin/layout.tsx` (Navigation), Finanzexport (`finanzen/export/route.ts`), Belege (`api/belege/[id]/route.ts`), Hallenpreise (`admin/hallen/page.tsx`), `Header.tsx` (Admin-Link), Einstellungen (Seite und Aktion), Rollenvergabe (`admin-actions.ts`). **Admin 2 verliert Finanzen** (Vertrag 009, Rollen).
- `admin` ohne `is_owner` (Admin 2): `admin`, `moderation`, `booking`, `dashboard`; **nicht** `finance` und nicht `owner` (Vertrag 009). Das nimmt Admin 2 bisher vorhandene Rechte: Finanzen, Codes, Einstellungen, `setRole` werden Admin-1-only (AC-1, E1b).
- Genau ein Admin 1 (AC-2) **von der Datenbank** erzwungen: eindeutiger Teilindex auf `is_owner` und `CHECK (not is_owner or role = 'admin')`. `setRole` ist Admin-1-only; `is_owner` ist nicht über die Rollenauswahl vergebbar (nur der Betreiber-Schritt, Abschnitt 6).
- **Schutz von Admin 1 (E1b, Tests):** nicht sperrbar (der Sperrschutz `admin.ts:161` greift schon für `role = 'admin'`, Test, Mutation); `setRole` auf das eigene Konto abgelehnt (sonst Zustand ohne Admin 1); Konto-Löschung/Anonymisierung des Admin 1 abgelehnt, solange `is_owner` gesetzt ist (Hinweis: zuerst übergeben); Rolle `admin` kann Admin 1 nicht entziehen (nur der Betreiber-Schritt).
- **Teilrollen `moderator`, `finance`, `booking` entfallen mit M1 (Entscheid t9, Vertrag 009 Version 4).** Wann und wie, ist **offen** (Fragen P1/P3 an t9): die Migration M-1 ändert keine Rolle, und E1a/E1b lassen die Rollen im Code bestehen (die Rechte der Teilrollen gelten bis zur Entfernung wie heute). Die Entfernung ist eine eigene Etappe E1c (Abschnitt 9) nach der Antwort; sie ändert das Enum nicht (Werte lassen sich nicht entfernen, sie bleiben ungenutzt) und setzt die Konten um.

### 3.2 Berechtigungsmatrix (Soll, Rolle × Funktion)
„ja“ = erlaubt, „–“ = abgelehnt (Seite UND Server-Aktion). Spalte „heute“: nur Abweichungen zum Stand 872f1d6 sind markiert (Δ).
| Funktion | player | moderator (entfällt mit M1, P1/P3) | finance (entfällt mit M1, P1/P3) | booking (entfällt mit M1, P1/P3) | admin (Admin 2) | owner (Admin 1) |
|---|---|---|---|---|---|---|
| Admin-Übersicht / Navigation (`dashboard`) | – | ja | ja | ja | ja | ja |
| Spiele, Lobbys, Turniere, Nutzer/Support (inkl. Sperren), Teams, Ligen, Sponsoren (`admin`) | – | – | – | – | ja | ja |
| Moderation (`moderation`) | – | ja | – | – | ja | ja |
| Buchungen, Hallen (`booking`) | – | – | – | ja | ja | ja |
| Finanzen, Codes, Hallenpreise, Belege/Export (`finance`) | – | – | ja | – | – (Δ) | ja |
| Provisionen, Einstellungen, Kartenschalter | – | – | – | – | – (Δ) | ja |
| Rollen vergeben/entziehen | – | – | – | – | – (Δ) | ja |
| Nutzer sperren / entsperren (mit Begründung) | – | – | – | – | ja | ja |
| `owner` oder `admin` sperren | – | – | – | – | – | – (`owner` nie sperrbar) |
| Absage vorschlagen | – | – | – | – | ja | – (Admin 1 sagt direkt ab) |
| Absage entscheiden (bestätigen mit Erstattung / ablehnen) | – | – | – | – | – | ja |
| Spiel direkt absagen (`cancelMatch`, `adminCancelMatch`) | Captain wie bisher (nur vor der ersten Abbuchung) | – | – | – | – (Δ, Frage P4; Empfehlung: abgelehnt) | ja |
| Protokoll lesen | – | – | – | – | ja (Frage P7) | ja |
| Admin-Alarm erhalten | – | – | – | – | – (Δ) | ja |
Die drei Spalten der Teilrollen gelten bis zu ihrer Entfernung (E1c) wie heute; danach entfallen sie, und Konten mit diesen Rollen sind `admin` oder `player`. Die Matrix wird als Test umgesetzt (Rolle × Seite × Server-Aktion, Abschnitt 7) und ist die Grundlage der Umstellung in E1b.

### 3.3 Absagevorschlag und Absage (AC-9)
- Neue Tabelle `admin_cancel_proposals`: `id`, `match_id`, `proposed_by`, `reason` (3 bis 200 Zeichen), `status` (`open` | `approved` | `rejected` | `withdrawn` | `obsolete`), `decided_by`, `decided_at`, `decision_reason`, `created_at`. Datenbank erzwingt: höchstens ein offener Vorschlag je Spiel (Teilindex `where status = 'open'`), **`CHECK (decided_by IS NULL OR decided_by <> proposed_by)`** (Vorschlagender entscheidet nie selbst; Test: auch nicht, wenn er später Admin 1 wird).
- Server: `proposeCancel` (nur `admin` **ohne** `is_owner`; Admin 1 schlägt nicht vor, sondern sagt direkt per `adminCancelMatch` ab), `decideCancel` (nur `owner`), `withdrawProposal` (Vorschlagender oder `owner`). `approve` ruft den bestehenden Ablauf (`adminCancelMatch` → `requestMatchCancel`) auf. Der Vorschlag selbst löst **keine** Erstattung und keine Statusänderung am Spiel aus.
- **Sperrreihenfolge:** Spiel (`FOR UPDATE`) → Vorschlagszeile → `payment_refunds`/Abbuchungszeilen (die bestehende Reihenfolge Spiel zuerst bleibt). `approve` und das Anfordern der Absage laufen in **einer** Transaktion (`status = approved`, `cancel_requested_at` gesetzt); die Erstattungen laufen danach wie bisher über den Job/`progressCancel`, Wiederholung über `payment_refunds` (idempotent). `approve` auf einen schon `approved` Vorschlag ist ein No-op ohne Fehler und ohne zweite Absage.
- Hat sich das Spiel zwischenzeitlich geändert (abgesagt, gespielt, `cancel_requested_at` gesetzt, Anstoß vorbei), wird der Vorschlag `obsolete` (bei `approve` abgelehnt mit klarer Meldung; ein Job räumt offene Vorschläge zu beendeten Spielen auf). Wird dem Vorschlagenden die Rolle `admin` entzogen oder wird er gesperrt/gelöscht, werden seine offenen Vorschläge `withdrawn` (Frage P6).
- `adminCancelMatch` prüft künftig `owner` statt `admin`. Absage über `cancelMatch` (Spiel ohne Abbuchung): **Empfehlung (Entscheid Nutzer, Frage P4):** Vertrag wörtlich, Admin 2 darf nicht selbst absagen: `canManageMatch` lehnt die Rolle `admin` für die Absage ab; erlaubt bleiben `owner` und der Captain (Team-Admin) wie bisher. Eine Absage durch `owner` über `cancelMatch` läuft ebenfalls durch `recordIntervention` (Aktionsnamen `match.cancel` ergänzen).
- Benachrichtigung bei neuem Vorschlag: nur an `owner` (Typ `admin.task`, Link auf die Detailseite), Empfängerkreis wie AC-18.
- **Server ohne UI ist per POST erreichbar** (Server-Aktionen sind ohne Oberfläche aufrufbar): Security-Review der Aktionen schon in E3, nicht erst mit E4.

### 3.4 Eingriffsprotokoll (AC-8)
- **Struktur festgelegt:** `audit_log` bekommt in einer Migration ein eigenes Feld `reason text` (nullable für Altzeilen). `recordIntervention(actor, action, entity, id, { reason, before, after }, tx)` erzwingt die Begründung (3 bis 200 Zeichen, serverseitig; ohne Begründung wird nichts geändert) und schreibt `reason`. Aktionsnamen aus einer festen Liste (Beispiele, Namen beim Bau festlegen): `user.ban`, `user.unban`, `user.role`, `lobby.close`, `match.cancel`, `match.cancel_proposed`, `match.cancel_requested`, `match.cancel_rejected`, `venue.*`.
- Der Protokolleintrag steht **in derselben Transaktion** wie der Eingriff: scheitert der Eingriff, gibt es keinen Eintrag; (Test: Rollback → kein Protokolleintrag).
- Die Seite Protokoll bekommt den Filter „Eingriffe“ mit Spalte „Begründung“. Lesen: `owner` und `admin` (Default, Frage P7). Hinweis im Eingabefeld: „Keine Namen Dritter und keine persönlichen Angaben eintragen.“
- Das Protokoll wird über die Oberfläche nie geändert. Ob die Datenbank UPDATE/DELETE zusätzlich sperrt, gehört zu AC-7 (Beweisprotokoll, M3).
- `audit_log.actor_id` hat einen Fremdschlüssel auf `users`: Wie die Konto-Löschung (Anonymisierung) mit Eingriffszeilen umgeht, ist Frage R1.

### 3.5 Alarme (AC-18)
- Neue Funktion `ownerIds(exec)` (nicht gesperrte Nutzer mit `is_owner`). Alle Alarmpfade nutzen sie: `api/webhooks/stripe/route.ts:49`, `results.ts:409`, `booking.ts:34`/`scheduled.ts:224` je nach Entscheid (siehe unten) und alle neuen M4-Aufrufer. **E2 stellt sie um**; neue M4-Aufrufer müssen vorher `ownerIds`-fähig sein oder werden von E2 umgestellt. Ein grep-Test verbietet `platformAdminIds` in Alarmpfaden.
- **Finanz-Alarme (`scheduled.ts:224`, täglich an `admin` und `finance`):** bis Frage P8 beantwortet ist, gehen sie an Admin 1 UND `finance` (Admin 2 bekommt sie nicht mehr); der AC-18-Test nimmt diese Zeile bis dahin aus. `booking.ts:34` (Empfänger der Buchungsanfragen: `admin`, `booking`) ist kein Alarm im Sinne AC-18 und bleibt (zu bestätigen).
- **Übergang:** `ownerIds` liefert NUR den Admin 1. Der Betreiber-Schritt (Abschnitt 6) läuft vor dem Deploy von E2. Gibt es trotzdem keinen Admin 1, wird der Alarm **nicht still verworfen**: Eintrag im Server-Log (Alarmtyp, ohne personenbezogene Daten). Die Warnung „Es gibt keinen Admin 1“ in der Admin-Übersicht kommt **erst mit E4**; bis dahin gilt ausdrücklich nur das Server-Log. Kein Ersatzkreis.

### 3.6 Oberfläche (E4, nicht vor 013 M2 und 013 M7-Admin)
- Spiel-Detail im Admin (`/admin/spiele`): Block „Absage“: Admin 2 sieht „Absage vorschlagen“ (Pflichtfeld Begründung); Admin 1 sieht offene Vorschläge, „Absage bestätigen“ (mit Folgen: Anzahl der Abbuchungen und Summe, die erstattet werden) und „Ablehnen“ (Pflicht-Begründung). `ConfirmDialog` (kein natives `confirm()`), Text in einfachen Worten. Admin am Handy ist nach Vertrag 013 nur Übersicht, Moderation, Sperren, Protokoll lesen: die Absage ist **am Desktop** mit Hinweis am Handy.
- Übersicht: Zähler „offene Absagevorschläge“ und die Warnung „kein Admin 1“. Nutzer-Seite: Rollenauswahl nur für Admin 1, `owner` nicht auswählbar. Komponenten aus 013 M2 (`Button`, `ConfirmDialog`, `Form`/`Field`, `StatusBadge`, `StateMessage`, `PageShell`).

## 4. Inventar der Prüfstellen (Plattform-Rolle `users.role`; Team-Rolle ausgenommen)
Kategorien: **PA** = Plattform-Admin (`isPlatformAdmin`: `role = 'admin'`, also Admin 1 und Admin 2), **O** = nur Admin 1 (`isOwner`), **M** = Moderation (`role` `admin` oder `moderator`; Admin 1 trägt `admin` und ist damit enthalten), **Empf.** = Empfängerkreis, **Dev** = nur lokal.
| Stelle | Zweck | M1 |
|---|---|---|
| `src/server/session.ts:41` `requireAdmin` | Seitenschutz Plattform-Admin | PA |
| `src/server/session.ts:48` `requirePermission` → `can()` | Berechtigung je Bereich | Matrix 3.2 |
| `src/server/admin.ts:161` Sperrschutz | Plattform-Admins nicht sperrbar | beides `role = 'admin'` (Admin 1 und Admin 2): unverändert, getestet |
| `src/server/admin.ts:144` Rollenfilter | Filterliste der Rollen | Admin 1 über `is_owner` filtern bzw. ausweisen (kein Enum-Wert; `listUsers` liefert `is_owner`) |
| `src/server/admin.ts:167` `setRole` | Rolle vergeben | O |
| `src/server/payments/refund.ts:138` `adminCancelMatch` | Absage mit Erstattung | O |
| `src/server/lobby.ts:119` `platformAdmin` (Sicht) | Anzeige/Rechte in der Lobby | PA |
| `src/server/lobby.ts:202` `isPlatformAdmin` (Aufrufer `:216,:503,:576`) | Spiel verwalten, Zuweisung | PA; Absage: nicht `admin` (P4) |
| `src/server/results.ts:95,229-238` | Ergebnis entscheiden (Schiedsrichter) | PA |
| `src/server/tournaments.ts:59,124,711` | Turniere anlegen/verwalten/sehen | PA |
| `src/server/privategame.ts:106,115` | Einladungslink verwalten | PA |
| `src/server/stats.ts:158-160` | Statistik markieren | PA |
| `src/server/streams.ts:15` | Stream eintragen | PA |
| `src/server/media.ts:37,82` | Team-Logo hochladen / moderieren | PA; Moderation M |
| `src/server/content.ts:78-79` | Kommentar entfernen | M |
| `src/server/clips-actions.ts:28`, `lobby/[id]/uebersicht/page.tsx:146` | Clip löschen | PA |
| `src/server/profiles.ts:49,60`, `app/spieler/[id]/page.tsx:84` | Zuverlässigkeit/Spielplan sehen | PA |
| `src/app/app/turniere/neu/page.tsx:16` | Turnier anlegen (Seite) | PA |
| `src/server/notifications.ts:48-49` `platformAdminIds` | Alarm-Empfänger | Empf. → `ownerIds` |
| `src/server/scheduled.ts:224` | Finanz-Alarme (`notifyFinanceAlerts`, `admin` und `finance`) | Empf., Frage P8 |
| `src/server/booking.ts:34` | Empfänger der Buchungsanfragen (`bookingStaffIds`: `admin`, `booking`) | Empf., unverändert zu bestätigen |
| `src/app/admin/finanzen/export/route.ts:8`, `api/belege/[id]/route.ts:18`, `admin/hallen/page.tsx:57` | `can(…, "finance")` | Matrix (`canUser`: `finance` für Admin 1 und die Rolle `finance`) |
| `src/components/Header.tsx:64` | Link zum Admin-Bereich | `dashboard` |
| `src/auth.ts:39-41` | lokaler Dev-Login `admin@` | Dev: wird Admin 1 (setzt `is_owner`; Admin 2 für Tests per `makeUser`) |
Die übrigen Treffer der Suche betreffen die Team-Rolle (`teamMembers.role`/`team_role`: u. a. `challenges.ts`, `leagues.ts`, `matchmaking.ts`, `pro-events.ts`, `requests.ts`, `roster.ts`, `team-admin.ts`, `teams.ts`, `account.ts`, `privategame.ts:73-74`) und bleiben unverändert. **Das Inventar wird zu Beginn von E1b gegen den dann gültigen Code neu erzeugt** (grep), jede Zeile bekommt eine Kategorie; die Tabelle ist der Startpunkt, nicht die Endliste.
**grep-Test:** ein Unit-Test durchsucht `src/` und scheitert bei `role === "admin"` / `role !== "admin"` / `eq(users.role, "admin")` / `inArray(users.role` außerhalb von `src/lib/roles.ts` und einer Ausnahmeliste (Team-Rolle ist nicht betroffen, weil sie `teamMembers.role` heißt; die Ausnahmeliste enthält nur diese Dateien mit Begründung).

## 5. Migrationen (Nummern: jeweils die nächste freie, nie fest)
**Harte Startbedingung jeder Etappe:** Die Nummer wird gegen `origin/main` geprüft; M4a hat 0042 (PR #119), M4b-1 reserviert 0043; E1a nimmt die nächste freie (derzeit **0044**, mit t1d abgestimmt). Ziehen M4-Migrationen nach dem Start von E1a nach, wird die Folge **neu erzeugt** (`npm run db:generate` gegen den dann aktuellen main, Journal und Snapshots nicht von Hand mergen) und die Migrationsprüfung (Abschnitt 8, M1-B) wiederholt. Migrationen laufen nie parallel zu anderen Tasks mit Schema- oder Rollenannahmen.
- **Versuch (2026-11-12, lokale PostgreSQL, Wegwerf-Objekte):** `create unique index … where role::text = 'owner'` scheitert mit „Funktionen im Indexprädikat müssen als IMMUTABLE markiert sein“. Gehen: eine Spalte `is_owner boolean` mit Teilindex `where is_owner` und eine als IMMUTABLE deklarierte Hilfsfunktion im Prädikat. Entscheid: **`users.is_owner boolean not null default false`** (kein Enum-Wert, keine Hilfsfunktion, nativ in Drizzle ausdrückbar).
- **M-1 (E1a):** `ALTER TABLE users ADD COLUMN is_owner boolean DEFAULT false NOT NULL`; `CREATE UNIQUE INDEX users_one_owner ON users (is_owner) WHERE is_owner`; `ADD CONSTRAINT users_owner_is_admin CHECK (not is_owner or role = 'admin')`. **Kein** `UPDATE` in der Migration (niemand wird automatisch Admin 1); die Zuweisung ist der Betreiber-Schritt nach dem Commit. Kein Enum-Eingriff, deshalb entfällt das Problem „alle Migrationen in einer Transaktion“ (der Migrator nutzt eine); trotzdem wird es getestet.
- **M-2 (E2):** `audit_log.reason text`.
- **M-3 (E3):** Tabelle `admin_cancel_proposals` mit Teilindex (ein offener je Spiel) und `CHECK (decided_by IS NULL OR decided_by <> proposed_by)`.
- **Rollback:** Code zurück; Admin 1 abgeben (`is_owner = false`, Betreiber-SQL); Spalte, Index und CHECK bleiben ungenutzt stehen (Datenbankänderungen nur vorwärts, vorher sichern). Kein nicht umkehrbarer Enum-Wert.

## 6. Bootstrap des Admin 1 und Deploy-Reihenfolge
- Ohne Admin 1 ist M1 eine Sackgasse (`setRole` ist Admin-1-only, Alarme gehen ins Leere). Deshalb gibt es einen konkreten Weg: `scripts/set-owner.mjs <email> [--yes]` (Logik in `scripts/lib/set-owner.mjs`, umgesetzt in E1a; Ablauf in `docs/BETRIEB.md`). Eigenschaften: **idempotent**, **bricht ab**, wenn schon ein ANDERES Konto Admin 1 ist, das Konto fehlt oder gesperrt ist; setzt `role = 'admin'` und `is_owner` in einer Transaktion unter einer Sperre; Trockenlauf ohne `--yes` (zeigt nur Host, Port, Datenbankname); kein Lesen von Umgebungsdateien im Skript (die Verbindung kommt von `DATABASE_URL` des Aufrufers).
- **Protokolleintrag:** Das Skript schreibt `user.owner_set` mit **`actor_id` leer** (Systemeintrag außerhalb der App; `audit_log.actor_id` ist nullable, der Fremdschlüssel bleibt gültig) und der Begründung in `after.reason`, solange das Feld `audit_log.reason` nicht existiert (E2). Der Eintrag ist ein Betreiber-Schritt, keine App-Aktion.
- **Deploy-Reihenfolge (verbindlich; Stand: E1b ist gebaut und security-geprüft, noch nicht gemergt):** 1. Migration M-1 und Code E1a (Verhalten unverändert; Admin 1 trägt weiter `role = 'admin'`) → 2. Bootstrap (`set-owner`) → 3. Code E1b (Admin 2 verliert Finanzen, Einstellungen, Rollenvergabe; **nie vor dem Bootstrap**, sonst hat niemand diese Rechte) → 4. E2 (Alarme nur an Admin 1, `ownerIds`).
- Dev-Login `admin@` wird lokal Admin 1 (Dev-Skript setzt `is_owner`); Test-Helper `makeUser(tag, "owner")` legt `role admin` plus `is_owner` an. Höchstens ein Admin 1 je Datenbank: `cleanup()` löscht alle `@test.local`-Nutzer, danach ist der Platz wieder frei (Fixture-Regel).
- **Tests (nur gegen die Test-Datenbank; das Skript wird als Funktion mit dem Testpool aufgerufen, nie gegen eine andere Umgebung):** zweimal (idempotent), mit vorhandenem anderem Admin 1 (Abbruch, nichts geändert), unbekannte E-Mail, gesperrtes Konto, gleichzeitige Aufrufe für zwei Konten (genau eines), `makeUser owner`.

## 7. Dateiliste (Entwurf)
| Bereich | Dateien |
|---|---|
| Schema/Migration | `src/db/schema.ts` (Spalte `is_owner` mit Teilindex und CHECK, `audit_log.reason`, Tabelle `admin_cancel_proposals`), `drizzle/<nächste freie Nummer>_*.sql` (je Etappe), `drizzle/meta/*` |
| Rollen | `src/lib/roles.ts` (`Role`, `GRANTS`, `ROLE_LABEL`, `isPlatformAdmin`), `src/server/session.ts` (`requireAdmin`), die Stellen aus Abschnitt 4, `src/server/admin.ts`, `src/app/admin/layout.tsx`, `src/app/admin/nutzer/*`, `src/auth.ts` (Dev-Login) |
| Rollen-Helfer | `src/lib/roles.ts` (`isPlatformAdmin`, `isOwner`, `canUser`, Berechtigung `owner`, `GRANTS`), `src/server/session.ts` (`requirePermission` mit `canUser`) |
| Bootstrap | `scripts/set-owner.mjs` (neu), `docs/BETRIEB.md` (Ablauf, Rollback) |
| Absage | `src/server/payments/refund.ts`, neu `src/server/admin-cancel.ts` (`proposeCancel`, `decideCancel`, `withdrawProposal`), `src/server/admin-actions.ts`, `src/server/lobby.ts` (`canManageMatch`) |
| Protokoll | neu `src/server/intervention.ts` (`recordIntervention`), `src/server/audit.ts`, `src/server/admin.ts` (`listAudit`), `src/app/admin/protokoll/page.tsx` |
| Alarme | `src/server/notifications.ts` (`ownerIds`), Webhook-Route, `results.ts`, `scheduled.ts`, `booking.ts` |
| Oberfläche (E4) | `src/app/admin/spiele/*`, `src/app/admin/page.tsx`, neue Client-Komponenten |
| Tests | Abschnitt 8 |

## 8. Akzeptanzkriterien und Tests
| AC | Inhalt | Test |
|---|---|---|
| AC-1 | `admin` bekommt bei Finanzen, Provisionen, Einstellungen, Rollen, Buchhaltung (Seite und Server-Aktion) 403/Weiterleitung; `owner` darf. **Matrix-Test Rolle × Seite × Server-Aktion** nach 3.2 | `tests/integration/admin-rollen.test.ts` (neu) |
| AC-2 | Admin 1 ernennt/entfernt Admin 2 (protokolliert); Admin 2 versucht es: abgelehnt; zweiter Admin 1 wird von der Datenbank abgelehnt (Teilindex, CHECK); Admin 1 nicht sperrbar (auch nicht von `admin`); `setRole` auf das eigene Konto abgelehnt; Löschung/Anonymisierung von Admin 1 abgelehnt | `admin-rollen.test.ts` |
| AC-8 | Jeder Eingriff schreibt wer/wann/was/warum in `audit_log.reason`; leere/zu kurze/zu lange Begründung: abgelehnt, nichts geändert, kein Eintrag; Rollback des Eingriffs → kein Eintrag | `tests/integration/audit.test.ts` (neu) |
| AC-9 | Vorschlag gespeichert, keine Erstattung, Spiel unverändert; nur `owner` entscheidet; `approve` → Absage + Erstattung (FakeProvider); `reject` mit Begründung; Admin 2 kann nicht selbst absagen; Vorschlagender entscheidet nie selbst (CHECK); ein offener Vorschlag je Spiel; `approve` auf `approved` = No-op; Vorschlag zu inzwischen abgesagtem/gespieltem Spiel `obsolete`; Rolle entzogen → Vorschläge `withdrawn`; **Parallel-Test `approve` + Captain-`cancelMatch` + Job** → genau eine Absage, eine Erstattung je Platz | `tests/integration/admin-absage.test.ts` (neu) |
| AC-18 | Alarm (Zahlungsstreit, Doppelerfolg, Aufgabe) nur an Admin 1; nie an Admin 2; die täglichen Finanz-Alarme gehen bis P8 an Admin 1 und `finance` und sind aus diesem Test ausgenommen; **Fall kein `owner`**: kein Alarm an Dritte, Log-Eintrag, Warnung in der Übersicht; grep-Test: kein `platformAdminIds` in Alarmpfaden | `tests/integration/admin-alarm-empfaenger.test.ts` (neu) + Unit-grep-Test |
| M1-A | Regression: Stellen der Kategorie PA verhalten sich für Admin 1 und Admin 2 gleich (beide `role = 'admin'`); grep-Test verbietet `role === "admin"` außerhalb `roles.ts` | bestehende Integrations-/E2E-Tests grün, neuer grep-Test, `makeUser` kennt `owner` |
| M1-B | Migrationsprüfung **frische Datenbank (alle Migrationen in einem Lauf, wie CI/Worker-DB)** und **bestehende Datenbank mit Daten** (nur die letzte Migration danach): `node --env-file=.env.local scripts/migrate-check.mjs` (E1a, umgesetzt); danach `db:generate` = „No schema changes“; Bootstrap danach | `scripts/migrate-check.mjs`, im Task-Beleg, plus CI-Lauf |
| M1-C | Bootstrap zweimal, mit vorhandenem anderem `owner`, unbekannte E-Mail, gesperrtes Konto (Abschnitt 6) | `tests/integration/set-owner.test.ts` (neu) |
| E2E (E4) | Admin 2 schlägt Absage vor, Admin 1 bestätigt, Erstattung im Testmodus sichtbar, Eingriffe im Protokoll | `tests/e2e/admin.spec.ts` (erweitern), M4-AC-10 |

**Mutationen je Task (Pflicht, einzeln belegt):** Admin-1-Prüfung in `setRole`/`decideCancel`/`adminCancelMatch` entfernen → rot; Teilindex `users_one_owner` entfernen → rot; CHECK `users_owner_is_admin` entfernen → rot; Schutz von Admin 1 entfernen (`setRole` auf das eigene Konto, Löschung/Anonymisierung, Sperre) → rot; Teilindex „ein offener Vorschlag je Spiel“ entfernen → rot; `CHECK decided_by <> proposed_by` entfernen → rot; Pflicht-Begründung in `recordIntervention` entfernen → rot; Sperrschutz entfernen (`admin.ts:161`) → rot; `ownerIds` durch `platformAdminIds` ersetzen → rot; `approve`-Idempotenz entfernen (zweiter Aufruf bucht doppelt) → rot; Eintrag außerhalb der Transaktion → rot (Rollback-Test).

## 9. Etappenschnitt (seriell, Schema nie parallel)
| Etappe | Inhalt | Migration | Voraussetzung |
|---|---|---|---|
| E1a Grundlage (Code vorbereitet auf `feat/009-m1-e1a`, ohne drizzle-Datei) | `users.is_owner` mit Teilindex und CHECK, `isPlatformAdmin`/`isOwner`, **Vertragssatz in Vertrag 009 (Vorbedingung)**, `scripts/set-owner.mjs`, `makeUser owner`, Dev-Login, BETRIEB (Ablauf, Rollback), Migrationsprüfung frisch + bestehend | M-1 (nächste freie Nummer, derzeit 0044) | M4-Migrationen gemergt, freie Nummer |
| E1b Umstellung | Stellen aus Abschnitt 4 auf `isPlatformAdmin`/`isOwner`, Berechtigungsmatrix 3.2, grep-Test, Schutz von Admin 1 (Sperren, eigene Rolle, Löschung), Matrix-Test | keine | E1a gemergt und ausgerollt, **Bootstrap gelaufen** (Abschnitt 6) |
| E1c Teilrollen entfernen (**Vorschlag, erst nach der Antwort auf P1/P3**) | Konten mit `moderator`/`finance`/`booking` auf `admin` oder `player` setzen (Weg und Zeitpunkt laut Antwort: Betreiber-Zuordnung oder Migration), Oberfläche und `GRANTS` bereinigen, Matrix-Test anpassen; das Enum behält die Werte | je nach Antwort (nächste freie Nummer) | E1b, Antwort t9 |
| E2 Protokoll und Alarme (nach dem Bootstrap) | `audit_log.reason`, `recordIntervention`, Umstellung bestehender Eingriffe (`setBanned`, `setRole`, Lobby schließen, Halle, `cancelMatch`), Protokoll-Filter, `ownerIds` und alle Alarmpfade, Warnung „kein Admin 1“ (Daten dafür), grep-Test | M-2 | E1b |
| E3 Absagevorschlag (Server) | Tabelle, `proposeCancel`/`decideCancel`/`withdrawProposal`, `adminCancelMatch` → `owner`, Benachrichtigung an `owner`, Aufräum-Job, Server-Tests inkl. Parallel-Test; **Security-Review der Aktionen** (per POST erreichbar) | M-3 | E1b, E2 |
| E4 Oberfläche | Absage-Block, Übersicht-Zähler und Warnung, Rollenauswahl, E2E | keine | E3 und **013 M2 und 013 M7-Admin-UI** |
Go-live-MUSS G20-012 (Admin-Absage mit Oberfläche) **bleibt offen bis E4**. Beleg je Task einzeln (Befehl + Ergebnis), Reviewer ≠ Writer, Security-Review Pflicht (Auth, Rollen, Zahlungen) für jede Etappe.

## 10. Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test`; `npm run test:integration` (mit leerem `STRIPE_SECRET_KEY`); `npm run db:generate` (danach „No schema changes“); `npm run db:migrate` auf frischer UND bestehender Datenbank; `node scripts/set-owner.mjs <email>` zweimal (lokal); `npx playwright test tests/e2e/admin.spec.ts` (E4); `npm run build`. Oberfläche (E4) zusätzlich Impeccable-Durchgänge nach 013 AC-15.

## 11. Datenschutz, Risiken, Fragen
### 11.1 Datenschutz und Sicherheit
- Das Eingriffsprotokoll enthält Freitext-Begründungen, die personenbezogene Daten Dritter enthalten können. Sichtbar nur für `owner` und `admin`, nie für Captain, Spieler oder Gäste; nicht im Export anderer Nutzer; nicht in Logs oder Benachrichtigungstexten (Benachrichtigungen enthalten nur Typ und Link). Eingabehinweis „keine Namen Dritter“. Aufbewahrung, Auskunft, Löschung, `actor_id`-Fremdschlüssel bei Konto-Löschung: Rechtsfrage R1.
- Interne Begründung des Eingriffs und der **Absagegrund** (`matches.cancel_reason`, für Teilnehmer sichtbar, G21-012) sind verschieden; ob getrennte Felder nötig sind, ist Frage P5.
- Rechte werden nur serverseitig geprüft (Seite UND Server-Aktion); keine Rolle kommt aus dem Client. Der Bootstrap-Schritt läuft nur durch den Betreiber (Datenbankzugriff), nie über die App. Dev-Login `admin@` bleibt außerhalb der Produktion.
- Alarmtexte ohne Karten- und Zahlungsdaten; die Absage-Erstattung nutzt den bestehenden geprüften Ablauf.

### 11.2 Risiken
1. **Teilindex und Migrator:** Der Teilindex auf `role::text` ist in Postgres nicht erlaubt (Versuch, Abschnitt 5); `is_owner` vermeidet den Enum-Eingriff. Pflicht bleibt der Test mit allen Migrationen in einem Lauf (`migrate-check`). Ziehen M4-Migrationen nach, wird die Folge neu erzeugt, nicht von Hand gemergt.
2. **Rechte gehen verloren oder zu weit:** `admin` verliert Finanzen/Einstellungen/Rollen (gewollt); Fehler bei der Umstellung sperren Funktionen (Regressionstests) oder öffnen sie (Security-Review, Mutationen, Matrix-Test).
3. **Kein Admin 1:** Bootstrap-Reihenfolge (Abschnitt 6), Server-Log statt Ersatzkreis, Warnung in der Übersicht erst mit E4; Admin 1 kann sich selbst nicht entziehen oder löschen (Schutz E1b); Vertretung bei Ausfall: Frage P2.
4. **Schema-Kollision:** Migrationsnummern; M4 zuerst; jede Etappe prüft die freie Nummer.
5. **Oberfläche zu früh:** E4 wartet auf 013 M2/M7; Go-live wartet auf E4.
6. **Absage-Rennen:** Sperrreihenfolge Spiel → Vorschlag → Erstattungszeilen, Idempotenz, Parallel-Test.
7. **Server ohne UI:** Aktionen aus E3 sind per POST erreichbar; Security-Review vor dem Merge von E3.
8. **Vertrag und Realität weichen ab:** Vertrag 009 nennt Dateien/Tests, die es noch nicht gibt; sie entstehen in M1.
9. **Test-Fixtures:** Ein einziger `owner` je Datenbank kollidiert mit parallelen oder nicht aufgeräumten Tests.

### 11.3 Fragen (nicht entschieden; Produkt: Nutzer/t9, Recht: Anwalt, kein Agent beantwortet sie)
**Produkt**
- **P1 (an t9):** Die Teilrollen `moderator`, `finance`, `booking` entfallen mit M1 (entschieden). **Wann** (eigene Etappe E1c vor dem Go-live, oder zusammen mit E1b) und **wie** (Migration oder Zuordnung durch den Betreiber)? Das Enum behält die Werte (kein `DROP VALUE`); sie werden unbenutzt.
- **P2:** Welches Konto ist in der Produktion Admin 1 (`owner`), und gibt es einen Vertretungsweg, wenn Admin 1 ausfällt oder das Konto verloren geht (erneuter Bootstrap durch den Betreiber)?
- **P3 (an t9):** Auf welche Rolle wird jedes Konto der drei Teilrollen gesetzt (`admin` oder `player`; Vertrag 009 nennt beides „nach Absprache mit Admin 1“) und wer trifft die Zuordnung je Konto (Admin 1 anhand eines Prüfberichts, oder eine feste Regel)?
- **P4 (Entscheid Nutzer):** Gilt „Admin 2 kann nicht selbst absagen“ auch für Spiele OHNE Abbuchung? Empfehlung des Plans: ja, wörtlich nach Vertrag (nur `owner` und Captain wie bisher).
- **P5:** Ist die Begründung des Admin-Eingriffs zugleich der Absagegrund für die Teilnehmer (`matches.cancel_reason`), oder gibt es zwei Felder?
- **P6:** Läuft ein offener Absagevorschlag ab? Darf Admin 2 ihn zurückziehen? Was geschieht mit offenen Vorschlägen, wenn Admin 2 die Rolle verliert oder gesperrt wird (Plan: `withdrawn`)?
- **P7:** Darf Admin 2 das Protokoll vollständig lesen (Default des Plans: `owner` und `admin` lesen), auch die Rollen- und Absageentscheide von Admin 1?
- **P8 (Default bis zur Antwort: Finanz-Alarme an Admin 1 und `finance`):** Sollen die täglichen Finanz-Alarme (`scheduled.ts:224`, heute an `admin` und `finance`) ein Admin-Alarm im Sinne AC-18 sein (nur `owner`), oder bleibt sie bei den Mitarbeitern?

**Recht**
- **R1:** Aufbewahrungsdauer, Auskunft (Art. 15) und Löschung/Anonymisierung der Freitext-Begründungen im Eingriffsprotokoll (zusammen mit G21-012 Absagegrund); Umgang mit `audit_log.actor_id` bei Konto-Löschung (Fremdschlüssel auf `users`).
- **R2:** Darf bei einer Absage durch den Betreiber die Begründung gegenüber den Teilnehmern Dritte (z. B. gesperrte Spieler) nennen? Die Antwort bestimmt, ob nur ein Standardtext erlaubt ist.
