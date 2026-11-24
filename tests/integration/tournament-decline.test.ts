import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges } from "@/db/schema";
import { bookingEvidence, bookingEvidenceReasonText, evidenceActor, venueAccess, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { verifyEvidenceChain } from "@/server/evidence";
import { setSetting } from "@/server/settings";
import { confirmTournamentVenue, declineTournamentVenue, listTournamentConfirmations, notifyHallConfirmReminders } from "@/server/tournament-confirm";
import { resetVenueConfirmationIfTermsChanged } from "@/server/tournament-venue";
import { cleanup, makeUser } from "./helpers";

// Backlog 161 (Plan docs/design/plan-turnier-ablehnen.md, PR 1): die Halle lehnt ein Turnier mit Grund-Kategorie ab. Der Beweiseintrag kind = 'declined' entsteht durch den DEFERRABLE-Trigger
// (Migration 0059); die Runde zaehlt die bisherigen 'declined' des Turniers (jede neue Ablehnung = neue Runde); ab der ersten Abbuchungszeile ist Ablehnen gesperrt.

beforeAll(() => setSetting(null, "card_payments_enabled", true));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const DAY = 86_400_000;
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;
const NEUTRAL = /lässt sich gerade nicht ablehnen/;
const FREITEXT = "Wasserschaden im Hallenboden geheim-4711";

async function fixture(over: Partial<typeof tournaments.$inferInsert> = {}) {
  const org = await makeUser("org");
  const boss = await makeUser("boss");
  const [v] = await db.insert(venues).values({ name: `E2E Halle ABL ${nid("v")}`, city: "Essen", isPartner: true, active: true }).returning();
  await db.insert(venueAccess).values({ venueId: v.id, userId: boss.id, status: "active", assignedAt: new Date() });
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: nid("Ablehn-Cup"),
      city: "Essen",
      startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10),
      format: "knockout",
      maxTeams: 4,
      totalCents: 16000,
      hourlyCents: 8000,
      durationMin: 120,
      status: "payment",
      registrationDeadline: new Date(Date.now() + 4 * DAY),
      startsAt: new Date(Date.now() + 6 * DAY),
      isPrivate: false,
      venueId: v.id,
      venueAccessRequiredSnapshot: true,
      commissionPercentSnapshot: "10.00",
      finalShareCents: 1000,
      ...over,
    } as typeof tournaments.$inferInsert)
    .returning();
  return { org, boss, v, t };
}
/** Drizzle verpackt Datenbankfehler ("Failed query"): Meldung und SQLSTATE stehen in cause. */
async function pgError(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return ((e as { cause?: { message: string; code?: string } }).cause ?? (e as { message: string })) as { message: string; code?: string };
  }
  throw new Error("kein Fehler");
}
const rowOf = async (id: string) => (await db.select().from(tournaments).where(eq(tournaments.id, id)))[0];
const evidenceOf = (tid: string, kind?: string) =>
  db
    .select()
    .from(bookingEvidence)
    .where(and(eq(bookingEvidence.tournamentId, tid), eq(bookingEvidence.subject, "tournament"), ...(kind ? [eq(bookingEvidence.kind, kind)] : [])));

