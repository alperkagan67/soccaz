import { sql } from "drizzle-orm";
import { db } from "@/db";

type Exec = Pick<typeof db, "select" | "execute">;
const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

export type ChainCheck = { ok: boolean; count: number; headHash: string; firstBadSeq: number | null; reason: string | null };

/**
 * Prüft die Gesamtkette: lückenlose seq ab 1, prev_hash = Hash der Vorgängerzeile, hash = evidence_hash_of(Zeile), Klartext-Commitment (vorhandener Klartext muss zum Commitment passen; fehlender Klartext = nicht pruefbar, gueltig) (dieselbe SQL-Funktion wie der Trigger, Version 1 oder 2; unbekannte Version = 'hash'; NULL-Hashes werden mit IS DISTINCT FROM erkannt) und Zählerstand = letzte Zeile.
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
          when e.prev_hash is distinct from coalesce(lag(e.hash) over (order by e.seq), '') then 'prev_hash'
          when e.hash_version not in (1, 2) or (e.hash_version = 1 and e.match_id is null) then 'hash'
          when e.hash is distinct from evidence_hash_of(e) then 'hash'
          when rt.evidence_id is not null and e.reason_commitment is distinct from encode(sha256(convert_to(rt.salt || ':' || rt.reason, 'UTF8')), 'hex') then 'commitment'
          else null
        end as bad
      from booking_evidence_counter c
      left join booking_evidence e on true
      left join booking_evidence_reason_text rt on rt.evidence_id = e.id
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

export type Orphans = { matchIds: string[]; venueIds: string[]; tournamentIds: string[] };

/**
 * Verwaiste Verweise (Plan 14.2): Einträge, deren Spiel oder Halle nicht mehr existiert (die Fremdschlüssel entfallen wegen der Sperrfolge; der Guard auf matches/venues liest ohne Sperre).
 * Alarm, KEIN Kettenbruch: die Kette selbst bleibt gültig.
 */
export async function findOrphans(exec: Exec = db): Promise<Orphans> {
  const m = rowsOf<{ id: string }>(await exec.execute(sql`select distinct e.match_id as id from booking_evidence e left join matches x on x.id = e.match_id where e.match_id is not null and x.id is null`));
  const v = rowsOf<{ id: string }>(await exec.execute(sql`select distinct e.venue_id as id from booking_evidence e left join venues x on x.id = e.venue_id where e.venue_id is not null and x.id is null`));
  const t = rowsOf<{ id: string }>(await exec.execute(sql`select distinct e.tournament_id as id from booking_evidence e left join tournaments x on x.id = e.tournament_id where e.tournament_id is not null and x.id is null`));
  return { matchIds: m.map((r) => r.id), venueIds: v.map((r) => r.id), tournamentIds: t.map((r) => r.id) };
}

export type MissingEntry = { source: "hall" | "job" | "tournament" | "early_expiry"; subject: "match" | "tournament"; matchId: string | null; tournamentId: string | null; venueId: string | null; jobId: string | null; status: string };

/**
 * Abgleich (Plan 14.3/15.2): Anfragezeilen (pending, confirmed, declined, unmanaged) und Aufträge (alle außer in_progress) im Endstatus, zu denen der Protokolleintrag IN DER AKTUELLEN RUNDE fehlt
 * (z. B. weil ein Trigger deaktiviert oder die Wartungsausnahme gesetzt war). Die SQL-Funktion evidence_reconcile() steht in der Migration. Bewusst nicht erfasst: Wechsel confirmed -> declined
 * o. ä. (nur pending -> X erzeugt Einträge), in_progress, gelöschte Zeilen.
 */
export async function reconcileEvidence(exec: Exec = db): Promise<MissingEntry[]> {
  const rows = rowsOf<{ src: MissingEntry["source"]; r_subject: "match" | "tournament"; r_match: string | null; r_tournament: string | null; r_venue: string | null; r_job: string | null; r_status: string }>(
    await exec.execute(sql`select src, r_subject, r_match, r_tournament, r_venue, r_job, r_status from evidence_reconcile()`),
  );
  return rows.map((r) => ({ source: r.src, subject: r.r_subject, matchId: r.r_match, tournamentId: r.r_tournament, venueId: r.r_venue, jobId: r.r_job, status: r.r_status }));
}

export type EvidenceReport = { chain: ChainCheck; orphans: Orphans; missing: MissingEntry[]; ok: boolean };

/** Gesamtbericht für den Admin-Abruf und den Tagesjob: Kette (Kopf-Hash, Anzahl), Verwaiste, fehlende Einträge. */
export async function evidenceReport(exec: Exec = db): Promise<EvidenceReport> {
  const chain = await verifyEvidenceChain(exec);
  const orphans = await findOrphans(exec);
  const missing = await reconcileEvidence(exec);
  return { chain, orphans, missing, ok: chain.ok && orphans.matchIds.length === 0 && orphans.venueIds.length === 0 && orphans.tournamentIds.length === 0 && missing.length === 0 };
}

export type CachedEvidenceReport = EvidenceReport & { checkedAt: Date };
let cache: { at: number; report: CachedEvidenceReport } | null = null;
let inflight: Promise<CachedEvidenceReport> | null = null;
const REPORT_TTL_MS = 60_000;

/**
 * Gesamtbericht, höchstens alle 60 Sekunden neu berechnet (Review R-T225a): evidenceReport() prüft die GESAMTE Kette und gleicht ab (O(n)); jeder PDF-/Seitenabruf würde sonst bei wachsender
 * Kette teurer. Läuft gerade eine Berechnung, teilen sich alle gleichzeitigen Abrufe dasselbe Versprechen (kein Ansturm nach Ablauf des Zwischenspeichers, Security-Hinweis R-T226). Der
 * Prüfzeitpunkt (checkedAt) steht im Ergebnis und im PDF. Der Tagesjob evidence-head rechnet immer frisch.
 */
export async function cachedEvidenceReport(now: number = Date.now(), exec: Exec = db): Promise<CachedEvidenceReport> {
  if (cache && now - cache.at < REPORT_TTL_MS) return cache.report;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const report = { ...(await evidenceReport(exec)), checkedAt: new Date(now) };
      cache = { at: now, report };
      return report;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** NUR FÜR TESTS: leert Zwischenspeicher UND das laufende Versprechen (eine gerade laufende Berechnung wird dadurch nicht abgebrochen, ihr Ergebnis landet aber nicht mehr im Zwischenspeicher). */
export function clearEvidenceReportCache(): void {
  cache = null;
  inflight = null;
}
