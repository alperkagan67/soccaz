# Entscheid-Liste für das Plan-OK A2 (G25-009), max. 5 Punkte

Stand: 2026-11-23 · Verfasser: worker-2 · Status: **Punkte 2 bis 5 = JA (Entscheid t2q); Punkt 1 (Anbieter und Spike-Ergebnis) liegt beim Nutzer; Bau von A2 erst nach grünem Teil A und B der Spike-Liste.**
Plan: `docs/design/g25-009-db-rollenmodell.md` (v5); Rollenskripte: `scripts/db-roles.sql`, `scripts/db-roles.mjs`, `scripts/db-owner.mjs`; Betrieb: `docs/BETRIEB.md`. Spike-Liste: `docs/loop/A2-ANBIETER-SPIKE.md`; Bau-Plan: `docs/loop/A2-BAU-PLAN.md`.


1. **[OFFEN, Nutzer]** **Hosting-Anbieter und Spike-Ergebnis.** Frage: Welcher Anbieter, und liegen die Ergebnisse der Spike-Liste (`docs/loop/A2-ANBIETER-SPIKE.md`) vor? Empfehlung: **A2 erst bauen, wenn Teil A und B der Liste gruen oder gelb sind**; rot = anderer Anbieter/Betriebsweg. Ohne Ergebnis wird Code gebaut, der auf dem Zielsystem nicht laufen koennte.
2. **[JA, t2q]** **Eigentumswechsel (Besitzer der Bestandsobjekte).** Frage: Darf der Eigentumswechsel je Objekt per `db-owner.mjs` (Plan-Datei + Pruefsumme, kein `REASSIGN OWNED`) im Wartungsfenster laufen, bei Produktion nur auf einer Kopie zuerst? Empfehlung: **Ja**, Reihenfolge: Staging-Kopie, Prueflauf `verify-db-roles`, dann Produktion; auf gelb (Anbieter setzt Eigentum selbst) wird der Schritt zum Anbieter-Auftrag.
3. **[JA, t2q]** **PR-Schnitt und CI.** Frage: A2a (Migration, Skripte, Code, Tests) und A2b (`ci.yml`, NEEDS-USER, Nutzer merged) getrennt? Empfehlung: **Ja, A2a zuerst**; A2b erst danach, damit die CI nicht rot wird. A2a laeuft mit Security-Review (Agent) auf Plan und Umsetzung.
4. **[JA, t2q]** **Reihenfolge zu B und zum Go-live.** Frage: A2 vor B (`soccaz_ops`)? Empfehlung: **A2, dann B, beide vor Go-live und vor `evidence_enforcement = on` in Produktion**; bis B bleibt "App darf `evidence_set_setting`/`late_attempt` ausfuehren" als dokumentiertes Restrisiko (Alarm im Tagesjob). G25-009 gilt erst nach A2 + B + URL-Wechsel als geschlossen.
5. **[JA, t2q]** **Restrisiko akzeptieren und Zeitpunkt des URL-Wechsels.** Frage: Bleibt `users.role/is_owner`, `audit_log`, `payment_*` bis zur Folgeetappe offen (App-Rolle kann sich zum Admin machen), und wird der Wechsel der App auf `soccaz_app` im Wartungsfenster nach Staging-Abnahme (E2E durch den Nutzer) gemacht? Empfehlung: **Ja, offen lassen und dokumentieren (Abschnitt 9)**, Folgeetappe vor Live planen; Rueckfall = alte URL, Superuser-Zugang nur im Tresor.

Nicht Teil der Entscheidung (laufen separat): HMAC/Anker (Nutzer/Anwalt), Aufbewahrungsdauer (R3).
