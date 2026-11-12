// Migrationsbericht 011 M1 (nur lesend): Welche Hallen haben einen bisherigen Betreiber (venues.manager_user_id), aber KEINEN aktiven Zugang in venue_access?
// Das sind die Hallen, deren Zustand sich durch die Datenübernahme ändert (sie gelten jetzt als „ohne Zugang“): Admin 1 lädt sie vor dem Rollout neu ein (Entscheid t9 P11).
// Gründe: verwaist (kein Konto), anonymisiert (gelöschtes Konto), admin (Admin-Konto, Entscheid P4), gesperrt (wird als aktiv übernommen, hat aber keinen Zugriff, Annahme A7),
// sonst (aktiver Zugang fehlt aus anderem Grund, z. B. Einladung statt Zugang). Es werden nie E-Mail-Adressen ausgegeben, nur Hallen-ID, Name und Grund.
// Aufruf: node --env-file=.env.local scripts/venue-access-report.mjs   (Datenbank aus DATABASE_URL; die Sitzung ist READ ONLY)

/**
 * Liefert die Zeilen des Berichts. `client` ist ein pg-Client oder -Pool mit query(). Schreibt nichts.
 * `predict: true` (Tabelle venue_access gibt es noch nicht, vor der Migration): sagt voraus, welche Hallen die Datenübernahme überspringt (verwaist, anonymisiert, Admin-Konto).
 */
export async function venueAccessReport(client, { predict = false } = {}) {
  const { rows } = await client.query(`
    select v.id, v.name, v.city,
      case
        when u.id is null then 'verwaist'
        when u.email like 'geloescht-%@geloescht.invalid' then 'anonymisiert'
        when u.role = 'admin' then 'admin'
        when u.banned_at is not null then 'gesperrt'
        else 'sonst'
      end as grund,
      ${predict ? "false" : "exists (select 1 from venue_access a where a.venue_id = v.id and a.status = 'active')"} as hat_aktiven_zugang,
      ${predict ? "false" : "exists (select 1 from venue_access a where a.venue_id = v.id and a.status = 'invited')"} as hat_einladung,
      (select count(*)::int from match_hall_requests r join matches m on m.id = r.match_id
        where r.venue_id = v.id and r.status = 'pending' and m.veto_status = 'halls' and m.status = 'lobby') as offene_anfragen
    from venues v
    left join users u on u.id = v.manager_user_id
    where v.manager_user_id is not null
    order by v.name, v.id`);
  // Geändert = kein aktiver Zugang. Gesperrte Konten stehen als aktiv in venue_access (A7), erscheinen hier nur zur Information.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    grund: r.grund,
    aktiverZugang: r.hat_aktiven_zugang,
    einladungOffen: r.hat_einladung,
    offeneAnfragen: r.offene_anfragen,
    geaendert: predict ? ["verwaist", "anonymisiert", "admin"].includes(r.grund) : !r.hat_aktiven_zugang,
  }));
}

/** Formatiert den Bericht als Text (keine Adressen). */
export function formatReport(rows) {
  const changed = rows.filter((r) => r.geaendert);
  const lines = [];
  lines.push(`Hallen mit bisherigem Betreiber: ${rows.length}`);
  lines.push(`Hallen ohne aktiven Zugang (Zustand ändert sich, Admin 1 lädt neu ein): ${changed.length}`);
  for (const r of changed) {
    lines.push(`  - ${r.id}  ${r.name} (${r.city})  Grund: ${r.grund}  offene Anfragen: ${r.offeneAnfragen}${r.einladungOffen ? "  (Einladung offen)" : ""}`);
  }
  const info = rows.filter((r) => !r.geaendert && r.grund === "gesperrt");
  if (info.length) {
    lines.push(`Zur Information: ${info.length} Halle(n) mit gesperrtem Betreiber-Konto (als aktiv übernommen, kein Zugriff bis zur Entsperrung):`);
    for (const r of info) lines.push(`  - ${r.id}  ${r.name} (${r.city})`);
  }
  const open = changed.reduce((n, r) => n + r.offeneAnfragen, 0);
  if (open > 0) lines.push(`Achtung: ${open} offene Hallenanfrage(n) laufen bis zur Antwortfrist (12 Stunden) und gelten danach als belegt: Migration außerhalb offener Anfragen ausführen oder vorher neu einladen.`);
  return lines.join("\n");
}
