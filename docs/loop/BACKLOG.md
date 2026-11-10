# Backlog

Reihenfolge von oben nach unten. Der nächste Eintrag ohne offene Produktfragen startet ohne Rückfrage (siehe CLAUDE.md, Autonomie und Backlog).

| # | Eintrag | Status |
|---|---------|--------|
| 1 | Härtung: `safeInternalPath` in `guthaben/page.tsx`, `payments.ts` (`safeReturnPath`), `content-actions.ts` (`safePath`) und `actions.ts` (`internalReturnPath`) (#39) | fertig |
| 1 | Härtung: keine Schiedsrichterrechte (Ergebnis eintragen, Streit entscheiden) für Veranstalter, die Mitglied oder Turnierspieler eines beteiligten Teams sind (#40) | fertig |
| 1 | Härtung: `try/catch` je Turnier bei der Anmeldeschluss-Meldung (#40) | fertig |
| 2 | `lobby.ts:441`: Fisher-Yates statt `sort(Math.random() - 0.5)` (#42) | fertig |
| 2 | Locks in `mergeTeams` und `convertLegacyChallenges` (#44, c411eae) | fertig |
| 3 | Übrige Retro-Kandidaten ohne Produktentscheidung: anonymer E2E-Kontext, Kader-Namen unter `/teams/{slug}`, „Eure Lobby“-Texte für Fremde (gehört zusammen mit Eintrag 5; der anonyme E2E-Kontext wird dort als Prüfung mit abgedeckt) | fertig (mit Eintrag 5, T70) |
| 3 | Aus dem T42-Review: `guthaben/page.tsx:75-76` ohne Fallback auf `back` bei ungültigem Altwert | offen |
| 3 | Aus dem T42-Review: `teams/neu/page.tsx:11` Vorab-Muster lässt Tab und Zeilenumbruch durch | offen |
| 3 | Aus dem T42-Review: `notifyUsers`-URLs (`benachrichtigungen/page.tsx:40`, `admin/finanzen/page.tsx:57`) auf Validierung prüfen | offen |
| 3 | Aus dem T42-Review: Zähler `sent` in `notifyRegistrationDeadlines` ist bei Rollback zu hoch | offen |
| 3 | Aus dem Review des Regel-PRs: `docs/loop/BRANCH-PROTECTION.md:7` sagt noch „technisch nur Du per Pull Request nach main“ (veraltet durch die Autonomie-Regel) | offen |
| 3 | Aus Reviews: `mergeTeams` verschiebt `matchRequests.targetTeamId` nicht (der FK mit Cascade löscht offene Herausforderungen still) | offen |
| 3 | Aus Reviews: `matches.vetoTurnTeamId` hat keinen FK und wird beim Zusammenführen von Teams nicht umgeschrieben | offen |
| 3 | Aus Reviews: `convertLegacyChallenges` prüft `archivedAt` nicht | offen |
| 3 | Aus Reviews: In `convertLegacyChallenges` (`src/server/challenges.ts`) fängt der `catch`-Block pro Anfrage nach der Transaktion einen `DomainError` und überspringt die Anfrage ohne Log | offen |
| 3 | Aus Reviews: `ORDER BY asc(userId)` im Pool-SELECT von `randomSplit` (`lobby.ts`) und im zugehörigen Test (stabile Reihenfolge) | offen |
| 3 | Aus Reviews: `shareCents` (`src/lib/money.ts`) hat keine Obergrenze und keine `Number.isSafeInteger`-Prüfung für die Miete; heute prüft der Aufrufer die Mieten | offen |
| 3 | Aus A006: Links für eingeteilte Mitspieler auf `/spiele/{id}` laufen ins Leere (404, Mitspieler sind keine Team-Mitglieder): auf `/lobby/{id}/uebersicht` zeigen oder ausblenden (`results.ts:324`, `stats.ts:228`, `app/app/page.tsx:76`, `spieler/[id]/page.tsx:27` und `:47`, `lobby/[id]/page.tsx:152`, `lobby/[id]/uebersicht/page.tsx:131`) | offen |
| 3 | Aus A006: `teamComplete` und `evaluateConfirmation` prüfen `paidCents > 0` statt `>= Anteil` | offen |
| 3 | Aus A006: `leaderboards()` (`profiles.ts`): Turnierspiele und private Teamherausforderungen zählen in der Monatsrangliste mit; `visibility = 'public'` statt `kind <> 'private'` wäre strenger (Produktfrage) | offen |
| 3 | Aus A006: `/api/media/[id]` ist öffentlich cachebar; Fotos eines Privatspiels sind per UUID abrufbar | offen |
| 3 | Aus A006 (T58): Kommentar der probabilistischen Mutationstests korrigieren (etwa 8 % je Runde statt 1/16) | offen |
| 3 | Aus A006: Betriebsdokument (`docs/BETRIEB.md`): Was passiert bei Job-Ausfall nach dem Anstoß (Mietprüfung, Absage, Erstattung) | offen |
| 3 | Aus A006: `mergeTeams` (`admin.ts:255-257`) verschiebt und löscht Teilnehmer ohne `kind`-Prüfung; bei privaten Teams sinkt die Zahl der eingeteilten Spieler ohne Neuberechnung des Anteils (nur Admin, vorbestehend) | offen |
| 3 | Aus A006: Test für die Teamspiel-Abrechnung mit mehr als 12 Zahlern (Deckel 12 gegen Miete ÷ eingeteilte Spieler); er belegt „Teamspiel unverändert“ mutationsscharf, die Mutation „`settleMatch` nimmt für alle Spielarten `privateShareNow`“ bleibt heute grün | offen |
| 3 | Aus A006: Tests für `paid < final` in der Abrechnung und für eine zweite Abrechnung als Idempotenzbeweis | offen |
| 3 | Aus A006: Test für den Austritt weniger als 24 Stunden vor Anstoß mit `pending_refund` und anschließendem Ersatzspieler | offen |
| 3 | Aus A006 (Falle): `vi.mock('@/server/session')` in `tests/integration/privategame.test.ts` ohne `importActual`; alle anderen Session-Exporte sind dort undefiniert (im Test kommentiert), neue Tests in dieser Datei dürfen sie nicht brauchen | offen |
| 3 | Aus A006: Offene Pending-Ansprüche (Austritt nach der Frist, Erstattung erst bei Ersatzzahlung) erlauben jedem Link-Inhaber den Beitritt; erstattet wird erst nach seiner Zahlung | offen |
| 3 | Aus A006: Produktfrage zu AC-8, Beitrittssperre vor dem Fixieren (Nutzerentscheid, Schalter `BLOCK_PRIVATE_JOIN_BEFORE_FIX`) | offen (Nutzerentscheid) |
| 4 | Vertrag 006 Privatspiel (Orchestrator, Produktentscheidungen) | fertig (A006, PR #46, a27999f) |
| 5 | B-b Privatsphäre: Lobby-Seite für Fremde neutral („Offene Lobby von {Team}“); `/teams/{slug}`: Kader-Namen nur für Mitglieder und eingeloggte Nutzer, Gäste sehen Teamname, Stadt und Spielerzahl; verbindet den Retro-Kandidaten in Eintrag 3 (anonymer E2E-Kontext, Kader-Namen, „Eure Lobby“-Texte) | fertig (T70: offene Lobby neutral für Fremde, Kader und Torjäger nur für eingeloggte Nutzer, anonymer E2E-Kontext geschlossen) |
| 3 | Aus T70: Auf `/teams/{slug}` sind die Namen der Kommentarschreiber auch für Gäste sichtbar; Spieler-Profilseiten, Rangliste und Torjäger-Listen blieben bewusst unverändert (nicht Teil von B-b) – Produktfrage, ob Gäste dort Namen sehen sollen | offen |
| 6 | B-a Miete ÷ tatsächliche Spielerzahl für das Teamspiel (ersetzt `min_paid_players = 8` und die Reservierung; gleiche Frist-Regel wie das Privatspiel (einzige Frist 48 h vor Anstoß, Alles-oder-nichts zur Frist; Vorlauf unter 48 h: Sofortbuchung bzw. 1-h-Abbruch); gemeinsames Rechenmodul `shareCents` aus Vertrag 006) und das Turnier (dort nur das Modul nutzen) | Vertrag freigegeben (008 v2), Umsetzung geplant |
| 7 | Impeccable einrichten (Ausnahme-PR, berührt `.claude/`, daher merged der Nutzer selbst; vor Vertrag 007; Reihenfolge A006, B-b, B-a, Impeccable, 007). Vorgehen: Quelle `github.com/pbakaus/impeccable`, Tag `skill-v4.8.1`, den Commit-Hash des Tags festhalten; Klon in ein leeres Verzeichnis außerhalb des Repos, nichts ausführen; nur `plugin/skills/impeccable` nach `.claude/skills/impeccable` kopieren; kein Plugin, kein `npx install`, kein Hook; `HERKUNFT.md` mit Quelle, Tag und Commit; in `.claude/settings.json` unter `env` nur `IMPECCABLE_LIVE_COPY_AGENT=chat` ergänzen, sonst nichts ändern; die `.impeccable/`-Laufzeiteinträge aus der Impeccable-README in `.gitignore`; PR-Text mit Dateiliste und Hinweis, dass die Engine beim ersten Aufruf von GitHub-Releases nachgeladen wird; der Reviewer liest den Skill-Inhalt auf Skripte, Netzwerkzugriffe und Hooks | offen |
| 8 | B-c Vertrag 007: Oberfläche trennen in Teamspiel, Privatspiel und Turnier, dazu Navigation (Orchestrator schreibt den Vertrag nach 006) | Vertrag freigegeben (007 v2), Umsetzung nach 008 |
| 9 | Captain-Tausch nach der Frist (Captain tauscht einen Spieler gegen einen Ersatz, der registrierter Soccaz-Nutzer ist, ohne Zahlung über Soccaz; Folgeauftrag nach der Frist-Regel aus 006 v3 und 008 v3) | offen (Nutzer: Ja; Vertrag/ACs kurz folgen, Produktfragen an Orchestrator) |
| 10 | Wertung bei Nichterscheinen (ersetzt `recordLateCancel` mit 24-h-Grenze, das mit der 24-h-Regel entfällt; Produktfrage: Wie und ab wann wird ein Nichterscheinen gewertet?) | offen (Produktfrage) |

Status: offen / in Arbeit / fertig.
