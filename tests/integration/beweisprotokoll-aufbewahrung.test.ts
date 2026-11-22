import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingEvidence, bookingEvidenceCounter, evidenceActor } from "@/db/schema-finance";
import { verifyEvidenceChain } from "@/server/evidence";
import { retentionDays, runEvidenceHead, sweepReasonText } from "@/server/evidence-head";
import { recordEvidence } from "@/server/evidence-write";
import { cleanup, makeMatch } from "./helpers";

// Aufbewahrung des Begruendungs-Klartexts (G26-009, nur der Mechanismus; Standard 0 = aus, die Dauer ist Rechtsfrage R3). Die Kette ist EINE globale Reihe: jeder Test setzt sie zurueck (nur Test-Datenbank).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const maintenance = (fn: (tx: Tx) => Promise<unknown>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await fn(tx);
  });
const setRetention = (v: string) =>
  maintenance((tx) => tx.execute(sql`insert into settings (key, value) values ('evidence_reason_retention_days', to_jsonb(${v}::text)) on conflict (key) do update set value = excluded.value`));
async function resetChain() {
  await maintenance(async (tx) => {
    await tx.delete(evidenceActor);
    await tx.delete(bookingEvidence);
    await tx.update(bookingEvidenceCounter).set({ lastSeq: 0, lastHash: "" }).where(eq(bookingEvidenceCounter.id, 1));
  });
}
beforeEach(async () => {
  await cleanup();
  await resetChain();
  await setRetention("0");
});
afterEach(async () => setRetention("0"));
afterAll(async () => {
  await cleanup();
  await resetChain();
  await setRetention("0");
});

const rows = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));
const textCount = async () => rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from booking_evidence_reason_text`))[0].n;
const counts = async () => rows<{ e: number; a: number }>(await db.execute(sql`select (select count(*)::int from booking_evidence) as e, (select count(*)::int from evidence_actor) as a`))[0];

/** Zwei Eintraege mit Klartext, der zweite spaeter (50 ms): die Schwelle liegt dazwischen. */
async function twoEntries() {
  const m = await makeMatch({ hoursAhead: 72 });
  await db.transaction((tx) => recordEvidence(tx, { matchId: m.match.id, venueId: null, round: 1, kind: "declined", reason: "Halle belegt am Samstag", reasonCode: "belegt" }));
  await new Promise((r) => setTimeout(r, 60));
  await db.transaction((tx) => recordEvidence(tx, { matchId: m.match.id, venueId: null, round: 2, kind: "declined", reason: "Wartungsarbeiten", reasonCode: "wartung" }));
  const [a, b] = rows<{ at: Date }>(await db.execute(sql`select at from booking_evidence order by seq`));
  const cutoff = new Date((new Date(a.at).getTime() + new Date(b.at).getTime()) / 2); // zwischen den beiden Eintraegen
  return { cutoff };
}
const nowFor = (cutoff: Date, days: number) => new Date(cutoff.getTime() + days * 86_400_000);

describe("Aufbewahrung des Klartexts", () => {
  it("Standard 0 = aus: nichts wird gelöscht, auch bei sehr spätem Zeitpunkt", async () => {
    await twoEntries();
    expect(await retentionDays()).toBeNull();
    expect(await sweepReasonText(new Date(Date.now() + 10 * 365 * 86_400_000))).toEqual({ days: null, deleted: 0 });
    expect(await textCount()).toBe(2);
  });

  it("D > 0: nur der ältere Klartext wird gelöscht, Kette bleibt gültig, Einträge und Actor-Zeilen unverändert; zweiter Lauf löscht nichts; Audit-Eintrag", async () => {
    const { cutoff } = await twoEntries();
    await setRetention("30");
    const before = await counts();
    const auditBefore = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from audit_log where action = 'evidence.retention'`))[0].n;
    const r = await sweepReasonText(nowFor(cutoff, 30));
    expect(r).toEqual({ days: 30, deleted: 1 });
    expect(await textCount()).toBe(1);
    expect(await counts()).toEqual(before);
    expect((await verifyEvidenceChain()).ok).toBe(true);
    expect((await sweepReasonText(nowFor(cutoff, 30))).deleted).toBe(0);
    const a = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from audit_log where action = 'evidence.retention'`))[0].n;
    expect(a - auditBefore).toBe(1); // genau ein neuer Eintrag (der audit_log waechst ueber Laeufe hinaus)
    const left = rows<{ reason: string }>(await db.execute(sql`select reason from booking_evidence_reason_text`));
    expect(left[0].reason).toBe("Wartungsarbeiten"); // der jüngere bleibt
  });

  it("ungültige Werte (Text, negativ, zu groß, Dezimal) = aus: nichts wird gelöscht", async () => {
    const { cutoff } = await twoEntries();
    for (const v of ["abc", "-5", "99999999", "7.5", "", " "]) {
      await setRetention(v).catch(() => null); // der Einstellungsschutz lehnt manche Werte schon ab
      expect(await retentionDays(), v).toBeNull();
      expect((await sweepReasonText(nowFor(cutoff, 3650))).deleted, v).toBe(0);
    }
    expect(await textCount()).toBe(2);
  });

  it("der Tagesjob führt die Aufbewahrung aus und meldet die Anzahl; er löscht nur Klartext", async () => {
    await twoEntries();
    await setRetention("1");
    const res = await runEvidenceHead(new Date(Date.now() + 2 * 86_400_000));
    expect(res.retention).toEqual({ days: 1, deleted: 2 });
    expect(await textCount()).toBe(0);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });
});
