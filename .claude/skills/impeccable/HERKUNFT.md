# Herkunft: Impeccable-Skill

**Fremdcode. Nicht ausführen ohne Review.** Dieser Ordner ist eine unveränderte Kopie von `plugin/skills/impeccable` aus dem Impeccable-Repository; nur diese Datei (`HERKUNFT.md`) wurde hinzugefügt.

| | |
|---|---|
| Quelle | https://github.com/pbakaus/impeccable |
| Tag | `skill-v4.8.1` (Skill-Version 4.8.1) |
| Commit | `924bbd194d02e5e15a227e75b5901fb0d7a4ecad` (derselbe Commit trägt auch den Tag `cli-v4.8.1`) |
| Kopiert am | 2026-11-10 |
| Lizenz | Apache 2.0 (steht im Kopf von `SKILL.md`) |
| Umfang | nur `plugin/skills/impeccable` (58 Dateien); kein Plugin, kein `npx impeccable install`, kein Hook |

## Wichtig beim Betrieb

- **Engine-Download:** Beim ersten Aufruf von `scripts/impeccable` (bzw. `scripts/impeccable.cmd` unter Windows) lädt der Launcher eine Programmdatei (Engine Version 0.1.19, siehe `scripts/VERSION`) von GitHub-Releases (`https://github.com/pbakaus/impeccable/releases/download/engine-v0.1.19/…`) in den Benutzer-Cache `~/.impeccable/bin/<Version>/` und führt sie danach aus. Der Download wird gegen die SHA-256-Summen in `scripts/engine-checksums.txt` geprüft; ohne passende Summe wird abgebrochen. Das ist Fremdcode, der auf dem Rechner läuft.
- **Live-Modus:** `scripts/live-browser.js` wird bei `live` in eine lokale Seite eingebunden (Server auf localhost, Port 8400 in der Doku). Nicht in eine ausgelieferte Seite einbauen.
- **Kopier-Agent:** In `.claude/settings.json` steht unter `env` `IMPECCABLE_LIVE_COPY_AGENT=chat`. Ohne diese Einstellung startet „Apply“ im Live-Modus notfalls die `codex`- oder `claude`-CLI mit abgeschalteten Berechtigungsprüfungen. Mit `chat` bleibt Apply in der Chat-Sitzung.
- **Laufzeitdateien:** Impeccable schreibt unter `.impeccable/`; die Einträge dafür stehen in der `.gitignore` des Repos (Block aus der Impeccable-README).

## Sicherheitshinweise

1. **Hooks:** „kein Hook“ gilt nur für diese Kopie. Die Engine kann auf ausdrücklichen Befehl (`/impeccable hooks on`) PostToolUse- und Stop-Hooks anlegen: im Projekt in `.claude/settings.local.json` (nicht im Repo, gitignored), im Nutzerumfang aber auch in `~/.claude/settings.json`. `hooks on` nur bewusst und nach Rückfrage beim Nutzer aktivieren und danach `settings.local.json` bzw. `~/.claude/settings.json` kontrollieren. `impeccable context` repariert Hooks automatisch, wenn lokal `hook.consent=accepted` gesetzt ist.
2. **Engine (Fremd-Binary):** Die Engine (ca. 20 MB, `engine-v0.1.19`) wird beim ersten Aufruf von GitHub-Releases nach `~/.impeccable/bin/0.1.19/` geladen, per SHA-256 geprüft (`scripts/engine-checksums.txt`, bricht bei fehlender oder falscher Summe ab) und mit Benutzerrechten ausgeführt. Die Summen stimmen mit den Release-Digests überein (geprüft am 2026-11-10). Das belegt nicht die Unbedenklichkeit des Binaries. Bei Updates die Summen neu prüfen.
3. **Installations- und Update-Befehle:** `reference/doctor.md` nennt `npx impeccable update` und `impeccable install`. Nicht ohne Review ausführen.
4. **Kopier-Agent:** `IMPECCABLE_LIVE_COPY_AGENT=chat` (gesetzt in `.claude/settings.json`) verhindert, dass „Apply“ im Live-Modus eine `codex`- oder `claude`-CLI mit abgeschalteten Berechtigungsprüfungen startet.

## Aktualisieren

Neuen Tag in ein leeres Verzeichnis außerhalb des Repos klonen, nichts ausführen, `plugin/skills/impeccable` neu kopieren, Tag und Commit oben nachziehen und den Inhalt erneut auf Skripte, Netzwerkzugriffe und Hooks prüfen.
