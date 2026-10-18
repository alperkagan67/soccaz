#!/bin/sh
# Sichert die Datenbank täglich (Standard 03:30 UTC) nach /backups und löscht alte Sicherungen.
# Sofort eine Sicherung erzeugen: docker compose exec backup sh /backup-loop.sh once
set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_HOUR="${BACKUP_HOUR:-03}"
BACKUP_MINUTE="${BACKUP_MINUTE:-30}"

do_backup() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  tmp="/backups/.socaz-$stamp.sql.gz.part"
  out="/backups/socaz-$stamp.sql.gz"
  pg_dump --no-owner --clean --if-exists | gzip -9 > "$tmp"
  mv "$tmp" "$out"
  echo "[backup] $out ($(wc -c < "$out") Bytes)"
  find /backups -name 'socaz-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
}

if [ "${1:-}" = "once" ]; then
  do_backup
  exit 0
fi

echo "[backup] läuft täglich um $BACKUP_HOUR:$BACKUP_MINUTE UTC, behält $KEEP_DAYS Tage"
while true; do
  now_h="$(date -u +%H)"
  now_m="$(date -u +%M)"
  if [ "$now_h" = "$BACKUP_HOUR" ] && [ "$now_m" = "$BACKUP_MINUTE" ]; then
    do_backup || echo "[backup] FEHLGESCHLAGEN"
    sleep 60
  fi
  sleep 20
done
