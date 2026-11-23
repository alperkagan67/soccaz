## Retro-Notiz 012 M6b PR 1a: Vorbedingung `cardModeActive` ohne Guthaben-Klausel – 2026-11-23
Quellen: CI-Lauf zu #198 (Integration), Reviews R-T298/R-T299 (w4), Security-Review. Verfasser: worker-4. Nur Doku; die Regel ist ein **VORSCHLAG** (Regelvorschlag 22) und steht nicht in `CLAUDE.md`.

**Was lief gut:** Die CI hat den Fehler vor dem Merge gefunden; die Tests zur Doppelbelastung (PaymentIntent-Aufrufe zählen) waren stark genug, um ihn sichtbar zu machen.

**Was ging schief** (Symptom / Ursache / Fix, dazu Regressionstest)
| # | Symptom | Ursache | Fix | Regressionstest (Hinweis) |
|---|---|---|---|---|
| 1 | CI rot: acht statt vier PaymentIntent-Aufrufe; ein Platz mit Guthabenzahlung wäre im Kartenlauf ein zweites Mal belastet worden | PR 1a entfernte in `cardModeActive` die Klausel „bezahlter Platz bleibt im Guthabenmodell“ und las sie als „Altpfad-Rest“; die Klausel war zugleich der Doppelbelastungs-Schutz | Laut Task Manager im neu zugeschnittenen schmalen PR 1a (Branch `feat/012-m6b-1a`) behoben; Einzelheiten stehen dort | Gegenprobe-Test „Altspiel/Guthaben-Platz plus Kartenlauf: keine zweite Belastung“ (Datei laut PR) |
| 2 | Beide Reviews (security-reviewer, worker-4) übersahen es; w4 hatte „cardModeActive ohne die Altklausel“ in R-T298 und R-T299 unter „in Ordnung“ geführt | Der Review prüfte die Löschliste gegen den Plan, nicht jede entfernte Klausel einer Schutzfunktion gegen ihre Aufrufer und die Tests; die lokalen Integrationsläufe des Erstellers deckten `card-*` nicht vollständig ab | Review-Checkliste um den Abschnitt „Vorbedingungs- und Schutzfunktionen“ ergänzt (Aufrufer per grep, Gegenprobe-Test, Mutation); Regelvorschlag 22 | Checkliste, nicht Code |

**Prävention (VORSCHLAG):** Regelvorschlag 22 (alle Integrationsdateien `card-*`, `lobby*`, `tournament-*`, `payments*` einzeln lokal vor dem Push, Liste im PR-Text; je geänderter Vorbedingung Aufrufer, Gegenprobe-Test, Mutation). Ziel: AGENTS-SETUP.md und Review-Checkliste.

**Regressionstest-Hinweise:** Gegenprobe „Guthaben-Platz plus Kartenlauf“ als eigener Test auch nach Entfernung der Altspiele (M6b PR 2) behalten, solange `paid_cents`-Altzeilen existieren; Quelltext-Test für `cardModeActive` (Klauseln benannt).
