import { sql } from "drizzle-orm";
import { db } from "@/db";
import { cachedEvidenceReport, type CachedEvidenceReport } from "./evidence";

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

export type MatchEvidence = { matchId: string; number: number | null; entries: EvidenceEntryView[]; report: CachedEvidenceReport };

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
    report: await cachedEvidenceReport(), // höchstens alle 60 s neu (O(n)), Prüfzeitpunkt im Ergebnis
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

type ChainRow = {
  seq: number;
  at_text: string;
  kind: string;
  match_id: string | null;
  hash_version: number;
  subject: string;
  tournament_id: string | null;
  reason_code: string;
  reason_commitment: string;
  deadline_at_text: string | null;
  decided_at_text: string | null;
  statement_at_text: string | null;
  enforced: boolean | null;
  venue_id: string | null;
  job_id: string | null;
  round: number;
  reason: string | null;
  actor_commitment: string;
  prev_hash: string;
  hash: string;
};

const chainLine = (r: ChainRow) =>
  JSON.stringify({ hashVersion: r.hash_version, subject: r.subject, seq: r.seq, at: r.at_text, kind: r.kind, matchId: r.match_id, tournamentId: r.tournament_id, reasonCode: r.reason_code, reasonCommitment: r.reason_commitment, deadlineAt: r.deadline_at_text, decidedAt: r.decided_at_text, statementAt: r.statement_at_text, enforced: r.enforced, venueId: r.venue_id, jobId: r.job_id, round: r.round, reason: r.reason ?? "", actorCommitment: r.actor_commitment, prevHash: r.prev_hash, hash: r.hash });

/**
 * Gesamtketten-Export (NDJSON, eine Zeile je Eintrag) für die externe Prüfung (Plan 12 e), als Generator in Batches (Schlüsselmengen-Cursor über seq, Review R-T225a): nie die ganze Kette im Speicher.
 * Nur die Felder, die in den Hash eingehen, ohne Personenfelder. Die Kette wird nur angehängt: auch bei gleichzeitigen Einträgen bleibt jede Teilfolge ab seq 1 eine gültige Kette.
 */
export async function* exportEvidenceChainLines(batch = 1000, exec: Exec = db): AsyncGenerator<string> {
  let last = 0;
  for (;;) {
    const rows = rowsOf<ChainRow>(
      await exec.execute(sql`
        select seq, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text, kind, match_id, hash_version, subject, tournament_id, reason_code, reason_commitment,
          to_char(deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as deadline_at_text, to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as decided_at_text,
          to_char(statement_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as statement_at_text, enforced, venue_id, job_id, round, reason, actor_commitment, prev_hash, hash
        from booking_evidence where seq > ${last} order by seq limit ${batch}`),
    );
    for (const r of rows) yield chainLine(r);
    if (rows.length < batch) return;
    last = rows[rows.length - 1].seq;
  }
}

/** Als Byte-Stream für die Antwort der Route (Zeilen mit Zeilenumbruch getrennt). */
export function exportEvidenceChainStream(batch = 1000, exec: Exec = db): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const it = exportEvidenceChainLines(batch, exec);
  let first = true;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode((first ? "" : "\n") + value));
      first = false;
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

/** Gesamter Export als Text (Tests, kleine Ketten); die Route streamt. */
export async function exportEvidenceChain(exec: Exec = db): Promise<string> {
  const lines: string[] = [];
  for await (const l of exportEvidenceChainLines(1000, exec)) lines.push(l);
  return lines.join("\n");
}
