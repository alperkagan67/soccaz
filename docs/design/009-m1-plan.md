# 009 M1-Plan: Rollen, Absagevorschlag, Eingriffsprotokoll, Admin-Alarm
Stand: 2026-11-12 · Code-Stand `origin/main` 872f1d6 · Verfasser: worker-2 (Plan, Doku, kein Code) · Status: Entwurf, Review durch einen anderen Worker offen

Zweck: Plan für den Meilenstein M1 des Vertrags `docs/contracts/009-admin-einnahmen-buchhaltung.md` (Version 3): Rollen `owner`/`admin`, Rechteprüfung, Eingriffsprotokoll mit Pflicht-Begründung, Absagevorschlag (Admin 2) mit Absage und Erstattung nur durch Admin 1, Admin-Alarm nur an Admin 1 (AC-18), Oberfläche für die Admin-Absage. Der Plan ändert weder Code noch Vertrag und **beantwortet keine Produkt- oder Rechtsfrage**: Sie stehen in Abschnitt 10 als FRAGE. Annahmen sind als solche markiert.

Quellen: Vertrag 009 (Rollen, AC-1, 2, 8, 9, 18, Meilenstein M1, Entscheide t9 2026-11-12), `docs/loop/GO-LIVE-AUDIT.md` (G20-012 Admin-Absage mit Oberfläche = Go-live-MUSS, G21-012 Absagegrund), `docs/loop/FEHLT-NOCH.md` (Alarm-Empfänger ENTSCHIEDEN), `docs/design/m4-plan.md` (Admin-Alarm Admin 1, `admin.task`), `docs/design/m3-plan.md`, Vertrag 013 (Admin am Handy: nur Übersicht, Moderation, Sperren, Protokoll lesen).

## 1. Entscheide, die gelten (nicht neu verhandeln)
- Admin 1 = Rolle `owner`, genau einer. Admin 2 = Rolle `admin` (Mitarbeiter). Admin 2 hat keine Buchhaltung, Provisionen, Einstellungen, Rollenverwaltung (Vertrag 009, Rollen).
- Absage mit Erstattung nur durch Admin 1. Admin 2 schlägt vor, mit Begründung; keine Erstattung durch den Vorschlag (AC-9).
- Admin-Absage ohne Oberfläche reicht vor dem Go-live nicht (Go-live-MUSS G20-012). Die Oberfläche wird nicht vor der Grundlage 013 M2 und der Admin-Oberfläche 013 M7 gebaut. Der E2E zu M4-AC-10 bleibt bis dahin `fixme`; der Server-Test deckt die Funktion.
- Admin-Alarm: bis zu dieser M1 (die Rolle `owner` gibt es noch nicht) an alle nicht gesperrten Nutzer mit Rolle `admin` (derzeit identisch mit Admin 1), danach NUR an `owner` (AC-18, Test `tests/integration/admin-alarm-empfaenger.test.ts`).
- Eingriffe (Sperren, Lobby schließen, Absage, Halle) werden mit wer/wann/was/warum protokolliert, Begründung Pflicht (AC-8).

