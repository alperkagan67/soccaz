# Vorschlag: CI-Lauf der Kartensuiten im Provisionsmodell (nur Text, keine `.github`-Änderung)

Stand: 2026-11-12 · Quelle: Review 009 M2 (Punkt 8), Entscheid t1d · Ablage im `.github`-Sammel-PR B (der Nutzer mergt).

## Problem

`makeMatch` in `tests/integration/helpers.ts` legt Testspiele standardmäßig im **alten** Modell (`legacy`, Abbuchung auf `revenue`) an, damit die Bestandssuiten unverändert gelten. Produktiv entstehen neue Spiele aber im Modell `commission` (Abbuchung auf `venue_payable`). Ohne zweiten Lauf deckt nur `provision.test.ts` den Produktivpfad ab.

## Vorschlag

Dieselben Suiten laufen ein zweites Mal mit der Umgebungsvariable `TEST_LEDGER_MODEL=commission`. Dann legt `makeMatch` jedes Spiel mit einer Halle im Modell `commission` an, und die Erwartungen zum Konto der Abbuchung nutzen `SHARE_ACCOUNT` (`revenue` bzw. `venue_payable`).

Schritt im Workflow (nach dem normalen Integrationslauf, gleiche Datenbank-Vorbereitung):

```yaml
- name: Integrationstests Provisionsmodell
  run: npx vitest run -c vitest.integration.config.mts --testTimeout=60000 <Dateiliste unten>
  env:
    TEST_LEDGER_MODEL: commission
```

## Dateiliste (24 Dateien card-* plus dispute-admin, lokal grün in beiden Modellen; lokal: `npm run test:integration:commission`)

Abbuchung, Erstattung, Streit, Wechsel: `card-charge`, `card-refund`, `card-run`, `card-late-success`, `card-grace-retry`, `card-grace`, `card-cover`, `card-cover-view`, `card-substitute`, `card-substitute-review`, `card-trigger`, `card-lobby`, `card-auto-cancel`, `card-alarms`, `card-dispute`, `dispute-admin`.
Guthaben- und Finanzpfade: `finance`, `wallet`, `privategame`, `final`, `lobby-ready`.

## Aufwand und Laufzeit

- Aufwand: ca. 10 Zeilen im Workflow (ein Schritt, eine Dateiliste); kein neuer Code, die Tests sind bereits vorbereitet.
- Mehrlaufzeit (lokal gemessen, 12 und 9 Dateien je Lauf, jeweils unter 30 Sekunden Testzeit plus Datenbank-Anlage und Migration): geschätzt 1 bis 2 Minuten zusätzlich in der CI.
- Risiko: gering. Fällt der Lauf rot, steht fest, dass ein Pfad im Provisionsmodell ein anderes Konto bucht als im alten Modell.

## Alternative

Ein Matrix-Job (`ledger-model: [legacy, commission]`) statt eines Zusatzschritts: sauberer in der Anzeige, aber die Datenbank-Anlage läuft doppelt (mehr Laufzeit).
