// NUR FUER TESTS (Plan 14.7): recordEvidence schreibt einen Eintrag aus der Anwendung. Produktiv entstehen die Eintraege DB-seitig (DEFERRABLE-Trigger beim COMMIT); ein Aufruf mitten in einer
// Transaktion hielte den globalen Zaehler und brachte den Deadlock-Zyklus zurueck. ESLint (no-restricted-imports) verbietet den Import in src/.
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