## 2. Bestand (Code 872f1d6)
- **Rollen:** Enum `user_role` = `player`, `admin`, `moderator`, `finance`, `booking` (`src/db/schema.ts:21`), kein `owner`. `src/lib/roles.ts`: `GRANTS` gibt `admin` ALLE Berechtigungen (`admin`, `moderation`, `finance`, `booking`, `dashboard`); `can(role, permission)`. Heute ist jeder Plattform-Admin faktisch Admin 1.
- **Prüfstellen:** 53 Zeilen in 29 Dateien prüfen `role === "admin"` bzw. `eq(users.role, "admin")` (u. a. `session.ts` `requireAdmin`, `lobby.ts:201` `isPlatformAdmin` mit 4 Aufrufern, `admin.ts`, `results.ts`, `tournaments.ts`, `teams.ts`, `auth.ts`). 12 Aufrufe `requirePermission("admin"|"finance")` unter `src/app`.
- **Admin-Bereich:** `src/app/admin/layout.tsx` (Navigation nach Berechtigung: Übersicht, Spiele, Nutzer, Teams, Ligen, Profi-Tag, Sponsoren, Moderation, Finanzen, Buchungen, Hallen, Codes, Protokoll, Einstellungen). `Einstellungen` hängt an `admin`, `Finanzen`/`Codes` an `finance`.
- **Rollen ändern und sperren:** `admin.ts` `setRole` (Audit `user.role`, ohne Begründung), `setBanned(actorId, userId, banned, reason)` (Plattform-Admins sind nicht sperrbar, `:161`), UI `src/app/admin/nutzer/UserActions.tsx` (Rollenauswahl).
- **Absage mit Erstattung (012 M3a):** `payments/refund.ts` `adminCancelMatch(actorId, matchId, reason)` (Grund 3 bis 200 Zeichen; prüft `actor.role === "admin"`) und `requestMatchCancel`; Server-Aktion `actions.ts:209` `adminCancelMatchAction`. **Es gibt keinen Aufrufer in der Oberfläche.** Absage durch Captain/Plattform-Admin ohne Abbuchung: `lobby.ts` `cancelMatch` → `canManageMatch` (Plattform-Admin erlaubt) → `cancelMatchTx`; nach der ersten Abbuchung lehnt `cancelMatchTx` ab.
- **Protokoll:** Tabelle `audit_log` (`actor_id`, `action`, `entity`, `entity_id`, `before`, `after`, `at`), Helfer `server/audit.ts`, Liste `admin.ts` `listAudit`, Seite `src/app/admin/protokoll/page.tsx`. Eine Begründung ist kein eigenes Feld (sie steht, wenn überhaupt, in `after`); eine Pflicht gibt es nur je Funktion (`setBanned`, `adminCancelMatch`).
- **Alarm-Empfänger:** `notifications.ts:48` `platformAdminIds` = alle nicht gesperrten `role = 'admin'`; Aufrufer `api/webhooks/stripe/route.ts:49` und `results.ts:409`. M4 (`docs/design/m4-plan.md`) benachrichtigt Admin 1 über `admin.task`.
- **Tests:** `tests/integration/helpers.ts` `makeUser(tag, role)` kennt `player|admin|finance|booking|moderator`; die in 009 genannten Dateien `admin-rollen.test.ts`, `audit.test.ts`, `admin-absage.test.ts` gibt es noch nicht; E2E `tests/e2e/admin.spec.ts` existiert.
- **Migrationen:** letzte auf main `drizzle/0041_perfect_whistler.sql`; die Nummern 0042 und 0043 sind durch M4 belegt. M1 nimmt **0044 aufwärts, seriell**, die Nummer vor dem Start gegen main prüfen (Regel: Migrationen laufen nie parallel zu Tasks mit Schema-Annahmen).

## 3. Zielbild
### 3.1 Rollenmodell
- Neue Rolle `owner` mit allen Berechtigungen plus der neuen Berechtigung `owner` (Rollenverwaltung, Einstellungen, Finanzen/Codes/Provisionen, Absage-Entscheid, Protokoll-Eingriffe lesen).
- `admin` (Admin 2): `admin`, `moderation`, `booking`, `dashboard`; **nicht** `finance` und nicht `owner` (Vertrag 009, Rollen). Das ändert heute bestehende Rechte: `Finanzen`, `Codes`, `Einstellungen` und `setRole` werden `owner`-only (AC-1).
- Eine Hilfsfunktion `isPlatformAdmin(role)` (= `owner` oder `admin`) ersetzt die 53 Stellen `role === "admin"`; die Bedeutung dort ist durchgehend „Plattform-Admin“, nicht „Admin 1“. Stellen, die Admin-1-Rechte meinen (Finanzen, Einstellungen, Rollen, Absage mit Erstattung, Alarme), prüfen `owner` ausdrücklich.
- `owner` ist genau einer (AC-2): durch die Datenbank erzwungen (Teilindex `unique ... where role = 'owner'`), nicht nur im Code. `setRole` ist `owner`-only; niemand setzt `owner` per Oberfläche außer Admin 1 selbst (Übergabe siehe Frage P2). Der `owner` ist nicht sperrbar (wie heute die Plattform-Admins).
- Rollen `moderator`, `finance`, `booking`: Annahme des Vertrags 009 (Rollenmigration): werden zu `admin` bzw. `player` **nach Absprache mit Admin 1**; kein Nutzer behält stillschweigend mehr Rechte. Technisch: Migration ändert sie NICHT automatisch; ein Prüfbericht (Abschnitt 5, E1) listet die betroffenen Konten, Admin 1 entscheidet (Frage P3).

