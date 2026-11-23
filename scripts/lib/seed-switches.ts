// Schalter-Flip (t2q, Plan docs/loop plan-schalter-flip): Dev-Seeds schalten Zahlungen UND Kartenmodell EIN, damit Entwickler das Kartenmodell nutzen. Produktion bleibt AUS/AUS
// (Standardwerte, keine Migration): die Seeds laufen nur hinter assertSeedAllowed (scripts/lib/seed-guard.ts: localhost:5433, soccav2 oder soccaz_w1 bis soccaz_w4, nie NODE_ENV=production).
// Automatisierte Tests starten trotzdem immer AUS/AUS (tests/integration/setup.ts, tests/e2e/global-setup.ts, tests/cleanup.ts); Entwickler setzen die Schalter nach einem Testlauf
// mit `node --env-file=.env.local scripts/seed-demo.mjs` (idempotent) oder auf der Admin-Seite wieder.
type Q = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const DEV_SWITCHES = ["payments_enabled", "card_payments_enabled"] as const;

/** Setzt beide Schalter auf true (Upsert). Idempotent: schon gesetzte Werte werden nicht erneut geschrieben, eine Audit-Zeile (Akteur null) nur bei einer Aenderung. Gibt die geaenderten Schluessel zurueck. */
export async function enableCardModel(q: Q): Promise<string[]> {
  const changed: string[] = [];
  for (const key of DEV_SWITCHES) {
    const before = (await q.query("select value from settings where key = $1", [key])).rows[0]?.value ?? null;
    if (before === true) continue;
    await q.query("insert into settings (key, value) values ($1, 'true'::jsonb) on conflict (key) do update set value = 'true'::jsonb, updated_at = now()", [key]);
    await q.query("insert into audit_log (actor_id, action, entity, entity_id, before, after) values (null, 'setting.change', 'setting', $1, $2::jsonb, $3::jsonb)", [key, JSON.stringify({ value: before }), JSON.stringify({ value: true })]);
    changed.push(key);
  }
  return changed;
}