describe("Turnier-Ablehnen: Ablehnung der Halle", () => {
  it("Betreiber lehnt ab: Spalten gesetzt, genau EIN Beweiseintrag declined (Runde 1, Kategorie, Akteur), Freitext nur im Beweisprotokoll, Audit ohne Freitext, Mitteilung ohne Freitext und ohne Betreiber; zweiter Aufruf idempotent; Kette gueltig", async () => {
    const { org, boss, v, t } = await fixture();
    expect(await declineTournamentVenue(boss.id, t.id, { code: "wartung", text: FREITEXT })).toEqual({ declined: true });
    const row = await rowOf(t.id);
    expect(row).toMatchObject({ venueDeclineCode: "wartung", venueDeclinedBy: boss.id, venueConfirmedAt: null });
    expect(row.venueDeclinedAt).not.toBeNull();
    const ev = await evidenceOf(t.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "declined", round: 1, venueId: v.id, reasonCode: "wartung", deadlineAt: null, matchId: null, enforced: null });
    expect(ev[0].decidedAt).not.toBeNull();
    expect(ev[0].statementAt?.getTime()).toBe(ev[0].decidedAt?.getTime());
    expect((await db.select().from(evidenceActor).where(eq(evidenceActor.evidenceId, ev[0].id)))[0]?.userId).toBe(boss.id);
    expect((await db.select().from(bookingEvidenceReasonText).where(eq(bookingEvidenceReasonText.evidenceId, ev[0].id)))[0]?.reason).toBe(FREITEXT);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.action, "tournament.venue_decline"), eq(auditLog.entityId, t.id)));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain("geheim-4711");
    const note = (await db.select().from(notifications).where(and(eq(notifications.userId, org.id), eq(notifications.title, "Die Halle hat abgesagt"))))[0];
    expect(note.body).toContain("Grund: Geschlossen oder Wartung");
    expect(note.body).toContain("wählt eine andere Halle oder sagt das Turnier ab");
    expect(note.body).not.toContain("geheim-4711");
    expect(note.body).not.toContain(boss.name ?? "@@");
    expect(await declineTournamentVenue(boss.id, t.id, { code: "wartung" })).toEqual({ declined: false });
    expect(await evidenceOf(t.id)).toHaveLength(1);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("ohne Freitext: Eintrag ohne Klartext; parallele Ablehnungen: genau eine wirkt, genau ein Beweiseintrag", async () => {
    const { boss, t } = await fixture();
    const results = await Promise.all([1, 2, 3].map(() => declineTournamentVenue(boss.id, t.id, { code: "belegt" })));
    expect(results.filter((r) => r.declined)).toHaveLength(1);
    const ev = await evidenceOf(t.id, "declined");
    expect(ev).toHaveLength(1);
    expect(await db.select().from(bookingEvidenceReasonText).where(eq(bookingEvidenceReasonText.evidenceId, ev[0].id))).toHaveLength(0);
  });

  it("Eingaben: Kategorie Pflicht, 'sonstiges' braucht eine Begruendung, Laenge 3 bis 200; nichts wird gespeichert", async () => {
    const { boss, t } = await fixture();
    await expect(declineTournamentVenue(boss.id, t.id, {})).rejects.toThrow(/wähle einen Grund/);
    await expect(declineTournamentVenue(boss.id, t.id, { code: "erfunden" })).rejects.toThrow(/wähle einen Grund/);
    await expect(declineTournamentVenue(boss.id, t.id, { code: "sonstiges" })).rejects.toThrow(/3 bis 200/);
    await expect(declineTournamentVenue(boss.id, t.id, { code: "belegt", text: "x".repeat(201) })).rejects.toThrow(/3 bis 200/);
    expect((await rowOf(t.id)).venueDeclinedAt).toBeNull();
    expect(await evidenceOf(t.id)).toHaveLength(0);
  });

  it("Berechtigung ZUERST: wer keinen Zugang zur Halle des Turniers hat, bekommt fuer unbekannt/abgesagt/fixiert/ohne Snapshot/zugesagt dieselbe neutrale Meldung (auch bei ungueltiger Kategorie)", async () => {
    const stranger = await makeUser("str");
    const confirmed = await fixture();
    await confirmTournamentVenue(confirmed.boss.id, confirmed.t.id);
    const ids = [
      (await fixture()).t.id,
      (await fixture({ status: "cancelled" })).t.id,
      (await fixture({ bracketGeneratedAt: new Date(), status: "running" })).t.id,
      (await fixture({ venueAccessRequiredSnapshot: false })).t.id,
      "00000000-0000-4000-8000-000000000000",
      "kein-uuid",
    ];
    for (const id of ids) await expect(declineTournamentVenue(stranger.id, id, { code: "belegt" })).rejects.toThrow(NEUTRAL);
    await expect(declineTournamentVenue(stranger.id, ids[0], { code: "" })).rejects.toThrow(NEUTRAL); // Eingabefehler verraet dem Unberechtigten nichts
    expect((await rowOf(ids[0])).venueDeclinedAt).toBeNull();
    // der Betreiber selbst: zugesagt und abgesagt sind nicht ablehnbar
    await expect(declineTournamentVenue(confirmed.boss.id, confirmed.t.id, { code: "belegt" })).rejects.toThrow(NEUTRAL); // Zusage gilt
    expect((await rowOf(confirmed.t.id)).venueDeclinedAt).toBeNull();
    const cancelled = await fixture({ status: "cancelled" });
    await expect(declineTournamentVenue(cancelled.boss.id, cancelled.t.id, { code: "belegt" })).rejects.toThrow(NEUTRAL);
  });

  it("RANDFALL: nach der ersten Abbuchungszeile ist Ablehnen gesperrt (neutrale Meldung, nichts gespeichert, kein Beweiseintrag)", async () => {
    const { boss, org, t } = await fixture();
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: org.id, amountCents: 1000, idempotencyKey: `abl:${t.id}:${org.id}` });
    await expect(declineTournamentVenue(boss.id, t.id, { code: "belegt" })).rejects.toThrow(NEUTRAL);
    const row = await rowOf(t.id);
    expect(row.venueDeclinedAt).toBeNull();
    expect(row.venueDeclineCode).toBeNull();
    expect(await evidenceOf(t.id, "declined")).toHaveLength(0);
    const list = await listTournamentConfirmations(boss.id);
    expect(list.find((x) => x.tournamentId === t.id)?.chargesStarted).toBe(true);
  });

  it("Frist ueberschritten: abgelehnt mit Meldung zur Frist, nichts gespeichert", async () => {
    const { boss, t } = await fixture();
    await expect(declineTournamentVenue(boss.id, t.id, { code: "belegt" }, { now: new Date(Date.now() + 10 * DAY) })).rejects.toThrow(/Frist ist vorbei/);
    expect((await rowOf(t.id)).venueDeclinedAt).toBeNull();
  });
});

