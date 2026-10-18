import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { joinLeagueAction, leaveLeagueAction } from "@/server/league-actions";
import { getLeague } from "@/server/leagues";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/ligen/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getLeague(id);
  return { title: data ? data.league.name : "Liga nicht gefunden" };
}

export default async function LeaguePage({ params }: PageProps<"/ligen/[id]">) {
  const { id } = await params;
  const data = await getLeague(id);
  if (!data) notFound();
  const { league, table, champion } = data;
  const user = await getCurrentUser();
  const mine = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const inLeague = new Set(table.map((r) => r.team_id));
  const joinable = league.status === "active" && league.openJoin ? mine.filter((t) => !inLeague.has(t.id) && (!league.city || t.city === league.city)) : [];
  const leavable = league.status === "active" ? mine.filter((t) => inLeague.has(t.id)) : [];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{league.name}</h1>
        <p className="text-muted">
          {league.city ?? "Ganz NRW"} · {league.startsOn} bis {league.endsOn} · {league.status === "finished" ? "beendet" : "läuft"}
        </p>
        {champion && (
          <p className="text-green" data-testid="champion">
            Meister: <Link href={`/teams/${champion.slug}`} className="font-semibold underline">{champion.name}</Link>
          </p>
        )}
      </header>

      {table.length === 0 ? (
        <p className="card text-muted">Noch keine Teams in dieser Liga.</p>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="p-2">#</th>
                <th>Team</th>
                <th>Sp</th>
                <th>S-U-N</th>
                <th>Tore</th>
                <th className="pr-3 text-right">Pkt</th>
              </tr>
            </thead>
            <tbody>
              {table.map((t, i) => (
                <tr key={t.team_id} className="border-t border-line">
                  <td className="p-2">{i + 1}</td>
                  <td>
                    <Link href={`/teams/${t.slug}`} className="font-semibold hover:text-green">{t.name}</Link>
                  </td>
                  <td>{t.played}</td>
                  <td>{t.wins}-{t.draws}-{t.losses}</td>
                  <td>{t.gf}:{t.ga}</td>
                  <td className="pr-3 text-right font-bold">{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(joinable.length > 0 || leavable.length > 0) && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Dein Team</h2>
          {joinable.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{t.name}</span>
              <ActionButton action={joinLeagueAction.bind(null, league.id, t.id)} label="Anmelden" className="btn btn-primary !min-h-9 !px-3 text-xs" />
            </div>
          ))}
          {leavable.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{t.name}</span>
              <ActionButton action={leaveLeagueAction.bind(null, league.id, t.id)} label="Abmelden" confirm="Euer Team wirklich aus der Liga abmelden?" />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
