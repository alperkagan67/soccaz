# Umbauplan Frontend (Vertrag 013, Ergebnis aus M1)
Stand: 2026-11-11 · Verfasser: Orchestrator · Grundlage: `docs/design/analyse-frontend-verdichtung.md` (983 Funde: 4 P0, 512 P1, 466 P2, 1 P3; 17 Cluster) · Gate: Nutzer-Ja (G1 erteilt 2026-11-11, mit Bedingungen AC-13 bis AC-15)

## 1. Befund in drei Sätzen
Die Bedienung leidet weniger an einzelnen Seiten als an fehlenden gemeinsamen Mustern: Es gibt keine einheitliche Navigation (145 Funde), Fehler- und Leerzustände ohne nächsten Schritt (93), Formulare ohne Struktur und Rückfrage (140) und das Altmodell mit Guthaben auf fast jeder Seite (89). Die Hauptaktion liegt oft unter dem Falz (31), Touch-Ziele sind zu klein (69), und Status ist teils nur Farbe (12). Deshalb baue ich zuerst die Muster einmal richtig (M2) und wende sie dann Seitengruppe für Seitengruppe an (M3 bis M7), statt 62 Seiten einzeln anzufassen.

## 2. Gestaltung (meine Entscheidung innerhalb Richtung E „Trikot“)
Leitidee: **Eine Seite, eine Hauptaktion, immer „Dein Stand“ zuerst.** Jede Seite beantwortet in dieser Reihenfolge: Wo bin ich? Was ist mein Stand? Was ist der eine nächste Schritt?
- **Navigation (`AppNav`, K11):** Handy unten, Desktop oben, dieselben fünf Ziele nach Vertrag 007 AC-1 und Nutzerentscheid Q6 (t9, 2026-11-11): Teamspiel | Privatspiel | Spiel suchen (Mittelknopf, Orange) | Turniere | Profil. Startseite ist das Logo (`/`); für Angemeldete ist „Meine Spiele“ (`/app`, nach Modus gruppiert) der Einstieg im Profil-Tab (Profil → Meine Spiele). „Spiel suchen“ führt in einen Auswahlschritt (Teamspiel suchen / Privatspiel anlegen / Turnier). Aktiver Eintrag mit `aria-current` und Wort. Rollenbereiche (Hallenbetreiber, Admin) im Profilmenü. Die Fußzeile nur für Rechtliches. Turniere stehen auf beiden Geräten in der Navigation.
- **Seitenkopf (`PageHeader`, K06):** Titel (genau eine `h1`), „Dein Stand“-Block (z. B. „Du bist bereit, Karte hinterlegt“), genau eine Hauptaktion. Handy: feste Aktionsleiste unten. Desktop: Aktion rechts im Kopf, Detailseiten zweispaltig (Inhalt + Seitenleiste).
- **Status (`StatusBadge`, K10, K09):** Symbol + Wort + Farbe. Neue Status-Tokens (`--ok`, `--warn`, `--danger`, `--info`) getrennt vom Akzent. Orange nur für Marke und Hauptaktion (nie Fließtext, nie Warnfarbe). Dritte sehen immer die neutrale Variante.
- **Zustände (`StateMessage`, K08):** Leer, Fehler und Ende bestehen aus Titel, Grund in einem Satz und genau einer nächsten Handlung. Gestaltete `not-found`/`error`/Sperrseiten mit Weg zurück („Dafür brauchst du die Rolle X, so bekommst du sie“, K14).
- **Bedienelemente (K02, K03):** Basis `Button`/`LinkButton`/`IconButton` mit mindestens 44 px, kleinste Schrift 12 px (Lint), sichtbarer Fokus-Ring, Skip-Link.
- **Formulare (K15):** `Form`-Muster (Feldgruppen, Fehler am Feld, Pflichtmarke, eine Speichern-Handlung), `ConfirmDialog` für Unumkehrbares (Entfernen, Konto löschen), `DateTimeField`, die nicht abgeschnitten wird.
- **Sprache (K05):** Begriffsverzeichnis `docs/design/begriffe.md`, alle Wörter über i18n; je Begriff eine Bedeutung (Lobby, Spiel, Bereit, Bezahlen, Entfernen, Abmelden).
- **Technik:** nativ plus eigene Bausteine, kein shadcn, kein Radix (ADR 0002); `UserMenu` wird neu gebaut (native Popover/`<details>`, Tastatur-Test).
- **Daten sehen (K12):** Eine Sichtbarkeitsmatrix (Rolle × Datenfeld) und ein serverseitiger Helfer `canSee`: Gäste und Fremde sehen Zahlen und Initialen, Namen, Elo und Position nur angemeldete Nutzer; Zahlstatus Dritter nur neutral.
- Hell und dunkel nach Systemeinstellung (schon 007), Kontrast ≥ 4,5:1.