### 3.2 Absagevorschlag und Absage (AC-9)
- Neue Tabelle `admin_cancel_proposals` (Entwurf): `id`, `match_id`, `proposed_by`, `reason` (3 bis 200 Zeichen), `status` (`open` | `approved` | `rejected` | `withdrawn`), `decided_by`, `decided_at`, `decision_reason`, `created_at`; höchstens ein offener Vorschlag je Spiel (Teilindex). Der Vorschlag löst **keine** Erstattung und keine Statusänderung am Spiel aus.
- Server: `proposeCancel` (nur `admin` oder `owner`), `decideCancel` (nur `owner`): `approve` ruft `adminCancelMatch` auf (bestehender Ablauf mit Erstattung, `requestMatchCancel`), `reject` mit Pflicht-Begründung. Beide schreiben in das Eingriffsprotokoll. Der Vorschlagende kann nicht selbst entscheiden (auch nicht, wenn er später `owner` würde).
- `adminCancelMatch` prüft künftig `owner` statt `admin`. Die Absage durch Plattform-Admin über `cancelMatch` (Spiel ohne Abbuchung) bleibt zu klären (Frage P4: AC-9 sagt „Admin 2 kann nicht selbst absagen“).
- Benachrichtigung bei neuem Vorschlag: nur an `owner` (Typ `admin.task`, Link auf die Detailseite), nach demselben Empfängerkreis wie AC-18.

### 3.3 Eingriffsprotokoll (AC-8)
- Ein zentraler Helfer `recordIntervention(actor, action, entity, id, { reason, before, after }, tx)`: erzwingt die Begründung (3 bis 200 Zeichen, serverseitig), schreibt in `audit_log` mit `after.reason`, Aktionsname aus einer festen Liste (Beispiele, Namen beim Bau festlegen: `user.ban`, `user.unban`, `lobby.close`, `match.cancel_proposed`, `match.cancel_requested`, `match.cancel_rejected`, `venue.*`, `user.role`). Bestehende Eingriffe (`setBanned`, `setRole`, Hallen, Lobby schließen) werden darauf umgestellt.
- Die Seite Protokoll bekommt einen Filter „Eingriffe“ mit Spalte „Begründung“. Lesen: `admin` und `owner` (Vertrag 013: Protokoll lesen am Handy). Das Protokoll wird nie über die Oberfläche geändert; ob die Datenbank UPDATE/DELETE zusätzlich sperrt, ist AC-7/M3 (Beweisprotokoll) und hier nicht Teil (Frage R1 zur Aufbewahrung).

### 3.4 Alarme (AC-18)
- Neue Funktion `ownerIds(exec)` (nicht gesperrte Nutzer mit Rolle `owner`). `platformAdminIds` bleibt für Nachrichten an ALLE Plattform-Admins (falls es sie braucht: heute keine; die zwei Aufrufer sind Alarme) und wird für Alarme durch `ownerIds` ersetzt: `api/webhooks/stripe/route.ts:49`, `results.ts:409` und die neuen Aufrufer aus M4.
- Übergang: Solange die Migration nicht gelaufen ist, gilt der heutige Kreis (alle `admin`). Nach der Migration: nur `owner`. Gibt es nach der Migration KEINEN `owner`, geht der Alarm ins Leere: Schutz durch Warnung in der Admin-Übersicht und einen Start-Check (Vorschlag, Frage P2).

### 3.5 Oberfläche (nicht vor 013 M2 und 013 M7-Admin)
- Spiel-Detail im Admin (`/admin/spiele`): Block „Absage“: Admin 2 sieht „Absage vorschlagen“ (Pflichtfeld Begründung); Admin 1 sieht offene Vorschläge, „Absage bestätigen“ (mit Folgen: Anzahl der Abbuchungen und Summe, die erstattet werden, aus den Daten des Spiels) und „Ablehnen“ (Pflicht-Begründung). `ConfirmDialog` (kein natives `confirm()`), Text in einfachen Worten, Handy: Admin am Handy ist nach Vertrag 013 nur Übersicht, Moderation, Sperren und Protokoll lesen; die Absage ist **am Desktop** mit Hinweis am Handy.
- Übersicht: Zähler „offene Absagevorschläge“ für Admin 1. Nutzer-Seite: Rollenauswahl nur für Admin 1, `owner` nicht auswählbar.
- Komponenten aus 013 M2 (`Button`, `ConfirmDialog`, `Form`/`Field`, `StatusBadge`, `StateMessage`, `PageShell`). Die Oberfläche folgt dem Aufbau der Admin-Seiten aus 013 M7; bis dahin gibt es nur Server und Tests.

