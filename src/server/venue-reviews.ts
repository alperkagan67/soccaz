// Hallenbewertung (Vertrag 010 M1, PR 1: Berechtigung, Frist, Speichern; Plan docs/design/plan-010-m1-hallenbewertung.md). Keine Oberfläche, kein Geld, kein Beweisprotokoll.
// Berechtigung "hat dort gespielt": Teilnehmer (nicht als Nichterscheinen markiert) eines abgeschlossenen, bestätigten Team- oder Privatspiels dieser Halle; bei Turnieren "hat am Turnier dort gespielt"
// (Spieler eines beendeten Turniers dieser Halle, EINE Bewertung je Turnier, Halle und Nutzer). Frist: 7 Tage ab Spielende (Datenbankuhr). Jeder Mangel bekommt dieselbe neutrale Meldung.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { venueReviews } from "@/db/schema-content";
import { checkReviewText } from "@/lib/review-text";
import { REVIEW_WINDOW_DAYS, validateScores, type ReviewCategory, type ReviewScores } from "@/lib/venue-review";
import { audit } from "./audit";
import { DomainError } from "./teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REVIEW_NOT_POSSIBLE = "Diese Halle lässt sich für dieses Spiel nicht bewerten.";
export const REVIEW_ALREADY = "Du hast dieses Spiel schon bewertet.";

/** Eingabefehler an Feldern (Kategorien, Text): die Aktion gibt sie als fieldErrors zurück, der eingegebene Text bleibt in der Oberfläche erhalten. */
export class ReviewInputError extends DomainError {
  constructor(public fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? "Bitte prüfe deine Eingabe.");
  }
}

export type ReviewTarget = { kind: "match" | "tournament"; id: string };
export type ReviewInput = ReviewTarget & { scores: Partial<Record<ReviewCategory, unknown>>; text?: string | null };
export type Reviewable = { kind: "match" | "tournament"; targetId: string; venueId: string; venueName: string; endedAt: Date; deadline: Date };

type Row = { venue_id: string; venue_name: string; ended_at: Date | string };
const nowSql = (now?: Date) => (now ? sql`${now.toISOString()}::timestamptz` : sql`now()`);
const toReviewable = (kind: "match" | "tournament", targetId: string, r: Row): Reviewable => {
  const endedAt = new Date(r.ended_at);
  return { kind, targetId, venueId: r.venue_id, venueName: r.venue_name, endedAt, deadline: new Date(endedAt.getTime() + REVIEW_WINDOW_DAYS * 86_400_000) };
};
/**
 * "Hat am Turnier dort gespielt" (security-Review #365): ein Eintrag in tournament_players genügt NICHT (auch Nichtzahler oder ein Team ohne Spiel stünden dort). Verlangt wird: der Spieler hat
 * Geld eingezahlt (paid_cents > 0) ODER sein Team hat an einem gespielten Turnierspiel teilgenommen (tournament_matches.played_at). Bekannte Grenze: ein Spieler seines Teams, das spielte, aber selbst nicht
 * auf dem Platz stand, gilt als "dabei" (der Plan kennt keine Aufstellung je Turnierspiel).
 */
const playedInTournament = sql`(tp.paid_cents > 0 or exists (select 1 from tournament_matches tm where tm.tournament_id = t.id and tm.played_at is not null and (tm.team_a = tp.team_id or tm.team_b = tp.team_id)))`;
/** Ende eines Turniers: Abrechnung, sonst Anstoß plus Dauer. */
const tournamentEnd = sql`coalesce(t.settled_at, t.starts_at + make_interval(mins => coalesce(t.duration_min, 0)))`;

/** Darf dieser Nutzer dieses Spiel bzw. Turnier jetzt bewerten (Berechtigung und Frist, noch ohne Prüfung auf eine vorhandene Bewertung)? null = nein, ohne Grund. */
export async function reviewEligibility(userId: string, target: ReviewTarget, opts: { now?: Date } = {}): Promise<Reviewable | null> {
  if (!UUID.test(userId) || !UUID.test(target.id)) return null;
  const now = nowSql(opts.now);
  const rows =
    target.kind === "match"
      ? await db.execute(sql`
          select m.venue_id, v.name as venue_name, m.finalized_at as ended_at
          from matches m
          join match_participants p on p.match_id = m.id and p.user_id = ${userId} and p.no_show = false
          join venues v on v.id = m.venue_id and v.approval_status = 'approved'
          where m.id = ${target.id} and m.kind in ('team', 'private') and m.status = 'played' and m.finalized_at is not null
            and ${now} >= m.finalized_at and ${now} < m.finalized_at + make_interval(days => ${REVIEW_WINDOW_DAYS})`)
      : await db.execute(sql`
          select t.venue_id, v.name as venue_name, ${tournamentEnd} as ended_at
          from tournaments t
          join tournament_players tp on tp.tournament_id = t.id and tp.user_id = ${userId}
          join venues v on v.id = t.venue_id and v.approval_status = 'approved'
          where t.id = ${target.id} and t.status = 'finished' and t.venue_id is not null and ${playedInTournament}
            and ${now} >= ${tournamentEnd} and ${now} < ${tournamentEnd} + make_interval(days => ${REVIEW_WINDOW_DAYS})`);
  const row = (rows.rows as Row[])[0];
  return row ? toReviewable(target.kind, target.id, row) : null;
}

