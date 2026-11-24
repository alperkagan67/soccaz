# Plan: Vertrag 010 M1, Hallenbewertung mit Kategorien (AC-1 bis AC-4, AC-9)

Stand: 2026-11-24 · Code-Stand `origin/main` 3666ee7 (höchste Migration 0059, vergeben an Turnier-Ablehnen #350) · Verfasser: worker-4 · Status: **Plan, kein Bau** (Auftrag t2q/t2s) · Quellen: `docs/contracts/010-spieler-funktionen.md`, `src/server/content.ts`, `src/db/schema-content.ts`, `013-frontend-ueberarbeitung.md` (AC-8, AC-17, M6)

## 1. Vertragsstand (G1)
Vertrag 010 **v2 ist freigegeben (2026-11-11)**, Abschnitt „Offene Fragen“: keine; Fristen vom Nutzer entschieden. Der Teil M1 (Bewertung mit Kategorien, Melden, Erinnerung) ist also **plan-fähig**. M2 (Karte) und M3 („Nochmal spielen“) sind **nicht** Teil dieses Plans. Einschränkung durch **013 AC-8**: die Hallenseiten gehören zu 013 M6 („Hallen (öffentlich) … Spieler-Funktionen (010)“) und bleiben bis zum Pilot-Feedback gesperrt; **Server, Migration, Job und Tests sind keine Seiten** und können vorher laufen, die Oberfläche (PR 4) erst danach, **gleich im neuen Look** (kein doppelter Bau).

## 2. Ausgangslage im Code
- Heute: `comments` mit `targetType = 'venue'` und **einer** Sterne-Bewertung je Person und Halle (`comments_one_review_per_venue`, Neuschreiben ersetzt die frühere), Melden (`comment_reports`), Auto-Ausblenden ab 3 Meldenden, Moderationsliste `/admin/moderation`. Keine Kategorien, keine Bindung an ein gespieltes Spiel, keine Frist.
- Spiel→Halle: `matches.venueId` (Spiele aller Arten: `kind` = `team`, `private`, `tournament`), Teilnahme: `match_participants`; Ende: `finalizedAt` und Status `played`.
- Sichtbarkeit (013 AC-17): Gäste und reine Betreiber sehen Personen nur als Initialen; die Quelle ist `lobby-namen.ts` (`autorLabel`, `commentView`).

## 3. Datenmodell (eine Migration, additiv)
**Migration 0060** (seriell nach 0059; vor dem Bau die höchste Nummer auf `main` erneut prüfen):
- `venue_reviews`: `id`, `match_id` (Spiel), `venue_id`, `user_id` (Konto löschen: `on delete set null`, Text bleibt als „gelöschtes Konto“ anonymisiert), `floor`, `changing_rooms`, `cleanliness`, `showers`, `parking` (je 1 bis 5, **CHECK**), `body` (optional, bis 500 Zeichen, bereinigt), `status` (`visible | hidden | removed`), `hidden_reason`, `created_at`; **UNIQUE (`match_id`, `user_id`)** (einmal je Spiel und Spieler, schließt Doppelaufrufe aus); Index `(venue_id, status, created_at)`.
- `venue_review_reports` (wie `comment_reports`: `review_id`, `reporter_id`, `reason`, `resolved_at`, PK je Paar).
- **Bestehende Sterne-Kommentare bleiben unberührt** (Vertrag: „Bestehende Kommentare bleiben“); kein Umschreiben von Altzeilen; Rückfall: beide Tabellen droppen (keine Daten anderer Tabellen betroffen).
- **A2 / Rollenmodell:** keine Beweis- oder Definer-Funktion, keine Wirkung auf `evidence_*`; zu prüfen bleibt nur, dass die neuen Tabellen für die App-Rolle gewährt werden (`db-roles.mjs`: Standardrechte beim Anlegen; Katalogtest im A2-PR). **Kein Hoster-Spike nötig.**

## 4. PR-Schnitt (höchstens 5)
| PR | Inhalt | Aufwand | Prüfung |
|---|---|---|---|
| **1** | Migration 0060 + Schema; Server `venue-reviews.ts`: `reviewableMatches(user)`, `submitReview` (Berechtigung **„hat dort gespielt“**: Teilnehmer eines abgeschlossenen, bestätigten Spiels dieser Halle, auch Privat- und Turnierspiel; Frist 7 Tage nach Spielende; Halle freigegeben; Eingabegrenzen; eindeutiger Schlüssel), Server-Aktion; **kein UI** | 2 Tage | security-reviewer (Rechteprüfung); Integration `hallenbewertung.test.ts` (AC-1, AC-2) |
| **2** | Lesen und Moderation: Durchschnitt je Kategorie und Anzahl (nur sichtbare), Texte nur für Angemeldete (**AC-17**: Gäste ohne Texte, Autoren über `autorLabel`), `reportReview` (ein Melden je Person, Auto-Ausblenden wie bei Kommentaren), Moderationsaktion Admin 2 (ausblenden/wiederherstellen, Audit), Konto-Löschung (Anonymisierung) und Datenexport; Moderationsliste um die zweite Quelle erweitert (Daten, kein neues Design) | 2 Tage | security-reviewer; Integration (AC-3 Datenseite, AC-4); Gast-Sicht-Registry und Gesamtprüfung angleichen (Texte nie im Gast-HTML/RSC) |
| **3** | Erinnerung (AC-9): Job `venue-review-reminders` (Zeitplan, `jobs.ts`), genau **eine** Push-Erinnerung am Tag nach Spielende für noch nicht Bewertende, Marker je (Spiel, Spieler) im Audit (Muster der Hallen-Erinnerung), Text zentral; nach 7 Tagen keine Bewertung mehr (Server aus PR 1) | 1 Tag | Integration (AC-9: genau eine, keine nach der Frist, Idempotenz bei Doppelstart) |
| **4** | **Oberfläche (013 M6, erst nach dem Pilot-Feedback):** Hallenseite (Durchschnitt je Kategorie, Texte), Bewertungsformular („Spiel bewerten“ in „Meine Spiele“ und Spielseite, eine Hauptaktion), „Melden“-Knopf; **Impeccable-Pflicht** (critique + Engine, AC-15), AC-5/AC-30 | 2 bis 3 Tage | e2e `hallen.spec.ts` (Spieler bewertet, Gast sieht Durchschnitt, kein Text), Impeccable-Lauf, Gast-Sicht-Gesamtprüfung |
| **5** | Admin-Moderation (013 M7, nach dem Pilot): Liste der gemeldeten Bewertungen im neuen Admin-Design | 1 Tag | e2e `admin`-Moderation |
Summe rund **8 bis 9 Arbeitstage**; PR 1 bis 3 sind unabhängig von den gesperrten Seiten und können nach dem OK laufen, PR 4 und 5 hängen am Gate **013 AC-8**.

## 5. Testplan (je mit Gegenprobe)
- **Berechtigung (AC-1, AC-2):** Teilnehmer eines bestätigten Spiels bewertet; Nicht-Teilnehmer, Gast, Teilnehmer eines **nicht** abgeschlossenen oder abgesagten Spiels, Teilnehmer eines Spiels in **anderer** Halle, nicht freigegebene Halle: neutrale Ablehnung; zweite Bewertung desselben Spiels abgelehnt, **parallele Doppelaufrufe** (genau einer gewinnt), Frist (genau 7 Tage: erlaubt/danach nicht, Datenbankuhr), Eingaben (Kategorie 0 und 6, fehlende Kategorie, Text zu lang, Steuerzeichen).
- **Sicht (AC-3, 013 AC-17):** Durchschnitt nur aus sichtbaren Bewertungen, ausgeblendete zählen nicht; Gast sieht keinen Text und keine Namen (HTML, RSC, JSON: Registry-Zeile `/hallen/[id]` mit echten Bewertungstexten im Seed); Betreiber nur Initialen.
- **Melden/Moderation (AC-4):** ein Melden je Person, Auto-Ausblenden ab Schwelle, Admin 2 blendet aus und wieder ein, Audit-Eintrag, Rechteprüfung (nur Moderation).
- **Erinnerung (AC-9):** genau eine, nur ohne bestehende Bewertung, nicht nach 7 Tagen, nicht doppelt bei zwei Läufen.
- **Konto löschen/Export:** Bewertung bleibt anonym sichtbar, Export enthält die eigenen Bewertungen. **Mutationen** je PR (Berechtigung weglassen, UNIQUE entfernen, Frist verlängern) müssen rot werden.

## 6. Zahlungs-, Beweis- und Sicherheitsnähe
**Kein Geld und kein Beweisprotokoll.** Sicherheitsrelevant ist die **Rechteprüfung „hat dort gespielt“** (Enumeration, fremde Spiele, IDOR) und der **Datenschutz** (Gäste ohne Namen, Freitext mit Personenbezug, Anonymisierung beim Löschen): **security-reviewer Pflicht für PR 1 und 2** (ein Lauf genügt, keine Zwei-Läufe-Regel), Eintrag in `docs/loop/GO-LIVE-AUDIT.md` (Datenschutz: Bewertungstexte, Aufbewahrung nach Konto-Löschung).

## 7. Produktfragen an t2q (offen, nicht im Vertrag)
1. **Alte Sterne-Kommentare** (`comments`, `venue`): getrennt lassen und auf der Hallenseite **getrennt** zeigen („ältere Kommentare“), oder in den Durchschnitt einrechnen? Vorschlag: getrennt.
2. **Autoren sichtbar?** Angemeldete sehen nach AC-17 Name und Link, Gäste Initialen. Für **kritische Hallenbewertungen** wäre „anonym für alle“ (nur „Spieler dieser Halle“) datenschutzfreundlicher und schützt vor Vergeltung der Halle (011 M5 lässt Hallen antworten). Entscheid Nutzer.
3. **Freitext-Grenzen:** Vorschlag 3 bis 500 Zeichen, Hinweis „Bitte keine Namen von Personen“ (wie bei der Ablehnung), Pflicht nur bei Bewertung unter 3 Punkten? (Vorschlag: nie Pflicht.)
4. **Turnier und Privatspiel:** bewertbar sind sie nach Annahme des Vertrags; bei Turnieren zählt als „gespielt“ jedes **gespielte** Turnierspiel des Spielers in der Halle (eine Bewertung je Spiel würde ein Turnier mehrfach bewerten lassen): Vorschlag **eine Bewertung je Turnier und Halle**; Entscheid.
5. **Reihenfolge:** PR 1 bis 3 **vor** dem Pilot-Feedback bauen (Backend ohne Seite) oder erst danach? Der Pilot hat Vorrang; Kapazitätsfrage für t2q.
6. **Aufbewahrung** der Bewertungstexte nach Konto-Löschung (anonym unbegrenzt oder Löschung nach X Monaten): Rechtsliste (FEHLT-NOCH), nicht von Agenten zu beantworten.