describe("Turnier-Ablehnen: Runden, Ruecksetzen, Zusage danach, Liste, Erinnerung", () => {
  it("jede neue Ablehnung ist eine neue Runde: Ablehnung, Hallenwechsel (setzt zurueck), Rueckwechsel, erneute Ablehnung derselben Halle = zwei Eintraege (Runden 1 und 2)", async () => {
    const { boss, v, t } = await fixture();
    const [other] = await db.insert(venues).values({ name: `E2E Halle ABL2 ${nid("v")}`, city: "Essen", isPartner: true, active: true }).returning();
    await declineTournamentVenue(boss.id, t.id, { code: "belegt" });
    await db.update(tournaments).set({ venueId: other.id }).where(eq(tournaments.id, t.id));
    let row = await rowOf(t.id);
    expect(row).toMatchObject({ venueDeclinedAt: null, venueDeclinedBy: null, venueDeclineCode: null }); // der Hallenwechsel setzt die Ablehnung zurueck
    await db.update(tournaments).set({ venueId: v.id }).where(eq(tournaments.id, t.id));
    await declineTournamentVenue(boss.id, t.id, { code: "veranstaltung" });
    row = await rowOf(t.id);
    expect(row.venueDeclineCode).toBe("veranstaltung");
    const ev = (await evidenceOf(t.id, "declined")).sort((a, b) => a.round - b.round);
    expect(ev.map((e) => [e.round, e.reasonCode])).toEqual([[1, "belegt"], [2, "veranstaltung"]]);
    expect((await verifyEvidenceChain()).ok).toBe(true);
  });

  it("Zusage nach Ablehnung: die Ablehnung entfaellt (nie beides), ein accepted-Eintrag; das Turnier ist wieder zusagbar", async () => {
    const { boss, t } = await fixture();
    await declineTournamentVenue(boss.id, t.id, { code: "belegt" });
    expect(await confirmTournamentVenue(boss.id, t.id)).toEqual({ confirmed: true });
    const row = await rowOf(t.id);
    expect(row.venueConfirmedAt).not.toBeNull();
    expect(row).toMatchObject({ venueDeclinedAt: null, venueDeclinedBy: null, venueDeclineCode: null });
    expect((await evidenceOf(t.id)).map((e) => e.kind).sort()).toEqual(["accepted", "declined"]);
  });

  it("Reset bei geaenderten Bedingungen (Termin/Dauer/Miete) setzt auch die Ablehnung zurueck", async () => {
    const { boss, t } = await fixture();
    await declineTournamentVenue(boss.id, t.id, { code: "belegt" });
    const row = await rowOf(t.id);
    const terms = { venueId: row.venueId, startsAt: row.startsAt, durationMin: row.durationMin, totalCents: row.totalCents };
    expect(await db.transaction((tx) => resetVenueConfirmationIfTermsChanged(tx, t.id, terms, { ...terms }))).toBe(false);
    expect((await rowOf(t.id)).venueDeclinedAt).not.toBeNull();
    expect(await db.transaction((tx) => resetVenueConfirmationIfTermsChanged(tx, t.id, terms, { ...terms, durationMin: 180 }))).toBe(true);
    expect(await rowOf(t.id)).toMatchObject({ venueDeclinedAt: null, venueDeclineCode: null });
  });

  it("Liste der Halle: abgelehnte Turniere stehen mit declined = true (die Halle kann noch zusagen); Erinnerung nach der Ablehnung nennt die Absage der Halle (ohne Rechtsfolge, ohne Freitext)", async () => {
    const { org, boss, t } = await fixture();
    await declineTournamentVenue(boss.id, t.id, { code: "belegt", text: FREITEXT });
    const item = (await listTournamentConfirmations(boss.id)).find((x) => x.tournamentId === t.id);
    expect(item).toMatchObject({ declined: true, chargesStarted: false });
    const due = new Date(Date.now() + 4 * DAY);
    expect(await notifyHallConfirmReminders(new Date(due.getTime() - 23 * 3_600_000))).toBeGreaterThanOrEqual(1);
    const reminder = (await db.select().from(notifications).where(and(eq(notifications.userId, org.id), eq(notifications.title, "Die Halle hat abgesagt"))))
      .map((x) => x.body)
      .find((b) => b.includes("Die Frist ist in etwa"));
    expect(reminder).toContain("Wähle eine andere Halle oder sage das Turnier ab.");
    expect(reminder).not.toContain("geheim-4711");
    expect(reminder).not.toMatch(/Erstattung|abgebucht|Zahlung/);
  });
});

