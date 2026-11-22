import { sql } from "drizzle-orm";
import { db } from "@/db";
import { evidenceReport, type EvidenceReport } from "./evidence";

// Beweisprotokoll, Lesen und Export (Vertrag 009 M3c, Plan 3.6 und 12 e): Einträge eines Spiels für das PDF, Gesamtketten-Export für die externe Prüfung, Übersicht für Admin 1.
// ENTWURF (ohne Datenbank-Lauf geschrieben): nur Admin 1 darf diese Funktionen über Routen/Seiten erreichen; hier steht keine Berechtigungsprüfung.
type Exec = Pick<typeof db, "execute">;
const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

export type EvidenceEntryView = {
  seq: number;
  at: Date;
  kind: string;
  round: number;
  reason: string | null;
  venueName: string | null;
  /** Name des antwortenden Betreibers (nur Admin 1, aus evidence_actor; nach Anonymisierung null). */
  actorName: string | null;
  hash: string;
};

export type MatchEvidence = { matchId: string; number: number | null; entries: EvidenceEntryView[]; report: EvidenceReport };

/** Einträge eines Spiels in Reihenfolge der seq, mit Hallenname und (nur für Admin 1) dem Namen des Betreibers. Unbekannte oder ungültige Spiel-ID: null. */
export async function loadMatchEvidence(matchId: string, exec: Exec = db): Promise<MatchEvidence | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) return null;
  const rows = rowsOf<{ seq: number; at: Date | string; kind: string; round: number; reason: string | null; venue_name: string | null; actor_name: string | null; hash: string; number: number | null }>(
    await exec.execute(sql`
      select e.seq, e.at, e.kind, e.round, e.reason, v.name as venue_name, a.name as actor_name, e.hash, m.number
      from booking_evidence e
      left join venues v on v.id = e.venue_id
      left join evidence_actor a on a.evidence_id = e.id
      left join matches m on m.id = e.match_id
      where e.match_id = ${matchId}
      order by e.seq`),
  );
  if (rows.length === 0) return null; // unbekannt oder ohne Einträge: gleiche Antwort
  return {
    matchId,
    number: rows[0].number,
    entries: rows.map((r) => ({ seq: r.seq, at: new Date(r.at), kind: r.kind, round: r.round, reason: r.reason, venueName: r.venue_name, actorName: r.actor_name, hash: r.hash })),
    report: await evidenceReport(),
  };
}

export type EvidenceOverviewRow = { matchId: string; number: number | null; entries: number; lastAt: Date };

/** Übersicht für Admin 1: Spiele mit Einträgen, neueste zuerst. */
export async function listEvidenceMatches(limit = 100, exec: Exec = db): Promise<EvidenceOverviewRow[]> {
  const rows = rowsOf<{ match_id: string; number: number | null; n: number; last_at: Date | string }>(
    await exec.execute(sql`
      select e.match_id, m.number, count(*)::int as n, max(e.at) as last_at
      from booking_evidence e left join matches m on m.id = e.match_id
      group by e.match_id, m.number
      order by max(e.at) desc
      limit ${limit}`),
  );
  return rows.map((r) => ({ matchId: r.match_id, number: r.number, entries: r.n, lastAt: new Date(r.last_at) }));
}

/**
 * Gesamtketten-Export (NDJSON, eine Zeile je Eintrag) für die externe Prüfung (Plan 12 e): nur die Felder, die in den Hash eingehen, ohne Personenfelder. Zusammen mit dem extern abgelegten
 * Kopf-Hash lässt sich die Kette außerhalb der Datenbank nachrechnen (SHA-256 über die längenpräfixierte Kodierung, siehe evidence_hash in der Migration).
 */
export async function exportEvidenceChain(exec: Exec = db): Promise<string> {
  const rows = rowsOf<{
    seq: number;
    at: Date | string;
    kind: string;
    match_id: string;
    venue_id: string | null;
    job_id: string | null;
    round: number;
    reason: string | null;
    actor_commitment: string;
    prev_hash: string;
    hash: string;
    at_text: string;
  }>(
    await exec.execute(sql`
      select seq, at, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text, kind, match_id, venue_id, job_id, round, reason, actor_commitment, prev_hash, hash
      from booking_evidence order by seq`),
  );
  return rows
    .map((r) => JSON.stringify({ seq: r.seq, at: r.at_text, kind: r.kind, matchId: r.match_id, venueId: r.venue_id, jobId: r.job_id, round: r.round, reason: r.reason ?? "", actorCommitment: r.actor_commitment, prevHash: r.prev_hash, hash: r.hash }))
    .join("\n");
}
