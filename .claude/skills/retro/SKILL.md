---
name: retro
description: Kurze Retrospektive nach einem abgeschlossenen Auftrag (Phase 9). Hält Lehren als maximal 2-3 neue Regeln fest und macht jeden gefundenen Bug zu einem Regressionstest.
---

# Retro (Phase 9)

Spezifikation: `docs/loop/LOOP-SPEC.md`, Abschnitt 2 / Phase 9 und 7.4.

## Ablauf
1. Eintrag nach `docs/retros/_TEMPLATE.md` schreiben (eine Datei oder ein Block je Auftrag):
   ```
   ## Retro <Auftrag> – <Datum>
   Was lief gut: (1 Zeile)
   Was ging schief: Symptom / Ursache / Fix
   Prävention: (max. 2–3 Regeln) → Ziel: CLAUDE.md | AGENTS-SETUP.md | Hook | Test
   ```
2. Grundlage sind nur Belege: Berichte, Review-Ergebnisse, Logs. Nichts erfinden.
3. **Jeder gefundene Bug wird ein Regressionstest.** Fehlt der Test noch, steht er unter Prävention.

## Regeln
- Maximal **2–3 Zeilen** neue Regeln pro Auftrag, keine Romane.
- Ziel der Regel: `CLAUDE.md` (Projektkonventionen) oder `AGENTS-SETUP.md` (Team-Ablauf); wenn technisch erzwingbar lieber Hook oder Test.
- Task Manager entwirft, Orchestrator kürzt, der Nutzer sieht die Änderung im PR.
- Alle 5 Aufträge aufräumen: Regeln, die Claude ohnehin befolgt, löschen oder in Hooks umwandeln.
