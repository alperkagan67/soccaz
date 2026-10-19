import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { Pager } from "@/components/Pager";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { CITIES } from "@/lib/validation";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 40) || undefined : undefined;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const term = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      city: teams.city,
      isVerified: teams.isVerified,
      elo: teamStats.elo,
      matches: teamStats.matches,
      members: sql<number>`(select count(*)::int from team_members m where m.team_id = ${teams.id})`,
    })
    .from(teams)
    .leftJoin(teamStats, eq(teamStats.teamId, teams.id))
    .where(and(isNull(teams.archivedAt), city ? eq(teams.city, city) : undefined, term ? ilike(teams.name, term) : undefined))
    .orderBy(desc(sql`coalesce(${teamStats.matches}, 0)`), asc(teams.name))
    .limit(31)
    .offset((page - 1) * 30);
  const list = rows.slice(0, 30);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Teams</h1>
        <p className="text-muted">Alle Teams auf Socaz. Schau dir Kader und Bilanz an und fordere sie heraus.</p>
      </header>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Teamname" aria-label="Teamname" className="field !w-auto min-w-0 flex-1" />
        <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto">
          <option value="">Alle Städte</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary">Suchen</button>
      </form>
      {list.length === 0 ? (
        <p className="text-muted">Keine Teams gefunden.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/teams/${t.slug}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
                <span>
                  <span className="font-semibold">{t.name}</span>
                  {t.isVerified && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Verifiziert</span>}
                  <span className="block text-sm text-muted">{t.city} · {t.members} {t.members === 1 ? "Spieler" : "Spieler"}</span>
                </span>
                <span className="text-right text-sm text-muted">
                  {t.matches ? `Elo ${t.elo}` : "noch ohne Spiel"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager path="/teams" params={{ q, city }} page={page} hasMore={rows.length > 30} />
    </div>
  );
}
