// Reine Funktionen für scripts/restore-test.mjs (Backup/Restore-Probe, Go-live-Prüfpunkt E8). Keine Datenbank, kein Dateizugriff, keine Geheimnisse:
// alles hier ist ohne Datenbank testbar (tests/unit/restore-checks.test.ts). Ausgaben enthalten nur Tabellennamen und Zahlen, nie Zeileninhalte.

export const SCRATCH_PREFIX = "restore_check_";
/** Tabellen, die nur wachsen dürfen (angehängt, nie gelöscht): eine kleinere Zahl nach dem Restore ist ein FEHLER. Alle anderen Tabellen dürfen driften (die Sicherung lief live). */
export const GROW_ONLY_TABLES = ["ledger_entries", "booking_evidence"];

/**
 * Manifest-Abfrage: EINE Zeile, JSON. Läuft beim Sichern (scripts/backup-loop.sh, wortgleich dort eingebettet: tests/unit/restore-checks.test.ts prüft die Gleichheit)
 * und beim Prüfen auf der wiederhergestellten Datenbank. Nur Zahlen und der Kopf-Hash der Beweiskette (kein Personenbezug).
 */
export const MANIFEST_SQL =
  "select json_build_object('format', 1, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), " +
  "'tables', (select coalesce(json_object_agg(c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint), '{}'::json) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'), " +
  "'migrations', (select count(*) from drizzle.__drizzle_migrations), " +
  "'ledgerSum', (select coalesce(sum(amount_cents), 0) from ledger_entries), " +
  "'evidenceCount', (select count(*) from booking_evidence), " +
  "'evidenceHead', coalesce((select hash from booking_evidence order by seq desc limit 1), ''))";

/** Name der Scratch-Datenbank: nur dieses Muster darf angelegt und gelöscht werden (nie die Quelle, nie soccav2, nie soccaz_w*). */
export const scratchNameOk = (name) => typeof name === "string" && /^restore_check_[a-z0-9_]{1,40}$/.test(name);

/** Verbindungsdaten für psql/pg_restore als Umgebungsvariablen: das Passwort steht NIE in der Argumentliste (Prozessliste). */
export function connEnv(url) {
  const u = new URL(url);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")),
  };
}

/** URL derselben Instanz mit anderer Datenbank. */
export function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Erkennt das Dateiformat an den ersten Bytes: gzip (Klartext-SQL), pg_dump custom ("PGDMP"), sonst Klartext-SQL. */
export function detectFormat(head) {
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return "gzip-sql";
  if (head.length >= 5 && head.subarray(0, 5).toString("latin1") === "PGDMP") return "custom";
  return "sql";
}

const R = (id, status, text) => ({ id, status, text });

/** Zeilenzahlen, Summen und Kopf-Hash der Beweiskette gegen das Manifest der Sicherung. `actual` = Ergebnis von MANIFEST_SQL auf der wiederhergestellten Datenbank plus evidenceHeadAtManifest. */
export function compareManifest(manifest, actual) {
  if (!manifest) return [R("manifest", "WARN", "Kein Manifest: Zeilenzahlen, Summen und Kopf-Hash sind NICHT gegen die Quelle geprüft (nur Teilbeweis).")];
  const out = [];
  if (manifest.format !== 1) return [R("manifest", "FAIL", `Manifest-Format ${String(manifest.format)} unbekannt.`)];
  const mt = manifest.tables ?? {};
  const at = actual.tables ?? {};
  const missing = Object.keys(mt).filter((t) => !(t in at));
  out.push(missing.length ? R("tabellen", "FAIL", `Tabellen fehlen nach dem Restore: ${missing.join(", ")}`) : R("tabellen", "PASS", `${Object.keys(mt).length} Tabellen aus dem Manifest vorhanden.`));
  const extra = Object.keys(at).filter((t) => !(t in mt));
  if (extra.length) out.push(R("tabellen-neu", "WARN", `Tabellen nur im Restore (nicht im Manifest): ${extra.join(", ")}`));
  const shrunk = [];
  const drift = [];
  for (const t of Object.keys(mt)) {
    if (!(t in at)) continue;
    const d = Number(at[t]) - Number(mt[t]);
    if (GROW_ONLY_TABLES.includes(t)) {
      if (d < 0) shrunk.push(`${t} (${at[t]} statt mindestens ${mt[t]})`);
    } else if (d !== 0) drift.push(`${t} (${d > 0 ? "+" : ""}${d})`);
  }
  out.push(shrunk.length ? R("zeilen-wachsend", "FAIL", `Zu wenige Zeilen in nur-anhängenden Tabellen: ${shrunk.join(", ")}`) : R("zeilen-wachsend", "PASS", `${GROW_ONLY_TABLES.join(" und ")}: mindestens so viele Zeilen wie im Manifest.`));
  out.push(drift.length ? R("zeilen-drift", "WARN", `Zeilenzahl weicht vom Manifest ab (Sicherung lief live?): ${drift.join(", ")}`) : R("zeilen-drift", "PASS", "Alle übrigen Zeilenzahlen gleich dem Manifest."));
  out.push(Number(actual.ledgerSum) >= Number(manifest.ledgerSum) ? R("ledger-summe", "PASS", `Summe der Buchungen ${actual.ledgerSum} Cent (Manifest ${manifest.ledgerSum}, nur anhängend).`) : R("ledger-summe", "FAIL", `Summe der Buchungen ${actual.ledgerSum} Cent ist KLEINER als im Manifest (${manifest.ledgerSum}).`));
  if (Number(actual.evidenceCount) < Number(manifest.evidenceCount)) out.push(R("beweis-anzahl", "FAIL", `Beweiskette hat ${actual.evidenceCount} Einträge, Manifest ${manifest.evidenceCount}.`));
  else if (Number(manifest.evidenceCount) === 0) out.push(R("beweis-kopf", "PASS", "Manifest: Beweiskette war leer."));
  else out.push(actual.evidenceHeadAtManifest === manifest.evidenceHead ? R("beweis-kopf", "PASS", `Eintrag Nr. ${manifest.evidenceCount} hat den Hash aus dem Manifest.`) : R("beweis-kopf", "FAIL", `Eintrag Nr. ${manifest.evidenceCount} hat NICHT den Hash aus dem Manifest (Kette verändert).`));
  return out;
}

