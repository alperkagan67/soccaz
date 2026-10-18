import { and, asc, desc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { leagues, leagueTeams } from "@/db/schema-league";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { notifyUsers, teamAdminIds } from "./notifications";
import { DomainError } from "./teams";

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export type LeagueInput = { name: string; city?: string | null; startsOn: string; endsOn: string; openJoin: boolean };

export async function createLeague(actorId: string, input: LeagueInput) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) throw new DomainError("Der Name braucht 3 bis 80 Zeichen.");
  if (input.city && !(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine gültige Stadt oder ganz NRW.");
  if (!isDay(input.startsOn) || !isDay(input.endsOn)) throw new DomainError("Bitte gib Start und Ende an.");
  if (input.endsOn < input.startsOn) throw new DomainError("Das Ende liegt vor dem Start.");
  const [row] = await db.insert(leagues).values({ name, city: input.city || null, startsOn: input.startsOn, endsOn: input.endsOn, openJoin: input.openJoin, createdBy: actorId }).returning();
  await audit(actorId, "league.create", "league", row.id, { after: row });
  return row;
}

async function activeLeague(id: string) {
  const [l] = await db.select().from(leagues).where(eq(leagues.id, id));
  if (!l) throw new DomainError("Liga nicht gefunden.");
  if (l.status === "finished") throw new DomainError("Diese Liga ist abgeschlossen.");
  return l;
}

export async function addTeamToLeague(actorId: string, leagueId: string, teamId: string) {
  const l = await activeLeague(leagueId);
  const [t] = await db.select({ id: teams.id, city: teams.city, archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, teamId));
  if (!t || t.archivedAt) throw new DomainError("Team nicht gefunden.");
  if (l.city && t.city !== l.city) throw new DomainError(`Diese Liga ist für Teams aus ${l.city}.`);
  const [inserted] = await db.insert(leagueTeams).values({ leagueId, teamId }).onConflictDoNothing().returning();
  if (inserted) await audit(actorId, "league.add_team", "league", leagueId, { after: { teamId } });
  return Boolean(inserted);
}

export async function removeTeamFromLeague(actorId: string, leagueId: string, teamId: string) {
  await activeLeague(leagueId);
  await db.delete(leagueTeams).where(and(eq(leagueTeams.leagueId, leagueId), eq(leagueTeams.teamId, teamId)));
  await audit(actorId, "league.remove_team", "league", leagueId, { before: { teamId } });
}

/** Ein Team-Admin meldet sein Team zu einer offenen Liga an. */
export async function joinLeague(userId: string, leagueId: string, teamId: string) {
  const l = await activeLeague(leagueId);
  if (!l.openJoin) throw new DomainError("Diese Liga nimmt nur auf Einladung auf.");
  const [m] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können ihr Team anmelden.");
  if (!(await addTeamToLeague(userId, leagueId, teamId))) throw new DomainError("Euer Team ist schon dabei.");
}

export async function leaveLeague(userId: string, leagueId: string, teamId: string) {
  const [m] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können das Team abmelden.");
  await removeTeamFromLeague(userId, leagueId, teamId);
}

export type LeagueRow = { team_id: string; name: string; slug: string; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number; points: number };

/** Live-Tabelle: alle gespielten, öffentlichen Spiele zwischen zwei Teilnehmern im Zeitraum (nach Berliner Datum). */
export async function leagueTable(leagueId: string): Promise<LeagueRow[]> {
  await connection();
  return rows<LeagueRow>(
    await db.execute(sql`
      with l as (select starts_on, ends_on from leagues where id = ${leagueId}),
      played as (
        select m.home_team_id as team_id, r.home_score as gf, r.away_score as ga
        from matches m join match_results r on r.match_id = m.id, l
        where m.status = 'played' and m.visibility = 'public'
          and (m.starts_at at time zone 'Europe/Berlin')::date between l.starts_on and l.ends_on
          and m.home_team_id in (select team_id from league_teams where league_id = ${leagueId})
          and m.away_team_id in (select team_id from league_teams where league_id = ${leagueId})
        union all
        select m.away_team_id, r.away_score, r.home_score
        from matches m join match_results r on r.match_id = m.id, l
        where m.status = 'played' and m.visibility = 'public'
          and (m.starts_at at time zone 'Europe/Berlin')::date between l.starts_on and l.ends_on
          and m.home_team_id in (select team_id from league_teams where league_id = ${leagueId})
          and m.away_team_id in (select team_id from league_teams where league_id = ${leagueId})
      )
      select t.id as team_id, t.name, t.slug,
        count(p.team_id)::int as played,
        coalesce(sum(case when p.gf > p.ga then 1 else 0 end), 0)::int as wins,
        coalesce(sum(case when p.gf = p.ga then 1 else 0 end), 0)::int as draws,
        coalesce(sum(case when p.gf < p.ga then 1 else 0 end), 0)::int as losses,
        coalesce(sum(p.gf), 0)::int as gf, coalesce(sum(p.ga), 0)::int as ga,
        coalesce(sum(p.gf - p.ga), 0)::int as gd,
        coalesce(sum(case when p.gf > p.ga then 3 when p.gf = p.ga then 1 else 0 end), 0)::int as points
      from league_teams lt join teams t on t.id = lt.team_id left join played p on p.team_id = t.id
      where lt.league_id = ${leagueId}
      group by t.id, t.name, t.slug
      order by points desc, gd desc, gf desc, t.name asc`),
  );
}

export async function listLeagues(filter: { includeFinished?: boolean } = {}) {
  await connection();
  return rows<{ id: string; name: string; city: string | null; starts_on: string; ends_on: string; status: string; open_join: boolean; champion: string | null; teams: number }>(
    await db.execute(sql`
      select l.id, l.name, l.city, l.starts_on::text, l.ends_on::text, l.status, l.open_join, ct.name as champion,
        (select count(*)::int from league_teams x where x.league_id = l.id) as teams
      from leagues l left join teams ct on ct.id = l.champion_team_id
      ${filter.includeFinished ? sql`` : sql`where l.status <> 'finished'`}
      order by l.status = 'finished', l.starts_on desc limit 50`),
  );
}

export async function getLeague(id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
  if (!league) return null;
  const table = await leagueTable(id);
  const [champion] = league.championTeamId ? await db.select({ name: teams.name, slug: teams.slug }).from(teams).where(eq(teams.id, league.championTeamId)) : [];
  return { league, table, champion: champion ?? null };
}

/** Schließt die Saison: Platz 1 der Tabelle ist Meister, alle Team-Admins werden benachrichtigt. */
export async function finishLeague(actorId: string, leagueId: string) {
  const l = await activeLeague(leagueId);
  const table = await leagueTable(leagueId);
  const champion = table.find((r) => r.played > 0) ?? null;
  await db.update(leagues).set({ status: "finished", championTeamId: champion?.team_id ?? null }).where(eq(leagues.id, leagueId));
  await audit(actorId, "league.finish", "league", leagueId, { after: { champion: champion?.team_id ?? null } });
  for (const row of table) {
    const place = table.indexOf(row) + 1;
    const body = row.team_id === champion?.team_id ? `Ihr seid Meister der Liga ${l.name}. Glückwunsch!` : `Die Liga ${l.name} ist beendet. Ihr habt Platz ${place} belegt.`;
    await notifyUsers(await teamAdminIds(db, row.team_id), { type: "system", title: "Liga beendet", body, url: `/ligen/${leagueId}` });
  }
  return champion;
}

/** Ligen, in denen das Team spielt (für die Teamseite). */
export async function leaguesOfTeam(teamId: string) {
  return db
    .select({ id: leagues.id, name: leagues.name, status: leagues.status, champion: leagues.championTeamId })
    .from(leagueTeams)
    .innerJoin(leagues, eq(leagues.id, leagueTeams.leagueId))
    .where(eq(leagueTeams.teamId, teamId))
    .orderBy(desc(leagues.startsOn), asc(leagues.name));
}
