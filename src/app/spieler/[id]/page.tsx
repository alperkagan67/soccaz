import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Comments } from "@/components/Comments";
import { FormChips, Sparkline } from "@/components/Sparkline";
import { OutcomeChip, StatTile } from "@/components/Stats";
import { BADGES, type BadgeCode } from "@/lib/badges";
import { accentCss } from "@/lib/profile-options";
import { formatDate, formatDateTime } from "@/lib/time";
import { getPlayerProfile, playerSchedule, type ScheduleRow } from "@/server/profiles";
import { getCurrentUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/spieler/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = await getPlayerProfile(id, null);
  return { title: p && !p.hidden ? p.user.name : "Spielerprofil" };
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line px-2.5 py-0.5 text-xs">{children}</span>;
}

function UpcomingRow({ m }: { m: ScheduleRow }) {
  return (
    <li>
      <Link href={m.status === "lobby" || m.status === "confirmed" ? `/lobby/${m.matchId}` : `/spiele/${m.matchId}`} className="card flex items-center justify-between gap-3 hover:border-green/50" data-testid="upcoming-match">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {m.teamName} gegen {m.opponentName}
          </span>
          <span className="text-xs text-muted">
            {m.schedulingOpen ? "Termin wird noch gewählt" : `${formatDateTime(m.startsAt)} Uhr`}
            {m.venue ? ` · ${m.venue}` : ""}
            {m.isPrivate ? " · privat" : ""}
          </span>
        </span>
        <span className={`shrink-0 text-xs ${m.status === "confirmed" ? "text-green" : "text-yellow"}`}>{m.status === "confirmed" ? "Bestätigt" : "Wartet auf Spieler"}</span>
      </Link>
    </li>
  );
}

function PastRow({ m }: { m: ScheduleRow }) {
  return (
    <li>
      <Link href={`/spiele/${m.matchId}`} className="card flex items-center justify-between gap-3 hover:border-green/50" data-testid="past-match">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {m.teamName} {m.goalsFor}:{m.goalsAgainst} {m.opponentName}
          </span>
          <span className="text-xs text-muted">
            {formatDate(m.startsAt)}
            {m.venue ? ` · ${m.venue}` : ""}
            {m.goals > 0 ? ` · ${m.goals} ${m.goals === 1 ? "Tor" : "Tore"}` : ""}
            {m.yellow > 0 ? ` · ${m.yellow}× Gelb` : ""}
            {m.red > 0 ? ` · ${m.red}× Rot` : ""}
            {m.mvp ? " · Spieler des Spiels" : ""}
          </span>
        </span>
        {m.outcome && <OutcomeChip outcome={m.outcome} />}
      </Link>
    </li>
  );
}

