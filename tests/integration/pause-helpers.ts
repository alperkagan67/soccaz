import { sql } from "drizzle-orm";
import { db } from "@/db";
import { setCardSwitch } from "@/server/payment-switch";
import { makeUser } from "./helpers";

// Gemeinsame Hilfe der Pausen-Tests: Notabschaltung AUS und wieder EIN ueber die echte Funktion (Audit card_switch.off/on), danach die Zeitpunkte der NEUEN Audit-Zeilen auf Wunschwerte setzen
// (die Frist selbst laeuft ueber das `now` des Aufrufs). Admin 1 gibt es hoechstens einmal je Datenbank: einmal anlegen, bis cleanup() in afterAll.
let owner: Awaited<ReturnType<typeof makeUser>> | undefined;
const ids = async () => new Set((await db.execute<{ id: string }>(sql`select id::text as id from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`)).rows.map((r) => r.id));

export async function ownerUser() {
  owner ??= await makeUser("pz", "owner");
  return owner;
}

/** Pause von `offAt` bis `onAt` (Standard: eine Stunde davor). */
export async function resumeCycle(onAt: Date, offAt: Date = new Date(onAt.getTime() - 3_600_000)) {
  const o = await ownerUser();
  const before = await ids();
  await setCardSwitch(o.id, false, "Notabschaltung wegen Stoerung", true);
  await setCardSwitch(o.id, true, "Stoerung behoben, alles geprueft", true);
  const fresh = [...(await ids())].filter((id) => !before.has(id));
  if (fresh.length === 0) return;
  const list = sql.join(fresh.map((id) => sql`${id}::uuid`), sql`, `);
  await db.execute(sql`update audit_log set at = ${offAt} where action = 'card_switch.off' and id in (${list})`);
  await db.execute(sql`update audit_log set at = ${onAt} where action = 'card_switch.on' and id in (${list})`);
}
