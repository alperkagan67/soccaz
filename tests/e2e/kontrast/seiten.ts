import { addParticipant, run, seedUser, testDb } from "../helpers";
import { seedOwner } from "../helpers-db";

// AC-27: Seitenliste der Kontrastmessung. Jede Seite wird mit der angegebenen Rolle geladen und in beiden Farbschemata gemessen. Neue Seiten (M2c, M3) hier eintragen.
export type Role = "gast" | "spieler" | "neuling" | "admin1";

/**
 * Umfang der Messung. "baseline" (Phase 1, Laufzeit ca. 3 Minuten je Spec, Entscheid TM): Gast und Spieler, sechs Kernseiten, dunkel und hell. "voll": alle Rollen und alle Seiten (nach M2c im verbindlichen Lauf).
 * Der Umfang ist diese eine Konstante; die Seitenliste unten bleibt vollständig.
 */
export const UMFANG = ((): "baseline" | "voll" => "baseline")(); // Funktionsaufruf, damit TypeScript den Vergleich mit "voll" nicht als unmöglich ablehnt
export const ROLLEN: Role[] = UMFANG === "voll" ? ["gast", "spieler", "neuling", "admin1"] : ["gast", "spieler", "neuling"]; // neuling = angemeldet, Einrichtung (/willkommen) noch offen
const KERNSEITEN = new Set(["gast-start", "gast-hallen", "gast-spiel-gespielt", "gast-suche", "gast-turniere", "gast-einladung", "gast-lobby", "spieler-app", "spieler-lobby", "spieler-spiel-gespielt", "spieler-suche", "spieler-turniere", "neuling-willkommen"]); // M3: Suche, Turniere, Einladung, Willkommen (Backlog 227)
export type PageEntry = { id: string; role: Role; path: string };
export type World = { pages: PageEntry[]; players: { spieler: { email: string; name: string }; neuling: { email: string; name: string }; admin1?: { email: string; name: string } } };

/** Legt die Daten an, die für die Seiten gebraucht werden (ohne Oberfläche, wie die anderen Specs). `tag` trennt die beiden Specs (390/1280). */
export async function seedWorld(tag: string): Promise<World> {
  const db = testDb();
  const spielerName = `Kontrast Spieler ${tag}`;
  const spielerKey = `kzs${tag}`;
  const spielerId = await seedUser(spielerKey, spielerName);
  const gegnerId = await seedUser(`kzg${tag}`, `Kontrast Gegner ${tag}`);
  const adminKey = `kza${tag}`;
  // Neuling: angemeldet, aber noch nicht eingerichtet (onboarded_at leer): sieht /willkommen
  const neulingKey = `kzn${tag}`;
  const neulingName = `Kontrast Neuling ${tag}`;
  await db.query("insert into users (email, name) values ($1, $2)", [`${neulingKey}-${run}@test.local`, neulingName]);
  if (UMFANG === "voll") await seedOwner(adminKey, `Kontrast Admin ${tag}`); // Admin 1 gibt es höchstens einmal je Datenbank: nur anlegen, wenn er gebraucht wird
  const mkTeam = async (name: string, admin: string, color: string) => {
    const slug = `e2e-kz-${name.replace(/\W+/g, "-").toLowerCase()}`;
    const { rows } = await db.query("insert into teams (name, slug, city, color, created_by) values ($1, $2, 'Essen', $3, $4) returning id, slug", [name, slug, color, admin]);
    await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
    return { id: rows[0].id as string, slug: rows[0].slug as string };
  };
  const home = await mkTeam(`Kontrast Heim ${tag} ${run}`, spielerId, "blue");
  const away = await mkTeam(`Kontrast Gast ${tag} ${run}`, gegnerId, "yellow");
  // gespieltes Spiel mit Ergebnis und Verlauf (Wertung aufdecken, Karte, Teamfarben)
  const played = await db.query(
    `insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at)
     values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour') returning id`,
    [home.id, away.id],
  );
  const playedId = played.rows[0].id as string;
  await addParticipant(playedId, spielerId, home.id);
  await addParticipant(playedId, gegnerId, away.id);
  await db.query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 3, 1, true, true)", [playedId]);
  await db.query("insert into rating_history (kind, subject_id, match_id, elo_before, elo_after) values ('user', $1, $3, 1000, 1090), ('user', $2, $3, 1000, 910)", [spielerId, gegnerId, playedId]);
  // offene Lobby (bevorstehendes Spiel)
  const lobby = await db.query("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, visibility) values ($1, $2, now() + interval '3 days', 60, 'lobby', 'public') returning id", [home.id, away.id]);
  const lobbyId = lobby.rows[0].id as string;
  await addParticipant(lobbyId, spielerId, home.id, true);
  await addParticipant(lobbyId, gegnerId, away.id);
  // Einladungslink (Einstieg für Neulinge); Token nur für diese Messung
  const inviteToken = `kz-${tag}-${run}`;
  await db.query("insert into invites (token, team_id, created_by, expires_at) values ($1, $2, $3, now() + interval '7 days')", [inviteToken, home.id, spielerId]);
  // offene Hallen-Anfrage (Admin-Seite)
  if (UMFANG === "voll") await db.query("insert into venues (name, city, source, verified, active, approval_status, approval_requested_at) values ($1, 'Essen', 'manual', false, false, 'requested', now())", [`Kontrast Anfragehalle ${tag} ${run}`]);

  const gastSeiten = ["/", "/anmelden", "/hilfe", "/datenschutz", "/hallen", "/rangliste", "/teams", "/spiele", "/suche", "/turniere"];
  const alle: PageEntry[] = [
    ...gastSeiten.map((path) => ({ id: path === "/" ? "gast-start" : `gast${path.replace(/\//g, "-")}`, role: "gast" as const, path })),
    { id: "gast-spiel-gespielt", role: "gast", path: `/spiele/${playedId}` },
    { id: "gast-team", role: "gast", path: `/teams/${home.slug}` },
    { id: "gast-einladung", role: "gast", path: `/einladung/${inviteToken}` },
    { id: "gast-lobby", role: "gast", path: `/lobby/${lobbyId}` },
    { id: "spieler-app", role: "spieler", path: "/app" },
    { id: "spieler-suche", role: "spieler", path: "/suche" },
    { id: "spieler-turniere", role: "spieler", path: "/turniere" },
    { id: "neuling-willkommen", role: "neuling", path: "/willkommen" },
    { id: "spieler-lobby", role: "spieler", path: `/lobby/${lobbyId}` },
    { id: "spieler-spiel-gespielt", role: "spieler", path: `/spiele/${playedId}` },
    { id: "spieler-team", role: "spieler", path: `/teams/${home.slug}` },
    { id: "spieler-halle-anfragen", role: "spieler", path: "/halle/anfragen" },
    { id: "admin-start", role: "admin1", path: "/admin" },
    { id: "admin-hallen-anfragen", role: "admin1", path: "/admin/hallen/anfragen" },
    { id: "admin-einstellungen", role: "admin1", path: "/admin/einstellungen" },
  ];
  const pages = UMFANG === "voll" ? alle : alle.filter((p) => KERNSEITEN.has(p.id));
  return {
    pages,
    players: { spieler: { email: `${spielerKey}-${run}@test.local`, name: spielerName }, neuling: { email: `${neulingKey}-${run}@test.local`, name: neulingName }, ...(UMFANG === "voll" ? { admin1: { email: `${adminKey}-${run}@test.local`, name: `Kontrast Admin ${tag}` } } : {}) },
  };
}