/** Migrationen der wiederhergestellten Datenbank gegen das Journal im Repo. `rows` = Hashes aus drizzle.__drizzle_migrations in Reihenfolge, `journalHashes` = sha256 der SQL-Dateien in Journal-Reihenfolge. */
export function compareMigrations(rows, journalHashes) {
  if (rows === null) return [R("migrationen", "FAIL", "Tabelle drizzle.__drizzle_migrations fehlt nach dem Restore.")];
  const n = Math.min(rows.length, journalHashes.length);
  for (let i = 0; i < n; i++) if (rows[i] !== journalHashes[i]) return [R("migrationen", "FAIL", `Migration Nr. ${i + 1}: Hash weicht vom Repo ab (Sicherung stammt aus einem anderen Stand).`)];
  if (rows.length > journalHashes.length) return [R("migrationen", "FAIL", `Sicherung hat ${rows.length} Migrationen, das Repo nur ${journalHashes.length} (Sicherung NEUER als der Code).`)];
  if (rows.length < journalHashes.length) return [R("migrationen", "WARN", `Sicherung hat ${rows.length} von ${journalHashes.length} Migrationen: vor dem Einsatz npm run db:migrate nötig.`)];
  return [R("migrationen", "PASS", `${rows.length} Migrationen, alle Hashes gleich dem Repo.`)];
}

/** Beweiskette: Ergebnis von verifyNdjson (+ optional externer Anker). */
export function chainResult(v, anchored) {
  if (!v.ok) return R("beweiskette", "FAIL", `Kette ungültig ab Nr. ${v.firstBadSeq} (${v.reason}); Einträge: ${v.count}`);
  if (!anchored) return R("beweiskette", "WARN", `Kette in sich gültig (${v.count} Einträge), aber OHNE externen Kopf-Hash und Anzahl KEIN Beweis gegen Kürzen.`);
  return R("beweiskette", "PASS", `Kette gültig, ${v.count} Einträge, Kopf-Hash gleich der externen Kopie.`);
}

/** Ergebnis des Schutz-Trigger-Tests: `blocked` = true wenn die Änderung an der Tabelle abgewiesen wurde, null = keine Zeile zum Testen. */
export function triggerResult(table, blocked) {
  if (blocked === null) return R(`trigger-${table}`, "SKIP", `${table}: keine Zeile, Schutz-Trigger nicht prüfbar.`);
  return blocked ? R(`trigger-${table}`, "PASS", `${table}: Änderung wird abgewiesen (Schutz-Trigger vorhanden).`) : R(`trigger-${table}`, "FAIL", `${table}: Änderung wurde NICHT abgewiesen (Schutz-Trigger fehlen nach dem Restore).`);
}

export const exitCode = (results, strict = false) => (results.some((r) => r.status === "FAIL" || (strict && r.status === "WARN")) ? 1 : 0);

export function formatReport(results, strict = false) {
  const lines = results.map((r) => `${r.status.padEnd(4)}  ${r.id}: ${r.text}`);
  const c = (s) => results.filter((r) => r.status === s).length;
  const code = exitCode(results, strict);
  lines.push(`${code === 0 ? "ERGEBNIS: BESTANDEN" : "ERGEBNIS: NICHT BESTANDEN"} (${c("PASS")} PASS, ${c("WARN")} WARN, ${c("FAIL")} FAIL, ${c("SKIP")} SKIP${strict ? ", streng: WARN zählt als Fehler" : ""})`);
  return lines.join("\n");
}
