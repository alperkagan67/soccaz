import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Comments } from "@/components/Comments";
import { ImageUpload } from "@/components/ImageUpload";
import { StatTile } from "@/components/Stats";
import { formatDate, formatDateTime } from "@/lib/time";
import { getTeamProfile } from "@/server/profiles";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { leaguesOfTeam } from "@/server/leagues";
import { sponsorsOfTeam } from "@/server/sponsors";
import { getTeamMembers, isTeamAdmin } from "@/server/teams";
import { InviteBox } from "./InviteBox";
import { LeaveTeam, MemberControls, TeamSettings } from "./TeamManage";

export async function generateMetadata({ params }: PageProps<"/teams/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getTeamProfile(slug);
  return { title: profile ? profile.team.name : "Team nicht gefunden" };
}

type Row = { id: string; startsAt: Date; homeName: string; homeSlug: string; awayName: string; awaySlug: string; homeScore: number | null; awayScore: number | null };

function MatchRow({ m, teamId, homeId }: { m: Row; teamId: string; homeId: string }) {
  const played = m.homeScore !== null && m.awayScore !== null;
  const mine = homeId === teamId ? 0 : 1;
  const gf = mine === 0 ? m.homeScore : m.awayScore;
  const ga = mine === 0 ? m.awayScore : m.homeScore;
  const outcome = !played ? null : gf! > ga! ? "Sieg" : gf === ga ? "Remis" : "Niederlage";
  return (
    <li>
      <Link href={`/spiele/${m.id}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {m.homeName} {played ? `${m.homeScore}:${m.awayScore}` : "gegen"} {m.awayName}
          </span>
          <span className="text-xs text-muted">{played ? formatDate(m.startsAt) : `${formatDateTime(m.startsAt)} Uhr`}</span>
        </span>
        {outcome && <span className="text-xs text-muted">{outcome}</span>}
      </Link>
    </li>
  );
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const { slug } = await params;
  const profile = await getTeamProfile(slug);
  if (!profile) notFound();
  const { team, stats } = profile;

  const [members, user, leagues, jerseys] = await Promise.all([getTeamMembers(team.id), getCurrentUser(), leaguesOfTeam(team.id), sponsorsOfTeam(team.id)]);
  const admin = user ? await isTeamAdmin(user.id, team.id) : false;
  const canChallenge = user?.onboardedAt ? (await myAdminTeams(user.id)).some((t) => t.id !== team.id) : false;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        {team.logoUrl && <Image src={team.logoUrl} alt={`Logo von ${team.name}`} width={72} height={72} unoptimized className="mb-2 size-[72px] rounded-xl object-cover" />}
        <h1 className="text-3xl font-bold">
          {team.name}
          {team.isVerified && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 align-middle text-xs text-green">Verifiziert</span>}
        </h1>
        <p className="text-muted">
          {team.city} · Spielstärke {team.strength} von 5
        </p>
        {!admin && !canChallenge && user === null && (
          <Link href={`/anmelden?next=${encodeURIComponent(`/app/suche/neu?gegner=${team.slug}`)}`} className="text-sm text-green underline">
            Anmelden, um dieses Team herauszufordern
          </Link>
        )}
        {canChallenge && (
          <Link href={`/app/suche/neu?gegner=${team.slug}`} className="btn btn-primary mt-2">
            Herausfordern
          </Link>
        )}
      </header>

      {jerseys.length > 0 && (
        <p className="text-sm text-muted">
          Trikot-Partner:{" "}
          {jerseys.map((j, i) => (
            <span key={j.id}>
              {i > 0 && ", "}
              <a href={`/api/sponsor/${j.id}`} rel="sponsored noopener" target="_blank" className="font-semibold text-ink hover:text-green">{j.name}</a>
            </span>
          ))}
        </p>
      )}

      <section aria-label="Statistik" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Spiele" value={stats.matches} />
        <StatTile label="S-U-N" value={`${stats.wins}-${stats.draws}-${stats.losses}`} />
        <StatTile label="Tore" value={`${stats.goalsFor}:${stats.goalsAgainst}`} />
        <StatTile label="Elo" value={profile.hasStats ? stats.elo : "–"} hint={profile.cityRank ? `Platz ${profile.cityRank} in ${team.city}` : "Rang ab 5 Spielen"} />
      </section>

      {leagues.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Ligen</h2>
          <ul className="flex flex-wrap gap-2">
            {leagues.map((l) => (
              <li key={l.id}>
                <Link href={`/ligen/${l.id}`} className="rounded-full border border-line px-3 py-1 text-sm hover:border-green/50">
                  {l.name}{l.champion === team.id ? " 🏆" : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {admin && <InviteBox teamId={team.id} teamName={team.name} />}
      {admin && <ImageUpload kind="team_logo" refId={team.id} label={team.logoUrl ? "Logo ändern" : "Logo hochladen"} />}

      {profile.upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Nächste Spiele</h2>
          <ul className="space-y-2">
            {profile.upcoming.map((m) => (
              <MatchRow key={m.id} m={m} teamId={team.id} homeId={m.homeId} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Letzte Ergebnisse</h2>
        {profile.recent.length === 0 ? (
          <p className="text-sm text-muted">Noch keine gespielten Spiele.</p>
        ) : (
          <ul className="space-y-2">
            {profile.recent.map((m) => (
              <MatchRow key={m.id} m={m} teamId={team.id} homeId={m.homeId} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Kader ({members.length})</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.userId} className="card space-y-2" data-testid="member">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/spieler/${m.userId}`} className="min-w-0 hover:text-green">
                  <span className="font-semibold">{m.name}</span>
                  {m.isVerifiedPro && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Profi</span>}
                  <span className="block text-sm text-muted">{m.position ?? "Position offen"}</span>
                </Link>
                {m.role === "admin" && <span className="text-xs text-muted">Team-Admin</span>}
              </div>
              {admin && <MemberControls teamId={team.id} userId={m.userId} isAdmin={m.role === "admin"} isSelf={m.userId === user?.id} />}
            </li>
          ))}
        </ul>
      </section>

      {admin && <TeamSettings teamId={team.id} name={team.name} city={team.city} strength={team.strength} />}
      {user && members.some((m) => m.userId === user.id) && <LeaveTeam teamId={team.id} />}

      <Comments targetType="team" targetId={team.id} path={`/teams/${team.slug}`} title="Kommentare" />
    </div>
  );
}
