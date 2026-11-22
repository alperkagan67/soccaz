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
  // Plan 16g.6: Klartext der Begruendungen zuerst (Eintraege, deren Actor-Zeile anonymisiert ist oder deren Konto nicht mehr existiert), dann die Actor-Zeilen; Turnier-Bestaetiger ohne Konto loesen
  await db.execute(sql`
    delete from booking_evidence_reason_text rt using evidence_actor ea
    where ea.evidence_id = rt.evidence_id
      and ((ea.user_id is null and ea.name is null and ea.email is null)
        or (ea.user_id is not null and not exists (select 1 from users u where u.id = ea.user_id and u.email not like 'geloescht-%@geloescht.invalid')))`);
  await db.execute(sql`update tournaments t set venue_confirmed_by = null where t.venue_confirmed_by is not null and not exists (select 1 from users u where u.id = t.venue_confirmed_by and u.email not like 'geloescht-%@geloescht.invalid')`);
  const r = await db.execute(sql`
    update evidence_actor ea set user_id = null, name = null, email = null
    where (ea.user_id is not null or ea.name is not null or ea.email is not null)
      and (ea.user_id is null or not exists (select 1 from users u where u.id = ea.user_id and u.email not like 'geloescht-%@geloescht.invalid'))`);
  return (r as unknown as { rowCount?: number }).rowCount ?? 0;
}
type Last = { count: number; headHash: string; at: string };

/** Obergrenze der Aufbewahrungsdauer in Tagen (100 Jahre): Werte darueber gelten als ungueltig (Schutz gegen Tippfehler, nicht gegen Rechtsfragen). */
const RETENTION_MAX_DAYS = 36_500;
/** Hoechstens so viele Klartexte je Lauf (kein langes DELETE, Rest folgt im naechsten Lauf). */
export const RETENTION_BATCH = 10_000;

