---
name: contract
description: Schreibt aus den Intake-Ergebnissen (grill-me) einen Feature-Vertrag nach docs/contracts/_TEMPLATE.md. Nutzen in Phase 2, bevor Tasks zerlegt werden; endet mit Gate G1 (Freigabe durch den Nutzer).
---

# Vertrag schreiben (Phase 2)

Spezifikation: `docs/loop/LOOP-SPEC.md`, Abschnitt 2 / Phase 2 und 7.1.

## Ablauf
1. Nächste freie Nummer wählen (`ls docs/contracts`), Datei `docs/contracts/<NNN>-<kurzname>.md` aus `docs/contracts/_TEMPLATE.md` anlegen. Keine Überschrift des Templates weglassen.
2. Alle Felder aus den Intake-Antworten füllen. Fehlt eine Information: nicht raten, sondern unter **Offene Fragen** eintragen und beim Nutzer nachfragen.
3. Fakten aus dem Code per Subagent holen und mit Fundstelle (`Pfad:Zeile`) belegen, den Nutzer nur nach Entscheidungen fragen.

## Regeln für Akzeptanzkriterien
- Jedes Kriterium hat eine ID (`AC-1`, `AC-2`, …).
- Format **Gegeben / Wenn / Dann** (Given/When/Then).
- Jedes Kriterium nennt seinen **Check**: die Testdatei (Unit/Integration/E2E), die es beweist.
- Messbar statt vage: nicht "funktioniert gut", sondern "liefert HTTP 200 und zeigt X".
- Randfälle aus dem Intake (z. B. ungerade Teamanzahl, Absage, Zahlung fehlgeschlagen) bekommen eigene Kriterien.

## Pflichtteile
- **Nicht-Ziele**: Pflicht, mindestens ein Eintrag.
- **Meilensteine**: je 1–4 Kriterien, jeweils einzeln auslieferbar.
- **Datenschutz / Sicherheit**: personenbezogene Daten, Zahlungen, Rechte ausdrücklich benennen.
- **End-to-End-Nachweis**: ein E2E-Test, der das Feature als Ganzes beweist.
- **Offene Fragen**: vor der Freigabe leer.

## Gate G1
Vertrag dem Nutzer zeigen. Status erst auf "Freigegeben (Datum)" setzen, wenn der Nutzer ausdrücklich "freigegeben" sagt. Ohne G1 startet keine Zerlegung und keine Umsetzung. Danach geht der Vertrag an den Task Manager.