## 4. Dateiliste (Entwurf)
| Bereich | Dateien |
|---|---|
| Schema/Migration | `src/db/schema.ts` (Enum `owner`, Tabelle `admin_cancel_proposals`), `drizzle/0044_*.sql` (Rolle `owner`, Teilindex), `drizzle/0045_*.sql` (Vorschläge), `drizzle/meta/*` |
| Rollen | `src/lib/roles.ts` (`Role`, `GRANTS`, `ROLE_LABEL`, `isPlatformAdmin`), `src/server/session.ts` (`requireAdmin`, `requireOwner`), die 29 Dateien mit `role === "admin"` (mechanisch auf `isPlatformAdmin`), `src/server/admin.ts` (`setRole`, `setBanned`), `src/app/admin/layout.tsx` (Berechtigung je Eintrag), `src/app/admin/nutzer/*`, `src/auth.ts` (lokaler Dev-Login `admin@` wird `owner`) |
| Absage | `src/server/payments/refund.ts` (`adminCancelMatch` → `owner`), neu `src/server/admin-cancel.ts` (`proposeCancel`, `decideCancel`), `src/server/admin-actions.ts` (Aktionen), `src/server/lobby.ts` (`canManageMatch`/`isPlatformAdmin`, siehe Frage P4) |
| Protokoll | `src/server/audit.ts` oder neu `src/server/intervention.ts` (`recordIntervention`), `src/server/admin.ts` (`listAudit` Filter), `src/app/admin/protokoll/page.tsx` |
| Alarme | `src/server/notifications.ts` (`ownerIds`), `src/app/api/webhooks/stripe/route.ts`, `src/server/results.ts` |
| Oberfläche (Etappe E4) | `src/app/admin/spiele/*` (Absage-Block), `src/app/admin/page.tsx` (Zähler), neue Client-Komponenten |
| Doku | `docs/BETRIEB.md` (Admin 1 festlegen/übergeben), `docs/loop/GO-LIVE-AUDIT.md` (G20-012 Stand), Vertrag 009 (AC-Tabelle bei Abweichung) |
| Tests | siehe Abschnitt 6 |

## 5. Etappenschnitt (seriell, Schema nie parallel)
| Etappe | Inhalt | Migration | Voraussetzung |
|---|---|---|---|
| E1 Rollenmodell | Enum `owner`, Teilindex (genau einer), `GRANTS`, `isPlatformAdmin`, Umstellung der 53 Stellen, `requireOwner`, `setRole`/Layout nach Berechtigung, Prüfbericht für `moderator`/`finance`/`booking`, Admin-1-Festlegung (Frage P2) | 0044 | M4-Migrationen 0042/0043 gemergt (Nummern), Security-Review |
| E2 Eingriffsprotokoll und Alarme | `recordIntervention`, Umstellung bestehender Eingriffe, Protokoll-Filter, `ownerIds`, Alarme (AC-18) | keine | E1 |
| E3 Absagevorschlag (Server) | Tabelle, `proposeCancel`/`decideCancel`, `adminCancelMatch` → `owner`, Benachrichtigung an `owner`, Server-Tests (AC-9) | 0045 | E1, E2 |
| E4 Oberfläche | Absage-Block, Übersicht-Zähler, Rollenauswahl, E2E (M4-AC-10 von `fixme` auf aktiv) | keine | E3 und **013 M2 und 013 M7-Admin-UI** |
E1 bis E3 können vor der Oberfläche gebaut werden; Go-live braucht E4 (G20-012). Die Migration 0044 ändert Rechte: sie läuft nie parallel zu anderen Tasks mit Rollenannahmen.

