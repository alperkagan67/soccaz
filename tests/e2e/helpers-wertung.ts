import type { Page } from "@playwright/test";
import { addParticipant, devLogin, run, seedUser, testDb } from "./helpers";

/** Anmelden UND abwarten, bis die Sitzung steht (devLogin wartet nicht: ein sofortiges goto bricht die Anmeldung ab, die Seite wäre als Gast geladen). */
export async function login(page: Page, email: string, name: string) {
  await devLogin(page, email, name);
  await page.waitForURL((url) => !url.pathname.startsWith("/anmelden"));
}

/** Ein gespieltes, bestätigtes Spiel 3:1 mit zwei Spielern und je einer Verlaufszeile (nach 1000 -> 1090: Aufstieg Kreide -> Rasen; Gegner 1000 -> 910: Stufe bleibt). */
export async function seedPlayedWithRatings(tag: string) {
  const starName = `Aufsteiger ${tag} ${run}`;
  const rivalName = `Absteiger ${tag} ${run}`;
  const star = await seedUser(`rv${tag}star`, starName);
  const rival = await seedUser(`rv${tag}rival`, rivalName);
  const db = testDb();
  const mkTeam = async (name: string, admin: string) => {
    const { rows } = await db.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, `e2e-rv-${name.replace(/\W+/g, "-").toLowerCase()}`, admin]);
    await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
    return rows[0].id as string;
  };
  const home = await mkTeam(`Reveal ${tag} Heim ${run}`, star);
  const away = await mkTeam(`Reveal ${tag} Gast ${run}`, rival);
  const { rows } = await db.query(
    `insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at)
     values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour') returning id`,
    [home, away],
  );
  const matchId = rows[0].id as string;
  await addParticipant(matchId, star, home);
  await addParticipant(matchId, rival, away);
  await db.query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 3, 1, true, true)", [matchId]);
  await db.query("insert into rating_history (kind, subject_id, match_id, elo_before, elo_after) values ('user', $1, $3, 1000, 1090), ('user', $2, $3, 1000, 910)", [star, rival, matchId]);
  return { matchId, star, rival, starName, rivalName, starEmail: `rv${tag}star-${run}@test.local`, rivalEmail: `rv${tag}rival-${run}@test.local` };
}

/** Hängt vor dem Laden einen Beobachter ein, der Start und Ende aller CSS-Animationen mit Zeitstempel aufschreibt (window.__anims). */
export const RECORD_ANIMATIONS = `
  window.__anims = [];
  document.addEventListener("animationstart", (e) => window.__anims.push({ name: e.animationName, type: "start", t: performance.now() }), true);
  document.addEventListener("animationend", (e) => window.__anims.push({ name: e.animationName, type: "end", t: performance.now() }), true);
`;
