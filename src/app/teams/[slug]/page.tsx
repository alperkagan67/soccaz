import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Comments } from "@/components/Comments";
import { ChallengeNow } from "@/components/ChallengeNow";
import { ImageUpload } from "@/components/ImageUpload";
import { FormChips, Sparkline } from "@/components/Sparkline";
import { StatTile } from "@/components/Stats";
import { PlayerRow } from "@/components/PlayerRow";
import { TeamCard } from "@/components/TeamCard";
import { TeamColorDot } from "@/components/TeamColor";
import { RATING, cardViewerFor, playerCardFor, teamCardFor } from "@/lib/player-card";
import { isPlatformAdmin } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/time";
import { getTeamMemberElos, getTeamProfile, getTeamRosterView } from "@/server/profiles";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { leaguesOfTeam } from "@/server/leagues";
import { sponsorsOfTeam } from "@/server/sponsors";
import { isTeamAdmin } from "@/server/teams";
import { isVenueManager } from "@/server/venue-access-rules";
import { InviteBox } from "./InviteBox";
import { LeaveTeam, MemberControls, TeamSettings } from "./TeamManage";
import { TopScorers } from "./TopScorers";

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
      <Link href={`/spiele/${m.id}`} className="card flex items-center justify-between gap-3 hover:border-accent/50">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {m.homeName} {played ? `${m.homeScore}:${m.awayScore}` : "gegen"} {m.awayName}
          </span>
          <span className="text-sm text-muted">{played ? formatDate(m.startsAt) : `${formatDateTime(m.startsAt)} Uhr`}</span>
        </span>
        {outcome && <span className="text-sm text-muted">{outcome}</span>}
      </Link>
    </li>
  );
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const myTeams = user?.onboardedAt ? await myAdminTeams(user.id) : [];
  const profile = await getTeamProfile(slug, myTeams.find((t) => t.slug !== slug)?.id ?? null, user?.id ?? null);
  if (!profile) notFound();
  const { team, stats } = profile;

  // Datenschutz: Namen des Kaders (und der Torjäger) nur für eingeloggte Nutzer, Gäste sehen nur die Spielerzahl (serverseitig gefiltert)
  const [roster, leagues, jerseys] = await Promise.all([getTeamRosterView(team.id, user?.id ?? null), leaguesOfTeam(team.id), sponsorsOfTeam(team.id)]);
  const members = roster.members;
  const admin = user ? await isTeamAdmin(user.id, team.id) : false;
  // Karten und Zeilen: die Sichtbarkeit entscheidet der Server (playerCardFor), Gäste bekommen weiter KEINE Namen und KEINE Wertung (getTeamRosterView liest für sie nichts); die Teamwertung ist nur eine Zahl
  // Backlog 216 (013 M3 5a): hallOperator aus venue_access; ein reiner Betreiber (weder Mitglied noch Team-Admin noch Plattform-Admin) bekommt die namenfreie Sicht, die Abfrage läuft nur, wenn sie etwas ändern kann
  const isMember = user ? members.some((m) => m.userId === user.id) : false;
  const hallOperator = user && !isMember && !admin && !isPlatformAdmin(user) ? await isVenueManager(user.id) : false;
  const viewer = cardViewerFor({ userId: user?.id ?? null, hallOperator, participant: isMember, teamAdmin: admin, platformAdmin: isPlatformAdmin(user) });
  const teamCard = teamCardFor({ name: team.name, slug: team.slug, color: team.color ?? null, memberElos: await getTeamMemberElos(team.id) }, RATING);
  const isMyTeam = myTeams.some((t) => t.id === team.id); // das eigene Team kann man nicht herausfordern
  const canChallenge = !isMyTeam && myTeams.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        {team.logoUrl && <Image src={team.logoUrl} alt={`Logo von ${team.name}`} width={72} height={72} unoptimized className="mb-2 size-[72px] rounded-xl object-cover" />}
        <h1 className="text-3xl font-bold">
          <TeamColorDot color={team.color} slug={team.slug} className="mr-2 !size-4" />
          {team.name}
          {team.isVerified && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 align-middle text-sm text-accent-fg">Verifiziert</span>}
        </h1>
        <p className="text-muted">
          {team.city} · Spielstärke {team.strength} von 5 · gegründet {formatDate(team.createdAt)}
        </p>
        {team.bio && <p className="whitespace-pre-line pt-1 text-sm" data-testid="bio">{team.bio}</p>}
        <FormChips form={profile.form} />
        <TeamCard data={teamCard} className="mt-3" />
        {!admin && !canChallenge && user === null && (
          <Link href={`/anmelden?next=${encodeURIComponent(`/app/suche/neu?gegner=${team.slug}`)}`} className="text-sm text-accent-fg underline">
            Anmelden, um dieses Team herauszufordern
          </Link>
        )}
        {isMyTeam && (
          <div className="pt-2" data-testid="team-open-lobby">
            <Link href="/matchmaking" className="btn btn-primary">Lobby aufmachen</Link>
            <p className="mt-1 text-sm text-muted">Tag und Zeitfenster festlegen, dann sehen alle Teams eure offene Lobby und können antreten.</p>
          </div>
        )}
        {canChallenge && (
          <div className="pt-2" data-testid="team-challenge">
            <ChallengeNow target={{ id: team.id, name: team.name }} teams={myTeams.filter((x) => x.id !== team.id).map((x) => ({ id: x.id, name: x.name }))} />
          </div>
        )}
      </header>

      {jerseys.length > 0 && (
        <p className="text-sm text-muted">
          Trikot-Partner:{" "}
          {jerseys.map((j, i) => (
            <span key={j.id}>
              {i > 0 && ", "}
              <a href={`/api/sponsor/${j.id}`} rel="sponsored noopener" target="_blank" className="font-semibold text-ink hover:text-accent-fg">{j.name}</a>
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
                <Link href={`/ligen/${l.id}`} className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent/50">
                  {l.name}{l.champion === team.id ? " 🏆" : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Kennzahlen" className="grid grid-cols-3 gap-3">
        <StatTile label="Siegquote" value={profile.winRate === null ? "–" : `${profile.winRate} %`} />
        <StatTile label="Tore pro Spiel" value={profile.goalsPerGame ?? "–"} />
        <StatTile label="Mitglieder" value={roster.count} />
      </section>
      <Sparkline values={profile.eloHistory} label="Elo-Verlauf" />

      {profile.vs && profile.vs.games > 0 && (
        <p className="card text-sm" data-testid="head-to-head">
          Direktvergleich mit deinem Team: <strong>{profile.vs.wins} Siege, {profile.vs.draws} Remis, {profile.vs.losses} Niederlagen</strong> ({profile.vs.gf}:{profile.vs.ga} Tore) aus {profile.vs.games} Spielen.
        </p>
      )}

      <TopScorers scorers={profile.topScorers} viewer={viewer} />

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
        <h2 className="text-lg font-semibold">Kader ({roster.count})</h2>
        {user === null && (
          <p className="card text-sm text-muted" data-testid="roster-guest">
            {roster.count} Spieler im Kader. Die Namen sehen angemeldete Nutzer.{" "}
            <Link href={`/anmelden?next=${encodeURIComponent(`/teams/${team.slug}`)}`} className="text-accent-fg underline">Anmelden</Link>
          </p>
        )}
        {members.length > 0 && (
          // EIN Rahmen um die Liste, die Zeilen haben keinen eigenen (AC-30 c: keine Karte in der Karte)
          <ul className="card divide-y divide-line" data-testid="roster">
            {members.map((m) => (
              <li key={m.userId} className="space-y-2 py-3 first:pt-0 last:pb-0" data-testid="member">
                <PlayerRow
                  data={playerCardFor(viewer, { name: m.name, elo: m.elo, position: m.position, teamColor: team.color ?? null, teamSlug: team.slug }, RATING)}
                  href={`/spieler/${m.userId}`}
                  badges={m.isVerifiedPro ? <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-sm font-normal text-accent-fg">Profi</span> : null}
                  trailing={m.role === "admin" ? <span className="text-sm text-muted">Team-Admin</span> : null}
                />
                {admin && <MemberControls teamId={team.id} userId={m.userId} isAdmin={m.role === "admin"} isSelf={m.userId === user?.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && <TeamSettings teamId={team.id} slug={team.slug} color={team.color ?? null} name={team.name} city={team.city} strength={team.strength} bio={team.bio ?? null} />}
      {user && members.some((m) => m.userId === user.id) && <LeaveTeam teamId={team.id} />}

      <Comments targetType="team" targetId={team.id} path={`/teams/${team.slug}`} title="Kommentare" />
    </div>
  );
}