describe("Turnier-Ablehnen: Datenbankebene (Migration 0059)", () => {
  it("CHECKs: Zusage und Ablehnung nie gemeinsam, Ablehnung braucht Kategorie und Halle, Kategorie nur aus der Liste", async () => {
    const { boss, t } = await fixture();
    await confirmTournamentVenue(boss.id, t.id);
    // Zusage steht: ein roher UPDATE mit Ablehnung bleibt ohne Wirkung (der BEFORE-Trigger loescht die Ablehnung neben einer Zusage), kein Beweiseintrag declined
    await db.execute(sql`update tournaments set venue_declined_at = now(), venue_declined_by = ${boss.id}, venue_decline_code = 'belegt' where id = ${t.id}`);
    expect(await rowOf(t.id)).toMatchObject({ venueDeclinedAt: null, venueDeclineCode: null });
    expect(await evidenceOf(t.id, "declined")).toHaveLength(0);
    const b = await fixture();
    await expect(db.execute(sql`update tournaments set venue_declined_at = now() where id = ${b.t.id}`)).rejects.toThrow(); // ohne Kategorie
    await expect(db.execute(sql`update tournaments set venue_declined_at = now(), venue_decline_code = 'erfunden' where id = ${b.t.id}`)).rejects.toThrow();
    await expect(db.execute(sql`update tournaments set venue_declined_at = now(), venue_decline_code = '' where id = ${b.t.id}`)).rejects.toThrow();
    expect((await rowOf(b.t.id)).venueDeclinedAt).toBeNull();
    expect(await evidenceOf(b.t.id, "declined")).toHaveLength(0);
  });

  it("Trigger-Pruefung: roher UPDATE mit 'sonstiges' ohne Begruendung scheitert beim Commit (EV002), nichts wird gespeichert; mit Begruendung gelingt er und schreibt den Eintrag", async () => {
    const { boss, t } = await fixture();
    const err = await pgError(db.execute(sql`update tournaments set venue_declined_at = now(), venue_declined_by = ${boss.id}, venue_decline_code = 'sonstiges' where id = ${t.id}`));
    expect(err.code).toBe("EV002");
    expect((await rowOf(t.id)).venueDeclinedAt).toBeNull();
    expect(await evidenceOf(t.id, "declined")).toHaveLength(0);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(evidence_session_key('evidence_reason', ${t.id}::uuid, ${t.venueId}::uuid), 'Halle wegen Umbau zu', true)`);
      await tx.execute(sql`update tournaments set venue_declined_at = now(), venue_declined_by = ${boss.id}, venue_decline_code = 'sonstiges' where id = ${t.id}`);
    });
    expect(await evidenceOf(t.id, "declined")).toHaveLength(1);
  });

  it("Beweisprotokoll: Turnier-Eintraege kennen nur accepted und declined (CHECK), andere Arten scheitern", async () => {
    const { t, v } = await fixture();
    await expect(
      db.execute(sql`insert into booking_evidence (hash_version, subject, tournament_id, venue_id, round, kind, decided_at, statement_at) values (2, 'tournament', ${t.id}, ${v.id}, 1, 'expired', now(), now())`),
    ).rejects.toThrow();
  });

  it("Rundenmodus: evidence_emit lehnt eine unpassende Art/Modus-Kombination fuer Turniere ab", async () => {
    const { t, v } = await fixture();
    const err = await pgError(db.execute(sql`select evidence_emit('tournament', NULL, ${t.id}::uuid, ${v.id}::uuid, NULL, 'declined', 'accepted_count', NULL, 'belegt', NULL, NULL, now(), now(), NULL)`));
    expect(err.message).toMatch(/passt nicht/);
  });
});
