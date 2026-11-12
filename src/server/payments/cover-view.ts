// "Anteil übernehmen" (Vertrag 012, M3c-3b): Daten für die Lobby-Seite FÜR EINEN BETRACHTER. Die Sichtbarkeit wird hier auf dem Server entschieden (AC-12/AC-20, Plan Abschnitt 3 bis 5):
// die Seite und der Client bekommen nur Nutzer-IDs und Ja/Nein, nie Rohstatus, Fehlercodes oder Namen aus dieser Funktion (Namen stehen ohnehin in der Lobby-Liste).
//   - canCover: Plätze, neben denen der Betrachter den Knopf bekommt (coverTargets, nur Teilnehmer mit Karte, nur solange offen)
//   - covering: der Platz, dessen Anteil der Betrachter übernimmt (zum Zurücknehmen), releasable = noch vor der Frist
//   - covered: der eigene Platz des Betrachters ist übernommen ("Dein Anteil wird übernommen")
//   - pairs: nur für Captain/Veranstalter/Plattform-Admin: wer übernimmt wessen Anteil (nur Plätze ihrer Teams)
// Dritte und Gäste bekommen überall "nichts"; dass ein Platz gedeckt ist, steht in CardDisplay.covered (card-visibility.ts), ohne Namen.
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges } from "@/db/schema";
import { coverRoleOf, coverTargets } from "@/lib/cover-rules";
import { cardModeActive } from "../wallet";
import { coverClosed, validCoversOf } from "./cover";

export type CoverViewer = { userId: string | null; platformAdmin: boolean; adminOf: readonly string[] };
export type CoverView = {
  canCover: string[];
  covering: string | null;
  releasable: boolean;
  covered: boolean;
  pairs: { targetUserId: string; payerUserId: string }[];
};

const EMPTY: CoverView = { canCover: [], covering: null, releasable: false, covered: false, pairs: [] };

export async function getCoverView(matchId: string, viewer: CoverViewer, now: Date = new Date()): Promise<CoverView> {
  if (!viewer.userId && !viewer.platformAdmin && viewer.adminOf.length === 0) return EMPTY;
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match || !(await cardModeActive(db, match))) return EMPTY;
  const seats = await db
    .select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus, coveredByUserId: matchParticipants.coveredByUserId })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));
  const teamGame = match.kind === "team";
  const valid = validCoversOf(seats, teamGame);
  // Nach dem Anlegen der Abbuchungszeilen steht die Übernahme in der Zeile (payer_user_id), der Übernehmer ist dann nicht mehr card_ready (charge_pending): trotzdem sichtbar
  const charged = await db
    .select({ target: paymentCharges.userId, payer: paymentCharges.payerUserId })
    .from(paymentCharges)
    .where(and(eq(paymentCharges.matchId, matchId), isNotNull(paymentCharges.payerUserId)));
  const covers = new Map(valid);
  for (const c of charged) if (c.payer) covers.set(c.target, c.payer);
  const open = !(await coverClosed(db, match, now));
  const role = coverRoleOf(viewer.userId, covers);
  const manager = (teamId: string | null) => teamId !== null && (viewer.platformAdmin || viewer.adminOf.includes(teamId));
  const pairs = seats
    .filter((s) => covers.has(s.userId) && (viewer.platformAdmin || manager(s.teamId)))
    .map((s) => ({ targetUserId: s.userId, payerUserId: covers.get(s.userId)! }));
  return {
    canCover: coverTargets({ viewerId: viewer.userId, seats, validCovers: valid, teamGame, open }),
    covering: role.covering,
    releasable: role.covering !== null && open,
    covered: role.covered,
    pairs,
  };
}
