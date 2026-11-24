# Anbieter-Entscheidungsvorlage: Server und Postgres für Go-live (3./4.12.) und Turnier (12.12.)

Stand: 2026-11-24 · Verfasser: worker-2 · Auftrag: t2s (Plan Turnier 12.12.) · **Der Nutzer entscheidet.** · Preise: nur öffentliche Preisseiten, Abrufdatum **2026-11-24**; Preise ändern sich, vor der Bestellung auf der Seite prüfen. Was ich nicht belegen konnte, steht als „nicht gefunden“. Eigene Rechnungen sind als **Rechnung** gekennzeichnet.

## 1. Ausgangslage (aus dem Repo)

- Der Stack läuft bereits **komplett in Docker Compose auf einem Server**: Postgres 17 (`postgres:17-alpine`), App (Node 22), Caddy (HTTPS automatisch), Backup-Dienst (täglich 03:30 UTC `pg_dump`, 14 Tage in `./backups`), Migration als eigener Dienst (`docker-compose.yml`, `docs/BETRIEB.md`). Es gibt ein Staging-Override und eine Staging-Checkliste (`docs/design/pilot-staging-checkliste.md`).
- Für das Turnier: Zahlungen **aus**, bis 16 Teams (ca. 100 Spieler), Anmeldung nur Google. Last und Datenmenge sind klein.
- Das Rollenmodell (A2, `docs/loop/A2-ANBIETER-SPIKE.md`) ist **pausiert bis nach dem 12.12.**; die Anbieterwahl darf es aber nicht verbauen.

## 2. Die Optionen

| | **A: Hetzner Cloud, Postgres im Compose** | **B: IONOS VPS, Postgres im Compose** | **C: Managed Postgres (Beispiel IONOS DBaaS) + kleiner Server** |
|---|---|---|---|
| Was | ein Server, alles wie im Repo | wie A, anderer Anbieter | Datenbank als Dienst, App-Server separat |
| Server (≥ 2 vCPU, 4 GB) | **CX23** 2 vCPU, 4 GB, 40 GB NVMe: **5,99 €/Monat netto**; CAX11 (Arm) 6,49 €; CX33 (4 vCPU, 8 GB, 80 GB) 8,99 €. Standorte NBG1 (Nürnberg), HEL1 (Helsinki). Hinweis: die Seite zeigt bei diesen Plänen „currently unavailable“ (Bestellung evtl. gerade nicht möglich). Alternative **CPX22** (2 vCPU, 4 GB, 80 GB) **16,99 €** (HEL1) bzw. **19,99 €** (NBG1) netto. Quelle: hetzner.com/cloud/cost-optimized und /regular-performance | **VPS M+** 2 vCores, 4 GB, 120 GB: **12 €/Monat brutto**; L+ 4 vCores, 8 GB: 22 € brutto; einmalig 10 € Einrichtung; monatlich kündbar. Standorte: „EU, USA, Großbritannien“, **Deutschland pro Tarif nicht gefunden**. Quelle: ionos.de/server/vps (Teile nur als Zusammenfassung gelesen, bitte gegenprüfen) | Server wie A oder B |
| Postgres | im Compose, **16/17 frei wählbar** (Repo: 17) | im Compose, wie A | Versionen 16/17 auf der Seite **nicht gefunden**; PITR „bis zu 7 Tage“ genannt |
| Datenbankpreis | 0 € extra | 0 € extra | nur Einzelpreise: 0,06 €/Core/Std., 0,007 €/GB RAM/Std., SSD Standard 0,07 €/GB/30 Tage, S3-Backup 0,007 €/GB/30 Tage, netto. **Rechnung** für 1 Core, 2 GB RAM, 10 GB SSD (730 Std./Monat): ca. **55 €/Monat netto**, ohne Backup und Server. Quelle: cloud.ionos.de/managed/dbaas/postgresql. Weitere Anbieter (Scaleway: Preisseite blockiert den Abruf, 403; Sliplane ab 19 €/Monat netto laut Drittvergleich, nicht geprüft) |
| Backup | Compose-Dienst `backup` (logisch, täglich, 14 Tage) **vorhanden**; zusätzlich Hetzner „Backups“ (tägliche Server-Kopie, 7 Plätze, ab 1,098 €/Monat netto laut Seite, Prozentsatz nicht angegeben) und Snapshots 0,0143 €/GB/Monat | Compose-Dienst vorhanden; Server-Backup bei IONOS: **nicht gefunden** | im Dienst (PITR 7 Tage genannt), Preis nicht im Grundpreis belegt |
| Daten in DE/EU | NBG1 = Deutschland, HEL1 = Finnland (EU) | EU, Deutschland **nicht belegt** | „europäische Rechenzentren“, Stadt **nicht gefunden** |
| Docker/Compose | ja (Ubuntu 24.04 wie in der Checkliste) | ja (Linux-Image, Docker selbst installieren) | App wie A/B; Datenbank-Container entfällt |
| Aufwand Nutzer | Konto, Server bestellen, SSH-Schlüssel, Domain-A-Record, dann Runbook: ca. **2 bis 3 Std.** | gleich, plus Rechenzentrum und Image prüfen: **2 bis 3 Std.** | wie A plus Datenbank anlegen, Zugangsdaten, IP-Freigabe, Rollen klären: **4 bis 6 Std.**, mehr Unbekanntes |
| Fit zu A2-Spike | **Grün erwartet:** wir sind Superuser im eigenen Container, `CREATE ROLE`, Eigentümerwechsel, `SET ROLE`, direkter Port ohne Pooler, SCRAM, TLS intern (A2, B1 bis B7, A6). **Lücke:** Spike C1 verlangt physisches Backup/PITR; wir haben logische Sicherung plus Server-Backup (nur absturzkonsistent) | wie A | **Offen:** Superuser/`CREATE ROLE`, Pooler, Version laut Seite nicht belegt; genau das prüft der Spike. Rot möglich (Abschnitt „Auswertung“ im Spike) |