## 3. Meilensteine und Seitengruppen
Aufwand in Task-Tagen (ein Writer), grob; zwei Writer parallel nur bei disjunkten Dateien; gemeinsame Dateien (`globals.css`, Layout, Header, Navigation) seriell.

| M | Inhalt | Seitengruppe / Cluster | Aufwand |
|---|---|---|---|
| M2 | Grundlage: `DESIGN.md` auf E, Tokens (Typo-Skala, Status, Fokus), Basiskomponenten (`Button`, `PageShell`, `PageHeader`/`PageTitle`/Skip-Link, `StateMessage`, `StatusBadge`, `ConfirmDialog`, `Form`, `DateTimeField`), `format.ts`, Begriffsverzeichnis (`docs/design/begriffe.md`: Findet statt / Preis steht fest / Ergebnis bestätigt), `UserMenu` neu, Lint- und UI-Regel-Tests, Kontrasttest erweitert | K01–K05, K09, K10, K13, K15, K17 | 6–8 |
| **Gate M2b** | **Look-Abnahme (AC-13)**: Start und Lobby komplett im neuen Look, Screenshots Handy 390 px und Desktop 1280 px, hell UND dunkel (4 Varianten je Seite), `NEEDS-USER`; erst nach dem „Ja“ des Nutzers geht M3 in die Breite; Guthaben wird in M2b nur in Start-/Lobby-Texten und der `/app`-Karte entfernt, Kopfleiste, Konto-Menü und `/app/guthaben` bleiben bis 012 M6a | | – |
| M3 | Navigation und Einstieg: `AppNav`, Start, Spiel suchen, Meine Spiele (`/app`), Lobby (Dein Stand, Hauptaktion, Captain-Leiste, Fehlerzustand mit Grund und Nachzahl-Weg aus 012 M3b), Neuling/Einladung/Onboarding, Turnierliste, UI-Texte (`lobby/[id]/page.tsx:238`: „Findet statt, sobald in beiden Teams mindestens 4 bereit sind“; `FinalConfirm.tsx:8-14`: „Preis steht fest, sobald beide Captains bestätigen“ statt „Letzte Bestätigung“; `mygame.ts:60`: „Findet statt (Preis folgt)“; Benachrichtigung `match.confirmed` (`lobby.ts` ca. 247, Mail/Push): „Spiel bestätigt“ wird „Spiel findet statt“); Start-Voraussetzung: 012 M5 gemergt und 012 M6a durch | K06, K08, K11, K12, K14 | 8–10 |
| **Gate** | **Pilot-Test** mit Freunden in einer Halle, Stripe-Testkarten; Feedback fließt in M4 bis M7 | | – |
| M4 | Team, Profil, Spielersuche, Ranglisten, Benachrichtigungen (ungelesen sichtbar, „Alle gelesen“), Konto und Einstellungen, Spielsuche für Gäste (Zahlen/Initialen) | K05, K12, K15 | 5–7 |
| M5 | Turnier-Detail (Phasen, „Anmelden“ nur wo sinnvoll), Privatspiel anlegen, Zahlen/Karte erneuern (012-Oberflächen), Spiel und Ergebnis | K06, K08, K15 | 5–6 |
| M6 | Hallen (öffentlich), `/halle` Betreiber (011), Spieler-Funktionen (010), Overlay, Hilfe, Rechtliches, Fußzeile; Ligen/Profitag/Stadt-Challenge zurückgestellt und ausgeblendet, nicht gelöscht (Backlog 59) | K16, K14 | 4–6 |
| M7 | Admin (16 Seiten, Desktop zuerst, Rollen nach 009), Handy: nur Übersicht, Moderation, Nutzer sperren, Protokoll lesen | K14, K13 | 5–7 |
| M8 | Abnahme: Impeccable polish und audit über alles, Gesamtstrecke je Rolle auf 390 und 1280 px | alle | 3–4 |
| | **Summe** | | **36–48** |