/** Spiele und Turniere, die der Nutzer jetzt noch bewerten kann (in der Frist, noch keine eigene Bewertung): Grundlage für "Meine Spiele" (PR 4) und die Erinnerung (PR 3). */
export async function listReviewable(userId: string, opts: { now?: Date } = {}): Promise<Reviewable[]> {
  if (!UUID.test(userId)) return [];
  const now = nowSql(opts.now);
  const matches = await db.execute(sql`
    select m.id as target_id, m.venue_id, v.name as venue_name, m.finalized_at as ended_at
    from matches m
    join match_participants p on p.match_id = m.id and p.user_id = ${userId} and p.no_show = false
    join venues v on v.id = m.venue_id and v.approval_status = 'approved'
    where m.kind in ('team', 'private') and m.status = 'played' and m.finalized_at is not null
      and ${now} >= m.finalized_at and ${now} < m.finalized_at + make_interval(days => ${REVIEW_WINDOW_DAYS})
      and not exists (select 1 from venue_reviews r where r.match_id = m.id and r.user_id = ${userId})`);
  const tournaments = await db.execute(sql`
    select t.id as target_id, t.venue_id, v.name as venue_name, ${tournamentEnd} as ended_at
    from tournaments t
    join tournament_players tp on tp.tournament_id = t.id and tp.user_id = ${userId}
    join venues v on v.id = t.venue_id and v.approval_status = 'approved'
    where t.status = 'finished' and t.venue_id is not null and ${playedInTournament}
      and ${now} >= ${tournamentEnd} and ${now} < ${tournamentEnd} + make_interval(days => ${REVIEW_WINDOW_DAYS})
      and not exists (select 1 from venue_reviews r where r.tournament_id = t.id and r.venue_id = t.venue_id and r.user_id = ${userId})`);
  const out = [
    ...(matches.rows as (Row & { target_id: string })[]).map((r) => toReviewable("match", r.target_id, r)),
    ...(tournaments.rows as (Row & { target_id: string })[]).map((r) => toReviewable("tournament", r.target_id, r)),
  ];
  return out.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
}

/**
 * Bewertung speichern. Reihenfolge: ERST die Berechtigung (neutrale Meldung bei jedem Mangel: Gast, fremdes Spiel, Nichterscheinen, nicht abgeschlossen, andere Halle, nicht freigegebene Halle, Frist
 * vorbei), DANN die Eingabe (Kategorien 1 bis 5, Text ohne Kontaktdaten), dann der eindeutige Schlüssel (einmal je Spiel bzw. je Turnier, Halle und Nutzer; parallele Aufrufe: genau einer gewinnt).
 * Audit ohne Text. Der Text steht nur in der Bewertung.
 */
export async function submitVenueReview(userId: string, input: ReviewInput, opts: { now?: Date } = {}): Promise<{ id: string }> {
  const target = await reviewEligibility(userId, { kind: input.kind, id: input.id }, opts);
  if (!target) throw new DomainError(REVIEW_NOT_POSSIBLE);
  const fieldErrors: Record<string, string> = {};
  const scores = validateScores(input.scores);
  if (!scores.ok) Object.assign(fieldErrors, scores.fieldErrors);
  const text = checkReviewText(input.text);
  if (!text.ok) fieldErrors.body = text.error;
  if (!scores.ok || !text.ok) throw new ReviewInputError(fieldErrors);
  return db.transaction(async (tx) => {
    const s: ReviewScores = scores.scores;
    const [row] = await tx
      .insert(venueReviews)
      .values({
        venueId: target.venueId,
        matchId: target.kind === "match" ? target.targetId : null,
        tournamentId: target.kind === "tournament" ? target.targetId : null,
        userId,
        floor: s.floor,
        changingRooms: s.changingRooms,
        cleanliness: s.cleanliness,
        showers: s.showers,
        parking: s.parking,
        body: text.text,
      })
      .onConflictDoNothing()
      .returning({ id: venueReviews.id });
    if (!row) throw new DomainError(REVIEW_ALREADY);
    await audit(userId, "venue.review", "venue", target.venueId, { after: { kind: target.kind, targetId: target.targetId } }, tx); // nie der Text
    return { id: row.id };
  });
}
