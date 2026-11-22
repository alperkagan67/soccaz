import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, teams } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { matchHallRequests, matchOptions } from "@/db/schema-matchmaking";
import { acceptChallenge, challengeTeam } from "@/server/challenges";
import { currentRoundOf } from "@/server/evidence";
import { proposeOption, voteOption } from "@/server/scheduling";
import { advanceVetos, answerHallRequest, pendingHallInquiries, startHallCheck } from "@/server/veto";
import { cleanup, grantVenueAccess, makeTeam, makeUser } from "./helpers";

// 011 M2a-2 (Plan 011 M2, 3.1 bis 3.3, 7.1): Antwort des Betreibers mit Kategorie, Runde, Fristgrenze in SQL, late_attempt, Beweiseinträge per Datenbank-Trigger.
// Die Beweispflicht (evidence_enforcement) steht standardmäßig AUS: die App prüft Frist, Kategorie und Runde immer selbst; ein eigener Test schaltet die Pflicht kurz ein (Datenbank-Ebene).
type Row = Record<string, unknown>;
const rows = async <T = Row>(q: ReturnType<typeof sql>): Promise<T[]> => {
  const r = await db.execute(q);
  return ((r as { rows?: T[] }).rows ?? (r as unknown as T[]));
};

afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSettings();
});

/** Einstellungen zurück auf die Vorgabe (Wartungsausnahme nur im Test). */
async function resetSettings() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
    await tx.execute(sql`update settings set value = to_jsonb('off'::text) where key = 'evidence_enforcement'`);
    await tx.execute(sql`update settings set value = to_jsonb('js'::text) where key = 'evidence_clock_source'`);
  });
}

/** Zwei Teams in "Hallenort2", zwei Hallen mit Betreiber, eine ohne; der Termin steht in 5 Tagen, die Hallen sind angefragt (Runde 1). */
async function duel() {
  const a = await makeUser("ha");
  const b = await makeUser("hb");
  const manager = await makeUser("hm");
  const other = await makeUser("ho"); // zweites Konto ohne Zugang
  const ta = await makeTeam(a.id, "Antwort A");
  const tb = await makeTeam(b.id, "Antwort B");
  await db.update(teams).set({ city: "Hallenort2" }).where(inArray(teams.id, [ta.id, tb.id]));
  const vs = await db
    .insert(venues)
    .values([1, 2, 3].map((i) => ({ name: `E2E Hallenort2 ${i} ${manager.id.slice(0, 6)}`, city: "Hallenort2", isPartner: i < 3 })))
    .returning();
  await grantVenueAccess(vs[0].id, manager.id);
  await grantVenueAccess(vs[1].id, manager.id);
  const id = await challengeTeam(a.id, ta.id, tb.id);
  await acceptChallenge(b.id, id);
  await proposeOption(a.id, id, { startsAt: new Date(Date.now() + 5 * 86_400_000) });
  const [opt] = await db.select().from(matchOptions).where(eq(matchOptions.matchId, id));
  await voteOption(b.id, id, opt.id);
  return { a, b, manager, other, id, v: vs };
}

const evidenceOf = (matchId: string, venueId: string) =>
  rows<{ kind: string; reason_code: string; reason: string | null; reason_commitment: string; deadline_at: Date | null; decided_at: Date | null; hash_version: number }>(
    sql`select kind, reason_code, reason, reason_commitment, deadline_at, decided_at, hash_version from booking_evidence where subject = 'match' and match_id = ${matchId} and venue_id = ${venueId} order by seq`,
  );
const statusOf = async (matchId: string, venueId: string) => (await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, matchId)).then((r) => r.find((x) => x.venueId === venueId)))?.status;