/** Liest evidence_reason_retention_days: ganze Zahl 1 bis RETENTION_MAX_DAYS = aktiv; 0, fehlend, ungueltig, negativ = aus (null). */
export async function retentionDays(): Promise<number | null> {
  const raw = await getSetting<unknown>("evidence_reason_retention_days", 0);
  const text = String(raw ?? "").trim();
  if (!/^[0-9]{1,5}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= RETENTION_MAX_DAYS ? n : null;
}

/**
 * Aufbewahrung des Begruendungs-Klartexts (G26-009, NUR der Mechanismus; die Dauer ist Rechtsfrage R3, Standard 0 = aus): loescht AUSSCHLIESSLICH Zeilen von booking_evidence_reason_text, deren Eintrag
 * (booking_evidence.at = COMMIT-Zeit) aelter ist als evidence_reason_retention_days Tage. Commitment, Hash, evidence_actor und Kette bleiben unberuehrt (fehlender Klartext = nicht pruefbar, gueltig).
 * Idempotent: ein zweiter Lauf loescht nichts. Gibt Dauer und Anzahl zurueck; bei "aus" (days = null) passiert nichts. Backups, WAL und Logs erreicht das Loeschen nicht (Frage R3).
 */
export async function sweepReasonText(now?: Date): Promise<{ days: number | null; deleted: number; invalid: boolean; more: boolean }> {
  const days = await retentionDays();
  if (days === null) {
    // Hinweis statt stillem Nichtstun: ein Wert ungleich 0, der nicht gilt (Text, negativ, Dezimal, ueber 36 500), loescht nichts
    const raw = String((await getSetting<unknown>("evidence_reason_retention_days", 0)) ?? "").trim();
    return { days, deleted: 0, invalid: raw !== "" && raw !== "0", more: false };
  }
  // Anker ist die Eintragszeit booking_evidence.at (R3: ein anderer Anker, z. B. Spielende, ist moeglich); Stichtag = Datenbankuhr (wie booking_evidence.at); der Parameter now ist NUR fuer Tests (eine falsch gehende App-Uhr loeschte sonst unumkehrbar zu frueh)
  const cutoff = now ? new Date(now.getTime() - days * 86_400_000) : new Date((await db.execute(sql`select (now() - make_interval(days => ${days})) as c`)).rows[0].c as string);
  const r = await db.execute(sql`
    delete from booking_evidence_reason_text
    where evidence_id in (
      select rt.evidence_id from booking_evidence_reason_text rt join booking_evidence e on e.id = rt.evidence_id
      where e.at < ${cutoff.toISOString()}::timestamptz order by e.seq limit ${RETENTION_BATCH})`);
  const deleted = (r as unknown as { rowCount?: number }).rowCount ?? 0;
  if (deleted > 0) await audit(null, "evidence.retention", "evidence", "reason_text", { after: { days, deleted, cutoff: cutoff.toISOString() } });
  return { days, deleted, invalid: false, more: deleted >= RETENTION_BATCH };
}

/**
 * Tagesjob (Plan 14.3): Kopf-Hash und Anzahl der Beweiskette ausgeben, die Kette prüfen, Verwaiste und fehlende Einträge melden. Ausgabe = Benachrichtigung an Admin 1 (bis der Anwalt den
 * Ablageort außerhalb der Datenbank festlegt, Frage R3) und Eintrag im Eingriffsprotokoll. Alarm, wenn die Kette ungültig ist, die Anzahl KLEINER ist als beim letzten Lauf oder der frühere
 * Kopf-Hash nicht mehr in der Kette liegt. Der "letzte Lauf" liegt in derselben Datenbank: maßgeblich ist die externe Kopie (Benachrichtigung/Ablage), nicht dieser Wert.
 */
export async function runEvidenceHead(nowOverride?: Date): Promise<{ ok: boolean; count: number; headHash: string; alarms: string[]; actorsCleared: number; retention: { days: number | null; deleted: number; invalid: boolean; more: boolean; skipped?: boolean } }> {
  const now = nowOverride ?? new Date();
  const actorsCleared = await clearOrphanActors();
  const report = await evidenceReport();
  const last = await getSetting<Last | null>(LAST_KEY, null);
  const alarms: string[] = [];
  if (!report.chain.ok) alarms.push(`Kette ungültig ab seq ${report.chain.firstBadSeq} (${report.chain.reason})`);
  if (report.orphans.matchIds.length || report.orphans.venueIds.length || report.orphans.tournamentIds.length) alarms.push(`verwaiste Verweise: ${report.orphans.matchIds.length} Spiele, ${report.orphans.venueIds.length} Hallen, ${report.orphans.tournamentIds.length} Turniere`);
  if (report.missing.length) alarms.push(`${report.missing.length} Anfragen/Aufträge ohne Protokolleintrag`);
  if (last && report.chain.count < last.count) alarms.push(`Anzahl kleiner als beim letzten Lauf (${report.chain.count} statt ${last.count})`);
  if (last && last.count > 0) {
    const [still] = (await db.execute(sql`select 1 as ok from booking_evidence where hash = ${last.headHash} and seq = ${last.count}`)).rows as { ok: number }[];
    if (!still) alarms.push("der frühere Kopf-Hash liegt nicht mehr in der Kette");
  }
  // Plan 16g.1: Durchsetzung AUS = Hinweis (die Uhrenquelle prüft nicht der Job, sondern evidence_set_setting beim Einschalten) in JEDEM Lauf, bis Admin 1 sie einschaltet (hart vor Go-live); kein Kettenalarm, daher nicht in alarms
  const enforcement = await getSetting<string>("evidence_enforcement", "on");
  const enforcementNote = enforcement === "off" ? " HINWEIS: Durchsetzung (Frist, Pflichtbegründung) ist AUS; Go-live nur mit 'on'." : "";
  // Aufbewahrung ERST NACH der Pruefung und NUR bei gueltiger Kette (R-T253): sonst wuerde das Loeschen manipulierten Klartext unpruefbar machen, bevor die Pruefung ihn sieht. Befund zuerst festhalten.
  const retention: { days: number | null; deleted: number; invalid: boolean; more: boolean; skipped?: boolean } = report.chain.ok
    ? await sweepReasonText(nowOverride)
    : { days: await retentionDays(), deleted: 0, invalid: false, more: false, skipped: true };
  if (retention.skipped && retention.days !== null) alarms.push("Aufbewahrung ausgesetzt: Kette ungültig (Klartext bleibt bis zur Klärung erhalten)");
  await audit(null, "evidence.head", "evidence", "chain", { after: { count: report.chain.count, headHash: report.chain.headHash, alarms: alarms.length, actorsCleared, enforcement } });
  const owners = (await db.select({ id: users.id }).from(users).where(and(eq(users.isOwner, true), sql`${users.bannedAt} is null`))).map((u) => u.id);
  if (owners.length) {
    await notifyUsers(owners, {
      type: "admin.task",
      title: alarms.length ? "Beweisprotokoll: Abweichung" : "Beweisprotokoll: Tagesstand",
      body: `${report.chain.count} Einträge, Kopf-Hash ${report.chain.headHash || "(leer)"}${alarms.length ? ` Alarm: ${alarms.join("; ")}.` : ""}${enforcementNote}${retention.deleted ? ` Aufbewahrung: ${retention.deleted} Begründungstexte nach ${retention.days} Tagen gelöscht.` : ""}${retention.more ? " Weitere Begründungstexte folgen im nächsten Lauf." : ""}${retention.invalid ? " HINWEIS: evidence_reason_retention_days ist ungültig (erlaubt 1 bis 36500, 0 = aus): es wird nichts gelöscht." : ""}`,
      url: "/admin",
    });
  }
  await setSetting(null, LAST_KEY, { count: report.chain.count, headHash: report.chain.headHash, at: now.toISOString() } satisfies Last);
  return { ok: alarms.length === 0, count: report.chain.count, headHash: report.chain.headHash, alarms, actorsCleared, retention };
}
