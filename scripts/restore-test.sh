#!/bin/sh
# Prüft, dass die neueste Sicherung wirklich wiederherstellbar ist (monatlich ausführen!).
# Aufruf: sh scripts/restore-test.sh        (im Projektordner, mit laufendem docker compose)
set -eu

latest="$(ls -1t backups/socaz-*.sql.gz 2>/dev/null | head -n 1 || true)"
if [ -z "$latest" ]; then
  echo "Keine Sicherung gefunden. Erst erzeugen: docker compose exec backup sh /backup-loop.sh once"
  exit 1
fi
echo "Prüfe $latest"

DB_USER="${POSTGRES_USER:-socaz}"
TMP_DB="restore_check_$$"

docker compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $TMP_DB" >/dev/null
trap 'docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB" >/dev/null' EXIT

gunzip -c "$latest" | docker compose exec -T db psql -U "$DB_USER" -d "$TMP_DB" -v ON_ERROR_STOP=1 -q >/dev/null

tables="$(docker compose exec -T db psql -U "$DB_USER" -d "$TMP_DB" -At -c "select count(*) from information_schema.tables where table_schema='public'")"
users="$(docker compose exec -T db psql -U "$DB_USER" -d "$TMP_DB" -At -c "select count(*) from users")"
echo "Wiederherstellung ok: $tables Tabellen, $users Nutzer"
test "$tables" -ge 10
