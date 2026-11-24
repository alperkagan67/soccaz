# Look-Liste: Änderungen, die mit der nächsten Look-Abnahme entschieden werden

Stand: 2026-11-24 · Verfasser: worker-4 · Zweck: Look-Änderungen (Schrift, Größen, Farben) sammeln, die **nicht** nebenbei in Fehler- oder Pilot-PRs gehen; der Nutzer (Look-Besitzer) entscheidet bei der nächsten Look-Abnahme (Vertrag 013 AC-13, AC-30).

| # | Punkt | Fundstelle | Stand | Quelle |
|---|---|---|---|---|
| 1 | **BottomNav-Beschriftung `text-xs` (12 px) auf mindestens `text-sm`** (5 Einträge, bei 390 px und Englisch auf Umbruch prüfen) | `src/components/BottomNav.tsx` Zeile 32 und 56 | offen; t2q 2026-11-24: nicht anfassen, Look-Änderung | Impeccable Lauf 3 P2-4, Backlog 237 Rest |
| 2 | **Schrift Figtree statt Plus Jakarta Sans** (`overused-font`) | `src/app/layout.tsx` | offen, nach dem Pilot | Backlog 239 |
| 3 | Fußzeile `text-sm` statt `text-xs`: **zur Kenntnis**, eine Look-Änderung außerhalb der Look-Abnahme (Entscheid t2q 2026-11-24: Fußzeile ja, BottomNav nein) | `src/components/Footer.tsx` | erledigt (Pilot-P2 PR C) | Impeccable Lauf 3 P2-4 |
| 4 | Sprachumschalter (war 16 px hoch): **erledigt in PR A** (`min-h-11 min-w-11`), zur Kenntnis | `src/components/LanguageSwitch.tsx` | erledigt (Pilot-P2 PR A) | Impeccable Lauf 3 P2-3 |
| 5 | **Zustimmungs-Kästchen im Bestätigungsdialog** (`ConfirmDialog`, Mandat/Zahlungszusage): `size-5` (20 px) statt 24 px mit 44-px-Zeile wie in `CardForm` | `src/components/ui/ConfirmDialog.tsx` Zeile 158 | **offen** (Backlog-Kandidat, kleine Änderung, Zahlungsmaske: security-reviewer) | Review R-T411 (w1) |
