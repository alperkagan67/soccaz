import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeChip, StatTile } from "@/components/Stats";
import { BADGES, type BadgeCode } from "@/lib/badges";
import { formatDate } from "@/lib/time";
import { getPlayerProfile } from "@/server/profiles";
import { getCurrentUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/spieler/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = await getPlayerProfile(id, null);
  return { title: p && !p.hidden ? p.user.name : "Spielerprofil" };
}

export default async function PlayerPage({ params }: PageProps<"/spieler/[id]">) {
  const { id } = await params;
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
  const { user, stats } = p;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">
          {user.name}
          {user.isVerifiedPro && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 align-middle text-xs text-green">Profi</span>}
        </h1>
        <p className="text-muted">
          {[user.city, user.position].filter(Boolean).join(" · ") || "Keine Angaben"} · dabei seit {formatDate(user.createdAt)}
        </p>
        {p.isSelf && !user.profilePublic && <p className="text-sm text-pink">Dein Profil ist privat – nur du siehst diese Seite.</p>}
        {p.isSelf && (
          <Link href="/app/einstellungen" className="text-sm text-green underline">
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
      </section>

      {p.reliability !== undefined && (
        <section className="card text-sm" data-testid="reliability">
          <span className="font-semibold">Zuverlässigkeit: </span>
          {p.reliability === null ? "noch zu wenige Spiele" : `${p.reliability} %`}
          <span className="block text-xs text-muted">Nur für dich, Team-Admins und die Plattform sichtbar.</span>
        </section>
      )}

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

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Letzte Spiele</h2>
        {p.results.length === 0 ? (
          <p className="text-sm text-muted">Noch keine gespielten Spiele.</p>
        ) : (
          <ul className="space-y-2">
            {p.results.map((r) => (
              <li key={r.matchId}>
                <Link href={`/spiele/${r.matchId}`} className="card flex items-center justify-between gap-3 hover:border-green/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {r.teamName} {r.goalsFor}:{r.goalsAgainst} {r.opponentName}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDate(r.startsAt)}
                      {r.goals > 0 ? ` · ${r.goals} ${r.goals === 1 ? "Tor" : "Tore"}` : ""}
                    </span>
                  </span>
                  <OutcomeChip outcome={r.outcome} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