## 3. Empfehlung

**A (Hetzner Cloud, ein Server, Compose wie im Repo)**, Standort **NBG1 (Deutschland)**:
1. **Passt ohne Umbau** zum vorhandenen Stack, zur Staging-Checkliste und zum Runbook; kein neues Unbekanntes vor dem Code-Freeze (27.11.).
2. **Kosten niedrig und klar:** 6 bis 9 € netto im Monat (CX23/CX33) plus Backups ab etwa 1,10 €; falls die günstigen Pläne nicht bestellbar sind, CPX22 mit 20 € netto. Zwei Server (Produktion und Staging) wären doppelt; Staging darf laut Checkliste nicht auf dem Produktionsserver laufen.
3. **A2 bleibt offen und gut baubar** (volle Rechte in der eigenen Datenbank).
4. **Restrisiko:** kein physisches Backup/PITR. Für das Turnier mit Zahlungen aus tragbar (tägliche logische Sicherung plus Server-Backup, Restore-Probe vor dem Go-live nach `BETRIEB.md`); vor Zahlungen in Produktion ist PITR (WAL-Archivierung) oder ein Managed-Dienst nachzuholen (Entscheid nach dem 12.12.).
5. **Bestellbarkeit prüfen:** Hetzner zeigt bei CX23/CAX11/CX33 „currently unavailable“. Ist das beim Bestellen noch so, CPX22 nehmen.

B nur, wenn Sie IONOS schon haben; Deutschland-Standort vorher klären. C erst nach dem 12.12. und nach dem Spike.

## 4. Was der Nutzer entscheiden muss

1. Anbieter A, B oder C (Empfehlung A).
2. Server **für Produktion** und **separat für Staging** (Staging-Generalprobe 30.11. bis 2.12.): zwei Server oder Staging nach der Generalprobe wieder löschen (stundenweise Abrechnung bei Hetzner laut Seite, Monatsobergrenze).
3. Standort Deutschland (NBG1) ja/nein (Datenschutzseite nennt den Standort; Rechtsfrage nur melden).
4. **AVV** (Auftragsverarbeitung) mit dem Anbieter abschließen: Recht, nicht von mir zu entscheiden (Nutzerliste).

## 5. Quellen (alle Abruf 2026-11-24)

- https://www.hetzner.com/cloud/cost-optimized/ (CX23, CAX11, CX33, Backups, Snapshots, Traffic 20 TB inklusive; Preise netto)
- https://www.hetzner.com/cloud/regular-performance (CPX22)
- https://www.ionos.de/server/vps (VPS M+/L+; brutto; teils nur als Zusammenfassung gelesen)
- https://cloud.ionos.de/managed/dbaas/postgresql (Einzelpreise netto; teils nur als Zusammenfassung gelesen)
- Nicht abrufbar: Scaleway (HTTP 403); UpCloud-Preisdokument (404). Keine Zahlen aus dem Gedächtnis.
