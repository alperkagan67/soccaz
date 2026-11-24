#!/bin/sh
# Sichert die Datenbank täglich (Standard 03:30 UTC) nach /backups und löscht alte Sicherungen.
# Sofort eine Sicherung erzeugen: docker compose exec backup sh /backup-loop.sh once
set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_HOUR="${BACKUP_HOUR:-03}"
BACKUP_MINUTE="${BACKUP_MINUTE:-30}"

# Manifest für scripts/restore-test.mjs (Zeilenzahlen, Summen, Kopf-Hash der Beweiskette; keine Personendaten). Wortgleich mit MANIFEST_SQL in scripts/lib/restore-checks.mjs (Test prüft das).
MANIFEST_SQL="$(cat <<'SQL'
select json_build_object('format', 1, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'tables', (select coalesce(json_object_agg(c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint), '{}'::json) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'), 'migrations', (select count(*) from drizzle.__drizzle_migrations), 'ledgerSum', (select coalesce(sum(amount_cents), 0) from ledger_entries), 'evidenceCount', (select count(*) from booking_evidence), 'evidenceHead', coalesce((select hash from booking_evidence order by seq desc limit 1), ''))
SQL
)"

do_backup() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  tmp="/backups/.socaz-$stamp.sql.gz.part"
  out="/backups/socaz-$stamp.sql.gz"
  # Manifest VOR der Sicherung: Buchungen und Beweiskette wachsen nur, nach dem Restore dürfen sie also nicht kleiner sein. Ein Fehler hier lässt die Sicherung nicht scheitern.
  manifest="/backups/socaz-$stamp.manifest.json"
  if psql -X -At -v ON_ERROR_STOP=1 -c "$MANIFEST_SQL" > "$manifest.part" 2>/dev/null; then mv "$manifest.part" "$manifest"; else rm -f "$manifest.part"; echo "[backup] Manifest fehlgeschlagen (die Sicherung selbst läuft weiter)"; fi
  pg_dump --no-owner --clean --if-exists | gzip -9 > "$tmp"
  mv "$tmp" "$out"
  echo "[backup] $out ($(wc -c < "$out") Bytes)"
  find /backups -name 'socaz-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
  find /backups -name 'socaz-*.manifest.json' -mtime "+$KEEP_DAYS" -delete
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
