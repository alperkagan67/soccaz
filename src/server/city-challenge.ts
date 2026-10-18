import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { berlinMonthRange, toBerlinInputValue } from "@/lib/time";
import { audit } from "./audit";
import { notifyUsers } from "./notifications";

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];

export type CityRow = { city: string; wins: number; games: number };

/** Stadt-Challenge: Siege von Teams einer Stadt gegen Teams einer anderen Stadt im Monat. Spiele innerhalb derselben Stadt zählen nicht. */
export async function cityChallenge(from: Date, to: Date): Promise<CityRow[]> {
  await connection();
  return rows<CityRow>(
    await db.execute(sql`
      with g as (
        select h.city as hc, a.city as ac, r.home_score as hs, r.away_score as aws
        from matches m
        join match_results r on r.match_id = m.id
        join teams h on h.id = m.home_team_id
        join teams a on a.id = m.away_team_id
        where m.status = 'played' and m.visibility = 'public' and h.city <> a.city
          and m.starts_at >= ${from} and m.starts_at < ${to}
      ),
      sides as (
        select hc as city, case when hs > aws then 1 else 0 end as win from g
        union all
        select ac, case when aws > hs then 1 else 0 end from g
      )
      select city, sum(win)::int as wins, count(*)::int as games from sides group by city order by wins desc, games desc, city asc`),
  );
}

/** Schreibt das Ergebnis des Vormonats fest und gratuliert den Teams der Siegerstadt. Mehrfach ausführbar. */
export async function closeCityChallenge(now: Date = new Date()) {
  const current = berlinMonthRange(undefined, now).month;
  const prevDate = new Date(Date.UTC(+current.slice(0, 4), +current.slice(5, 7) - 2, 15));
  const prev = berlinMonthRange(toBerlinInputValue(prevDate).slice(0, 7), now);
  const result = await cityChallenge(prev.from, prev.to);
  if (result.length === 0) return { month: prev.month, closed: false };

  const inserted = await db.transaction(async (tx) => {
    let any = false;
    for (const [i, row] of result.entries()) {
      const r = await tx.execute(sql`insert into city_challenge_results (month, city, wins, rank) values (${prev.month}, ${row.city}, ${row.wins}, ${i + 1}) on conflict do nothing returning 1`);
      if (r.rows.length > 0) any = true;
    }
    return any;
  });
  if (!inserted) return { month: prev.month, closed: false };

  const winner = result[0];
  const admins = rows<{ id: string }>(await db.execute(sql`select distinct m.user_id as id from team_members m join teams t on t.id = m.team_id where m.role = 'admin' and t.city = ${winner.city} and t.archived_at is null`));
  await notifyUsers(admins.map((a) => a.id), { type: "system", title: "Stadt-Challenge", body: `${winner.city} hat die Stadt-Challenge im ${prev.label} mit ${winner.wins} Siegen gewonnen.`, url: "/rangliste" });
  await audit(null, "city_challenge.close", "city_challenge", prev.month, { after: { winner: winner.city, wins: winner.wins } });
  return { month: prev.month, closed: true, winner: winner.city };
}

export async function pastChampions(limit = 6) {
  await connection();
  return rows<{ month: string; city: string; wins: number }>(await db.execute(sql`select month, city, wins from city_challenge_results where rank = 1 order by month desc limit ${limit}`));
}