export default async function PlayerPage({ params, searchParams }: PageProps<"/spieler/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.seite === "string" ? sp.seite : 1) || 1);
  const viewer = await getCurrentUser();
  const p = await getPlayerProfile(id, viewer ? { id: viewer.id, role: viewer.role } : null);
  if (!p) notFound();
  if (p.hidden) {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{p.name}</h1>
        <p className="text-muted">Dieses Profil ist nicht öffentlich.</p>
      </div>
    );
  }
  const { user, stats, gamer } = p;
  const accent = accentCss(gamer.accentColor);
  const schedule = await playerSchedule(user.id, p.isSelf || viewer?.role === "admin", page);

  return (
    <div className="space-y-6">
      <header
        className="space-y-3 rounded-2xl border border-line p-5"
        style={{ borderTop: `4px solid ${accent}`, background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 16%, transparent), transparent 60%)` }}
        data-testid="gamer-card"
      >
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={`Profilbild von ${user.name}`} width={96} height={96} unoptimized className="size-24 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${accent}` }} />
          ) : (
            <div className="grid size-24 shrink-0 place-items-center rounded-full bg-panel2 font-heading text-4xl font-bold" style={{ boxShadow: `0 0 0 3px ${accent}` }} aria-hidden>
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight">
              {user.name}
              {user.isVerifiedPro && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 align-middle text-xs text-green">Profi</span>}
            </h1>
            {gamer.nickname && (
              <p className="text-lg font-semibold" style={{ color: accent }} data-testid="nickname">
                „{gamer.nickname}“
              </p>
            )}
            <p className="text-sm text-muted">
              {[user.city, user.position].filter(Boolean).join(" · ") || "Keine Angaben"} · dabei seit {formatDate(user.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {gamer.shirtNumber && <Chip>Nr. {gamer.shirtNumber}</Chip>}
          {gamer.strongFoot && <Chip>Starker Fuß: {gamer.strongFoot}</Chip>}
          {gamer.favoriteClub && <Chip>Lieblingsverein: {gamer.favoriteClub}</Chip>}
          {stats.matches > 0 && <Chip>Elo {stats.elo}</Chip>}
          {p.cityRank && (
            <Chip>
              Platz {p.cityRank}
              {user.city ? ` in ${user.city}` : ""}
            </Chip>
          )}
        </div>
        {p.bio && (
          <p className="whitespace-pre-line text-sm" data-testid="bio">
            {p.bio}
          </p>
        )}
        <FormChips form={p.form} />
        {p.isSelf && !user.profilePublic && <p className="text-sm text-pink">Dein Profil ist privat – nur du siehst diese Seite.</p>}
        {p.isSelf && (
          <Link href="/app/einstellungen" className="btn btn-ghost !min-h-9 !px-3 text-sm">
            Profil bearbeiten
          </Link>
        )}
      </header>

      <section aria-label="Statistik" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Spiele" value={stats.matches} />
        <StatTile label="Siege" value={stats.wins} hint={`${stats.draws} Remis · ${stats.losses} Niederlagen`} />
        <StatTile label="Tore" value={stats.goals} />
        <StatTile label="Spieler des Spiels" value={stats.mvps} />
        <StatTile label="Spielstärke (Elo)" value={stats.matches > 0 ? stats.elo : "–"} hint={p.cityRank ? `Platz ${p.cityRank}${user.city ? ` in ${user.city}` : ""}` : "Rang ab 5 Spielen"} />
        <StatTile label="Gelbe Karten" value={stats.yellowCards} />
        <StatTile label="Rote Karten" value={stats.redCards} />
        <StatTile label="Siegesserie" value={stats.winStreak} />
        <StatTile label="Siegquote" value={p.winRate === null ? "–" : `${p.winRate} %`} />
        <StatTile label="Tore pro Spiel" value={p.goalsPerGame ?? "–"} />
      </section>

      <Sparkline values={p.eloHistory} label="Elo-Verlauf" />

      {p.reliability !== undefined && (
        <section className="card text-sm" data-testid="reliability">
          <span className="font-semibold">Zuverlässigkeit: </span>
          {p.reliability === null ? "noch zu wenige Spiele" : `${p.reliability} %`}
          <span className="block text-xs text-muted">Nur für dich, Team-Admins und die Plattform sichtbar.</span>
        </section>
      )}

      <section className="space-y-2" aria-label="Kommende Spiele">
        <h2 className="text-lg font-semibold">Kommende Spiele ({schedule.upcoming.length})</h2>
        {schedule.upcoming.length === 0 ? (
          <p className="text-sm text-muted">{p.isSelf ? "Nichts geplant. Such dir einen Gegner im Matchmaking." : "Keine kommenden öffentlichen Spiele."}</p>
        ) : (
          <ul className="space-y-2">
            {schedule.upcoming.map((m) => (
              <UpcomingRow key={m.matchId} m={m} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="Spielverlauf">
        <h2 className="text-lg font-semibold">Spielverlauf</h2>
        {schedule.past.length === 0 ? (
          <p className="text-sm text-muted">Noch keine gespielten Spiele.</p>
        ) : (
          <ul className="space-y-2">
            {schedule.past.map((m) => (
              <PastRow key={m.matchId} m={m} />
            ))}
          </ul>
        )}
        {(page > 1 || schedule.hasMorePast) && (
          <div className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={`/spieler/${user.id}?seite=${page - 1}`} className="btn btn-ghost !min-h-9">
                Neuere
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted">Seite {page}</span>
            {schedule.hasMorePast ? (
              <Link href={`/spieler/${user.id}?seite=${page + 1}`} className="btn btn-ghost !min-h-9">
                Ältere
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Abzeichen</h2>
        {p.badges.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Abzeichen.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {p.badges.map((b) => {
              const def = BADGES[b.code as BadgeCode];
              return (
                <li key={b.code} title={def?.description} className="rounded-full border border-green/30 bg-green-soft px-3 py-1 text-sm text-green">
                  {def?.name ?? b.code}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Teams</h2>
        {p.teams.length === 0 ? (
          <p className="text-sm text-muted">In keinem Team.</p>
        ) : (
          <ul className="space-y-2">
            {p.teams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.slug}`} className="card flex items-center justify-between hover:border-green/50">
                  <span className="font-semibold">{t.name}</span>
                  {t.role === "admin" && <span className="text-xs text-muted">Team-Admin</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Comments targetType="player" targetId={user.id} path={`/spieler/${user.id}`} title="Kommentare" canWrite={!p.isSelf} />
    </div>
  );
}
