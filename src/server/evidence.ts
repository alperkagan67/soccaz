import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvidence, evidenceActor } from "@/db/schema-finance";
import { cleanReason, isRequestKind, type EvidenceKind } from "@/lib/evidence";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Pick<typeof db, "select" | "execute">;
const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

export type EvidenceInput = {
  matchId: string;
  venueId: string | null;
  round: number;
  kind: EvidenceKind;
  jobId?: string | null;
  /** Begründung der Halle (Fremdtext): wird bereinigt und auf 300 Zeichen gekürzt; leer = keine. */
  reason?: string | null;
  /** Betreiber, der geantwortet hat (Plan 011 P2): Name und E-Mail landen NUR in evidence_actor, im Hash steht nur ein gesalzener Verpflichtungswert. */
  actor?: { userId: string; name?: string | null; email?: string | null } | null;
};

/** Verpflichtungswert: sha256(salt:user_id). Das Salz liegt in evidence_actor; ohne diese Zeile lässt sich der Bezug nicht mehr herstellen. */
export function actorCommitment(salt: string, userId: string): string {
  return createHash("sha256").update(`${salt}:${userId}`, "utf8").digest("hex");
}

/**
 * Trägt einen Zustandswechsel ins Beweisprotokoll ein, in DERSELBEN Transaktion wie der Wechsel (Rollback des Wechsels = kein Eintrag).
 * Reihenfolge (Plan 12, R-T210): (1) Zählerzeile nur SPERREN, (2) Existenz prüfen (Anfrage-Arten: vorhanden = still weiter, keine seq), (3) einfügen; der INSERT-Trigger zählt hoch.
 * Die Sperre vor der Prüfung verhindert das Rennen "beide prüfen nicht vorhanden, der zweite scheitert am UNIQUE und die Geschäftsaktion rollt zurück".
 * Sperrreihenfolge der Aufrufer: Spiel → Halle → Anfragezeile → Zähler (zuletzt).
 */
export async function recordEvidence(tx: Tx, input: EvidenceInput): Promise<{ created: boolean; seq: number | null }> {
  await tx.execute(sql`select id from booking_evidence_counter where id = 1 for update`);
  if (isRequestKind(input.kind)) {
    const venueCond = input.venueId === null ? sql`${bookingEvidence.venueId} is null` : eq(bookingEvidence.venueId, input.venueId);
    const [existing] = await tx
      .select({ seq: bookingEvidence.seq })
      .from(bookingEvidence)
      .where(and(eq(bookingEvidence.matchId, input.matchId), venueCond, eq(bookingEvidence.round, input.round), eq(bookingEvidence.kind, input.kind)));
    if (existing) return { created: false, seq: null };
  }
  const salt = input.actor ? randomBytes(16).toString("hex") : null;
  const reason = cleanReason(input.reason);
  const [row] = await tx
    .insert(bookingEvidence)
    .values({
      matchId: input.matchId,
      venueId: input.venueId,
      round: input.round,
      jobId: input.jobId ?? null,
      kind: input.kind,
      reason: reason === "" ? null : reason,
      actorCommitment: input.actor && salt ? actorCommitment(salt, input.actor.userId) : "",
    })
    .returning({ id: bookingEvidence.id, seq: bookingEvidence.seq });
  if (input.actor && salt) await tx.insert(evidenceActor).values({ evidenceId: row.id, userId: input.actor.userId, name: input.actor.name ?? null, email: input.actor.email ?? null, salt });
  return { created: true, seq: row.seq };
}

/** Aktuelle Runde der Hallenprüfung eines Spiels (0 = noch keine). */
export async function currentRound(exec: Exec, matchId: string): Promise<number> {
  const rows = rowsOf<{ r: number }>(await exec.execute(sql`select coalesce(max(round), 0)::int as r from booking_evidence where match_id = ${matchId}`));
  return rows[0]?.r ?? 0;
}

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
