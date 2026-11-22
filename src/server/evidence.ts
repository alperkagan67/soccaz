import { sql } from "drizzle-orm";
import { db } from "@/db";

type Exec = Pick<typeof db, "select" | "execute">;
const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

export type ChainCheck = { ok: boolean; count: number; headHash: string; firstBadSeq: number | null; reason: string | null };

/**
 * Prüft die Gesamtkette: lückenlose seq ab 1, prev_hash = Hash der Vorgängerzeile, hash = evidence_hash(...) (dieselbe SQL-Funktion wie der Trigger) und Zählerstand = letzte Zeile.
 * Meldet die ERSTE abweichende seq. Zeilen UND Zählerstand kommen aus EINER Anweisung (ein Schnappschuss unter READ COMMITTED): ein Eintrag, der gleichzeitig committet, kann keinen
 * Fehlalarm "zaehler" auslösen (wichtig für den Tagesjob).
 */
export async function verifyEvidenceChain(exec: Exec = db): Promise<ChainCheck> {
  // EINE Anweisung: die Zählerzeile bildet die Grundmenge, die Zeilen hängen per LEFT JOIN daran (auch die allererste/leere Kette hat so einen Zählerstand im selben Schnappschuss)
  const all = rowsOf<{ seq: number | null; bad: string | null; hash: string | null; counter_seq: number; counter_hash: string }>(
    await exec.execute(sql`
      select e.seq, e.hash, c.last_seq::int as counter_seq, c.last_hash as counter_hash,
        case
          when e.seq is null then null
          when e.seq <> row_number() over (order by e.seq) then 'seq-luecke'
          when e.prev_hash <> coalesce(lag(e.hash) over (order by e.seq), '') then 'prev_hash'
          when e.hash <> evidence_hash(e.seq, e.match_id, e.venue_id, e.round, e.job_id, e.kind, e.reason, e.at, e.actor_commitment, e.prev_hash) then 'hash'
          else null
        end as bad
      from booking_evidence_counter c
      left join booking_evidence e on true
      where c.id = 1
      order by e.seq`),
  );
  const counter = all[0] ? { last_seq: all[0].counter_seq, last_hash: all[0].counter_hash } : undefined;
  const rows = all.filter((r): r is typeof r & { seq: number; hash: string } => r.seq !== null && r.hash !== null);
  const first = rows.find((r) => r.bad !== null);
  const last = rows[rows.length - 1];
  const headHash = last?.hash ?? "";
  if (first) return { ok: false, count: rows.length, headHash, firstBadSeq: first.seq, reason: first.bad };
  if (!counter || counter.last_seq !== (last?.seq ?? 0) || counter.last_hash !== headHash) return { ok: false, count: rows.length, headHash, firstBadSeq: (last?.seq ?? 0) + 1, reason: "zaehler" };
  return { ok: true, count: rows.length, headHash, firstBadSeq: null, reason: null };
}

export type Orphans = { matchIds: string[]; venueIds: string[] };

/**
 * Verwaiste Verweise (Plan 14.2): Einträge, deren Spiel oder Halle nicht mehr existiert (die Fremdschlüssel entfallen wegen der Sperrfolge; der Guard auf matches/venues liest ohne Sperre).
 * Alarm, KEIN Kettenbruch: die Kette selbst bleibt gültig.
 */
export async function findOrphans(exec: Exec = db): Promise<Orphans> {
  const m = rowsOf<{ id: string }>(await exec.execute(sql`select distinct e.match_id as id from booking_evidence e left join matches x on x.id = e.match_id where x.id is null`));
  const v = rowsOf<{ id: string }>(await exec.execute(sql`select distinct e.venue_id as id from booking_evidence e left join venues x on x.id = e.venue_id where e.venue_id is not null and x.id is null`));
  return { matchIds: m.map((r) => r.id), venueIds: v.map((r) => r.id) };
}

export type MissingEntry = { source: "hall" | "job"; matchId: string; venueId: string | null; jobId: string | null; status: string };

/**
 * Abgleich (Plan 14.3/15.2): Anfragezeilen (pending, confirmed, declined, unmanaged) und Aufträge (alle außer in_progress) im Endstatus, zu denen der Protokolleintrag IN DER AKTUELLEN RUNDE fehlt
 * (z. B. weil ein Trigger deaktiviert oder die Wartungsausnahme gesetzt war). Die SQL-Funktion evidence_reconcile() steht in der Migration. Bewusst nicht erfasst: Wechsel confirmed -> declined
 * o. ä. (nur pending -> X erzeugt Einträge), in_progress, gelöschte Zeilen.
 */
export async function reconcileEvidence(exec: Exec = db): Promise<MissingEntry[]> {
  const rows = rowsOf<{ src: "hall" | "job"; r_match: string; r_venue: string | null; r_job: string | null; r_status: string }>(await exec.execute(sql`select src, r_match, r_venue, r_job, r_status from evidence_reconcile()`));
  return rows.map((r) => ({ source: r.src, matchId: r.r_match, venueId: r.r_venue, jobId: r.r_job, status: r.r_status }));
}

export type EvidenceReport = { chain: ChainCheck; orphans: Orphans; missing: MissingEntry[]; ok: boolean };

/** Gesamtbericht für den Admin-Abruf und den Tagesjob: Kette (Kopf-Hash, Anzahl), Verwaiste, fehlende Einträge. */
export async function evidenceReport(exec: Exec = db): Promise<EvidenceReport> {
  const chain = await verifyEvidenceChain(exec);
  const orphans = await findOrphans(exec);
  const missing = await reconcileEvidence(exec);
  return { chain, orphans, missing, ok: chain.ok && orphans.matchIds.length === 0 && orphans.venueIds.length === 0 && missing.length === 0 };
}