Abhängigkeiten: Browser-Tests beschleunigen (Backlog 49, Playwright-Image + Shards) vor M2. 012 M3b (Fehlerzustand, Benachrichtigung bei Fehlschlag, Datenschutz-Fix) vor der Lobby in M3. Neue Seiten werden von Anfang an **ohne Guthaben** gebaut. 012 M6 wird geteilt: **M6a** (Oberfläche und Texte: Rabattcode-Feld, `/app/guthaben`, Kopfleisten-/Konto-Menü-Guthaben, alle Guthaben-Texte; Rest K07) vor M3, **M6b** (Code, Schema, Tests entfernen; Rest K07) danach; Voraussetzung für M6a ist 012 M5 (Turnier auf Karte). Bindende Reihenfolge (Nutzerbedingung 2, t9, 2026-11-11, Backlog 63): M2 (M2-1 bis M2-5) → M2b (Look-Abnahme Start/Lobby; Guthaben in M2b nur in Start-/Lobby-Texten und der `/app`-Karte, wie in Backlog 63; Lobby-Abnahme im Kartenmodus (`card_payments_enabled = true`), der Altpfad mit Guthaben-Texten entfällt mit M6a/M6b (t9, Lesart a)) → 012 M3b bis M5 → 012 M6a → 013 M3 → Pilot-Test → M4 bis M8; M3 beginnt erst, wenn 012 M5 gemergt und M6a durch ist (AC-14, Backlog 58). Jeder UI-PR nennt alle sechs Impeccable-Befehle einzeln je Seite und Rolle (AC-15). 009, 010, 011 und 014 bauen ihre Oberflächen auf M2 auf. Jede Stufe: PR mit Impeccable-Belegen (critique, audit, distill, clarify, adapt, polish), Screenshots vorher/nachher, Web Interface Guidelines (nach Freigabe des Skills), Reviewer lehnt ohne Beleg ab.

## 4. Die vier P0 (zuerst)
1. Suchfeld `/spieler`, `/teams` am Handy (X-01, N1-SP-1): in M2/M4 mit dem Formular-Muster.
2. Keine Benachrichtigung bei fehlgeschlagener Abbuchung (N4-FZ-2): 012 M3b.
3. Admin „Betreiber zuweisen“ zerquetscht (AD-HA-1): M7, bis dahin kleiner Fix möglich.
4. Datenschutz in der Lobby (Gast sieht Zahlstatus namentlich, Y1-GM-07): 012 M3b, mit Test.

## 5. Produktfragen (entschieden am 2026-11-11, mit G1)
1. **Ligen, Profitag, Stadt-Challenge:** Entschieden: zurückgestellt und ausgeblendet (nicht verlinken, Stadt-Challenge auf `/rangliste` ausblenden), NICHT gelöscht; die Firmenliga aus 014 kann darauf aufbauen (Backlog 59).
2. **Admin am Handy:** Entschieden: nur Übersicht, Moderation, Nutzer sperren, Protokoll lesen; alles andere Desktop mit Hinweis.
3. **Sichtbarkeit für Gäste?** Entschieden: Gäste sehen Zahlen und Initialen; Namen, Elo und Position nur angemeldete Nutzer, festgehalten in einer Sichtbarkeitsmatrix.
4. **Unter 16:** Entschieden: vor dem Löschen eine Rückfrage, die Endseite sagt, was passiert; die Wiederanmeldungsregel ist eine **Rechtsfrage (Anwalt)** und steht offen im GO-LIVE-AUDIT (G16-013).
5. **Darf der Hallenbetreiber die eigene Halle bewerten?** Entschieden: Nein.
6. **Overlay für nicht öffentliche Spiele:** Entschieden: leere transparente Antwort statt Fehlerseite, kurze Anleitung für Streamer beim Veranstalter.
7. **Wann gilt ein Spiel als bestätigt?** (Code geprüft, entschieden als Begriffsfrage): Drei getrennte Dinge: Stufe 1 „Spiel findet statt“ = je Team mindestens 4 bereit (`lobby.ts:229-253`, `src/lib/lobby-rules.ts:4,10-12`); Stufe 2 „Preis steht fest“ = der Anteil wird fixiert (`fixShare`, `lobby.ts:338ff`), sobald beide Captains bestätigen (`lobby.ts:312-336`); `charge-run.ts:59` ist die Abbuchungs-Sperre (ohne beide Bestätigungen keine Abbuchung); „Ergebnis bestätigt“ = Gegner oder 48 h (`results.ts:332-444`). UI-Begriffe im Begriffsverzeichnis (M2): Findet statt / Preis steht fest / Ergebnis bestätigt; `mygame.ts:60` und der Text in `FinalConfirm.tsx` entsprechend. Keine Frage an den Nutzer.

## 6. Entscheidung
G1 für Vertrag 013 ist erteilt (2026-11-11), mit den Bedingungen AC-13 (Look-Abnahme nach M2), AC-14 (kein Guthaben vor dem Pilot) und AC-15 (alle sechs Impeccable-Befehle einzeln). M2 startet nach der schnelleren CI.
