import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches } from "@/db/schema";
import { venueReviews } from "@/db/schema-content";
import { venues } from "@/db/schema-finance";
import { tournamentPlayers, tournaments } from "@/db/schema-league";
import { REVIEW_CONTACT_MESSAGE } from "@/lib/review-text";
import { REVIEW_SCORE_MESSAGE } from "@/lib/venue-review";
import { REVIEW_ALREADY, REVIEW_NOT_POSSIBLE, ReviewInputError, listReviewable, reviewEligibility, submitVenueReview } from "@/server/venue-reviews";
import { cleanup, makeUser } from "./helpers";

// Vertrag 010 M1 PR 1 (Plan docs/design/plan-010-m1-hallenbewertung.md): Hallenbewertung mit Kategorien. AC-1 (einmal je Spiel, nur wer dort gespielt hat), AC-2 (Berechtigung, neutrale Meldung), Frist 7 Tage
// (Datenbankuhr, hier mit vorgegebener Zeit), Turnier (eine Bewertung je Turnier, Halle und Nutzer), Eingabe (Kategorien 1 bis 5, Text ohne Kontaktdaten), parallele Aufrufe, CHECKs und UNIQUEs der Migration 0060.
const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/server/session", () => ({ requireUser: async () => session.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

afterAll(cleanup);