## 6. Akzeptanzkriterien und Tests
| AC | Inhalt | Test |
|---|---|---|
| AC-1 | `admin` (Admin 2) bekommt bei Finanzen, Provisionen, Einstellungen, Rollen, Buchhaltung (Seite und Server-Aktion) 403 bzw. Weiterleitung; `owner` darf | `tests/integration/admin-rollen.test.ts` (neu) |
| AC-2 | Admin 1 ernennt/entfernt Admin 2 (protokolliert); Admin 2 versucht es: abgelehnt; es gibt nie zwei `owner` (Datenbank lehnt den zweiten ab); `owner` nicht sperrbar | `admin-rollen.test.ts` |
| AC-8 | Jeder Eingriff (Sperren, Lobby schließen, Absage, Halle, Rolle) schreibt wer/wann/was/warum; ohne Begründung (leer, 2 Zeichen, 201 Zeichen) abgelehnt, nichts geändert | `tests/integration/audit.test.ts` (neu) |
| AC-9 | Admin 2 schlägt vor: gespeichert mit Begründung, keine Erstattung, Spiel unverändert; nur `owner` entscheidet; Bestätigen → Absage + Erstattung (FakeProvider); Ablehnen mit Begründung; Admin 2 kann nicht selbst absagen; Vorschlagender entscheidet nie selbst; ein offener Vorschlag je Spiel; parallele Entscheidungen (Rennen) enden in genau einem Ergebnis | `tests/integration/admin-absage.test.ts` (neu) |
| AC-18 | Alarm (Zahlungsstreit, Doppelerfolg, Aufgabe) geht nur an `owner`, nie an Admin 2 und nicht an andere `admin`; vor der Migration an alle `admin` (Übergang dokumentiert) | `tests/integration/admin-alarm-empfaenger.test.ts` (neu) |
| M1-A | Alle bisherigen Aufrufe mit `role === "admin"` verhalten sich für `admin` und `owner` gleich, wo „Plattform-Admin“ gemeint ist (Regression) | bestehende Integrations- und E2E-Tests grün; `makeUser` kennt `owner` |
| M1-B | Migration 0044/0045 auf frischer und auf bestehender Datenbank (`npm run db:migrate`), Enum-Wert in derselben Migrationsfolge nutzbar | Migrationstest im Task-Beleg (siehe Risiko 1) |
| E2E (E4) | Admin 2 schlägt Absage vor, Admin 1 bestätigt, Erstattung im Testmodus sichtbar, Eingriffe im Protokoll | `tests/e2e/admin.spec.ts` (erweitern), M4-AC-10 |
Mutationen je Task (Pflicht): Berechtigungsprüfung `owner` entfernen → rot; Teilindex entfernen → rot; Pflicht-Begründung entfernen → rot; `ownerIds` durch `platformAdminIds` ersetzen → rot.

## 7. Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test`; `npm run test:integration` (mit leerem `STRIPE_SECRET_KEY`, Aufräumen prüfen); `npm run db:generate` (danach „No schema changes“); `npm run db:migrate` auf frischer Datenbank; `npx playwright test tests/e2e/admin.spec.ts` (E4); `npm run build`. Security-Review (Auth, Rollen, Zahlungen) ist Pflicht für jede Etappe; die Oberfläche (E4) zusätzlich Impeccable-Durchgänge nach 013 AC-15.

## 8. Datenschutz und Sicherheit
- Das Eingriffsprotokoll enthält Freitext-Begründungen, die personenbezogene Daten Dritter enthalten können (z. B. Name eines gesperrten Spielers). Sichtbar nur für `admin` und `owner`, nie für Captain, Spieler oder Gäste; nicht im Export anderer Nutzer; nicht in Logs/Benachrichtigungstexten (Benachrichtigungen enthalten nur Typ und Link). Aufbewahrung, Auskunft, Löschung: Rechtsfrage R1.
- Interne Begründung des Eingriffs und der **Absagegrund** (`matches.cancel_reason`, für Teilnehmer sichtbar, G21-012) sind verschieden: Die interne Begründung bleibt im Protokoll; der Text für die Teilnehmer wird getrennt eingegeben (Frage P5).
- Rechte werden nur serverseitig geprüft (Seite UND Server-Aktion); keine Rolle kommt aus dem Client. `owner` ist nicht sperrbar und nicht per Oberfläche vergebbar außer durch Übergabe (Frage P2). Dev-Login `admin@` bleibt außerhalb der Produktion.
- Alarmtexte ohne Karten- und Zahlungsdaten; die Absage-Erstattung nutzt den bestehenden geprüften Ablauf (`requestMatchCancel`, idempotent).

