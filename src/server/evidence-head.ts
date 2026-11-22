import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "./audit";
import { evidenceReport } from "./evidence";
import { notifyUsers } from "./notifications";
import { getSetting, setSetting } from "./settings";

const LAST_KEY = "evidence_head_last";

/**
 * Zweite Anonymisierung (Plan 14.1, Review w4/t2s Fund 4): evidence_actor wird erst beim COMMIT des Eintrags geschrieben. Loescht ein Konto sich gleichzeitig, sieht deleteAccount die noch nicht
 * committete Zeile nicht, und nach dem Antwort-COMMIT bliebe Name/E-Mail einer geloeschten Person stehen. Darum leert der Tagesjob alle evidence_actor-Zeilen, deren Konto nicht mehr existiert oder
 * anonymisiert ist (E-Mail geloescht-<id>@geloescht.invalid). Zeile und Hash bleiben, die Kette bleibt gueltig. Gibt die Anzahl geleerter Zeilen zurueck.
 */
export async function clearOrphanActors(): Promise<number> {
  const r = await db.execute(sql`
    update evidence_actor ea set user_id = null, name = null, email = null
    where (ea.user_id is not null or ea.name is not null or ea.email is not null)
      and (ea.user_id is null or not exists (select 1 from users u where u.id = ea.user_id and u.email not like 'geloescht-%@geloescht.invalid'))`);
  return (r as unknown as { rowCount?: number }).rowCount ?? 0;
}
type Last = { count: number; headHash: string; at: string };

/**
 * Tagesjob (Plan 14.3): Kopf-Hash und Anzahl der Beweiskette ausgeben, die Kette prüfen, Verwaiste und fehlende Einträge melden. Ausgabe = Benachrichtigung an Admin 1 (bis der Anwalt den
 * Ablageort außerhalb der Datenbank festlegt, Frage R3) und Eintrag im Eingriffsprotokoll. Alarm, wenn die Kette ungültig ist, die Anzahl KLEINER ist als beim letzten Lauf oder der frühere
 * Kopf-Hash nicht mehr in der Kette liegt. Der "letzte Lauf" liegt in derselben Datenbank: maßgeblich ist die externe Kopie (Benachrichtigung/Ablage), nicht dieser Wert.
 */
export async function runEvidenceHead(now: Date = new Date()): Promise<{ ok: boolean; count: number; headHash: string; alarms: string[]; actorsCleared: number }> {
  const actorsCleared = await clearOrphanActors();
  const report = await evidenceReport();
  const last = await getSetting<Last | null>(LAST_KEY, null);
  const alarms: string[] = [];
  if (!report.chain.ok) alarms.push(`Kette ungültig ab seq ${report.chain.firstBadSeq} (${report.chain.reason})`);
  if (report.orphans.matchIds.length || report.orphans.venueIds.length) alarms.push(`verwaiste Verweise: ${report.orphans.matchIds.length} Spiele, ${report.orphans.venueIds.length} Hallen`);
  if (report.missing.length) alarms.push(`${report.missing.length} Anfragen/Aufträge ohne Protokolleintrag`);
  if (last && report.chain.count < last.count) alarms.push(`Anzahl kleiner als beim letzten Lauf (${report.chain.count} statt ${last.count})`);
  if (last && last.count > 0) {
    const [still] = (await db.execute(sql`select 1 as ok from booking_evidence where hash = ${last.headHash} and seq = ${last.count}`)).rows as { ok: number }[];
    if (!still) alarms.push("der frühere Kopf-Hash liegt nicht mehr in der Kette");
  }
  await audit(null, "evidence.head", "evidence", "chain", { after: { count: report.chain.count, headHash: report.chain.headHash, alarms: alarms.length, actorsCleared } });
  const owners = (await db.select({ id: users.id }).from(users).where(and(eq(users.isOwner, true), sql`${users.bannedAt} is null`))).map((u) => u.id);
  if (owners.length) {
    await notifyUsers(owners, {
      type: "admin.task",
      title: alarms.length ? "Beweisprotokoll: Abweichung" : "Beweisprotokoll: Tagesstand",
      body: `${report.chain.count} Einträge, Kopf-Hash ${report.chain.headHash || "(leer)"}${alarms.length ? ` Alarm: ${alarms.join("; ")}.` : ""}`,
      url: "/admin",
    });
  }
  await setSetting(null, LAST_KEY, { count: report.chain.count, headHash: report.chain.headHash, at: now.toISOString() } satisfies Last);
  return { ok: alarms.length === 0, count: report.chain.count, headHash: report.chain.headHash, alarms, actorsCleared };
}