const DAY = 86_400_000;
const GOOD = { floor: 4, changingRooms: 3, cleanliness: 5, showers: 2, parking: 4 };
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++n}`;

async function venue(over: Partial<typeof venues.$inferInsert> = {}) {
  const [v] = await db.insert(venues).values({ name: `E2E Halle BEW ${nid("v")}`, city: "Essen", source: "manual", ...over }).returning();
  return v;
}
/** Ein gespieltes, abgeschlossenes Teamspiel in einer freigegebenen Halle; Teilnehmer sind die zwei Team-Admins (adminA, adminB). */
async function playedMatch(over: Partial<typeof matches.$inferInsert> = {}, venueOver: Partial<typeof venues.$inferInsert> = {}) {
  const { makeMatch } = await import("./helpers");
  const g = await makeMatch({ ledgerModel: "legacy" });
  const v = await venue(venueOver);
  const finalizedAt = new Date(Date.now() - 3_600_000);
  await db.update(matches).set({ venueId: v.id, status: "played", finalizedAt, ...over }).where(eq(matches.id, g.match.id));
  return { ...g, v, finalizedAt };
}
async function tournamentOf(playerIds: string[], over: Partial<typeof tournaments.$inferInsert> = {}) {
  const org = await makeUser("borg");
  const { makeTeam } = await import("./helpers");
  const team = await makeTeam(org.id, "Turnierteam");
  const v = await venue();
  const [t] = await db
    .insert(tournaments)
    .values({
      organizerId: org.id,
      name: nid("Bew-Cup"),
      city: "Essen",
      startsOn: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10),
      format: "knockout",
      maxTeams: 4,
      durationMin: 120,
      status: "finished",
      startsAt: new Date(Date.now() - 2 * DAY),
      isPrivate: false,
      venueId: v.id,
      ...over,
    } as typeof tournaments.$inferInsert)
    .returning();
  for (const userId of playerIds) await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId });
  return { org, team, v, t };
}
const rows = (where: ReturnType<typeof eq>) => db.select().from(venueReviews).where(where);
const fieldErrorsOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ReviewInputError) return e.fieldErrors;
    throw e;
  }
  throw new Error("kein Eingabefehler");
};
const pgError = async (p: Promise<unknown>): Promise<{ message: string; code?: string }> => {
  try {
    await p;
  } catch (e) {
    return ((e as { cause?: { message: string; code?: string } }).cause ?? (e as { message: string })) as { message: string; code?: string };
  }
  throw new Error("kein Fehler");
};

describe("AC-1: Bewertung eines Spiels, einmal je Spiel und Spieler", () => {
  it("Teilnehmer eines abgeschlossenen Spiels bewertet (fünf Kategorien, Text): gespeichert, Audit ohne Text; zweite Bewertung desselben Spiels abgelehnt", async () => {
    const g = await playedMatch();
    const text = "Boden top, 3:1 gewonnen, am 24.11.2026 um 8:30 Uhr, 20 Euro";
    const { id } = await submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD, text });
    const [r] = await rows(eq(venueReviews.id, id));
    expect(r).toMatchObject({ venueId: g.v.id, matchId: g.match.id, tournamentId: null, userId: g.adminA.id, floor: 4, changingRooms: 3, cleanliness: 5, showers: 2, parking: 4, body: text, status: "visible" });
    const a = await db.select().from(auditLog).where(and(eq(auditLog.action, "venue.review"), eq(auditLog.entityId, g.v.id)));
    expect(a).toHaveLength(1);
    expect(JSON.stringify(a[0].after)).not.toContain("Boden top"); // nie der Text im Audit
    await expect(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD })).rejects.toThrow(REVIEW_ALREADY);
    expect(await rows(eq(venueReviews.matchId, g.match.id))).toHaveLength(1);
    // der andere Teilnehmer darf dasselbe Spiel bewerten (eine Bewertung je Spiel UND Spieler), ohne Text
    await submitVenueReview(g.adminB.id, { kind: "match", id: g.match.id, scores: { ...GOOD, parking: 1 } });
    expect(await rows(eq(venueReviews.matchId, g.match.id))).toHaveLength(2);
  });
  it("Privatspiel ist bewertbar (kind private)", async () => {
    const g = await playedMatch({ kind: "private" });
    await expect(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD })).resolves.toHaveProperty("id");
  });
  it("parallele Aufrufe desselben Spielers: genau eine Bewertung, alle anderen 'schon bewertet'", async () => {
    const g = await playedMatch();
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of res.filter((x) => x.status === "rejected")) expect(String((r as PromiseRejectedResult).reason?.message)).toBe(REVIEW_ALREADY);
    expect(await rows(eq(venueReviews.matchId, g.match.id))).toHaveLength(1);
  });
});

describe("AC-2: Berechtigung 'hat dort gespielt', jeder Mangel gibt dieselbe neutrale Meldung", () => {
  it("Fremder Nutzer, Nichterscheinen, Spiel nicht gespielt/abgesagt/nicht abgeschlossen, Turnierspiel, keine Halle, nicht freigegebene Halle, unbekannte oder ungültige ID: abgelehnt, nichts gespeichert", async () => {
    const stranger = await makeUser("stranger");
    const g = await playedMatch();
    const fall = async (userId: string, matchId: string) => expect(submitVenueReview(userId, { kind: "match", id: matchId, scores: GOOD })).rejects.toThrow(REVIEW_NOT_POSSIBLE);
    await fall(stranger.id, g.match.id); // hat dort nicht gespielt
    await fall("00000000-0000-4000-8000-000000000000", g.match.id); // unbekanntes Konto
    await fall(g.adminA.id, "00000000-0000-4000-8000-000000000000"); // unbekanntes Spiel
    await fall(g.adminA.id, "keine-uuid");
    // Nichterscheinen
    await db.update(matchParticipants).set({ noShow: true }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.adminB.id)));
    await fall(g.adminB.id, g.match.id);
    for (const over of [{ status: "confirmed" as const }, { status: "cancelled" as const }, { status: "disputed" as const }, { finalizedAt: null }, { kind: "tournament" as const }, { venueId: null }]) {
      const x = await playedMatch(over);
      await fall(x.adminA.id, x.match.id);
    }
    const requested = await playedMatch({}, { approvalStatus: "requested", active: false });
    await fall(requested.adminA.id, requested.match.id);
    expect(await db.select().from(venueReviews).where(eq(venueReviews.userId, stranger.id))).toHaveLength(0);
  });
  it("Berechtigung kommt VOR der Eingabeprüfung: wer nicht bewerten darf, bekommt die neutrale Meldung, nie einen Feldfehler", async () => {
    const g = await playedMatch();
    const stranger = await makeUser("stranger2");
    await expect(submitVenueReview(stranger.id, { kind: "match", id: g.match.id, scores: {}, text: "mail me@x.de" })).rejects.toThrow(REVIEW_NOT_POSSIBLE);
  });
});

describe("Frist: 7 Tage ab Spielende (Datenbankuhr, hier mit vorgegebener Zeit)", () => {
  it("genau 7 Tage: eine Sekunde vorher erlaubt, zur Frist nicht mehr; vor dem Spielende nicht", async () => {
    const g = await playedMatch();
    const end = g.finalizedAt.getTime();
    expect(await reviewEligibility(g.adminA.id, { kind: "match", id: g.match.id }, { now: new Date(end - 1_000) })).toBeNull();
    expect(await reviewEligibility(g.adminA.id, { kind: "match", id: g.match.id }, { now: new Date(end) })).toMatchObject({ venueId: g.v.id });
    expect(await reviewEligibility(g.adminA.id, { kind: "match", id: g.match.id }, { now: new Date(end + 7 * DAY - 1_000) })).not.toBeNull();
    expect(await reviewEligibility(g.adminA.id, { kind: "match", id: g.match.id }, { now: new Date(end + 7 * DAY) })).toBeNull();
    await expect(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD }, { now: new Date(end + 8 * DAY) })).rejects.toThrow(REVIEW_NOT_POSSIBLE);
    await expect(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD }, { now: new Date(end + 6 * DAY) })).resolves.toHaveProperty("id");
  });
});

describe("Eingabe: Kategorien 1 bis 5 (Pflicht), Text ohne Kontaktdaten", () => {
  it("fehlende, 0, 6, Nachkommastellen und Text: Feldfehler je Kategorie, nichts gespeichert", async () => {
    const g = await playedMatch();
    const fe = await fieldErrorsOf(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: { floor: 0, changingRooms: 6, cleanliness: 2.5, showers: "x" } }));
    expect(fe).toEqual({ floor: REVIEW_SCORE_MESSAGE, changingRooms: REVIEW_SCORE_MESSAGE, cleanliness: REVIEW_SCORE_MESSAGE, showers: REVIEW_SCORE_MESSAGE, parking: REVIEW_SCORE_MESSAGE });
    expect(await rows(eq(venueReviews.matchId, g.match.id))).toHaveLength(0);
  });
  it("Kontaktdaten im Text werden abgewiesen (neutrale Meldung am Feld body), Text zu kurz/zu lang auch; nichts gespeichert; ein Fußballtext wird angenommen", async () => {
    const g = await playedMatch();
    for (const text of ["Ruf an 0201 123456", "mail@example.de", "www.halle.de", "ab"]) {
      const fe = await fieldErrorsOf(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD, text }));
      expect(Object.keys(fe)).toEqual(["body"]);
    }
    expect((await fieldErrorsOf(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD, text: "Ruf an 0201 123456" }))).body).toBe(REVIEW_CONTACT_MESSAGE);
    expect(await rows(eq(venueReviews.matchId, g.match.id))).toHaveLength(0);
    await expect(submitVenueReview(g.adminA.id, { kind: "match", id: g.match.id, scores: GOOD, text: "3:1, 5-0, 2. Liga, Halle 3, 18.30 Uhr" })).resolves.toHaveProperty("id");
  });
});

describe("Turnier: eine Bewertung je Turnier, Halle und Nutzer; 'hat am Turnier dort gespielt'", () => {
  it("Spieler eines beendeten Turniers bewertet; zweite Bewertung desselben Turniers abgelehnt; Nicht-Spieler, laufendes oder abgesagtes Turnier, ohne Halle: neutral abgelehnt", async () => {
    const player = await makeUser("tplayer");
    const other = await makeUser("tother");
    const x = await tournamentOf([player.id]);
    const { id } = await submitVenueReview(player.id, { kind: "tournament", id: x.t.id, scores: GOOD, text: "Schöne Halle" });
    expect((await rows(eq(venueReviews.id, id)))[0]).toMatchObject({ tournamentId: x.t.id, matchId: null, venueId: x.v.id, userId: player.id });
    await expect(submitVenueReview(player.id, { kind: "tournament", id: x.t.id, scores: GOOD })).rejects.toThrow(REVIEW_ALREADY);
    await expect(submitVenueReview(other.id, { kind: "tournament", id: x.t.id, scores: GOOD })).rejects.toThrow(REVIEW_NOT_POSSIBLE);
    for (const over of [{ status: "running" as const }, { status: "cancelled" as const }, { venueId: null }]) {
      const y = await tournamentOf([player.id], over);
      await expect(submitVenueReview(player.id, { kind: "tournament", id: y.t.id, scores: GOOD })).rejects.toThrow(REVIEW_NOT_POSSIBLE);
    }
    // ein anderes Turnier derselben Person ist wieder bewertbar
    const z = await tournamentOf([player.id]);
    await expect(submitVenueReview(player.id, { kind: "tournament", id: z.t.id, scores: GOOD })).resolves.toHaveProperty("id");
  });
  it("Frist beim Turnier ab Abrechnung (settled_at), sonst ab Anstoß plus Dauer", async () => {
    const player = await makeUser("tplayer2");
    const settled = new Date(Date.now() - 10 * DAY);
    const x = await tournamentOf([player.id], { settledAt: settled });
    expect(await reviewEligibility(player.id, { kind: "tournament", id: x.t.id })).toBeNull(); // 10 Tage her
    expect(await reviewEligibility(player.id, { kind: "tournament", id: x.t.id }, { now: new Date(settled.getTime() + 3 * DAY) })).not.toBeNull();
    const y = await tournamentOf([player.id]); // ohne settled_at: Anstoß vor 2 Tagen plus 120 Minuten
    expect(await reviewEligibility(player.id, { kind: "tournament", id: y.t.id })).not.toBeNull();
  });
});

describe("listReviewable: offene Bewertungen des Nutzers", () => {
  it("nennt Spiele und Turniere in der Frist ohne eigene Bewertung; nicht: bewertet, abgelaufen, Nichterscheinen", async () => {
    const a = await playedMatch();
    const old = await playedMatch({ finalizedAt: new Date(Date.now() - 9 * DAY) });
    const t = await tournamentOf([a.adminA.id]);
    const before = (await listReviewable(a.adminA.id)).map((r) => r.targetId);
    expect(before).toEqual(expect.arrayContaining([a.match.id, t.t.id]));
    expect(before).not.toContain(old.match.id);
    await submitVenueReview(a.adminA.id, { kind: "match", id: a.match.id, scores: GOOD });
    expect((await listReviewable(a.adminA.id)).map((r) => r.targetId)).not.toContain(a.match.id);
    await db.update(matchParticipants).set({ noShow: true }).where(and(eq(matchParticipants.matchId, a.match.id), eq(matchParticipants.userId, a.adminB.id)));
    expect((await listReviewable(a.adminB.id)).map((r) => r.targetId)).not.toContain(a.match.id);
    expect(await listReviewable("keine-uuid")).toEqual([]);
  });
});

describe("Migration 0060: CHECKs und UNIQUEs in der Datenbank", () => {
  it("genau ein Bezug (Spiel ODER Turnier), Kategorien 1 bis 5, Text 3 bis 500, Status aus der Liste", async () => {
    const g = await playedMatch();
    const base = { venueId: g.v.id, userId: g.adminA.id, floor: 3, changingRooms: 3, cleanliness: 3, showers: 3, parking: 3 };
    const t = await tournamentOf([g.adminA.id]);
    expect((await pgError(db.insert(venueReviews).values(base))).code).toBe("23514"); // weder Spiel noch Turnier
    expect((await pgError(db.insert(venueReviews).values({ ...base, matchId: g.match.id, tournamentId: t.t.id }))).code).toBe("23514"); // beides
    for (const bad of [{ floor: 0 }, { parking: 6 }, { body: "ab" }, { body: "x".repeat(501) }, { status: "gesperrt" as unknown as "visible" }])
      expect((await pgError(db.insert(venueReviews).values({ ...base, matchId: g.match.id, ...bad }))).code, JSON.stringify(bad)).toBe("23514");
    expect(await rows(eq(venueReviews.venueId, g.v.id))).toHaveLength(0);
  });
  it("UNIQUE je Spiel und Nutzer sowie je Turnier, Halle und Nutzer (auch ohne den Server)", async () => {
    const g = await playedMatch();
    const base = { venueId: g.v.id, userId: g.adminA.id, floor: 3, changingRooms: 3, cleanliness: 3, showers: 3, parking: 3 };
    await db.insert(venueReviews).values({ ...base, matchId: g.match.id });
    expect((await pgError(db.insert(venueReviews).values({ ...base, matchId: g.match.id }))).code).toBe("23505");
    const t = await tournamentOf([g.adminA.id]);
    await db.insert(venueReviews).values({ ...base, venueId: t.v.id, tournamentId: t.t.id });
    expect((await pgError(db.insert(venueReviews).values({ ...base, venueId: t.v.id, tournamentId: t.t.id }))).code).toBe("23505");
  });
  it("Konto gelöscht (user_id wird NULL): mehrere anonyme Zeilen bleiben möglich (kein UNIQUE auf NULL)", async () => {
    const g = await playedMatch();
    const base = { venueId: g.v.id, matchId: g.match.id, floor: 3, changingRooms: 3, cleanliness: 3, showers: 3, parking: 3 };
    await db.insert(venueReviews).values([{ ...base, userId: null }, { ...base, userId: null }]);
    expect(await rows(eq(venueReviews.matchId, g.match.id))).toHaveLength(2);
  });
});

describe("Server-Aktion submitVenueReviewAction", () => {
  it("Erfolg, Feldfehler (Kategorien, Text) und neutrale Meldung; die Eingabe bleibt Sache der Oberfläche", async () => {
    const { submitVenueReviewAction } = await import("@/server/venue-review-actions");
    const g = await playedMatch();
    const fd = (o: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ kind: "match", targetId: g.match.id, ...Object.fromEntries(Object.entries(GOOD).map(([k, v]) => [k, String(v)])), body: "", ...o })) f.set(k, v);
      return f;
    };
    session.user = { id: g.adminA.id, role: "player" };
    expect(await submitVenueReviewAction(undefined, fd({ body: "Ruf an 0201 123456", parking: "9" }))).toEqual({ fieldErrors: { parking: REVIEW_SCORE_MESSAGE, body: REVIEW_CONTACT_MESSAGE } });
    expect(await submitVenueReviewAction(undefined, fd({ body: "Gute Halle" }))).toEqual({ ok: true });
    expect(await submitVenueReviewAction(undefined, fd({}))).toEqual({ error: REVIEW_ALREADY });
    session.user = { id: (await makeUser("stranger3")).id, role: "player" };
    expect(await submitVenueReviewAction(undefined, fd({}))).toEqual({ error: REVIEW_NOT_POSSIBLE });
  });
});