## 9. Risiken
1. **Enum-Wert und Migration:** `ALTER TYPE ... ADD VALUE 'owner'` kann in derselben Transaktion nicht verwendet werden, in der er angelegt wird; `scripts/migrate.mjs` führt die offenen Migrationen mit dem Drizzle-Migrator aus. Ein Teilindex auf `role = 'owner'` in derselben Folge könnte scheitern. Vor dem Bau auf frischer und bestehender Datenbank prüfen; Alternativen (Spalte statt Enum-Wert, getrennte Läufe) sind eine Entscheidung des Task Managers mit dem Vertrag (009 nennt die Rolle `owner`).
2. **Rechte gehen verloren oder zu weit:** `admin` verliert Finanzen/Einstellungen/Rollen (gewollt, AC-1); ein Fehler bei der Umstellung der 53 Stellen kann Admin-Funktionen sperren (Regressionstests) oder öffnen (Security-Review, Mutationen).
3. **Kein `owner` nach der Migration:** Alarme gehen ins Leere, niemand kann Vorschläge entscheiden. Schutz: Start-Check und Warnung (Frage P2), Reihenfolge Migration → Festlegen → Alarme umstellen.
4. **Schema-Kollision:** Migrationsnummern 0042/0043 gehören M4; M1 darf erst nach deren Merge nummerieren (seriell).
5. **Oberfläche zu früh:** E4 vor 013 M2/M7 erzeugt Doppelarbeit; der Plan hält E4 bis dahin zurück, Go-live wartet auf E4 (G20-012).
6. **Absage-Rennen:** Entscheidung des Vorschlags und paralleles Absagen durch den Captain (nur vor der ersten Abbuchung) oder den Job; Sperrreihenfolge Spiel zuerst (`FOR UPDATE`), Test mit Parallelaufruf.
7. **Vertrag und Realität weichen ab:** Vertrag 009 nennt Dateien/Tests, die es nicht gibt (`admin-rollen.test.ts` usw.); sie entstehen in M1.

## 10. Fragen (nicht entschieden; Produkt: Nutzer/t9, Recht: Anwalt, kein Agent beantwortet sie)
**Produkt**
- **P1:** Sollen `moderator`, `finance` und `booking` in M1 entfallen (Vertrag 009: zu `admin` bzw. `player`), oder bleiben sie als Teilrollen neben `owner`/`admin` bestehen?
- **P2:** Welches Konto ist in der Produktion Admin 1 (`owner`), und wie wird es festgelegt oder übergeben (einmaliger Betreiber-Schritt vs. Umgebungsangabe)? Wie wird verhindert, dass es nach der Migration keinen `owner` gibt (Start-Check, Warnung)? Gibt es einen Vertretungsweg, wenn Admin 1 ausfällt?
- **P3:** Wer ordnet die vorhandenen Konten mit `moderator`/`finance`/`booking` zu (Admin 1 vor der Migration)? Der Prüfbericht liefert die Liste, die Zuordnung ist Sache von Admin 1.
- **P4:** Gilt „Admin 2 kann nicht selbst absagen“ (AC-9) auch für Spiele OHNE Abbuchung (heute darf jeder Plattform-Admin über `cancelMatch` absagen), oder nur für Spiele mit Abbuchung?
- **P5:** Ist die Begründung des Admin-Eingriffs zugleich der Absagegrund für die Teilnehmer (`matches.cancel_reason`), oder gibt es zwei Felder (interne Begründung und Text an die Teilnehmer)?
- **P6:** Läuft ein offener Absagevorschlag ab (z. B. bei Spielbeginn automatisch erledigt)? Darf Admin 2 ihn zurückziehen?
- **P7:** Darf Admin 2 das Protokoll vollständig lesen (Vertrag 013: „Protokoll lesen“ am Handy), auch Rollen- und Absageentscheide von Admin 1?

**Recht**
- **R1:** Aufbewahrungsdauer, Auskunft (Art. 15) und Löschung/Anonymisierung der Freitext-Begründungen im Eingriffsprotokoll (zusammen mit G21-012 Absagegrund).
- **R2:** Darf bei einer Absage durch den Betreiber die Begründung gegenüber den Teilnehmern Dritte (z. B. gesperrte Spieler) nennen? Antwort bestimmt, ob nur ein Standardtext erlaubt ist.