describe("Antwort des Betreibers (011 M2a-2)", () => {
  it("Zusage: accepted mit Actor (Name nur in evidence_actor), kein Grund, Frist und Entscheidungszeit gesetzt, decided_at <= deadline_at", async () => {
    const d = await duel();
    const res = await answerHallRequest(d.manager.id, d.id, d.v[0].id, true);
    expect(res).toEqual({ status: "answered" });
    const ev = await evidenceOf(d.id, d.v[0].id);
    const acc = ev.find((e) => e.kind === "accepted")!;
    expect(acc).toBeTruthy();
    expect(acc.reason_code).toBe("");
    expect(acc.reason).toBeNull();
    expect(acc.deadline_at).not.toBeNull();
    expect(acc.decided_at!.getTime()).toBeLessThanOrEqual(acc.deadline_at!.getTime());
    const actors = await rows<{ user_id: string }>(sql`select a.user_id from evidence_actor a join booking_evidence e on e.id = a.evidence_id where e.match_id = ${d.id} and e.kind = 'accepted'`);
    expect(actors.map((x) => x.user_id)).toContain(d.manager.id);
  });

  it("Ablehnung mit Kategorie und Anmerkung: reason_code im Datensatz, Commitment im Hash, Klartext (bereinigt) nur in der Nebentabelle, Version 2", async () => {
    const d = await duel();
    await answerHallRequest(d.manager.id, d.id, d.v[1].id, false, { reasonCode: "sonstiges", reason: "  Platz   gesperrt  " });
    expect(await statusOf(d.id, d.v[1].id)).toBe("declined");
    const dec = (await evidenceOf(d.id, d.v[1].id)).find((e) => e.kind === "declined")!;
    expect(dec).toMatchObject({ reason_code: "sonstiges", reason: null, hash_version: 2 });
    expect(dec.reason_commitment).toMatch(/^[0-9a-f]{64}$/);
    const text = await rows<{ reason: string }>(sql`select t.reason from booking_evidence_reason_text t join booking_evidence e on e.id = t.evidence_id where e.match_id = ${d.id} and e.venue_id = ${d.v[1].id} and e.kind = 'declined'`);
    expect(text.map((x) => x.reason)).toEqual(["Platz gesperrt"]);
  });

  it("Ablehnung ohne Kategorie, mit zu kurzem Text oder „sonstiges“ ohne Text: Eingabefehler, Zeile bleibt pending, kein Beweiseintrag declined", async () => {
    const d = await duel();
    for (const opts of [{}, { reasonCode: "", reason: "" }, { reasonCode: "unbekannt" }, { reasonCode: "belegt", reason: "ab" }, { reasonCode: "sonstiges", reason: "" }]) {
      await expect(answerHallRequest(d.manager.id, d.id, d.v[0].id, false, opts)).rejects.toThrow();
    }
    expect(await statusOf(d.id, d.v[0].id)).toBe("pending");
    expect((await evidenceOf(d.id, d.v[0].id)).filter((e) => e.kind === "declined")).toHaveLength(0);
  });

  it("zwei Zeilen, zwei Gründe in EINER Transaktion: jeder Eintrag trägt seinen Grund (Schlüssel je Zeile, echte UUIDs), keine Ablehnung scheitert beim COMMIT", async () => {
    const d = await duel();
    await db.transaction(async (tx) => {
      for (const [venue, code, text] of [[d.v[0].id, "belegt", "Turnier im Haus"], [d.v[1].id, "wartung", ""]] as const) {
        await tx.execute(sql`select set_config(evidence_session_key('evidence_reason_code', ${d.id}::uuid, ${venue}::uuid), ${code}, true), set_config(evidence_session_key('evidence_reason', ${d.id}::uuid, ${venue}::uuid), ${text}, true)`);
        await tx.update(matchHallRequests).set({ status: "declined", answeredBy: d.manager.id, answeredAt: new Date() }).where(sql`${matchHallRequests.matchId} = ${d.id} and ${matchHallRequests.venueId} = ${venue}`);
      }
    });
    const a = (await evidenceOf(d.id, d.v[0].id)).find((e) => e.kind === "declined")!;
    const b = (await evidenceOf(d.id, d.v[1].id)).find((e) => e.kind === "declined")!;
    expect(a.reason_code).toBe("belegt");
    expect(b.reason_code).toBe("wartung");
    expect(a.reason_commitment).not.toBe(b.reason_commitment);
  });

  it("Ablauf ohne Antwort: expired, kein Grund, kein Actor", async () => {
    const d = await duel();
    await db.update(matches).set({ vetoTurnDeadline: new Date(Date.now() - 60_000) }).where(eq(matches.id, d.id));
    await advanceVetos(new Date());
    const exp = (await evidenceOf(d.id, d.v[0].id)).find((e) => e.kind === "expired");
    expect(exp).toBeTruthy();
    expect(exp!.reason_code).toBe("");
    expect(await rows(sql`select 1 from evidence_actor a join booking_evidence e on e.id = a.evidence_id where e.match_id = ${d.id} and e.kind = 'expired'`)).toHaveLength(0);
  });

  it("Antwort nach Fristende (Job noch nicht gelaufen): late, Zeile unverändert, kein accepted, genau EIN late_attempt, auch beim zweiten Versuch", async () => {
    const d = await duel();
    await db.update(matches).set({ vetoTurnDeadline: new Date(Date.now() - 60_000) }).where(eq(matches.id, d.id));
    expect(await answerHallRequest(d.manager.id, d.id, d.v[0].id, true)).toEqual({ status: "late" });
    expect(await answerHallRequest(d.manager.id, d.id, d.v[0].id, false, { reasonCode: "belegt" })).toEqual({ status: "late" });
    expect(await statusOf(d.id, d.v[0].id)).toBe("pending");
    const ev = await evidenceOf(d.id, d.v[0].id);
    expect(ev.filter((e) => e.kind === "accepted")).toHaveLength(0);
    expect(ev.filter((e) => e.kind === "late_attempt")).toHaveLength(1);
  });

  it("Frist noch nicht verstrichen (in 30 Sekunden): Antwort zulässig; ohne Zugang kein late_attempt", async () => {
    const d = await duel();
    await db.update(matches).set({ vetoTurnDeadline: new Date(Date.now() + 30_000) }).where(eq(matches.id, d.id));
    expect(await answerHallRequest(d.manager.id, d.id, d.v[0].id, true)).toEqual({ status: "answered" });
    const d2 = await duel();
    await db.update(matches).set({ vetoTurnDeadline: new Date(Date.now() - 60_000) }).where(eq(matches.id, d2.id));
    await expect(answerHallRequest(d2.other.id, d2.id, d2.v[0].id, true)).rejects.toThrow(/nicht zu deinem Konto/);
    expect((await evidenceOf(d2.id, d2.v[0].id)).filter((e) => e.kind === "late_attempt")).toHaveLength(0);
  });

  it("veraltete Seite: Aktion der alten Runde wird abgelehnt, die Anfrage bleibt pending; mit der aktuellen Runde geht es", async () => {
    const d = await duel();
    const round = await currentRoundOf(db, d.id);
    expect(round).toBeGreaterThanOrEqual(1);
    expect((await pendingHallInquiries(d.manager.id)).find((q) => q.matchId === d.id)?.round).toBe(round);
    await expect(answerHallRequest(d.manager.id, d.id, d.v[0].id, true, { round: round - 1 })).rejects.toThrow(/geändert/);
    expect(await statusOf(d.id, d.v[0].id)).toBe("pending");
    expect(await answerHallRequest(d.manager.id, d.id, d.v[0].id, true, { round })).toEqual({ status: "answered" });
  });

  it("Frist = min(12 h, Anstoß − 1 h); Vorlauf unter 1 h: Hallen mit Zugang bekommen keine Anfrage (P11)", async () => {
    const d = await duel();
    const start5h = new Date(Date.now() + 5 * 3_600_000);
    await db.update(matches).set({ startsAt: start5h }).where(eq(matches.id, d.id));
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, d.id));
      await startHallCheck(tx, m, "Hallenort2", new Date());
    });
    const [m5] = await db.select().from(matches).where(eq(matches.id, d.id));
    expect(m5.vetoTurnDeadline!.getTime()).toBeLessThanOrEqual(start5h.getTime() - 3_600_000 + 1000);
    expect(m5.vetoTurnDeadline!.getTime()).toBeGreaterThan(Date.now() + 3 * 3_600_000);
    // Vorlauf 40 Minuten: kein Fenster, keine pending-Zeile für Hallen mit Zugang
    await db.update(matches).set({ startsAt: new Date(Date.now() + 40 * 60_000), vetoStatus: "halls", status: "lobby" }).where(eq(matches.id, d.id));
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, d.id));
      await startHallCheck(tx, m, "Hallenort2", new Date());
    });
    const reqs = await db.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, d.id));
    expect(reqs.filter((r) => r.status === "pending")).toHaveLength(0);
    expect(reqs.some((r) => r.venueId === d.v[0].id || r.venueId === d.v[1].id)).toBe(false);
  });

  it("Beweispflicht an (Datenbank-Ebene, App-Prüfung umgangen): Ablehnung ohne Grund und Antwort nach Fristende werden vom Trigger abgelehnt; Antwort mit Grund geht", async () => {
    const d = await duel();
    try {
      await db.execute(sql`select evidence_set_setting('evidence_clock_source', 'db', ${d.manager.id}::uuid, 'Test')`);
      await db.execute(sql`select evidence_set_setting('evidence_enforcement', 'on', ${d.manager.id}::uuid, 'Test')`);
      // ohne Sitzungswert: EV002
      await expect(
        db.transaction((tx) => tx.update(matchHallRequests).set({ status: "declined", answeredBy: d.manager.id, answeredAt: new Date() }).where(sql`${matchHallRequests.matchId} = ${d.id} and ${matchHallRequests.venueId} = ${d.v[0].id}`)),
      ).rejects.toThrow();
      expect(await statusOf(d.id, d.v[0].id)).toBe("pending");
      // nach Fristende: EV001
      await db.update(matches).set({ vetoTurnDeadline: new Date(Date.now() - 60_000) }).where(eq(matches.id, d.id));
      await expect(
        db.transaction((tx) => tx.update(matchHallRequests).set({ status: "confirmed", answeredBy: d.manager.id, answeredAt: new Date() }).where(sql`${matchHallRequests.matchId} = ${d.id} and ${matchHallRequests.venueId} = ${d.v[0].id}`)),
      ).rejects.toThrow();
      // Frist wieder offen, über die App mit Grund: geht
      await db.update(matches).set({ vetoTurnDeadline: new Date(Date.now() + 3_600_000) }).where(eq(matches.id, d.id));
      expect(await answerHallRequest(d.manager.id, d.id, d.v[0].id, false, { reasonCode: "veranstaltung", reason: "" })).toEqual({ status: "answered" });
      const dec = (await evidenceOf(d.id, d.v[0].id)).find((e) => e.kind === "declined")!;
      expect(dec.reason_code).toBe("veranstaltung");
    } finally {
      await resetSettings();
    }
  });
});
