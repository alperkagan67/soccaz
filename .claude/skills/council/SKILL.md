---
name: council
description: Strukturierte Abwägung bei teuren oder schwer umkehrbaren Entscheidungen (Datenmodell, neue Abhängigkeit, Zahlungsfluss, Auth, Datenschutz) mit drei getrennten Subagents. Nutzen in Phase 3; Ergebnis ist ein ADR.
---

# Council (Phase 3)

Spezifikation: `docs/loop/LOOP-SPEC.md`, Abschnitt 5.

**Ehrliche Einordnung:** Mehrere Rollen auf demselben Modell teilen dieselben blinden Flecken und neigen zu Konformität. Der Council ist ein Abwägungswerkzeug, kein Ersatz für Fakten oder für den Nutzer. Nicht für Implementierungsdetails verwenden.

## Ablauf
1. Frage als konkrete Wahl formulieren ("Datenmodell für Turnierbäume: A, B oder C?") plus Randbedingungen und Vertragskriterien.
2. Drei Subagents **getrennt starten**, jeder bekommt nur die Frage und die Randbedingungen, **nie die Antworten der anderen**:
   - `council-architekt`: beste langfristige Lösung, Wartbarkeit, Passung zum bestehenden Code
   - `council-skeptiker`: Risiken, Fehlerfälle, Sicherheit, Datenschutz, Kosten
   - `council-pareto`: kleinste Lösung, die die Vertragskriterien erfüllt; was kann weg
3. **Beweispflicht:** Jede Aussage braucht eine Code-Fundstelle (`Pfad:Zeile`), Dokumentation oder Messung. Unbelegtes wird in der Synthese nicht gewertet.
4. **Anonymisierte Synthese:** Antworten als "Antwort 1/2/3" vergleichen, ohne Rollennamen zu gewichten.
5. **Entscheidungsregel:**
   - Einigkeit: ADR schreiben.
   - Uneinigkeit: die Pareto-Lösung gewinnt, **außer** der Skeptiker belegt ein Sicherheits- oder Datenrisiko. Dann entscheidet der Nutzer.
   - Irreversible Entscheidung oder uneiniger Council: immer Nutzer fragen.
6. ADR nach `docs/decisions/_TEMPLATE.md` als `docs/decisions/<NNNN>-<titel>.md` schreiben, Abschnitt "Council-Stimmen" kurz füllen.
